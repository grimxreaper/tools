# `index.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-parser/index.test.ts --update-snapshots` to update.

## `core > scope > dupl-bind-func-script-sloppy`

```javascript
JSRoot {
	comments: Array []
	corrupt: false
	diagnostics: Array []
	directives: Array []
	filename: "input.js"
	hasHoistedVars: false
	interpreter: undefined
	mtime: undefined
	sourceType: "script"
	syntax: Array []
	loc: Object {
		filename: "input.js"
		end: Object {
			column: 0
			index: 40
			line: 2
		}
		start: Object {
			column: 0
			index: 0
			line: 1
		}
	}
	body: Array [
		JSBlockStatement {
			directives: Array []
			loc: Object {
				filename: "input.js"
				end: Object {
					column: 39
					index: 39
					line: 1
				}
				start: Object {
					column: 0
					index: 0
					line: 1
				}
			}
			body: Array [
				JSFunctionDeclaration {
					id: JSBindingIdentifier {
						name: "foo"
						loc: Object {
							filename: "input.js"
							identifierName: "foo"
							end: Object {
								column: 14
								index: 14
								line: 1
							}
							start: Object {
								column: 11
								index: 11
								line: 1
							}
						}
					}
					loc: Object {
						filename: "input.js"
						end: Object {
							column: 19
							index: 19
							line: 1
						}
						start: Object {
							column: 2
							index: 2
							line: 1
						}
					}
					body: JSBlockStatement {
						body: Array []
						directives: Array []
						loc: Object {
							filename: "input.js"
							end: Object {
								column: 19
								index: 19
								line: 1
							}
							start: Object {
								column: 17
								index: 17
								line: 1
							}
						}
					}
					head: JSFunctionHead {
						async: false
						generator: false
						hasHoistedVars: false
						params: Array []
						rest: undefined
						returnType: undefined
						thisType: undefined
						typeParameters: undefined
						loc: Object {
							filename: "input.js"
							end: Object {
								column: 16
								index: 16
								line: 1
							}
							start: Object {
								column: 14
								index: 14
								line: 1
							}
						}
					}
				}
				JSFunctionDeclaration {
					id: JSBindingIdentifier {
						name: "foo"
						loc: Object {
							filename: "input.js"
							identifierName: "foo"
							end: Object {
								column: 32
								index: 32
								line: 1
							}
							start: Object {
								column: 29
								index: 29
								line: 1
							}
						}
					}
					loc: Object {
						filename: "input.js"
						end: Object {
							column: 37
							index: 37
							line: 1
						}
						start: Object {
							column: 20
							index: 20
							line: 1
						}
					}
					body: JSBlockStatement {
						body: Array []
						directives: Array []
						loc: Object {
							filename: "input.js"
							end: Object {
								column: 37
								index: 37
								line: 1
							}
							start: Object {
								column: 35
								index: 35
								line: 1
							}
						}
					}
					head: JSFunctionHead {
						async: false
						generator: false
						hasHoistedVars: false
						params: Array []
						rest: undefined
						returnType: undefined
						thisType: undefined
						typeParameters: undefined
						loc: Object {
							filename: "input.js"
							end: Object {
								column: 34
								index: 34
								line: 1
							}
							start: Object {
								column: 32
								index: 32
								line: 1
							}
						}
					}
				}
			]
		}
	]
}
```