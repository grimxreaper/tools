/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Server from "../Server";
import {
	PROJECT_CONFIG_DIRECTORY,
	PROJECT_CONFIG_FILENAMES,
	PROJECT_CONFIG_PACKAGE_JSON_FIELD,
	PROJECT_CONFIG_SENSITIVE_DIRECTORIES,
	PROJECT_CONFIG_WARN_FILENAMES,
	ProjectConfig,
	ProjectConfigMeta,
	ProjectDefinition,
	createDefaultProjectConfig,
	createMockProjectConfigMeta,
	loadCompleteProjectConfig,
} from "@internal/project";
import {
	WorkerContainer,
	WorkerPartialManifestsTransport,
	WorkerProjects,
} from "@internal/core";
import {
	DiagnosticLocation,
	DiagnosticsProcessor,
	createSingleDiagnosticsError,
	descriptions,
} from "@internal/diagnostics";
import {
	ManifestDefinition,
	manifestNameToString,
} from "@internal/codec-js-manifest";
import {
	AbsoluteFilePath,
	AbsoluteFilePathMap,
	AbsoluteFilePathSet,
	MixedPathMap,
	MixedPathSet,
	Path,
	UIDPath,
	UIDPathMap,
	URLPath,
	createUIDPathFromSegments,
} from "@internal/path";
import {FileReference} from "../../common/types/files";
import {
	GetFileHandlerResult,
	getFileHandlerFromPath,
} from "../../common/file-handlers/index";
import {CachedFileReader, FileNotFound} from "@internal/fs";
import {Consumer} from "@internal/consume";
import {json} from "@internal/codec-config";
import {VCSClient, getVCSClient} from "@internal/vcs";
import {PathLocker} from "@internal/async/lockers";
import {markup} from "@internal/markup";
import {ReporterNamespace} from "@internal/cli-reporter";
import {ExtendedMap} from "@internal/collections";
import {promiseAllFrom} from "@internal/async";

export type ProjectConfigSource = {
	consumer: Consumer;
	value: undefined | Consumer;
};

export default class ProjectManager {
	constructor(server: Server) {
		this.server = server;
		this.logger = server.logger.namespace(markup`ProjectManager`);

		this.projectIdCounter = 0;
		this.projectConfigDependenciesToIds = new AbsoluteFilePathMap();
		this.projectLoadingLocks = new PathLocker();
		this.projectDirectoryToProject = new AbsoluteFilePathMap();
		this.projects = new ExtendedMap("projects");

		// We maintain these maps so we can reverse any uids, and protect against collisions
		this.uidToFilename = new UIDPathMap();
		this.filenameToUID = new AbsoluteFilePathMap();
		this.remoteToLocalPath = new MixedPathMap();
		this.localPathToRemote = new AbsoluteFilePathMap();
	}

	private server: Server;
	private logger: ReporterNamespace;

	private uidToFilename: UIDPathMap<AbsoluteFilePath>;
	private filenameToUID: AbsoluteFilePathMap<UIDPath>;

	private remoteToLocalPath: MixedPathMap<AbsoluteFilePath>;
	private localPathToRemote: AbsoluteFilePathMap<URLPath>;

	// Lock to prevent race conditions that result in the same project being loaded multiple times at once
	private projectLoadingLocks: PathLocker;

	private projects: ExtendedMap<number, ProjectDefinition>;
	private projectDirectoryToProject: AbsoluteFilePathMap<ProjectDefinition>;
	private projectConfigDependenciesToIds: AbsoluteFilePathMap<Set<number>>;
	private projectIdCounter: number;

