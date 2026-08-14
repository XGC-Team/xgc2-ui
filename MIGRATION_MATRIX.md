# XGC2 Frontend Foundation Migration Matrix

This file is the implementation ledger for the family-wide React migration. A row is complete only when reusable behavior lives in `@xgc2/ui-react`, product-local duplication is removed, product tests/build pass, and the result has been visually checked in both themes and desktop/mobile layouts.

The `0.14.0` baseline covers **8 consumer repositories and 9 UI surfaces**: XGC2 GCS, APT Repository, Agent Hub, Research OS, STT Service, Media Edge, both Camera Calibration pages (intrinsic and extrinsic), and the standalone Gazebo camera tool. Camera Calibration is one repository with two independently packaged pages. XGC2 Lichtblick is an upstream MUI application with a narrow XGC2-owned compatibility bridge; it is not an immutable-tarball consumer and is not counted in this rollout matrix.

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
| XGC2 speech-client capture/transcript page | `SpeechClientWorkspace`, `SpeechTranscript`, `SpeechConnectionForm`; products own microphone, streaming and API origin | Implemented |
| XGC2 Automation spatial editor | Separate `@xgc2/ui-workflow`: `WorkflowCanvas`, viewport/grid/pan/zoom/selection/drop foundation, canvas/node/edge toolbars, and `WorkflowStickyNote` | Implemented; domain-specific node/edge bodies intentionally remain in each product while their spatial interaction and chrome stay shared |
| XGC2 `CommonUI` settings/info/resource rows | `SettingsList`, `SettingRow`, `DescriptionList`, `DescriptionItem`, `ResourceMeter` | Implemented |
| XGC2 panel view switches, collapsible configuration and workflow state cards | `PanelViewSwitcher`, `ConfigSection`, `WorkflowStatusCard` | Implemented |
| XGC2 `ListPage` folders, tags, protected drag/drop and resource lists | `ListPage` family; products retain resource data and actions only | Implemented |
| XGC2 terminal output, live logs and command stream viewers | Shared `CodeBlock` / `ScrollRegion` cover static text and scrolling; terminal transport, ANSI rendering and follow-tail lifecycle remain product-local until another consumer proves the same behavior | Intentional product boundary; no duplicated cross-product primitive remains to extract in this release |

## Product adoption

This snapshot records remote default branches, not local worktrees. A pull request is deliberately not reported as adopted until its default branch contains the immutable release.

| Product repository / UI surface | Remote baseline at this snapshot | `0.14.0` state and gate |
| --- | --- | --- |
| XGC2 GCS (`xgc2-vibe-coding-temp`) | `master@031035bb`; React `0.13.1`, workflow `0.2.1` | **Pending.** Draft PR [#20](https://github.com/lxk36/xgc2-vibe-coding-temp/pull/20) at `b96ff057` pins React `0.14.0` and workflow `0.3.0`, with its checks passing. It remains unadopted until reviewed and merged to `master`; the ledger must not treat the PR branch as the product baseline. |
| APT Repository (`xgc2-apt-repo`) | `master@5679f278`; React `0.14.0` | **Adopted.** Shared shell/topbar/table/select-all/code/theme/scrollbar primitives remain in use; Docker image run `31679837212` and deployment run `31680057249` passed. |
| Agent Hub (`xgc2-agent-hub`) | `main@b9512034`; React `0.14.0` | **Adopted.** The shared shell, drawer, bounded workspaces, controls, feedback, lists, Markdown and structured data are pinned; graph legend geometry is explicitly domain-local rather than disguised spacing. CI run `31680269661` passed. |
| Research OS (`xgc2-research-os`) | `main@b848c848`; React `0.14.0`, workflow `0.3.0` | **Adopted.** Shared shell, navigation, controls, data layouts and workflow surfaces are pinned while graph semantics and coordinates remain local. CI run `31650793799` passed. |
| STT Service (`xgc2-stt-service`) | `main@d348d9ac`; React `0.13.1` | **Pending.** Draft PR [#3](https://github.com/lxk36/xgc2-stt-service/pull/3) at `2551fe53` pins React `0.14.0` and has a passing review check. Merge remains with G0/Resonance; do not report default-branch adoption before that handoff completes. |
| Media Edge (`xgc2-media-edge`) | `main@900ea348`; React `0.14.0` (adopted at `5b8850a6`) | **Adopted.** The Go-embedded React player retains deterministic generated assets and the shared mobile contract. Current-main CI run `31681774803` passed. |
| Camera Calibration (`xgc2-camera-calibration-ros1`), intrinsic and extrinsic pages | `main@2e22e7bd`; React `0.14.0` | **Adopted for both UI surfaces.** One shared React source still produces two independently packaged pages; ROS transport, canvas interaction and calibration math remain domain-local. CI run `31679945282` passed. |
| Gazebo camera tool (`xgc2-gazebo-sim-camera`) | `main@3a2cc518`; React `0.14.0` | **Adopted.** This is the standalone camera repository, not the aggregate `xgc2-gazebo-sim` repository's `noetic` branch. CI run `31679945647` passed. |

At this snapshot, 6 of 8 consumer repositories and 7 of 9 UI surfaces have `0.14.0` on their remote default branch. XGC2 GCS and STT remain review/merge work, not completed migration.

## Geometry and breakpoint contract

- `--space-*` tokens express rhythm only: gaps, padding and layout insets. They must not be used as component width, height, diameter, handle size, hit target or reserved dimension, nor aliased into a custom property that is then used as one.
- Reusable component geometry uses the finite shared semantic `--size-*` roles. Genuine charts, graphs, calibration canvases, robot instruments and simulation geometry use honest local values; inventing a shared or product token merely to hide a domain pixel value is prohibited.
- `packages/tokens/src/breakpoints.json` is the cross-runtime authority: `compact` is `820px` and `mobile` is `720px`. Generated TypeScript and generated CSS consume it. Handwritten CSS may retain the literal canonical `820px` and `720px` media-query values because CSS custom properties cannot govern media queries, but it must not introduce a competing product breakpoint.

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release, update every consumer lockfile, validate each product, then deploy APT once and verify its remote workflow and service. Patch releases restart this consumer gate: a tagged package is not family-wide adoption until every applicable default branch and lockfile points at it.
