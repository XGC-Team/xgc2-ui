# @xgc2/ui-react

## 0.16.8

### Patch Changes

- Use the on-danger foreground for labeled danger buttons and explicitly solid command tiles. Preserve pressed relief, icon-only neutral surfaces, and disabled progress visibility.

## 0.16.7

### Patch Changes

- Keep log table refresh labels and headers stable during loading, expose scoped
  control and cell identities, derive SelectMenu trigger identity from its existing
  shell identity, and scope pagination actions to their existing entity identity.

## 0.16.6

### Patch Changes

- Give danger buttons with visible labels a solid destructive surface across appearances while keeping icon-only danger controls on neutral surfaces.
- Add an explicit solid command-tile appearance without inferring destructive action from a failed status, and retain pressed relief and readable progress when disabled.

## 0.16.5

### Patch Changes

- Bring workspace tabs and panel view switches onto the current neutral theme material, retaining full-surface selection and existing control heights. Keep navigation focus rings inside compact headers and tab scrollers so keyboard focus is never clipped.
- Use a muted brick-red danger palette in the light v016 theme and a softer coral-red palette in the dark theme. Align danger text, strong text, borders, and feedback surfaces while preserving existing control behavior and domain-specific HUD alarm colors.

  Rebuild the React stylesheet with the updated theme tokens and keep policy paired with the React patch release.

## 0.16.4

### Patch Changes

- Refine interactive workflow tiles with clean control surfaces, stable thin progress feedback, and readable disabled content.
- Add an opt-in raised Button appearance for compact command controls while preserving the existing default appearance and interaction semantics.

## 0.16.3

### Patch Changes

- Let the first real data row retain natural column sizing so previously measured pixel widths cannot freeze table layout after a viewport resize.
- Keep body-scrolling table headers and rows aligned across stable scrollbar gutters, including empty tables, selection columns, and viewport resizing.

## 0.16.1

### Patch Changes

- Render the sidebar collapse indicator in a fixed SVG icon box while retaining sidebar width motion.
- Expose typed DataTable header and sort-button host props so products can mark the actual interactive chrome without changing sorting ownership.

## 0.16.0

### Minor Changes

- Establish the 0.16 monochrome desktop foundation with neutral application chrome, semantic typography, quieter surfaces, more legible compact geometry, and a stable black/white/graphite visual hierarchy.
- Add the preview `@xgc2/ui-react/v016` surface with semantic `Heading`/`Text`, `PageFrame`, `CommandPalette`, `ConversationStream`, `WorkbenchShell`, `ResourceExplorer`, `ResourceWorkbench`, and the frame-batched external store APIs.
- Make deep `Panel` nesting flatten automatically so products no longer count panel levels or invent wrapper chrome for spacing.
- Preserve inactive editor/document/workbench state with React 19.2 `Activity` boundaries and isolate high-frequency visual data behind frame-batched, slice-selectable subscriptions.
- Add stable follow-tail behavior for streaming conversation surfaces so operator scroll position is never fought by incremental output.

## 0.15.19

### Patch Changes

- Keep Edit-mode panel drag on the WorkspacePanel chrome. The locked panel body
  and non-control header content remain drag handles, while native interactive
  controls and explicitly interactive descendants cancel dragging.

## 0.15.18

### Patch Changes

- FormField and FormGroup forward their ref to the field root; FormField
  tooltips attach to the field label instead of wrapping the whole field; the
  tooltip trigger is display:contents so it never reflows a parent
  grid/flex layout while staying in the DOM for child selectors, refs, focus,
  and pointer events.

## 0.15.17

### Patch Changes

- 74177d3: Shrink the number-input stepper to native-spinner proportions: the column
  drops from `--size-icon-xl` (24px) to `--size-icon-default` (16px), and the
  chevrons drop from a 12px box to a new `--size-icon-2xs` (10px) box, so the
  8×5 viewBox paints a ~7.5×3.75px glyph at a ~1.25px thin stroke. The arrows
  now read as a subordinate detail of the 30px control instead of a heavy,
  oversized arrowhead.