	public async init() {
		await this.injectVirtualModules();

		this.server.resources.add(
			this.server.refreshFileEvent.subscribe((events) => {
				for (const {path, type} of events) {
					if (type === "DELETED") {
						this.handleDeleted(path);
					}
				}
			}),
		);

		const vendorProjectConfig: ProjectConfig = {
			...createDefaultProjectConfig(),
			name: "rome-internal-remote",
		};
		const defaultVendorPath = vendorProjectConfig.files.vendorPath;
		// TODO find a way to do th
		await defaultVendorPath.createDirectory();
		await this.declareProject({
			isPartial: false,
			projectDirectory: defaultVendorPath,
			meta: createMockProjectConfigMeta(defaultVendorPath),
			config: vendorProjectConfig,
		});
		await this.server.memoryFs.watch(defaultVendorPath);
	}

	// Add a default project for virtual modules
	// This will automatically be sent to workers
	private async injectVirtualModules() {
		const projectDirectory = this.server.virtualModules.getMockDirectory();

		const projectConfig: ProjectConfig = {
			...createDefaultProjectConfig(),
			name: "rome-virtual-modules",
		};

		await this.declareProject({
			isPartial: false,
			projectDirectory,
			meta: createMockProjectConfigMeta(projectDirectory),
			config: projectConfig,
		});
	}

	private handleDeleted(path: AbsoluteFilePath) {
		this.projectConfigDependenciesToIds.delete(path);

		// Remove uids
		const uid = this.filenameToUID.get(path);
		this.filenameToUID.delete(path);
		if (uid !== undefined) {
			this.uidToFilename.delete(uid);
		}
	}

	public getRemoteFromLocalPath(path: AbsoluteFilePath): undefined | URLPath {
		return this.localPathToRemote.get(path);
	}

	public maybeGetFilePathFromUID(path: Path): undefined | AbsoluteFilePath {
		if (path.isUID()) {
			return this.uidToFilename.get(path.assertUID());
		} else {
			return undefined;
		}
	}

	public getFilePathFromUIDOrAbsolute(
		path: undefined | Path,
	): undefined | AbsoluteFilePath {
		if (path === undefined) {
			return undefined;
		}

		if (path.isUID()) {
			const uidToPath = this.maybeGetFilePathFromUID(path.assertUID());
			if (uidToPath !== undefined) {
				return uidToPath;
			}
		}

		if (path.isAbsolute()) {
			return path.assertAbsolute();
		}

		return undefined;
	}

	public categorizePaths(
		paths: Iterable<Path>,
	): {
		absolutes: AbsoluteFilePathSet;
		unknowns: MixedPathSet;
	} {
		const unknowns = new MixedPathSet();
		const absolutes = new AbsoluteFilePathSet();

		for (const path of paths) {
			const absolute = this.getFilePathFromUIDOrAbsolute(path);
			if (absolute === undefined) {
				unknowns.add(path);
			} else {
				absolutes.add(absolute);
			}
		}

		return {absolutes, unknowns};
	}

	private setUID(path: AbsoluteFilePath, uid: UIDPath) {
		const filename = path.join();

		// Verify we didn't already generate this uid for another file
		const collided = this.uidToFilename.get(uid);
		if (collided !== undefined && !collided.equal(path)) {
			throw new Error(
				`UID collision between ${filename} and ${collided}: ${uid}`,
			);
		}

		this.uidToFilename.set(uid, path);
		this.filenameToUID.set(path, uid);
	}

	public getUID(path: AbsoluteFilePath, allowMissing: boolean = false): UIDPath {
		// We maintain a map of file paths to UIDs
		// We clear the UID when a path is deleted.
		// If getUID is called on a file that doesn't exist then we'll populate it and it will exist forever.
		if (!(this.server.memoryFs.exists(path) || allowMissing)) {
			throw new FileNotFound(path);
		}

		// Check if we've already calculated and saved a UID
		const existing = this.filenameToUID.get(path);
		if (existing !== undefined) {
			return existing;
		}

		const project = this.assertProjectExisting(path);

		// Format of uids will be <PROJECT_NAME>/<PACKAGE_NAME>/<RELATIVE>
		let parts: string[] = [project.config.name];

		// Path we will relativize against for the final UID parts
		let root = project.directory;

		// Push on parent package name
		const pkg = this.server.memoryFs.getOwnedManifest(path);
		if (pkg !== undefined && !pkg.directory.equal(project.directory)) {
			const name = manifestNameToString(pkg.manifest.name);
			if (name !== undefined) {
				parts.push(name);
				root = pkg.directory;
			}
		}

		const relativeSegments = root.relativeForce(path).getSegments();
		parts = parts.concat(relativeSegments);

		const uid = createUIDPathFromSegments(parts);
		if (this.server.memoryFs.exists(path) || !allowMissing) {
			this.setUID(path, uid);
		}
		return uid;
	}

