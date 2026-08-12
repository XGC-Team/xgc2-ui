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
| APT fingerprint/install block and Agent Hub Markdown fences | `CodeBlock` with theme-aware highlighting | Implemented |
| APT packages and operations tables | `SortableDataTable` selection/select-all, `Pagination` | Implemented |
| XGC2 workflow/readiness/resource progress | `ProgressBar` | Implemented |
| XGC2 `ConfigDrawer`, confirmation and dialog queue | `Drawer`, `ConfirmationDialog`, `useConfirmationDialog` | Implemented |
| XGC2 Audit/Task Logs composition | `LogTablePage` | Implemented |
| XGC2 waveform/recording presentation | Data-driven `AudioWaveform`, `AudioCaptureControl`; silence never animates | Implemented |
| XGC2 Automation spatial editor | Separate `@xgc2/ui-workflow`: `WorkflowCanvas`, viewport/grid/pan/zoom/selection/drop foundation, canvas/node/edge toolbars, and `WorkflowStickyNote` | Canvas, navigation, sticky notes, and element toolbars implemented; generic domain-neutral node/edge shells next |
| XGC2 `CommonUI` settings/info/resource rows | `SettingsList`, `SettingRow`, `DescriptionList`, `DescriptionItem`, `ResourceMeter` | Implemented |
| XGC2 panel view switches, collapsible configuration and workflow state cards | `PanelViewSwitcher`, `ConfigSection`, `WorkflowStatusCard` | Implemented |
| XGC2 `ListPage` folders, tags, protected drag/drop and resource lists | `ListPage` family; products retain resource data and actions only | Implemented |
| XGC2 terminal output, live logs and command stream viewers | Consolidate text-stream viewport and follow-tail behavior | Pending extraction |

## Product adoption

| Product | Current state | Next migration gate |
| --- | --- | --- |
| XGC2 GCS | React; shared shell, panels, overlays, controls, feedback, tables, settings, lists, workspace tabs, configuration, workflow-status, color/choice controls and Automation spatial foundation are adopted; local presentation adapters are thin re-exports | Immutable `0.11.0` release pinned and 8787 + 5173 runtime verified; extract another primitive only from proven cross-product demand |
| APT Repository | React; shared shell/topbar/table/select-all/code block/theme/scrollbars/feedback/description rows are in use; Dashboard/Admin use one-screen desktop workspaces and mobile document flow; Admin is deliberately read-only | Immutable release pinned; generated embeds committed; Docker, smoke, image push, two-pass SSH deployment and public Dashboard byte-for-byte verification passed |
| Agent Hub | React; shared shell/topbar/tabs/controls/feedback and Markdown/tool-output `CodeBlock` are in use; redundant passive header counts and local interactive primitives are removed | Immutable `0.11.0` release pinned; product tests, types, build and remote-main integration passed |
| Research OS | React; shared shell/sidebar/topbar/theme controls/forms/feedback/structured data and optional workflow canvas are in use; mobile forces the shared sidebar into its compact rail instead of squeezing content | Keep research-domain cards and graph semantics local; promote a pattern only after a second product proves it reusable |
| STT Service | React; shared shell/topbar/controls/feedback/table/code/structured-data/progress/audio capture are adopted; `waveformLevels` now comes directly from the same PCM stream sent for transcription and inactive stale samples collapse to a baseline | Immutable `0.11.0` release pinned; product tests, types, build and remote-main integration passed |
| XGC2 Lichtblick | Existing React 18 application with its own upstream MUI theme package | Add an XGC2 token/theme bridge at the application boundary; do not fork every upstream MUI control into shared UI |
| Media Edge player | Small embedded HTML/CSS/JS operator page | Move to the lightweight embedded React build and consume shared tokens/controls |
| Camera intrinsic/extrinsic tools | Two small embedded HTML/CSS/JS calibration pages | Consolidate into one lightweight React calibration entry with shared form/layout/feedback primitives |
| Gazebo camera tool | Small embedded HTML/CSS/JS calibration page | Reuse the calibration React entry and keep only simulator transport/domain code local |

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release, update every consumer lockfile, validate each product, then deploy APT once and verify its remote workflow and service.
