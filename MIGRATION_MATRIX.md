# XGC2 Frontend Foundation Migration Matrix

This file is the implementation ledger for the family-wide React migration. A row is complete only when reusable behavior lives in `@xgc2/ui-react`, product-local duplication is removed, product tests/build pass, and the result has been visually checked in both themes and desktop/mobile layouts.

## Ownership rule

| Shared UI owns | Product owns |
| --- | --- |
| Tokens, themes, scrollbars, density, focus and accessibility behavior | Routes, API clients, authentication, permissions |
| Controls, feedback, code rendering, tables, selection, pagination | Domain queries, mutations, validation and error wording |
| Page/panel chrome, common layout, responsive shell, overlays | Product navigation model and domain-specific composition |
| Waveform/progress presentation | Media acquisition, transport and device lifecycle |

If a pattern appears in two products, or in several XGC2 operations pages, it is a shared candidate. Domain nouns alone do not make a component reusable.

## Shared package extraction

| Source / repeated pattern | Shared target | State |
| --- | --- | --- |
| Product skins, old XGC2 scrollbar, repeated spacing and chrome sizes | tokens, theme materials, global scrollbar rules | Implemented |
| Left sidebar, topbar, split panes, desktop/mobile page behavior | `AppShell`, `AppSidebar`, `Topbar`, `ResponsiveSplit` | Implemented |
| Repeated flex/grid gaps and one-screen operations pages | `Stack`, `Inline`, `ResponsiveGrid`, `OperatorWorkspace`, `ScrollRegion`, `SectionHeader` | Implemented |
| XGC2 controls and form primitives | `Button`, `Input`, `Textarea`, native `Select`, portaled/grouped `SelectMenu`, `Checkbox`, `Switch`, `ColorControl`, keyboard-operable `ChoiceCardGroup`, `FormField`, `FormGroup`, `FormActions`, `Tooltip` | Implemented |
| Product tab variants | `Tabs`, `SegmentedControl`, and editable/reorderable `WorkspaceTabs` | Implemented |
| XGC2 feedback/status variants | `StatusText`, `Notice`, `EmptyState` | Implemented |
| Agent/Research document lists, Markdown, disclosures and notices | `SelectableList`, `MarkdownContent`, `Disclosure`, `NoticeRegion` | Implemented |
| XGC2 file commands and parameter schema overlays | `ActionMenu`, `Popover` | Implemented |
| XGC2 repeated config groups, input actions, XYZ/RPY matrices and prompts | `FormSection`, `InputActionControl`, `Vector3Control`, `TextPromptDialog`, `useTextPromptDialog` | Implemented |
| APT fingerprint/install block and Agent Hub Markdown fences | `CodeBlock` with theme-aware highlighting | Implemented |
| APT packages and operations tables | `SortableDataTable` selection/select-all, `Pagination` | Implemented |
| XGC2 workflow/readiness/resource progress | `ProgressBar` | Implemented |
| XGC2 `ConfigDrawer`, confirmation and dialog queue | `Drawer`, `ConfirmationDialog`, `useConfirmationDialog` | Implemented |
| XGC2 Audit/Task Logs composition | `LogTablePage` | Implemented |
| XGC2 waveform/recording presentation | Data-driven `AudioWaveform`, `AudioCaptureControl`; silence never animates | Implemented |
| XGC2 Automation spatial editor | Separate `@xgc2/ui-workflow`: `WorkflowCanvas`, viewport/grid/pan/zoom/selection/drop foundation, canvas/node/edge toolbars, and `WorkflowStickyNote` | Implemented; domain-specific node/edge bodies intentionally remain in each product while their spatial interaction and chrome stay shared |
| XGC2 `CommonUI` settings/info/resource rows | `SettingsList`, `SettingRow`, `DescriptionList`, `DescriptionItem`, `ResourceMeter` | Implemented |
| XGC2 panel view switches, collapsible configuration and workflow state cards | `PanelViewSwitcher`, `ConfigSection`, `WorkflowStatusCard` | Implemented |
| XGC2 `ListPage` folders, tags, protected drag/drop and resource lists | `ListPage` family; products retain resource data and actions only | Implemented |
| XGC2 terminal output, live logs and command stream viewers | Shared `CodeBlock` / `ScrollRegion` cover static text and scrolling; terminal transport, ANSI rendering and follow-tail lifecycle remain product-local until another consumer proves the same behavior | Intentional product boundary; no duplicated cross-product primitive remains to extract in this release |