	public getFileReference(real: AbsoluteFilePath): FileReference {
		const project = this.assertProjectExisting(real);
		const uid = this.getUID(real);
		const pkg = this.server.memoryFs.getOwnedManifest(real);

		// TODO should we cache this?
		let ref: FileReference;

		if (pkg === undefined) {
			ref = {
				uid,
				real,
				project: project.id,
			};
		} else {
			ref = {
				uid,
				real,
				manifest: pkg.id,
			};
		}

		const remote = this.localPathToRemote.has(real);
		if (remote) {
			return {
				...ref,
				remote,
			};
		} else {
			return ref;
		}
	}

	public getURLFileReference(
		local: AbsoluteFilePath,
		url: URLPath,
	): FileReference {
		if (!this.remoteToLocalPath.has(url)) {
			this.remoteToLocalPath.set(url, local);
			this.localPathToRemote.set(local, url);
		}

		return this.getFileReference(local);
	}

	public async maybeEvictProjects(paths: AbsoluteFilePath[]): Promise<boolean> {
		// Check if this filename is a rome config dependency
		let projectIds: Set<number> = new Set();
		for (const path of paths) {
			const pathProjectIds = this.projectConfigDependenciesToIds.get(path);
			if (pathProjectIds !== undefined) {
				projectIds = new Set([...projectIds, ...pathProjectIds]);
			}
		}
		if (projectIds.size === 0) {
			return false;
		}

		const projectsToEvict: Set<ProjectDefinition> = new Set();

		function getAllProjects(project: ProjectDefinition) {
			let children: ProjectDefinition[] = [];
			for (const child of project.children) {
				children = children.concat(getAllProjects(child));
			}
			return [project, ...children];
		}

		for (const evictProjectId of projectIds) {
			// Fetch the project
			const project = this.projects.assert(evictProjectId);

			// Add all parent projects
			let topProject = project;
			while (topProject.parent !== undefined) {
				topProject = topProject.parent;
			}
			for (const project of getAllProjects(topProject)) {
				projectsToEvict.add(project);
			}
		}

		// Evict
		for (const project of projectsToEvict) {
			await this.evictProject(project, true);
		}

		return true;
	}

	public async evictProject(project: ProjectDefinition, reload: boolean) {
		await this.server.memoryFs.processingLock.wrap(async () => {
			const evictProjectId = project.id;

			// Remove the config locs from our internal map that belong to this project
			for (const [configLoc, projectIds] of this.projectConfigDependenciesToIds) {
				if (projectIds.has(evictProjectId)) {
					projectIds.delete(evictProjectId);
				}

				if (projectIds.size === 0) {
					this.projectConfigDependenciesToIds.delete(configLoc);
				}
			}

			// Notify all workers that it should delete the project
			for (const {bridge} of this.server.workerManager.getWorkers()) {
				// Evict project
				bridge.events.evictProject.send(evictProjectId);

				// Evict packages
				bridge.events.updateManifests.send({
					manifests: new Map(
						Array.from(project.manifests.keys(), (id) => [id, undefined]),
					),
				});
			}

			// Delete the project from 'our internal map
			this.projects.delete(evictProjectId);
			this.projectDirectoryToProject.delete(project.directory);

			// Tell the MemoryFileSystem to close the watcher so new file events are not emitted
			this.server.memoryFs.close(project.directory);

			// Evict all files that belong to this project and delete their project mapping
			const ownedPaths: AbsoluteFilePath[] = Array.from(
				this.server.memoryFs.glob(project.directory),
			);
			await promiseAllFrom(
				ownedPaths,
				(path) =>
					this.server.fileAllocator.evict(
						path,
						markup`project dependency change`,
					)
				,
			);
			for (const path of ownedPaths) {
				this.handleDeleted(path);
			}

			// Tell the MemoryFileSystem to clear it's maps
			this.server.memoryFs.unwatch(project.directory);

			this.logger.info(
				markup`Evicted project <emphasis>${project.directory}</emphasis>`,
			);

			if (reload) {
				this.logger.info(
					markup`Reloading evicted project <emphasis>${project.directory}</emphasis>`,
				);
				await this.findProject(project.directory);
			}
		});
	}