## 0.15.16

### Patch Changes

- f2d431f: Number-input stepper chevrons render at half their previous stroke weight
  (`--stroke-thin` instead of `--stroke-strong`). The 8×5 viewBox scales 1.5×
  to a 12px box, so the strong stroke painted a ~3px chevron on a 9px glyph —
  about twice the weight of the theme's other chevrons (e.g. lucide ~1.7px)
  and out of proportion with the 30px control.
- a835608: Give first-level panel headers equal four-pixel padding on all sides around compact controls, with the divider occupying its own pixel.
- 722a04c: Panel and WorkspacePanel header titles fill the header content row: the title line box uses --size-control-panel-header so the label has equal gaps on every side (the header --space-xs padding) and aligns with the header's compact controls.
- ecdb4ae: Keep AppShell sidebar width motion with a clipped expanded inner track. Framed Panels that render a header use the same --space-xs inset on default body as on the header.

## 0.15.15

### Patch Changes

- Panel and WorkspacePanel headers drop vertical padding and use the body
  inset (`--space-panel-padding`) inline, so the title label, trailing
  controls, and the first body row all sit on the same inset. Framed default
  bodies keep the same padding as their header.

## 0.15.14

### Patch Changes

- Panel and WorkspacePanel header titles fill the header content row so the
  label keeps equal gaps on every side and lines up with trailing controls.
  Panel accepts `headerProps` so products can stamp markable identity on the
  whole header chrome.

## 0.15.13

### Patch Changes

- Give Panel and WorkspacePanel headers full token padding and regular,
  theme-consistent title typography.

## 0.15.12

### Patch Changes

- Keep bounded data-table scrollbars inside the row viewport so sticky headers
  retain their theme surface without a covering gutter.

## 0.15.11

### Patch Changes

- Reserve a shared ListPage clip margin so control focus rings remain visible at
  the page edge without product-specific padding workarounds.

## 0.15.10

### Patch Changes

- Allow `WorkflowStatusCard` progress to select its own semantic tone and fill
  color without recoloring the card status label.

## 0.15.9

### Patch Changes

- Add `SortableDataTable` `emptyMode` (`'message' | 'table'`, default `'message'`).
  `'table'` keeps the real table rendered while `rows` is empty — column headers
  and the focusable body-scroll row viewport stay stable across empty and
  populated states, with an optional `emptyMessage` rendered as a full-width,
  headerless row inside the viewport. Column-width sync only measures real data
  rows, so the empty-state message never stamps its colSpan width onto the first
  header. The default `'message'` mode is unchanged for existing consumers.
- Ignore disabled selection controls in `SortableDataTable`: a disabled
  select-all checkbox can no longer trigger `selection.onChange`.

## 0.15.8

### Patch Changes

- Separate resource-directory and form/settings layout ownership, mark each
  shared family in the DOM, and reject selectors that couple their geometry.
  Keep Settings on the compact control-height rhythm.

## 0.15.7

### Patch Changes

- Stop per-frame overlay re-renders: `Popover` and `SelectMenu` coalesce
  capture-phase scroll/resize listeners into one animation-frame layout read
  and skip the position state write entirely when the resolved geometry is
  unchanged.
- Memoize `CodeBlock` and cache its highlight result per content+language so
  streaming transcripts and logs stop re-highlighting every historical block
  when a parent re-renders.
- Ship the family keyboard-focus contract as a dedicated unlayered stylesheet
  (`@xgc2/ui-react/focus.css`). Consumers import it after their resets so
  route-level styles can never erase the focus indicator; the rules move out of
  per-product CSS where they duplicated shared control internals.
- Own the `WorkflowStatusCard` `tile` geometry end to end: the title floats
  centered over the card without intercepting pointer events and the progress
  bar pins to the bottom edge, replacing per-product absolute-position patches.
