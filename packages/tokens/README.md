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

Selection colors and their complete enclosing halo are part of this theme contract:
use `--color-selection-highlight`, `--color-selection-glow`, and
`--shadow-selection-highlight-halo`. Products must not mirror these values in a
local skin. Ordinary component selection should prefer the quieter
`--shadow-selection-ring`; the highlight palette is reserved for spatial or
instrument selections that need stronger operator visibility.

The spatial rhythm is intentionally bounded to `--space-2xs`, `--space-xs`,
`--space-sm`, `--space-md`, `--space-lg`, `--space-xl`, `--space-2xl`, and
`--space-3xl`. Semantic aliases such as `--space-panel-padding` encode a
family-wide role. Numeric aliases (`--space-7`) and one-off tokens mirroring a
legacy pixel value are rejected by validation. Apply the same judgment to
type, radii, opacity, elevation, icon sizes, and breakpoints; domain geometry
does not become a design token merely because it is a number.
