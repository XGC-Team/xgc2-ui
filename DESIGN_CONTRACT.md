# XGC2 Web UI Contract

This document is normative for every XGC2 web frontend. Product CSS may lay out domain content, but it must not redefine these interaction and chrome conventions.

## Shared foundation

- New and migrated frontends use React and consume an immutable `@xgc2/ui-react` release.
- Repeated interaction patterns belong in the shared package before products copy them.
- Product repositories own routes, APIs, authentication, and domain state; the shared package owns visual language, accessibility, and reusable behavior.

## Page and panel chrome

- A page topbar uses `--size-header-page` and contains exactly one product title on the left.
- The right side contains only high-value interactive controls. Center copy, subtitles, helper descriptions, and decorative content are prohibited.
- A first-level panel header has the fixed height `--size-header-panel`, based on the compact 34px XGC2 experiment panel. Its interactive actions use `--size-control-panel-header`; products must not size panel chrome or its controls locally.
- A code label and Copy action use the shared `CodeBlock` and its quiet `--size-header-code` metadata row (the compact GPG-fingerprint treatment). A code block must not look like it owns another panel topbar. Executable snippets declare `language` so shared, theme-aware syntax tokens can highlight them safely.

## Spacing and layout

- Products use the shared `--space-*`, type, radius, control-size, and header-size tokens. Repeated local pixel values for page padding, panel gaps, toolbars, grid columns, and chrome heights are technical debt.
- Use `Stack`, `Inline`, and `ResponsiveGrid` for ordinary composition; use `OperatorWorkspace` and `ScrollRegion` for fixed operations pages. A product may add domain layout constraints, but must not redefine shared spacing rhythm.
- Use `SectionHeader` for a quiet content-level heading and `Panel` for a framed first-level surface. Helper copy belongs in the body, not beside the title in fixed chrome.
- Toolbar controls use a single shared density. A panel action must not become as tall as its panel header.
- Drawers use `Drawer`: one title and critical actions in the fixed header, independently scrolling body content, optional footer, mobile full width, focus containment, and a shared dirty-data confirmation path.

## Status

- Do not render Ready, Online, Healthy, or equivalent pills merely to confirm the normal state.
- Show status only when it changes an operator decision. Put it beside the content or action it describes, not in the page topbar.
- Errors and degraded states remain visible in the relevant content surface and use accessible text, not color alone.
- Render compact state labels with the shared `StatusText` primitive as undecorated text. Status capsules, filled backgrounds, enclosing rounded borders, and decorative status dots are prohibited.
- Semantic text color may reinforce meaning, but the wording carries the state and normal/completed states stay visually quiet.

## Appearance

- Light and dark modes share semantic roles but not mechanically inverted values. Dark mode dims the workspace, raises forward surfaces by restrained luminance, and reduces chromatic saturation so operator data remains dominant.
- App, chrome, surface, control, and panel-header materials come from shared `--background-*` tokens. Their gradients and top-light sheen remain subtle; products must not add decorative accent glows or competing background effects.

## Selection and navigation

- Left-edge accent bars are prohibited for selection, active state, severity, dialogs, notifications, and controls.
- This includes left borders, pseudo-element stripes, and inset left-edge shadows.
- Use a complete background, enclosing border, and text/icon color for selected state.
- Simple view switching uses the shared `Tabs` or `SegmentedControl` primitive and its tablist/tab semantics, arrow-key behavior, density, and full-background selection treatment.
- Persistent work areas that can be renamed, closed, created, or reordered use `WorkspaceTabs`. Products supply item data and domain callbacks but do not duplicate its drag/drop, keyboard navigation, inline editing, internal scrolling, or selection skin.
- Resource directories use the `ListPage` family for the persistent search/action rail, internal scroll region, folders, rows, metadata, empty states, and protected drag/drop. Products provide data and business actions; they do not restyle selected rows with a left stripe or turn metadata/counts into filled pills.

## Forms and controls