- Add `Pagination` `hidePageSize` for fitted page sizes that must not offer a
  rows-per-page selector.
- Add `ListPage` / `ListPageHost` `contentWidth="full"` for dense operator
  pages that use the whole workspace instead of the centered reading column,
  plus `--xgc-list-folder-gap`, `--xgc-list-folder-item-gap`, and
  `--xgc-list-folder-title-padding-inline` spacing hooks.
- Consume a `--xgc-breadcrumb-item-max-width` hook on breadcrumb items.

## 0.15.6

### Patch Changes

- Restore the published light skin to the cool blue-grey industrial hierarchy
  (`#f4f6fa` workbench, white chrome, `#315fdc` interaction) that replaced the
  achromatic 0.15.5 correction.
- Keep the application topbar full-bleed: the content pane no longer reserves a
  stable scrollbar gutter under the topbar's trailing edge. Body-scroll table
  headers span the table, including the row-viewport scrollbar column.
- Measure ActionMenu / Popover against a fixed, shrink-wrapped surface on the
  first open so end-aligned menus do not clamp to the left viewport margin.

## 0.15.5

### Patch Changes

- Lock cross-page geometry, flatten nested panel chrome, and add the
  `--space-panel-section-gap` rhythm token so list-page toolbars and stacked
  control strips share one vertical spacing contract.
- Give solid danger and success buttons explicit hover and active states.

## 0.15.4

### Patch Changes

- Add a bounded `SortableDataTable` row viewport that keeps the column header
  outside vertical scrolling while preserving one synchronized horizontal
  table axis for headers and data.

## 0.15.3

### Patch Changes

- Inline the corrected achromatic neutral-white light skin. Light application
  workbenches are neutral grey, forward surfaces and controls are clean white,
  and code/terminal surfaces use neutral luminance steps without changing the
  independent graphite dark skin.

## 0.15.2

### Minor Changes

- Add embeddable speech-client chrome: connection fields for a user-supplied
  API origin and key, a live final/partial transcript surface, and a two-panel
  capture workspace. Products keep microphone access, streaming transport, and
  persistence; this package owns the shared page composition.

## 0.14.1

### Patch Changes

- Arbitrate Escape through one topmost overlay stack for SelectMenu, Popover,
  Tooltip, Modal, Drawer, and the mobile AppSidebar. Each key press dismisses
  only the innermost dismissible layer, restores its trigger, respects consumed
  and IME events, and leaves nondismissible owners in place.
- Let dialog focus containment recognize its portaled overlay descendants, so
  native Tab traversal is not intercepted by the parent Modal or Drawer.
- Extend the cross-product gate to executable entry-HTML scripts and inline
  handlers, including optional/window document access, and reject absolute
  component dimensions laundered through spacing arithmetic or unknown custom
  properties while preserving relative and genuine semantic-size layouts.

## 0.14.0

### Major corrective release

- Enforce one enabled roving listbox tab stop even when selection or explicit
  tab indexes conflict.
- Parse divider-free Markdown tables without dropping their first row and reject
  malformed table structures while preserving escaped source text.
- Complete mobile drawer modality with inert closed state, Escape dismissal,
  cyclic focus trapping, and trigger-focus restoration.
- Make queued text prompts identity-bound and exactly-once across stale callbacks,
  duplicate settlement, and unmount.
- Make skin persistence reactive to storage-key changes, external storage
  events, and same-document hooks through one subscription authority.
- Give statistic buttons an explicitly spaced accessible name and consume the
  generated breakpoint and semantic geometry contracts.

## 0.13.1

### Patch Changes

- Collapse the application shell to a single content column below the mobile
  breakpoint when its sidebar is configured as a drawer. This prevents an
  off-canvas drawer from retaining an implicit grid track and compressing
  narrow operator pages.

## 0.13.0

### Minor Changes

