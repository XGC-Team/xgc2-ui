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

## Status

- Do not render Ready, Online, Healthy, or equivalent pills merely to confirm the normal state.
- Show status only when it changes an operator decision. Put it beside the content or action it describes, not in the page topbar.
- Errors and degraded states remain visible in the relevant content surface and use accessible text, not color alone.

## Appearance

- Light and dark modes share semantic roles but not mechanically inverted values. Dark mode dims the workspace, raises forward surfaces by restrained luminance, and reduces chromatic saturation so operator data remains dominant.
- App, chrome, surface, control, and panel-header materials come from shared `--background-*` tokens. Their gradients and top-light sheen remain subtle; products must not add decorative accent glows or competing background effects.

## Selection and navigation

- Left-edge accent bars are prohibited for selection, active state, severity, dialogs, notifications, and controls.
- This includes left borders, pseudo-element stripes, and inset left-edge shadows.
- Use a complete background, enclosing border, and text/icon color for selected state.
- Tab switching uses the shared `Tabs` primitive and its tablist/tab semantics, arrow-key behavior, density, and full-background selection treatment.

## Scrolling

- All scrollable regions inherit the global XGC2 scrollbar tokens and browser rules.
- Fixed operator workspaces such as APT Dashboard/Admin keep the document and page shell within one viewport. Data tables, command lists, logs, and other unbounded regions scroll independently.
- Use `min-height: 0` through flex/grid ancestors and `scrollbar-gutter: stable` on persistent internal scroll regions.
- Responsive operator pages use shared `AppShell mobileLayout="document"` and `ResponsiveSplit`: desktop remains a fixed one-screen workspace, while compact displays become a readable single-column document flow. Dense pages choose `mobileBreakpoint="compact"`; breakpoint-dependent behavior uses `XGC_BREAKPOINTS`, `XGC_MEDIA_QUERIES`, or `useMediaQuery`, not product-local viewport constants.

## Data tables

- Sortable lists use the shared `SortableDataTable`, including its sort indicators, `aria-sort` state, keyboard-operable buttons, stable value comparison, empty state, and internal scroll container.
- Selectable tables use the shared `selection` contract. The first header cell provides select-all and partial-selection state; selected rows use a complete background and enclosing border.

## Review gate

A UI change is incomplete if it introduces copied foundation controls, a left selection stripe, decorative healthy-state chrome, a second title in the topbar, prominent nested code headers, or document-level scrolling in a fixed operator workspace.
