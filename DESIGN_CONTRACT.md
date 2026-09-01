# XGC2 Web UI Contract

This document is normative for every XGC2 web frontend. Product CSS may lay out domain content, but it must not redefine these interaction and chrome conventions.

## Shared foundation

- New and migrated frontends use React and consume an immutable `@xgc2/ui-react` release.
- Repeated interaction patterns belong in the shared package before products copy them.
- Product repositories own routes, APIs, authentication, and domain state; the shared package owns visual language, accessibility, and reusable behavior.

## Page and panel chrome

- Cross-page frame geometry is a first-class contract: list, table, form, settings, and operator pages share the content origin, `--space-page-padding` inset, page topbar, and common control sizes, so switching routes does not move the page frame under the operator's cursor. Geometry below that frame is family-scoped: resource directories use `ListPage`, logs and tabular data use their table family, and forms/settings/operator workspaces use `ConfigSection`, `FormSection`, and `OperatorWorkspace`. Their section headings, content padding, and row heights are deliberately not normalized to one another. Exempt: multi-card workspace dashboards (Home, Experiments) whose layout is inherently card-based.

- `AppShell` is the common spatial frame: a collapsible navigation rail on the left, one fixed-height topbar above the work area, and the product workspace in the remaining viewport. Products may omit a region, but must not create a second shell skin.
- A page topbar uses `--size-header-page` and contains exactly one product title on the left.
- The right side contains only high-value interactive controls. Center copy, subtitles, helper descriptions, and decorative content are prohibited.
- A first-level panel header has the fixed height `--size-header-panel` (35px): `4px` top padding + a compact `--size-control-panel-header` (26px) action + `4px` bottom padding + the `1px` bottom hairline. `Panel` and `WorkspacePanel` must keep the same real top and bottom padding; the divider is not padding and must not be counted as optical compensation. Products must not size panel chrome or its controls locally.
- The workspace canvas uses the shared `--background-app` material in both skins. Ordinary and composable panels use the shared `--background-surface`, `--background-panel-header`, and `--shadow-card` material stack, so static pages and drag/resizable dashboards have the same visual depth.
- Draggable and resizable dashboard surfaces use `WorkspacePanel`. It owns the same narrow header material, optional title and critical actions, selected/editing treatment, a `min-height: 0` fill body, and explicit internal scrolling. Products must not redraw its header or surface skin; domain-specific body layout may use the documented slot classes passed by the wrapper.
- A code label and Copy action use the shared `CodeBlock` and its quiet `--size-header-code` metadata row (the compact GPG-fingerprint treatment). A code block must not look like it owns another panel topbar. Executable snippets declare `language` so shared, theme-aware syntax tokens can highlight them safely. One-screen command collections use `viewport="compact"`; products must not pierce the shared `pre` element to invent another height.

## Spacing and layout

