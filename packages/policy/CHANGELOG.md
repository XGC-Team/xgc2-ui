# @xgc2/ui-policy

## 0.18.11

### Patch Changes

- Allow each workspace tab to opt out of deletion while preserving selection, rename, reorder and existing default behavior.
- Updated dependencies
  - @xgc2/ui-react@0.18.11

## 0.18.10

### Patch Changes

- Give tooltips a semantic layer above portaled controls and shared notifications so option help remains visible over open menus.
- Updated dependencies
  - @xgc2/ui-react@0.18.10

## 0.18.9

### Patch Changes

- Support optional hover help on select options through the shared Tooltip component, preserving option labels and selection behavior.
- Updated dependencies
  - @xgc2/ui-react@0.18.9

## 0.18.8

### Patch Changes

- Keep native tables inside the shared scrolling viewport full width, including single-row and empty file lists. Preserve the existing table typography, column alignment, and ordinary non-scrolling tables. Pair the policy with the React release.
- Updated dependencies
  - @xgc2/ui-react@0.18.8

## 0.18.7

### Patch Changes

- Add explicit flat DataTable chrome for embedded file views while preserving default frames, row dividers and keyboard focus feedback. Pair the policy with the React release.
- Updated dependencies
  - @xgc2/ui-react@0.18.7

## 0.18.6

### Patch Changes

- Keep confirmation actions in two equal tracks, wrap long content, and stack actions in narrow dialogs.
- Updated dependencies
  - @xgc2/ui-react@0.18.6

## 0.18.5

### Patch Changes

- Expose WorkflowStatusCard progressClassName so product layouts can select their own progress presentation without reaching into shared component classes. Existing cards retain their default behavior.
- Updated dependencies
  - @xgc2/ui-react@0.18.5

## 0.18.4

### Patch Changes

- WorkspaceTabs renders a hidden combobox fallback (same items, switch-only) so owning layouts can swap the scroll strip for a combobox inside their own container-query breakpoint instead of growing a horizontal scrollbar.
- Updated dependencies
  - @xgc2/ui-react@0.18.4

## 0.18.3

### Patch Changes

- Fix the FormSection container collapse losing the cascade to the base two-column rule; the container query now follows the base grid so narrow containers actually stack their fields.
- Updated dependencies
  - @xgc2/ui-react@0.18.3

## 0.18.2

### Patch Changes

- FormSection collapses its field grid by its own container width (600px container query) instead of the viewport, and modal titles truncate with the shared header-label ellipsis contract.
- Updated dependencies
  - @xgc2/ui-react@0.18.2

## 0.18.1

### Patch Changes

- Track the react 0.18.1 data-table viewport contract.

## 0.18.0

### Minor Changes

- bbb5437: Replace implicit browser theme persistence with an explicit product-owned SkinStore. Share initialized snapshots through initializeSkin/useSkin, expose async commit failures, and provide an explicit memory-only store. Preserve the shared DOM policy and align the workflow React peer floor with the 0.17 family.

### Patch Changes

- 6c947e8: Present a confirmed measured terminal receipt once in WorkflowStatusCard. Keep execution state and callbacks independent of token-based playback, honor the reduced-motion floor, and consume paused receipts without replay. Pair policy with the React patch.
- 2ace3a2: Animate overlay presence in Drawer, Modal, Popover, and SelectMenu. Enter runs once on mount; a closing surface stays mounted through its exit animation via the new shared `usePresence` hook, which waits for the surface's running animations and always releases the node through a leak-guard timer. Overlay stack registration, focus restore, and trigger aria still observe the close immediately. Reduced-motion operators and environments without matchMedia keep the historical instant mount/unmount path. Durations, easings, travel distances, and opacity endpoints are shared tokens only. Pair policy with the React patch.
- 7270461: Add optional accessible option descriptions to the shared SelectMenu, keeping trigger labels and keyboard behavior unchanged. Pair the policy release without changing its rules.
- 650da8f: Align the sidebar brand and navigation icon axes while retaining width motion and reduced-motion behavior.
- 606cd25: Measure Tooltip placement from the rendered child of the transparent event host. Cancel paired pointer/mouse hover timers on leave, disable and scroll so dismissed help cannot reopen. Preserve the explicit product-owned SkinStore contract and pair policy with the React patch.
- Updated dependencies [bbb5437]
- Updated dependencies [6c947e8]
- Updated dependencies [2ace3a2]
- Updated dependencies [7270461]
- Updated dependencies [650da8f]
- Updated dependencies
- Updated dependencies [606cd25]
  - @xgc2/ui-react@0.18.0

