# XGC2 Frontend Foundation Migration Matrix

This file is the implementation ledger for the family-wide React migration. A row is complete only when reusable behavior lives in the shared packages, product-local duplication is removed, immutable packages are installed from the canonical organization repository, the fail-closed policy runs in product CI, product tests/build pass, and the result has been visually checked in both themes and desktop/mobile layouts.

The current published family on `main` is `0.15.5` (React `0.15.5`, tokens
`0.8.2`, workflow `0.3.2`, policy `0.15.5`). It contains the post-`0.15.4`
geometry lock: flattened nested panel chrome, list-page toolbar rhythm, and
`--space-panel-section-gap`. The snapshot below remains the last verified
`0.15.4` consumer train; a tagged `0.15.5` family is not family-wide adoption
until every applicable default branch and lockfile points at it.

The previous `0.15.4` rollout covered **8 consumer repositories and 9 UI surfaces**: XGC2 GCS, APT Repository, Agent Hub, Research OS, STT Service, Media Edge, both Camera Calibration pages (intrinsic and extrinsic), and the standalone Gazebo camera tool. Camera Calibration is one repository with two independently packaged pages. XGC2 Lichtblick is an upstream MUI application with a narrow XGC2-owned compatibility bridge; it is not an immutable-tarball consumer and is not counted in this rollout matrix.

## Canonical source and immutable artifacts