- The spacing vocabulary is deliberately finite: `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, and `3xl`, plus a small set of semantic layout roles such as `--space-panel-padding`. Numeric names such as `--space-7` are prohibited. A token must express a reusable scale step or design decision; it must never be a new name for one product's historical pixel value.
- The same rule applies to type, radius, elevation, opacity, icon size, and breakpoints: extend a bounded shared scale only when several components need a stable role. Spacing tokens express rhythm and must never supply width, height, diameter, handle, hit-target, or reserved component geometry. Reusable component dimensions use finite semantic `--size-*` roles. SVG coordinates, charts, calibration geometry, and domain simulation dimensions remain honest local numbers rather than fake design tokens.
- Products consume shared token values but may not redefine them. Product custom properties must describe genuine domain semantics, not compatibility aliases for shared values.
- Width and height declarations must not construct an absolute component size from spacing tokens and raw arithmetic. Relative layout calculations based on percentages, viewport/container units, or a genuine `--size-*` role remain valid composition.
- Shared controls expose only five product-level geometry hooks: `--xgc-control-button-padding`, `--xgc-control-button-padding-block`, `--xgc-control-button-padding-inline`, `--xgc-control-height`, and `--xgc-control-input-padding-inline`. Product definitions of any other `--xgc-control-*` property are appearance forks and fail the cross-product style gate.
- Repeated local pixel values for page padding, panel gaps, toolbars, grid columns, chrome heights, and responsive shell behavior are technical debt.
- There is exactly one combobox: `SelectMenu` (product adapter `SelectControl`). Native `<select>` wrappers and hand-rolled dropdowns are prohibited; height, padding, type step, chevron, and the hover/focus/active trio all come from the shared `.xgc-select-control` trigger.
- Table cells share one body typeface. Columns differ by content alignment and whitespace, never by font family, size, weight, or color; status columns stay plain readable text without per-severity color inside tabular data. Monospace is allowed only for genuine code/path content applied uniformly.
- Content must never break its layout box. Table cells are `min-width: 0` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap` — long paths, commands, and IDs truncate, with the full value on `title`/tooltip. Flex and grid children carry `min-width: 0`/`min-height: 0` so nothing outgrows its track. Media with intrinsic size (SVG, canvas, img) is constrained to its cell (`width/height: 100%`, hard clip), never allowed to size itself by viewBox.
- Use `Stack`, `Inline`, and `ResponsiveGrid` for ordinary composition; use `OperatorWorkspace` and `ScrollRegion` for fixed operations pages. A product may add domain layout constraints, but must not redefine shared spacing rhythm.
- Use `SectionHeader` for a quiet content-level heading and `Panel` for a framed first-level surface. Helper copy belongs in the body, not beside the title in fixed chrome.
- Panel nesting is flattened by contract. Inside a workspace region, at most two levels of full chrome (`Panel`/`WorkspacePanel` with border, radius, header, and card shadow) may nest. From the third level inward, sections must degrade to `chrome="flat"`: no background, border, radius, or shadow, with grouping expressed only by `--space-layout-*` spacing, the shared heading step, and at most one `1px var(--color-border-muted)` hairline.
- Card shadow is exclusive to the outermost panel of a nesting chain; descendant panels never cast `--shadow-card`. Overlays (popover, modal, drawer) are exempt.
- Inner sections never repaint `--color-bg-surface` over their parent panel. Recessed areas such as table headers use `--color-bg-subtle` and are prohibited from the third nesting level inward.
- When an inner panel no longer needs an action row, its header is omitted entirely; one or two surviving actions move up to the outermost panel's actions area instead of creating another fixed header.
- Pure layout containers never draw a boundary. Toolbars, button rows, form rows, list-row wrappers, and similar arrangement-only containers (`Toolbar`, `Inline`, `Stack`, form rows) must not render an outer border, outline, or boxed background: their job is arrangement, not partitioning. Grouping is expressed by exactly three tools — panel chrome at the outermost level, a single `1px var(--color-border-muted)` hairline, and spacing rhythm.
- Stacked control strips inside a panel (path toolbar, filter row, action row) share one vertical rhythm token, `--space-panel-section-gap`. Products must not invent per-strip padding values.
- The canonical resource-directory layout is the `ListPage` pattern: one single-line toolbar (control-height, borderless, controls in one row) directly above the list surface, with the toolbar-to-list gap on the shared spacing rhythm. Catalogs and resource directories (Terminal hosts, Automations, Host Files, …) converge on this pattern instead of inventing multi-row or boxed toolbars. System, Station, App Store, and other form/settings/operator pages keep their `ConfigSection` / `FormSection` heading hierarchy and form-row rhythm; ListPage folder-title or row geometry must never be copied onto them.
- Flat vs framed is chosen by scene, never by habit. When the whole page is one list or one data view (audit log, Operations, file browser), the page is flat: single-line toolbar plus content laid out directly, no wrapping Panel. When several cards coexist in one workspace (Experiment dashboard, Host Overview blocks), each card is a framed `Panel` within the nesting-flattening limits. Actions of a card may live in that card's header actions; actions of the page's single view must live in the standalone toolbar, never inside a panel header. Mnemonic: a panel is a card among cards, not a gift box around a page.
- Toolbar controls use a single shared density. A panel action must not become as tall as its panel header.
- Drawers use `Drawer`: one title and critical actions in the fixed header, independently scrolling body content, optional footer, mobile full width, focus containment, and a shared dirty-data confirmation path. Form submit/cancel actions belong in the fixed header and keep one family-wide order and compact density; they must not move to the end of the scrolling form in individual products. Every right-side Drawer title uses the same shared sans/base/regular/control-line-height typography as the page breadcrumb; products must not restyle individual Drawer titles.
- Select menus, popovers, tooltips, modals, drawers, and mobile navigation share one topmost overlay stack. Escape dismisses exactly one innermost dismissible layer, consumed or IME events dismiss nothing, and a nondismissible layer blocks underlying dismissal. Portaled descendants inherit logical ownership so a parent focus trap never cancels their native Tab traversal.