	public getProjects(): ProjectDefinition[] {
		return Array.from(this.projects.values());
	}

	private addDependencyToProjectId(
		path: AbsoluteFilePath,
		projectId: number,
	): void {
		const ids = this.projectConfigDependenciesToIds.get(path);

		if (ids === undefined) {
			this.projectConfigDependenciesToIds.set(path, new Set([projectId]));
		} else {
			ids.add(projectId);
		}
	}

	public findProjectConfigConsumer(
		def: ProjectDefinition,
		test: (consumer: Consumer) => undefined | false | Consumer,
	): ProjectConfigSource {
		const {meta} = def;

		for (const consumer of meta.consumersChain) {
			const value = test(consumer);
			if (value !== undefined && value !== false && value.exists()) {
				return {value, consumer: meta.consumer};
			}
		}

		return {value: undefined, consumer: meta.consumer};
	}

	public async getVCSClient(project: ProjectDefinition): Promise<VCSClient> {
		const client = await this.maybeGetVCSClient(project);

		if (client === undefined) {
			const {
				value: rootConfigConsumer,
				consumer,
			} = this.findProjectConfigConsumer(
				project,
				(consumer) => consumer.has("vsc") && consumer.getPath(["vsc", "root"]),
			);

			const rootConfigLocation: undefined | DiagnosticLocation =
				rootConfigConsumer === undefined
					? undefined
					: rootConfigConsumer.getDiagnosticLocation();

			const location: DiagnosticLocation =
				rootConfigLocation === undefined
					? consumer.getDiagnosticLocation()
					: rootConfigLocation;

			throw createSingleDiagnosticsError({
				description: descriptions.PROJECT_MANAGER.NO_VCS(rootConfigLocation),
				location,
			});
		} else {
			return client;
		}
	}

	public async maybeGetVCSClient(
		project: ProjectDefinition,
	): Promise<undefined | VCSClient> {
		return await getVCSClient(project.config.vcs.root);
	}

	public addDiskProject(
		opts: {
			isPartial: boolean;
			projectDirectory: AbsoluteFilePath;
			configPath: AbsoluteFilePath;
			reader: CachedFileReader;
		},
	): Promise<void> {
		const {projectDirectory, configPath, isPartial} = opts;

		return this.projectLoadingLocks.wrapLock(
			async () => {
				if (this.hasLoadedProjectDirectory(projectDirectory)) {
					// Already defined
					return;
				}

				const {config, meta} = await loadCompleteProjectConfig(
					projectDirectory,
					configPath,
					opts.reader,
				);

				await this.declareProject({
					isPartial,
					projectDirectory: opts.projectDirectory,
					meta,
					config,
				});
			},
			projectDirectory,
		);
	}