## Product adoption

| Product | Current state | Next migration gate |
| --- | --- | --- |
| XGC2 GCS | React; shared tokens, shell, panels, overlays, controls, feedback, tables, settings, lists, workspace tabs, configuration, workflow node surface and spatial foundation are adopted; repeated product-local feedback, menu/popover, prompt, config-section, vector and input-action implementations are removed | Publish and pin the batched immutable release, then run 8787 + 5173 and light/dark desktop/mobile runtime verification |
| APT Repository | React; shared shell/topbar/table/select-all/code block/theme/scrollbars/feedback/description rows are in use; Dashboard/Admin use one-screen desktop workspaces and mobile document flow; Admin is deliberately read-only | Immutable release pinned; generated embeds committed; Docker, smoke, image push, two-pass SSH deployment and public Dashboard byte-for-byte verification passed |
| Agent Hub | React; shared shell, responsive drawer, bounded workspaces, controls, feedback, SelectableList, Markdown, Disclosure and structured data are adopted; the 3,060-line legacy stylesheet and local Markdown parser have been reduced to domain composition only | Publish and pin the batched immutable release, then run formal product build and light/dark desktop/mobile runtime verification |
| Research OS | React; shared shell/sidebar drawer, theme state, controls, feedback, SelectableList, sortable data, bounded layouts and WorkflowNodeSurface are adopted; product CSS no longer pierces shared internals | Publish and pin the batched immutable release; keep research node roles, graph semantics and coordinates local |
| STT Service | React; shared shell/topbar/controls/feedback/table/code/structured-data/progress/audio capture are adopted; `waveformLevels` now comes directly from the same PCM stream sent for transcription and inactive stale samples collapse to a baseline | Immutable `0.11.0` release pinned; product tests, types, build and remote-main integration passed |
| XGC2 Lichtblick | Existing React 18 application retains its upstream MUI theme boundary; the XGC2-owned initial-layout selector consumes shared `ChoiceCardGroup` | Intentional upstream boundary: bridge XGC2-owned surfaces only; do not fork the upstream control system |
| Media Edge player | Embedded React player consumes `AppShell`, `Topbar`, `ProductBrand`, `SegmentedControl`, `Panel`, `StatusText`, `Button`, shared themes/tokens and scrollbars; generated JS/CSS remain Go-embedded | Immutable `0.11.0` release pinned; deterministic rebuild/drift gate, Go tests/race/vet, package compliance and desktop/mobile light/dark browser verification passed |
| Camera intrinsic/extrinsic tools | Both independently packaged pages now build from one React/shared-UI source and consume the shared shell, topbar, theme control, panels, forms, tables, feedback, progress and code presentation; their existing ROS transport, canvas interaction and calibration math remain domain-local | Immutable `0.11.0` release pinned; deterministic two-variant build/drift gate, Python tests, package compliance, amd64/arm64 Debian builds and desktop/mobile light/dark browser verification passed (`6804ed6`, CI `31544924506`) |
| Gazebo camera tool | The independently packaged static page now builds from React and consumes the shared shell, topbar, theme control, panels, controls, feedback, progress and code presentation while retaining its Gazebo transport and camera-domain canvas behavior | Immutable `0.11.0` release pinned; deterministic build/drift gate, package tests/compliance, amd64/arm64 Debian builds and desktop/mobile light/dark browser verification passed (`1ead70c`, CI `31544923978`) |

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release, update every consumer lockfile, validate each product, then deploy APT once and verify its remote workflow and service.