## Status

- Do not render Ready, Online, Healthy, or equivalent pills merely to confirm the normal state.
- Show status only when it changes an operator decision. Put it beside the content or action it describes, not in the page topbar.
- Errors and degraded states remain visible in the relevant content surface and use accessible text, not color alone.
- Render compact state labels with the shared `StatusText` primitive as undecorated text. Status capsules, filled backgrounds, enclosing rounded borders, and decorative status dots are prohibited.
- This prohibition also covers status chips, badges, LEDs, lamps, glowing dots, halos, text shadows, and semantic fill on an enclosing card. Renaming one of those shapes does not create an exception.
- `connected`, `online`, `ready`, `healthy`, `succeeded`, `completed`, and `cancelled` are quiet states. They use the normal text hierarchy unless a product can name a concrete operator decision that requires additional emphasis.
- `created`, `pending`, `queued`, `waiting`, `starting`, `restarting`, `running`, `stopping`, `loading`, and other ordinary lifecycle states use neutral or restrained informational text. Warning is reserved for decision-relevant conditions such as blocked, degraded, paused, stale, or unavailable; failures use danger text. The wording always carries the state and never relies on color alone.
- Use `Notice` for a bounded explanation and recovery action. Its enclosing surface remains neutral in every tone; only its heading text may reinforce severity. Use `EmptyState` for absence, never as a fake health indicator.
- Domain instruments may use real measured visualizations (battery level, radio strength, progress, maps, graphs). Those visuals must describe measured data rather than substitute an ornamental status light.

## Appearance

- Light and dark modes share semantic roles but not mechanically inverted values. Dark mode dims the workspace, raises forward surfaces by restrained luminance, and reduces chromatic saturation so operator data remains dominant.
- App, chrome, surface, control, and panel-header materials come from shared `--background-*` tokens. Their gradients and top-light sheen remain subtle; products must not add decorative accent glows or competing background effects.
- Light surfaces use the original cool blue-grey industrial hierarchy: a quiet blue-grey workbench under clean white, with soft cool borders and slate text. Cream and yellow-brown casts are prohibited in light foundation and material roles. Dark surfaces independently use graphite luminance and shadow for depth. Neither skin may separate every panel with a bright outline; borders stay subordinate to material and elevation.
- Light foundations may hold a restrained blue-grey bias. App, chrome, sidebar, surface, control, border, text, terminal, and neutral chart tokens are guarded against warm-biased values; saturated color is reserved for real data, syntax, focus, and decision-relevant semantics.
- Product entry HTML may declare a static fallback `data-skin`, but executable inline scripts must not read or write skin persistence or mutate `documentElement`; `initializeSkin` and `useSkin` remain the single lifecycle authority.

## Conversation and agent interaction

- Human/agent timelines use `ConversationRegion`; messages use `ConversationMessage`; prompt entry uses `ConversationComposer`; tool calls, decisions, and bounded agent work use `AgentActivity`. Research or future products reuse the same contract rather than recreating a chat skin.
- The shared foundation owns live-log roles, internal scrolling, speaker alignment, author/time placement, textarea and action geometry, Enter-to-send, Shift+Enter newline, IME safety, activity disclosure, and reduced-motion behavior. Products own transport, domain data, permissions, and follow-tail policy.
- Agent messages are quiet document-like content. Operator messages may use one complete neutral control surface. Avatars are unframed identity affordances, never colored discs that imply health or connection.
- `AgentActivity` always uses one neutral surface. A tool, request, or decision may show `StatusText`, but status must never tint, glow, animate, stripe, or otherwise change the enclosing material.
- Composer errors use accessible text; supporting constraints remain neutral text. Connection, readiness, completion, and cancellation are not decorative composer or header ornaments.

## Motion and opacity

- Shared interaction motion uses the finite `--duration-quick`, `--duration-fast`, and `--duration-deliberate` scale with `--easing-standard`, `--easing-enter`, or `--easing-exit`. Products must not mint tokens for historical millisecond values or add ornamental pulsing, bouncing, shimmer, or glow.
- Every shared motion path has a `prefers-reduced-motion` equivalent. Continuous animation is reserved for honest measured activity or a progress operation whose wording also communicates what is happening; it must never impersonate connectivity, voice level, health, or readiness.
- Opacity uses the bounded shared roles (`hidden`, `subdued`, `disabled`, `deemphasized`, `secondary`, `full`). Domain rendering may use local alpha for charts, video overlays, robot instruments, and spatial data, but ordinary controls and layout surfaces may not introduce arbitrary opacity values.