## 0.17.6

### Patch Changes

- Pair with @xgc2/ui-react 0.17.6. Existing policy rules are unchanged.

## 0.17.5

### Patch Changes

- Pair with @xgc2/ui-react 0.17.5. Existing policy rules are unchanged.

## 0.17.4

### Patch Changes

- Pair with @xgc2/ui-react 0.17.4. Existing policy rules are unchanged.

## 0.17.3

### Patch Changes

- Pair with @xgc2/ui-react 0.17.3 and its shared overlay presence motion contract; existing policy gates remain unchanged.

## 0.17.2

### Patch Changes

- Pair with @xgc2/ui-react 0.17.2 and its shared terminal progress presentation contract; existing policy gates remain unchanged.

## 0.17.1

### Patch Changes

- Pair with `@xgc2/ui-react` 0.17.1 and its Tooltip geometry and dismissal fixes. The explicit product-owned SkinStore and existing policy rules remain unchanged.

## 0.17.0

### Minor Changes

- Pair with `@xgc2/ui-react` 0.17.0 and document the explicit product-owned `SkinStore` boundary. Positive fixtures use injected stores; direct document theme mutation and browser theme persistence remain rejected with unchanged rules.

## 0.16.19

### Patch Changes

- Keep @xgc2/ui-policy paired with @xgc2/ui-react 0.16.19; the text-role tokens (`--type-*`) are shared-owned, so product CSS may consume but never redefine them.
- New typography gate (`typographyContractViolations`): `font-size`, `font-weight`, `line-height`, `letter-spacing` and the `font` shorthand must come from role or primitive tokens (CSS-wide keywords, `letter-spacing: 0|normal` and `font-size: 0` stay legal); shared type tokens (`--font-*`, `--weight-*`, `--line-height-*`, `--tracking-*`, `--type-*`) may not carry a `var()` fallback; `--font-md` and `--weight-strong` were removed from the token set and referencing either is a hard error; `font-family` must be exactly one shared family token; typographic custom properties may not launder literal values or private font stacks; monospace may not be set above the bundled 400/500 faces.
- Fixed-geometry instrumentation opts out of the literal-value checks only, per stylesheet, with `/* xgc2-style-policy: fixed-geometry-typography — <decision or instrument contract> */`; an exemption without a reason fails, and the CLI lists every exempt file on stdout.
- Updated dependencies
  - @xgc2/ui-react@0.16.19

## 0.16.18

### Patch Changes

- Keep @xgc2/ui-policy paired with @xgc2/ui-react 0.16.18; policy rules are unchanged.
- Updated dependencies
  - @xgc2/ui-react@0.16.18

## 0.16.17

- Keep policy paired with React 0.16.17 and its exact peer dependency; gates are unchanged from 0.16.16.

## 0.16.16

- New `rawCustomPropertyDurationViolations` rule: raw motion durations fail even inside custom properties (zero durations and `var()`-driven expressions stay legal), closing the hole where a raw value hid behind `--my-duration: 1.6s`.
- The ownership snapshot now covers the v016, monochrome, responsive, and focus stylesheets, so shared classes such as `xgc-page-frame-*` and `xgc-workbench-*` are protected again.
- Keep policy paired with React 0.16.16 and its exact peer dependency.

## 0.16.15

