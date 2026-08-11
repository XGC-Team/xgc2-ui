# @xgc2/ui-tokens

Import the tokens before application or component CSS:

```css
@import '@xgc2/ui-tokens';
@import '@xgc2/ui-tokens/base.css';
```

Set the active skin on the root element:

```html
<html data-skin="dark">
```

Applications may add domain-specific tokens, but must not redefine shared tokens locally.