The source authority is [XGC-Team/xgc2-ui](https://github.com/XGC-Team/xgc2-ui). Consumer manifests and lockfiles must use its immutable release URLs; the former personal-owner URL is only a GitHub compatibility redirect and is not an accepted production source.

| Package | Canonical immutable asset | SHA-256 |
| --- | --- | --- |
| `@xgc2/ui-react@0.15.4` | [`v0.15.4/xgc2-ui-react-0.15.4.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/v0.15.4/xgc2-ui-react-0.15.4.tgz) | `328aed92b7fc713984524c3d4c34311948f1d078db651013c1d174663c55dcc5` |
| `@xgc2/ui-workflow@0.3.1` | [`v0.15.2/xgc2-ui-workflow-0.3.1.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/v0.15.2/xgc2-ui-workflow-0.3.1.tgz) | `fb1667961b7455fb21abca93e7a73c617a998cfca69590dcae170f61bf5d3e4e` |
| `@xgc2/ui-policy@0.15.4` | [`policy-v0.15.4/xgc2-ui-policy-0.15.4.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/policy-v0.15.4/xgc2-ui-policy-0.15.4.tgz) | `49cbca9f5afd148452d167c7d05d8a8ef23f81d7d5156b4874d8a7bf62bb5849` |

The workflow package keeps its independent `0.3.1` package version and therefore remains attached to the immutable `v0.15.2` release. The policy package is independently tagged `policy-v0.15.4`; neither fact permits a consumer to substitute a moving branch or a legacy-owner URL. React `0.15.4` contains both the achromatic neutral-white Light correction introduced in `0.15.3` and the bounded table-row scrolling fix; the independent graphite Dark source was not changed. Both `0.15.4` tags resolve to [`main@876c45a1d743e4b2f380ea8ca33815bcb748a16d`](https://github.com/XGC-Team/xgc2-ui/commit/876c45a1d743e4b2f380ea8ca33815bcb748a16d), whose [library CI](https://github.com/XGC-Team/xgc2-ui/actions/runs/31705568780), [React release](https://github.com/XGC-Team/xgc2-ui/actions/runs/31705879660), and [policy release](https://github.com/XGC-Team/xgc2-ui/actions/runs/31706223381) all passed.

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
| APT packages and operations tables | `SortableDataTable` sorting, selection/select-all and bounded `bodyScroll`; `Pagination` | Implemented; a bounded table keeps its header outside the focusable vertical row viewport, synchronizes measured header/body columns across scrollbar widths and resize, and retains one shared horizontal axis |
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

This snapshot was verified on 2026-08-14 and records remote default branches, not local worktrees. A pull request is deliberately not reported as default-branch adoption. A green run is listed only when the checked revision actually executes `xgc2-style-policy` against product source; ordinary build success is not a substitute.

| Product repository / UI surface | Verified remote default | Shared package state | Gate evidence |
| --- | --- | --- | --- |
| XGC2 GCS (`xgc2-vibe-coding-temp`) | [`master@8d0838d4f20807d5780cb2b9789e9d69d87c17b6`](https://github.com/lxk36/xgc2-vibe-coding-temp/commit/8d0838d4f20807d5780cb2b9789e9d69d87c17b6) | React `0.15.4`, workflow `0.3.1`, policy `0.15.4`; all three use canonical `XGC-Team` assets. | **Complete.** [`web-ci` run 31707339382, attempt 3](https://github.com/lxk36/xgc2-vibe-coding-temp/actions/runs/31707339382) passed policy, repository gates, Light/Dark visual regression and all four real Core-to-Agent lifecycle checks, including isolated cleanup; [`secret-policy` run 31707339384](https://github.com/lxk36/xgc2-vibe-coding-temp/actions/runs/31707339384) also passed. |
| APT Repository (`xgc2-apt-repository`) | [`master@2b7ec9b6f91dae7b885a7a47d3c63da2a902bb18`](https://github.com/XGC-Team/xgc2-apt-repository/commit/2b7ec9b6f91dae7b885a7a47d3c63da2a902bb18) | React `0.15.4`, policy `0.15.4`; canonical `XGC-Team` assets. Package rows opt into the shared bounded table viewport. | **Complete and deployed.** [`Docker image` run 31706723143](https://github.com/XGC-Team/xgc2-apt-repository/actions/runs/31706723143) ran policy and passed; [`Deploy` run 31707002939](https://github.com/XGC-Team/xgc2-apt-repository/actions/runs/31707002939) passed. The [public dashboard](https://xgc2.apt.xiaokang.ink/dashboard/) and health endpoint returned `200`; desktop browser verification confirmed that vertical row scrolling leaves the header fixed and every measured header/body column aligned. |
| Agent Hub (`xgc2-agent-hub`) | [`main@6fcb196857cb3c74e09b2c9f2159a9d88470de25`](https://github.com/lxk36/xgc2-agent-hub/commit/6fcb196857cb3c74e09b2c9f2159a9d88470de25) | React `0.15.4`, policy `0.15.4`; canonical `XGC-Team` assets. | **Complete.** [`Agent Hub CI` run 31709834170](https://github.com/lxk36/xgc2-agent-hub/actions/runs/31709834170) ran policy and passed. |
| Research OS (`xgc2-research-os`) | [`main@4f06c602a2f73bb86a374f619e70c5488a7b2fac`](https://github.com/lxk36/xgc2-research-os/commit/4f06c602a2f73bb86a374f619e70c5488a7b2fac) | React `0.15.4`, workflow `0.3.1`, policy `0.15.4`; all three use canonical `XGC-Team` assets. | **Complete.** [`CI` run 31706876952](https://github.com/lxk36/xgc2-research-os/actions/runs/31706876952) ran policy and passed. |
| STT Service (`xgc2-stt-service`) | [`main@df7819dd37386021394446884c05c95c96970c54`](https://github.com/XGC-Team/xgc2-stt-service/commit/df7819dd37386021394446884c05c95c96970c54) | Default branch contains canonical React `0.15.2`, but no policy package or policy CI. | **Not complete on the default branch.** Open draft PR [#5](https://github.com/XGC-Team/xgc2-stt-service/pull/5) at `2c8de4c8b9f210cdf9e731cbaf85ba276c623a14` changes only the manifest/lockfile to canonical React `0.15.4` plus policy `0.15.4`; [`Review` run 31707007686](https://github.com/XGC-Team/xgc2-stt-service/actions/runs/31707007686) ran policy and passed. It remains open, draft and clean, and must not be counted as default-branch adoption. |
| Media Edge (`xgc2-media-edge`) | [`main@29d78e78607775c98d2da88e3cc9599144f478fd`](https://github.com/lxk36/xgc2-media-edge/commit/29d78e78607775c98d2da88e3cc9599144f478fd) | React `0.15.4`, policy `0.15.4`; canonical `XGC-Team` assets. | **Complete.** [`ci` run 31706973490](https://github.com/lxk36/xgc2-media-edge/actions/runs/31706973490) ran policy and passed; deterministic Go-embedded assets and the shared mobile contract remain intact. |
| Camera Calibration (`xgc2-camera-calibration-ros1`), intrinsic and extrinsic pages | [`main@34be705a9d05a7c4a6a65b904453107bc1342627`](https://github.com/lxk36/xgc2-camera-calibration-ros1/commit/34be705a9d05a7c4a6a65b904453107bc1342627) | React `0.15.4`, policy `0.15.4`; canonical `XGC-Team` assets for both packaged pages. | **Complete for both UI surfaces.** [`ci` run 31706973796](https://github.com/lxk36/xgc2-camera-calibration-ros1/actions/runs/31706973796) ran policy and passed. ROS transport, canvas interaction and calibration math remain domain-local. |
| Gazebo camera tool (`xgc2-gazebo-sim-camera`) | [`main@656a1451f71ad64284e276e32409043f4c343bf3`](https://github.com/lxk36/xgc2-gazebo-sim-camera/commit/656a1451f71ad64284e276e32409043f4c343bf3) | React `0.15.4`, policy `0.15.4`; canonical `XGC-Team` assets. | **Complete.** [`ci` run 31706972449](https://github.com/lxk36/xgc2-gazebo-sim-camera/actions/runs/31706972449) ran policy and passed. This is the standalone camera repository, not the aggregate `xgc2-gazebo-sim` repository's `noetic` branch. |

React `0.15.4` and matching policy `0.15.4` are complete on **7 of 8 default branches and 8 of 9 UI surfaces**. The same pair is validated on STT draft PR #5 but is deliberately not reported as default-branch adoption. Workflow `0.3.1` is complete on both applicable default branches, XGC2 GCS and Research OS. All seven completed defaults and the STT draft were checked in Light/Dark and desktop/mobile layouts; STT remains the sole draft-only handoff.

## Geometry and breakpoint contract

- `--space-*` tokens express rhythm only: gaps, padding and layout insets. They must not be used as component width, height, diameter, handle size, hit target or reserved dimension, nor aliased into a custom property that is then used as one.
- Reusable component geometry uses the finite shared semantic `--size-*` roles. Genuine charts, graphs, calibration canvases, robot instruments and simulation geometry use honest local values; inventing a shared or product token merely to hide a domain pixel value is prohibited.
- `packages/tokens/src/breakpoints.json` is the cross-runtime authority: `compact` is `820px` and `mobile` is `720px`. Generated TypeScript and generated CSS consume it. Handwritten CSS may retain the literal canonical `820px` and `720px` media-query values because CSS custom properties cannot govern media queries, but it must not introduce a competing product breakpoint.

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release from `XGC-Team/xgc2-ui`, update every consumer manifest and lockfile to the canonical asset, validate each product under `@xgc2/ui-policy`, then deploy APT once and verify its remote workflow and service. Patch releases restart this consumer gate: a tagged package is not family-wide adoption until every applicable default branch and lockfile points at it and runs the matching policy in CI.