## Selection and navigation

- Left-edge accent bars are prohibited for selection, active state, severity, dialogs, notifications, and controls.
- This includes left borders, pseudo-element stripes, and inset left-edge shadows.
- Use a complete background, enclosing border, and text/icon color for selected state.
- Simple view switching uses the shared `Tabs` or `SegmentedControl` primitive and its tablist/tab semantics, arrow-key behavior, density, and full-background selection treatment.
- Persistent work areas that can be renamed, closed, created, or reordered use `WorkspaceTabs`. Products supply item data and domain callbacks but do not duplicate its drag/drop, keyboard navigation, inline editing, internal scrolling, or selection skin. Its compact inline close action is a quiet neutral ghost control; destructive color belongs to the confirmation action, not the tab's hover surface.
- Resource directories use the `ListPage` family for the persistent search/action rail, internal scroll region, folders, rows, metadata, empty states, and protected drag/drop. Products provide data and business actions; they do not restyle selected rows with a left stripe or turn metadata/counts into filled pills.

## Forms and controls

- Buttons, links styled as actions, text inputs, textareas, selects, checkboxes, switches, color fields, preview choice cards, field labels, field groups, action rows, and tooltips use the corresponding shared React primitive. Products may add domain composition and stable `data-xgc-*` metadata, but may not retain duplicate presentation components or migration-only API wrappers.
- Control height, padding, typography, radius, focus treatment, and interactive states come from shared tokens and component CSS. Domain CSS may arrange controls in a page; it must not duplicate their base appearance.
- A `FormSection` keeps one field-label typography across direct fields and fields rendered inside a nested domain/schema form: shared sans, base size, regular weight, and tight line height. A domain wrapper may arrange those fields, but must not make its nested labels visually diverge from sibling fields in the same section.
- Numeric configuration fields with a unit, a bounded range, or a discrete step use the shared number input with its complete, theme-colored increment/decrement control. Render a short unit as the input's muted suffix (`sec`, `px`, `m`, and so on), not as parenthesized text in the field label. Preserve native `spinbutton` semantics plus the authored `min`, `max`, and `step`; browser-painted spinners must not leak a foreign background or clipped arrows into the shared control, and product CSS must not hide or redraw the shared stepper.
- `Checkbox` and `Switch` are different semantics and different visuals. A normal `input[type="checkbox"]` remains a checkbox; global selectors must never paint every checkbox as a switch.
- Color fields use `ColorControl`; the native picker, validated hex draft, and palette remain theme-consistent. Preview choices use `ChoiceCardGroup`, including radiogroup semantics and arrow-key movement; products provide preview content without rebuilding selection chrome.
- Use native `Select` for simple form choices. Use shared `SelectMenu` when an operator choice needs grouped options, icons, a portaled popup, or viewport-aware placement; products must not fork its listbox keyboard and positioning behavior.
- Use shared `ActionMenu` for command menus and `Popover` for non-modal anchored editing surfaces. They own portal placement, viewport clamping, dismissal, focus restoration, roles, and keyboard navigation; product CSS may arrange the contents but may not rebuild the floating surface.
- Use `FormSection`, `InputActionControl`, and `Vector3Control` for repeated static form groups, inset input actions, and XYZ/RPY entry. Use `TextPromptDialog` or `useTextPromptDialog` for queued text/password prompts.
- Tooltips use the shared portaled implementation so they are not clipped by panels and drawers. They must remain optional supporting information, dismiss on scroll or Escape, and never be required to understand a control's primary label.

## Scrolling

- All scrollable regions inherit the global XGC2 scrollbar tokens and browser rules.
- Fixed operator workspaces such as APT Dashboard/Admin keep the document and page shell within one viewport. Data tables, command lists, logs, and other unbounded regions scroll independently.
- Use `min-height: 0` through flex/grid ancestors and `scrollbar-gutter: stable` on persistent internal scroll regions.
- Responsive operator pages use shared `AppShell mobileLayout="document"` and `ResponsiveSplit`: desktop remains a fixed one-screen workspace, while compact displays become a readable single-column document flow. Dense pages choose `mobileBreakpoint="compact"`; breakpoint-dependent behavior uses `XGC_BREAKPOINTS`, `XGC_MEDIA_QUERIES`, or `useMediaQuery`, not product-local viewport constants. `breakpoints.json` is the cross-runtime authority (`compact: 820px`, `mobile: 720px`); handwritten CSS may retain those literal canonical media-query values because CSS custom properties cannot govern media queries, but products must not add competing thresholds.