	private async declareProject(
		{
			projectDirectory,
			meta,
			config,
			isPartial,
		}: {
			isPartial: boolean;
			projectDirectory: AbsoluteFilePath;
			meta: ProjectConfigMeta;
			config: ProjectConfig;
		},
	): Promise<void> {
		// Make sure there's no project with the same `name` as us
		for (const project of this.getProjects()) {
			if (project.config.name === config.name) {
				// TODO
				throw new Error(
					`Conflicting project name ${config.name}. ${projectDirectory.join()} and ${project.directory.join()}`,
				);
			}
		}

		const parentProject = this.findLoadedProject(projectDirectory.getParent());

		// The root project is the highest reachable project. The `root` project will not have the `root` property visible.
		const rootProject =
			parentProject === undefined
				? undefined
				: parentProject.root ?? parentProject;

		// Declare the project
		const project: ProjectDefinition = {
			config,
			meta,
			directory: projectDirectory,
			id: this.projectIdCounter++,
			packages: new Map(),
			manifests: new Map(),
			root: rootProject,
			parent: parentProject,
			children: new Set(),
			initialized: false,
			partial: isPartial,
		};

		this.logger.info(
			markup`Declared project <emphasis>#${project.id}</emphasis> from <emphasis>${projectDirectory}</emphasis>`,
		);

		this.projects.set(project.id, project);
		this.projectDirectoryToProject.set(projectDirectory, project);

		parentProject?.children.add(project);

		// Add all project config dependencies so changes invalidate the whole project
		if (meta.configPath !== undefined) {
			this.addDependencyToProjectId(meta.configPath, project.id);
		}
		for (const loc of meta.configDependencies) {
			this.addDependencyToProjectId(loc, project.id);
		}

		// Notify other pieces of our creation
		await this.server.workerManager.onNewProject(project);
	}

	public declareManifest(
		project: ProjectDefinition,
		isProjectPackage: boolean,
		def: ManifestDefinition,
		diagnostics: DiagnosticsProcessor,
	) {
		const name = manifestNameToString(def.manifest.name);

		const type = isProjectPackage ? "project package manifest" : "manifest";
		this.logger.info(
			markup`Declaring ${type} <emphasis>${name}</emphasis> in project <emphasis>#${project.id}</emphasis> in <emphasis>${def.directory}</emphasis>`,
		);

		// Declare this package in all projects
		const projects = this.getHierarchyFromProject(project);

		// Check for collisions
		if (isProjectPackage && name !== undefined) {
			for (const project of projects) {
				// If there is no package then there's nothing to collide
				const existingPackage = project.packages.get(name);
				if (existingPackage === undefined) {
					continue;
				}

				diagnostics.addDiagnostic({
					description: descriptions.PROJECT_MANAGER.DUPLICATE_PACKAGE(
						name,
						existingPackage.path.join(),
					),
					location: def.consumer.get("name").getDiagnosticLocation(
						"inner-value",
					),
				});
				return;
			}
		}

		// Set as a package
		for (const project of projects) {
			this.addDependencyToProjectId(def.path, project.id);
			project.manifests.set(def.id, def);

			if (isProjectPackage && name !== undefined) {
				project.packages.set(name, def);
			}
		}
	}

	public async notifyWorkersOfProjects(
		workers: WorkerContainer[],
		projects?: ProjectDefinition[],
	): Promise<void> {
		if (projects === undefined) {
			projects = Array.from(this.projects.values());
		}

		const manifestsSerial: WorkerPartialManifestsTransport = new Map();
		const workerProjects: WorkerProjects = new Map();
		for (const project of projects) {
			workerProjects.set(
				project.id,
				{
					configCacheKeys: project.meta.configCacheKeys,
					configPath: project.meta.configPath,
					config: project.config,
					directory: project.directory,
				},
			);

			for (const [id, def] of project.manifests) {
				manifestsSerial.set(
					id,
					this.server.memoryFs.getPartialManifest(def, project),
				);
			}
		}

		const promises = [];

		for (const worker of workers) {
			// Script runners do not care
			if (worker.type === "script-runner") {
				continue;
			}

			promises.push(worker.bridge.events.updateProjects.call(workerProjects));
			promises.push(
				worker.bridge.events.updateManifests.call({
					manifests: manifestsSerial,
				}),
			);
		}

		await Promise.all(promises);
	}