- Replace the withdrawn cool blue-gray foundation with a neutral graphite night
  material and a warm paper-gray light material. Keep semantic feedback and
  small data accents legible without tinting application surfaces.
- Add shared human/agent conversation regions, messages, composers, and neutral
  activity disclosures with accessible live-log, keyboard, IME, and reduced-
  motion behavior.
- Add engine-neutral composable workspaces and 34px workspace panels for fixed
  or drag/resizable operator layouts, including finite breakpoints, constraints,
  editing grids, selection, placeholder, and commit contracts.
- Make lifecycle status presentation a plain-text shared contract and add a
  compact bounded code viewport for one-screen command collections.

## 0.12.0

### Minor Changes

- Add selectable lists, sanitized Markdown, disclosures, notice regions, form
  sections, input actions, three-axis controls, text prompts, popovers, action
  menus, responsive mobile drawers, bounded workspace layouts, and shared skin
  initialization/persistence. Align every component with the finite semantic
  token scale and one refined light/dark theme contract.

## 0.11.0

### Minor Changes

- Industrialize the shared XGC2 frontend foundation with reusable application
  shell, navigation, workspace tabs, breadcrumbs, list-page, configuration,
  choice-card, color, workflow-status, modal/drawer, audio-capture, and sortable
  data-table capabilities. Standardize responsive operator layouts, real PCM
  waveforms, compact syntax-highlighted code blocks, global scrollbars, panel
  geometry, selection surfaces, and refined light/dark materials while enforcing
  the family-wide ban on left accent bars, status dots, pills, and decorative
  healthy-state chrome.

## 0.10.1

### Patch Changes

- Build workflow declarations before typechecking fresh workspace consumers.

## 0.10.0

### Minor Changes

- Add the shared spatial workflow canvas package and remove deprecated React compatibility APIs.

## 0.9.0

### Minor Changes

- Add the shared portaled SelectMenu and extend SegmentedControl with tab semantics, icons, stable selectors, and keyboard navigation.

## 0.8.0

### Minor Changes

- Expand the shared operator component set, preserve stable composite control metadata, and consolidate form, tooltip, and control styling for product migrations.

## 0.7.2

### Patch Changes

- Ensure compact single-column rules override every desktop split ratio instead of allowing the ratio selector to compress the primary pane beside a fixed secondary pane.

## 0.7.1

### Patch Changes

- Let document-flow shells choose the shared mobile or compact breakpoint so dense two-pane operator workspaces can stack before their controls become cramped.

## 0.7.0

### Minor Changes

- Fix panel headers and their action controls to semantic shared-token heights. Extend the compact copyable CodeBlock treatment with safe, theme-aware shell and JSON syntax highlighting. Add a generic sortable, selectable DataTable with accessible sort state, partial selection, and select-all behavior. Add shared responsive split panes, fixed/mobile-document shell modes, breakpoint constants, and media-query hooks. Apply restrained shared surface gradients across shell, panels, and controls.

## 0.6.0

### Minor Changes

- Add explicit page, panel, and code metadata header tokens. Align first-level panels to the compact 34px XGC2 experiment-panel chrome and replace the prominent CodeBlock header with a quiet, space-efficient metadata and copy row. Add shared semantic Tabs with keyboard navigation and complete-background selection styling.

## 0.5.0

### Minor Changes

- Promote the original XGC2 scrollbar tokens and global browser rules into the shared UI contract, including Firefox and WebKit interaction states. Enforce the family-wide prohibition on left-side accent bars and simplify the topbar contract to one title plus high-value actions without decorative healthy-state pills.

## 0.4.0

### Minor Changes

- Add shared button links, toolbars, statistic cards, data-table containers, and copyable code blocks.

## 0.3.0

### Minor Changes

- Add an accessible fieldset-based form group for segmented and compound controls.

## 0.2.0

### Minor Changes

- Add shared product branding, select and form-field primitives, segmented controls, audio waveforms, and a presentational audio capture control.