## Data tables

- Sortable lists use the shared `SortableDataTable`, including its sort indicators, `aria-sort` state, keyboard-operable buttons, stable value comparison, and empty state. Bounded list panels use `bodyScroll`, which keeps the header outside the vertical row viewport while one horizontal viewport keeps header and data columns aligned.
- Selectable tables use the shared `selection` contract. The first header cell provides select-all and partial-selection state; selected rows use a complete background and enclosing border.
- Audit, task, and runtime log views use `LogTablePage` when they need the standard search/filter/refresh/table/pagination composition. Its data region scrolls internally while the toolbar and pagination remain visible.

## Spatial workflow surfaces

- Workflow, topology, orchestration, and other node/edge editors use the optional `@xgc2/ui-workflow` package. The shared package owns viewport sizing, grid, pan/zoom defaults, box and multi-selection behavior, drop-coordinate conversion, empty overlay, and the floating canvas toolbar.
- Products own domain node schemas, validation, execution semantics, persistence, permissions, and API calls. These concepts must not leak into the shared canvas API.
- Canvas actions use `WorkflowCanvasToolbar`; node and edge actions use `WorkflowNodeToolbar` or `WorkflowElementToolbar`. Products may supply action icons, wording, and business callbacks but must not create a second toolbar skin, reimplement event isolation, or scatter viewport constants through route CSS.
- Node implementations compose `WorkflowNodeSurface`. The shared surface owns neutral padding, focus/selection rings, handle affordances, and stable metadata slots; products own node content and domain state without rebuilding its shell or encoding status as a stripe or dot.
- The two-skin selection palette belongs to `@xgc2/ui-tokens`; the finite abstract tone palette belongs to `@xgc2/ui-workflow`. Products map domain categories to shared tones and reuse global semantic colors for execution meaning. Product skins must not mirror either palette, leak domain taxonomy into shared token names, or keep synonymous `--color-automation-*` aliases.
- Lightweight authoring notes use `WorkflowStickyNote`. Products may persist note data in their own schema, but selection, resizing, editing, keyboard completion, deletion, and the note skin remain shared behavior.

## Composable panel workspaces

- Dashboard and whiteboard-style panel layouts use `ComposableWorkspace` with `WorkspacePanel`. `ComposableWorkspace` owns item identity, finite column and breakpoint policy, the optional low-contrast editing grid, per-item constraints, drag/resize handles, placeholder surface, and the layout-commit boundary. A product injects its layout-engine adapter; the shared React package does not force React Grid Layout or another third-party engine onto every consumer.
- Products own panel manifests, domain content, permissions, target routing, specialized height normalization, and persistence. Saved resource schemas and plugin registries never enter the shared component API.
- Grid editing uses a quiet full-area grid and enclosing focus/selection treatment. Accent stripes, status dots, status-color panel fills, animated glows, and product-specific panel-header gradients remain prohibited.

## Feedback and progress

- Use `Notice` and `EmptyState` for operator feedback. Products provide wording and recovery actions; they do not invent status-colored containers.
- Use `ProgressBar` for measured, indeterminate, or discrete-step progress. It owns clamping, accessibility, motion preferences, density, track/fill tokens, and semantic tone. A product may provide a domain label but must not rebuild the track.
- `AudioWaveform` is data-driven instrumentation, not decoration. It renders normalized levels derived from the microphone samples actually being captured. Recording state without samples is a quiet baseline; synthetic pulsing or randomized bars are prohibited because they falsely imply voice activity.
- Destructive confirmation uses `ConfirmationDialog` or `useConfirmationDialog`. Dirty configuration forms use the confirmation path owned by `Drawer`.

## Review gate

A UI change is incomplete if it introduces copied foundation controls, product CSS selectors that pierce `.xgc-*` shared internals, shared-token redefinitions, numeric pseudo tokens, a left selection stripe, decorative healthy-state chrome, a second title in the topbar, prominent nested code headers, or document-level scrolling in a fixed operator workspace.