	public async assertProject(
		path: AbsoluteFilePath,
		location?: DiagnosticLocation,
	): Promise<ProjectDefinition> {
		const project =
			this.findLoadedProject(path) || (await this.findProject(path));
		if (project) {
			return project;
		}

		if (location === undefined) {
			throw new Error(
				`Couldn't find a project. Checked ${PROJECT_CONFIG_FILENAMES.join(
					" or ",
				)} for ${path.join()}`,
			);
		} else {
			throw createSingleDiagnosticsError({
				location,
				description: descriptions.PROJECT_MANAGER.NOT_FOUND,
			});
		}
	}

	public hasLoadedProjectDirectory(path: AbsoluteFilePath): boolean {
		return this.projectDirectoryToProject.has(path);
	}

	// Convenience method to get the project config and pass it to the file handler class
	public getHandlerWithProject(path: AbsoluteFilePath): GetFileHandlerResult {
		const project = this.findLoadedProject(path);
		if (project === undefined) {
			return {ext: "", handler: undefined};
		} else {
			return getFileHandlerFromPath(path, project.config);
		}
	}

	public getHierarchyFromProject(
		project: ProjectDefinition,
	): ProjectDefinition[] {
		const projects: ProjectDefinition[] = [];

		let currProject: undefined | ProjectDefinition = project;
		while (currProject !== undefined) {
			projects.push(currProject);

			// root projects shouldn't be considered to have any parents
			if (currProject.config.root) {
				break;
			}

			currProject = project.parent;
		}

		return projects;
	}

	public getRootProjectForPath(path: AbsoluteFilePath): ProjectDefinition {
		const project = this.assertProjectExisting(path);
		return project.root ?? project;
	}

	public assertProjectExisting(path: AbsoluteFilePath): ProjectDefinition {
		const project = this.findLoadedProject(path);
		if (project === undefined) {
			throw new Error(
				`Expected existing project for ${path.join()} only have ${Array.from(
					this.projectDirectoryToProject.keys(),
					(directory) => directory.join(),
				).join(", ")}`,
			);
		}
		return project;
	}

	public getProjectFromPath(
		path: AbsoluteFilePath,
	): undefined | ProjectDefinition {
		return this.projectDirectoryToProject.get(path);
	}

	/**
	 * Given a path, it returns the list of projects
	 * @param path
	 */
	public getProjectHierarchyFromPath(
		path: AbsoluteFilePath,
	): ProjectDefinition[] {
		const found = this.findLoadedProject(path);
		if (found === undefined) {
			return [];
		} else {
			return this.getHierarchyFromProject(found);
		}
	}

	public findLoadedProject(
		path: AbsoluteFilePath,
	): undefined | ProjectDefinition {
		for (const dir of path.getChain()) {
			const project = this.projectDirectoryToProject.get(dir);
			if (project !== undefined) {
				return project;
			}
		}

		return undefined;
	}

