# `harness.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test internal/compiler/lint/rules/harness.test.ts --update-snapshots` to update.

## `a11y/useAnchorContent`

### `0`

```

 lint/a11y/useAnchorContent/reject/1/file.jsx:1 lint/a11y/useAnchorContent ━━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ Provide screen reader accessible content when using anchor elements.

    <a />
    ^^^^^

  ℹ All links on a page should have content that is accessible to screen readers.


```

### `0: formatted`

```jsx
<a />;

```

### `1`

```

 lint/a11y/useAnchorContent/reject/2/file.jsx:1 lint/a11y/useAnchorContent ━━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ Provide screen reader accessible content when using anchor elements.

    <a><TextWrapper aria-hidden /></a>
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  ℹ All links on a page should have content that is accessible to screen readers.


```

### `1: formatted`

```jsx
<a>
	<TextWrapper aria-hidden />
</a>;

```

### `2`

```

```

### `2: formatted`

```jsx
<a>
	Anchor Content!
</a>;

```

### `3`

```

```

### `3: formatted`

```jsx
<a>
	<TextWrapper />
</a>;

```

### `4`

```

```

### `4: formatted`

```jsx
<a dangerouslySetInnerHTML={{__html: "foo"}} />;

```

### `5`

```

```

### `5: formatted`

```jsx
<a>
	<TextWrapper aria-hidden={true} />
	 visible content
</a>;

```

### `6`

```

 lint/a11y/useAnchorContent/reject/1/file.html:1 lint/a11y/useAnchorContent ━━━━━━━━━━━━━━━━━━━━━━━━

  ✖ Provide screen reader accessible content when using anchor elements.

    <a></a>
    ^^^^^^

  ℹ All links on a page should have content that is accessible to screen readers.


```

### `6: formatted`

```html
<a>
</a>

```

### `7`

```

```

### `7: formatted`

```html
<a>
	Anchor Content!
</a>

```

### `8`

```

```

### `8: formatted`

```html
<a>
	<div aria-hidden="true">
	</div>
	visible content
</a>

```