- New `rawSpacingLiteralViolations` rule: raw pixel literals in `padding`, `margin`, `gap`, and `inset` declarations fail the gate. Exempt honest geometry: `0` resets, `1px` hairlines, the `-1px` visually-hidden idiom, and any token-driven value (`var()`, including relative `calc()` compositions). Spacing must come from the bounded scale or a semantic role.
- Keep policy paired with React 0.16.15 and its exact peer dependency.

## 0.16.14

- Keep policy paired with React 0.16.14 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.13

- Keep policy paired with React 0.16.13 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.12

- Keep policy paired with React 0.16.12 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.11

- Provide the shared inverse button appearance with immediate held-state feedback and matching policy ownership.

## 0.16.10

### Patch Changes

- Keep policy paired with React 0.16.10 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.9

### Patch Changes

- Keep policy paired with React 0.16.9 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.8

### Patch Changes

- Keep policy paired with React 0.16.8 and its exact peer dependency. Existing policy rules remain unchanged.

## 0.16.7

### Patch Changes

- Align the policy package and exact React peer with the 0.16.7 log table controls.
  Existing policy rules remain unchanged.
- Updated dependencies
  - @xgc2/ui-react@0.16.7

## 0.16.6

### Patch Changes

- Align the policy version and exact React peer with the 0.16.6 danger controls. Permit semantic material only on explicitly opted-in solid danger command tiles while retaining status decoration prohibitions.

## 0.16.5

### Patch Changes

- Use a muted brick-red danger palette in the light v016 theme and a softer coral-red palette in the dark theme. Align danger text, strong text, borders, and feedback surfaces while preserving existing control behavior and domain-specific HUD alarm colors.

  Rebuild the React stylesheet with the updated theme tokens and keep policy paired with the React patch release.
- Updated dependencies
  - @xgc2/ui-react@0.16.5

## 0.16.4

### Patch Changes

- Align the policy version and exact React peer with the 0.16.4 command control surfaces. Existing policy gates remain unchanged.

## 0.16.3

### Patch Changes

- Align the policy version and exact React peer with the 0.16.3 shared table sizing fixes. Existing policy gates remain unchanged.

## 0.16.1

### Patch Changes

- Keep the policy version and exact React peer aligned with the 0.16.1 sidebar and table-header fixes. Existing policy gates remain unchanged.

## 0.16.0

### Minor Changes

- Lock the policy package to `@xgc2/ui-react@0.16.0` so every 0.16 consumer validates against the same monochrome foundation and shared layout/interaction family.
- Carry the 0.16 product-system baseline forward as a fail-closed consumer contract; additional Workbench and advanced-surface rules can now evolve on the same versioned family instead of drifting behind React.
- Updated dependencies
  - @xgc2/ui-react@0.16.0

## 0.15.13

### Patch Changes

- Lock the shared Panel header spacing and regular-title contract.
- Updated dependencies
  - @xgc2/ui-react@0.15.13

## 0.15.12

### Patch Changes

- Require the bounded data-table sticky-header and themed scrollbar contract.
- Updated dependencies
  - @xgc2/ui-react@0.15.12

## 0.15.11

### Patch Changes

- Reserve a shared ListPage clip margin so control focus rings remain visible at
  the page edge without product-specific padding workarounds.
- Updated dependencies
  - @xgc2/ui-react@0.15.11

## 0.15.10

### Patch Changes

- Allow `WorkflowStatusCard` progress to select its own semantic tone and fill
  color without recoloring the card status label.
- Updated dependencies
  - @xgc2/ui-react@0.15.10

## 0.15.9

### Patch Changes

- Updated dependencies
  - @xgc2/ui-react@0.15.9

## 0.15.8

### Patch Changes

- Separate resource-directory and form/settings layout ownership, mark each
  shared family in the DOM, and reject selectors that couple their geometry.
  Keep Settings on the compact control-height rhythm.
- Updated dependencies
  - @xgc2/ui-react@0.15.8
