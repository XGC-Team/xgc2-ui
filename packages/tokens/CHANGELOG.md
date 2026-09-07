# @xgc2/ui-tokens

## 0.10.3

### Patch Changes

- Add `--color-progress-measured` for measured-complete progress fills: dark `#7ddc9a`, light `#19c66b`. Keep `--color-success` for status copy.

## 0.10.2

### Patch Changes

- Add a theme-specific on-danger foreground and verify readable text across idle, hover, active, and held command states in both palettes.

## 0.10.1

### Patch Changes

- Use a muted brick-red danger palette in the light v016 theme and a softer coral-red palette in the dark theme. Align danger text, strong text, borders, and feedback surfaces while preserving existing control behavior and domain-specific HUD alarm colors.

  Rebuild the React stylesheet with the updated theme tokens and keep policy paired with the React patch release.

## 0.10.0

### Minor Changes

- Introduce the 0.16 monochrome desktop foundation: neutral black/white/graphite application materials, semantic color reserved for data and decision-relevant states, and a separate optical light/dark hierarchy.
- Raise the compact legibility floor with 13px base text, 28px compact controls, 32px default controls, 38px panel chrome, and 40px page chrome while preserving the bounded spacing vocabulary.
- Add the versioned `v016.css` and `v016-monochrome.css` token surfaces so the new family can be validated and published without mutating an older immutable release.

## 0.9.3

### Patch Changes

- 74177d3: Shrink the number-input stepper to native-spinner proportions: the column
  drops from `--size-icon-xl` (24px) to `--size-icon-default` (16px), and the
  chevrons drop from a 12px box to a new `--size-icon-2xs` (10px) box, so the
  8×5 viewBox paints a ~7.5×3.75px glyph at a ~1.25px thin stroke. The arrows
  now read as a subordinate detail of the 30px control instead of a heavy,
  oversized arrowhead.

## 0.9.2

### Patch Changes

- a835608: Give first-level panel headers equal four-pixel padding on all sides around compact controls, with the divider occupying its own pixel.

## 0.9.1

### Patch Changes

- Grow the panel header height to 35px so a framed header holds the compact
  control row plus one divider pixel with equal four-pixel padding on every
  side.

## 0.9.0

### Minor Changes

- Restore the light skin to the original cool blue-grey industrial hierarchy:
  a `#f4f6fa` workbench, white chrome and cards, soft `#d9e0ea` borders, slate
  text, and `#315fdc` interaction. Cream, beige, and copper casts stay rejected.
- Replace the achromatic light-foundation gate with a not-warm contract. Cool
  blue-grey and neutral white are valid; warm red-biased literals are not.

## 0.8.2

### Patch Changes

- Add `--space-panel-section-gap` and tighten the page, panel, and list-page
  chrome geometry that the 0.15.5 React family publishes inline.

## 0.8.1

### Patch Changes

- Restore the light skin to an achromatic neutral-white hierarchy. Application,
  chrome, panel, control, code, terminal, border, text, and shadow foundations
  now create depth through luminance instead of cream, yellow, brown, or blue
  tint, while accent, semantic, and syntax colors remain intentionally scoped.
- Reject both cool and warm color casts in light foundation and material
  literals with a two-level maximum RGB channel delta, including alpha colors
  used by overlays and shadows.

## 0.8.0

### Major corrective release

- Replace spacing-derived component dimensions with finite semantic geometry
  tokens for controls, workflow handles, tabs, swatches, audio, progress, and
  scrollbars.
- Establish `src/breakpoints.json` as the only responsive breakpoint authority;
  generated TypeScript and CSS artifacts replace non-functional CSS variables
  and duplicated literals.

## 0.7.0

### Minor Changes

- Rebuild both theme palettes around hue-neutral surface, border, text, shadow,
  scrollbar, code, and terminal materials, with measured contrast and restrained
  warm interaction accents instead of the withdrawn blue-gray foundation.
- Add finite semantic motion, easing, opacity, panel material, and bounded code
  viewport roles. Validation now enforces contrast and rejects blue-biased
  foundation colors and history-shaped numeric aliases.

## 0.6.0

### Minor Changes

- Replace the history-shaped numeric spacing vocabulary with eight bounded
  semantic steps and a small set of stable layout roles. Complete the shared
  light/dark color, material, type, opacity, elevation, icon, and responsive
  contracts; strengthen validation so products cannot revive numeric spacing or
  redefine shared theme decisions. Move the high-visibility selection palette
  and enclosing halo out of product skins and into the shared two-skin contract.

## 0.5.0

### Minor Changes

- Industrialize the shared XGC2 frontend foundation with reusable application
  shell, navigation, workspace tabs, breadcrumbs, list-page, configuration,
  choice-card, color, workflow-status, modal/drawer, audio-capture, and sortable
  data-table capabilities. Standardize responsive operator layouts, real PCM
  waveforms, compact syntax-highlighted code blocks, global scrollbars, panel
  geometry, selection surfaces, and refined light/dark materials while enforcing
  the family-wide ban on left accent bars, status dots, pills, and decorative
  healthy-state chrome.

## 0.4.1

### Patch Changes

- Expand the shared operator component set, preserve stable composite control metadata, and consolidate form, tooltip, and control styling for product migrations.

## 0.4.0

### Minor Changes

- Add semantic panel-header control sizing and theme-aware syntax-highlight colors. Panel chrome now fixes both header and action heights entirely through shared tokens. Rebuild both appearance modes around restrained surface hierarchy, low-saturation dark semantics, and subtle shared material gradients.

## 0.3.0

### Minor Changes

- Add explicit page, panel, and code metadata header tokens. Align first-level panels to the compact 34px XGC2 experiment-panel chrome and replace the prominent CodeBlock header with a quiet, space-efficient metadata and copy row. Add shared semantic Tabs with keyboard navigation and complete-background selection styling.

## 0.2.0

### Minor Changes

- Promote the original XGC2 scrollbar tokens and global browser rules into the shared UI contract, including Firefox and WebKit interaction states. Enforce the family-wide prohibition on left-side accent bars and simplify the topbar contract to one title plus high-value actions without decorative healthy-state pills.