	// Attempt to find a project on the real disk and seed it into the memory file system
	public async findProject(
		cwd: AbsoluteFilePath,
		partial: boolean = false,
	): Promise<undefined | ProjectDefinition> {
		await this.server.memoryFs.processingLock.wait();

		// Check if we have an existing project
		const syncProject = this.findLoadedProject(cwd);
		if (syncProject !== undefined) {
			let rewatch = false;
			// They want the whole project but we only have a partial project loaded
			if (syncProject.partial && !partial) {
				rewatch = true;
			}
			// They want a partial project, we only have a partial project loaded, but we don't have this file!
			if (syncProject.partial && partial && !this.server.memoryFs.exists(cwd)) {
				rewatch = true;
			}
			if (rewatch) {
				await this.server.memoryFs.watch(syncProject.meta.projectDirectory);
			}

			return syncProject;
		}

		const processor = DiagnosticsProcessor.createImmediateThrower({
			entity: "ProjectManager.findProject",
		});

		// If not then let's access the file system and try to find one
		for (const dir of cwd.getChain(true)) {
			// Check for dedicated project configs
			for (const configFilename of PROJECT_CONFIG_FILENAMES) {
				// Check in root
				const configPath = dir.append(PROJECT_CONFIG_DIRECTORY, configFilename);

				const hasProject = await this.server.memoryFs.existsHard(configPath);
				if (hasProject) {
					if (this.isLoadingBannedProjectPath(dir, configPath, processor)) {
						// Would have emitted a diagnostic
						return;
					}
					await this.server.memoryFs.watch(dir, cwd, partial);
					return this.assertProjectExisting(cwd);
				}
			}

			// Check for package.json
			const packagePath = dir.append("package.json");
			if (await this.server.memoryFs.existsHard(packagePath)) {
				const input = await packagePath.readFileText();
				const consumer = await json.consumeValue({input, path: packagePath});
				if (consumer.has(PROJECT_CONFIG_PACKAGE_JSON_FIELD)) {
					if (this.isLoadingBannedProjectPath(dir, packagePath, processor)) {
						// Would have emitted a diagnostic
						return;
					}

					await this.server.memoryFs.watch(dir, cwd, partial);
					return this.assertProjectExisting(cwd);
				}
			}
		}

		// If we didn't find a project config then
		for (const dir of cwd.getChain()) {
			// Check for typo config filenames
			for (const basename of PROJECT_CONFIG_WARN_FILENAMES) {
				const path = dir.append(basename);

				if (await this.server.memoryFs.existsHard(path)) {
					this.checkPathForIncorrectConfig(path, processor);
				}
			}

			// Check for configs outside of a .config directory
			for (const configFilename of PROJECT_CONFIG_FILENAMES) {
				const path = dir.append(configFilename);

				if (await this.server.memoryFs.existsHard(path)) {
					this.checkPathForIncorrectConfig(path, processor);
				}
			}
		}

		this.logger.info(markup`Found no project for <emphasis>${cwd}</emphasis>`);

		return undefined;
	}

	// Refuse to load project path or root as valid project directories
	public isBannedProjectPath(projectFolder: AbsoluteFilePath): boolean {
		return (
			projectFolder.isRoot() ||
			PROJECT_CONFIG_SENSITIVE_DIRECTORIES.has(projectFolder)
		);
	}

	// Create a diagnostic if the project folder is sensitive
	private isLoadingBannedProjectPath(
		projectFolder: AbsoluteFilePath,
		configPath: AbsoluteFilePath,
		diagnostics: DiagnosticsProcessor,
	): boolean {
		if (this.isBannedProjectPath(projectFolder)) {
			diagnostics.addDiagnostic({
				description: descriptions.PROJECT_MANAGER.LOADING_SENSITIVE(
					projectFolder,
				),
				location: {
					path: configPath,
				},
			});
			return true;
		} else {
			return false;
		}
	}

	public checkPathForIncorrectConfig(
		path: AbsoluteFilePath,
		diagnostics: DiagnosticsProcessor,
	) {
		if (PROJECT_CONFIG_WARN_FILENAMES.includes(path.getBasename())) {
			diagnostics.addDiagnostic({
				description: descriptions.PROJECT_MANAGER.TYPO_CONFIG_FILENAME(
					path.getBasename(),
					PROJECT_CONFIG_FILENAMES,
				),
				location: {
					path,
				},
			});
		}

		if (
			PROJECT_CONFIG_FILENAMES.includes(path.getBasename()) &&
			path.getParent().getBasename() !== PROJECT_CONFIG_DIRECTORY
		) {
			diagnostics.addDiagnostic({
				description: descriptions.PROJECT_MANAGER.MISPLACED_CONFIG(
					path.getBasename(),
				),
				location: {
					path,
				},
			});
		}
	}
}
