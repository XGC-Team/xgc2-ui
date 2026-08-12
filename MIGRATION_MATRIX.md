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
| XGC2 controls and form primitives | `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `FormField`, `FormGroup`, `FormActions`, `Tooltip` | Implemented |
| Product tab variants | `Tabs`, `SegmentedControl` | Implemented |
| XGC2 feedback/status variants | `StatusText`, `Notice`, `EmptyState` | Implemented |
| APT fingerprint/install block and Agent Hub Markdown fences | `CodeBlock` with theme-aware highlighting | Implemented |
| APT packages and operations tables | `SortableDataTable` selection/select-all, `Pagination` | Implemented |
| XGC2 workflow/readiness/resource progress | `ProgressBar` | Implemented |
| XGC2 `ConfigDrawer`, confirmation and dialog queue | `Drawer`, `ConfirmationDialog`, `useConfirmationDialog` | Implemented |
| XGC2 Audit/Task Logs composition | `LogTablePage` | Implemented |
| XGC2 waveform/recording presentation | Data-driven `AudioWaveform`, `AudioCaptureControl`; silence never animates | Implemented |
| XGC2 `CommonUI` settings/info/resource rows | `SettingsList`, `SettingRow`, `DescriptionList`, `DescriptionItem`, `ResourceMeter` | Implemented |
| XGC2 `ListPage` folders, tags, drag/reorder and resource lists | Separate generic list shell from domain behavior | Pending design audit |
| XGC2 terminal output, live logs and command stream viewers | Consolidate text-stream viewport and follow-tail behavior | Pending extraction |

## Product adoption

| Product | Current state | Next migration gate |
| --- | --- | --- |
| XGC2 GCS | React; shared package installed; progress, feedback, drawer, log-table, settings/info rows, resource meters, forms and tooltips now use thin compatibility adapters over the release candidate; visual-policy cleanup underway | Migrate remaining buttons/inputs/select menus/tabs and Host/Container/Operations/Automation/Terminal layouts, verify 8787 + 5173 together, then pin the final immutable package release |
| APT Repository | React; shared shell/topbar/tabs/table/select-all/code block/theme/scrollbars in use | Consume the final package, verify Dashboard/Admin one-screen desktop and mobile document behavior, commit/push, then verify CI/CD deployment |
| Agent Hub | Migrated from Vue to React; shared shell and Markdown `CodeBlock` in use | Consume final status/topbar/layout APIs and delete compatibility CSS |
| STT Service | React; shared package upgraded; waveform is driven by the same real PCM frames sent to transcription, with silence rendered as a stable baseline | Consume final status/topbar/form/layout APIs, delete compatibility CSS and pin the final immutable release |
| XGC2 Lichtblick | Existing React 18 application with its own upstream MUI theme package | Add an XGC2 token/theme bridge at the application boundary; do not fork every upstream MUI control into shared UI |
| Media Edge player | Small embedded HTML/CSS/JS operator page | Move to the lightweight embedded React build and consume shared tokens/controls |
| Camera intrinsic/extrinsic tools | Two small embedded HTML/CSS/JS calibration pages | Consolidate into one lightweight React calibration entry with shared form/layout/feedback primitives |
| Gazebo camera tool | Small embedded HTML/CSS/JS calibration page | Reuse the calibration React entry and keep only simulator transport/domain code local |

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release, update every consumer lockfile, validate each product, then deploy APT once and verify its remote workflow and service.