- Buttons, links styled as actions, text inputs, textareas, selects, checkboxes, switches, color fields, preview choice cards, field labels, field groups, action rows, and tooltips use the corresponding shared React primitive. Products may add domain composition and stable `data-xgc-*` metadata, but may not retain duplicate presentation components or migration-only API wrappers.
- Control height, padding, typography, radius, focus treatment, and interactive states come from shared tokens and component CSS. Domain CSS may arrange controls in a page; it must not duplicate their base appearance.
- `Checkbox` and `Switch` are different semantics and different visuals. A normal `input[type="checkbox"]` remains a checkbox; global selectors must never paint every checkbox as a switch.
- Color fields use `ColorControl`; the native picker, validated hex draft, and palette remain theme-consistent. Preview choices use `ChoiceCardGroup`, including radiogroup semantics and arrow-key movement; products provide preview content without rebuilding selection chrome.
- Use native `Select` for simple form choices. Use shared `SelectMenu` when an operator choice needs grouped options, icons, a portaled popup, or viewport-aware placement; products must not fork its listbox keyboard and positioning behavior.
- Tooltips use the shared portaled implementation so they are not clipped by panels and drawers. They must remain optional supporting information, dismiss on scroll or Escape, and never be required to understand a control's primary label.

## Scrolling

- All scrollable regions inherit the global XGC2 scrollbar tokens and browser rules.
- Fixed operator workspaces such as APT Dashboard/Admin keep the document and page shell within one viewport. Data tables, command lists, logs, and other unbounded regions scroll independently.
- Use `min-height: 0` through flex/grid ancestors and `scrollbar-gutter: stable` on persistent internal scroll regions.
- Responsive operator pages use shared `AppShell mobileLayout="document"` and `ResponsiveSplit`: desktop remains a fixed one-screen workspace, while compact displays become a readable single-column document flow. Dense pages choose `mobileBreakpoint="compact"`; breakpoint-dependent behavior uses `XGC_BREAKPOINTS`, `XGC_MEDIA_QUERIES`, or `useMediaQuery`, not product-local viewport constants.

## Data tables

- Sortable lists use the shared `SortableDataTable`, including its sort indicators, `aria-sort` state, keyboard-operable buttons, stable value comparison, empty state, and internal scroll container.
- Selectable tables use the shared `selection` contract. The first header cell provides select-all and partial-selection state; selected rows use a complete background and enclosing border.
- Audit, task, and runtime log views use `LogTablePage` when they need the standard search/filter/refresh/table/pagination composition. Its data region scrolls internally while the toolbar and pagination remain visible.

## Spatial workflow surfaces

- Workflow, topology, orchestration, and other node/edge editors use the optional `@xgc2/ui-workflow` package. The shared package owns viewport sizing, grid, pan/zoom defaults, box and multi-selection behavior, drop-coordinate conversion, empty overlay, and the floating canvas toolbar.
- Products own domain node schemas, validation, execution semantics, persistence, permissions, and API calls. These concepts must not leak into the shared canvas API.
- Canvas actions use `WorkflowCanvasToolbar`; node and edge actions use `WorkflowNodeToolbar` or `WorkflowElementToolbar`. Products may supply action icons, wording, and business callbacks but must not create a second toolbar skin, reimplement event isolation, or scatter viewport constants through route CSS.
- Lightweight authoring notes use `WorkflowStickyNote`. Products may persist note data in their own schema, but selection, resizing, editing, keyboard completion, deletion, and the note skin remain shared behavior.

## Feedback and progress

- Use `Notice` and `EmptyState` for operator feedback. Products provide wording and recovery actions; they do not invent status-colored containers.
- Use `ProgressBar` for measured, indeterminate, or discrete-step progress. It owns clamping, accessibility, motion preferences, density, track/fill tokens, and semantic tone. A product may provide a domain label but must not rebuild the track.
- `AudioWaveform` is data-driven instrumentation, not decoration. It renders normalized levels derived from the microphone samples actually being captured. Recording state without samples is a quiet baseline; synthetic pulsing or randomized bars are prohibited because they falsely imply voice activity.
- Destructive confirmation uses `ConfirmationDialog` or `useConfirmationDialog`. Dirty configuration forms use the confirmation path owned by `Drawer`.

## Review gate

A UI change is incomplete if it introduces copied foundation controls, a left selection stripe, decorative healthy-state chrome, a second title in the topbar, prominent nested code headers, or document-level scrolling in a fixed operator workspace.
