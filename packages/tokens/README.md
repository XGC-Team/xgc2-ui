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

The shared foundation is deliberately neutral rather than blue-grey: dark mode
uses near-black graphite and subtly warm charcoal; light mode uses paper-white
and warm neutral grey. Copper and amber are reserved for small accents, focus,
and selection, while semantic and syntax colors stay restrained. Validation
rejects a blue channel bias in foundational surfaces, borders, text, terminal,
and chart chrome. It also enforces WCAG contrast for body and control text
(7:1), secondary and quiet text (4.5:1), focus indicators (3:1), primary
controls (4.5:1), and code/terminal content (4.5:1 or 7:1 for primary text).

Material roles are intentionally small and semantic. `--background-app` is the
workspace canvas beneath product content; `--background-chrome` and
`--background-sidebar` form the shell; `--background-surface` and
`--background-panel-header` form both fixed and composable panels;
`--background-control` is reserved for interactive controls and compact
operator messages. `--shadow-card` supplies restrained elevation, so products
must not redraw panels with bright dark-mode outlines or local gradients. In
the light skin the surface is a warm porcelain gradient over a quiet grey-beige
workbench; in the dark skin it is raised by graphite luminance and shadow.

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

Interactive motion follows three shared durations (`quick`, `fast`, and
`deliberate`) and three purpose-based easing curves (`standard`, `enter`, and
`exit`). Opacity likewise uses the finite semantic roles in this package.
Measured charts, video overlays, robot instruments, and similar domain data may
retain honest local alpha/animation math; ordinary component styling may not
create a new token for each historical value.
