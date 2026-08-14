# XGC2 Frontend Foundation Migration Matrix

This file is the implementation ledger for the family-wide React migration. A row is complete only when reusable behavior lives in the shared packages, product-local duplication is removed, immutable packages are installed from the canonical organization repository, the fail-closed policy runs in product CI, product tests/build pass, and the result has been visually checked in both themes and desktop/mobile layouts.

The `0.14.1` family baseline covers **8 consumer repositories and 9 UI surfaces**: XGC2 GCS, APT Repository, Agent Hub, Research OS, STT Service, Media Edge, both Camera Calibration pages (intrinsic and extrinsic), and the standalone Gazebo camera tool. Camera Calibration is one repository with two independently packaged pages. XGC2 Lichtblick is an upstream MUI application with a narrow XGC2-owned compatibility bridge; it is not an immutable-tarball consumer and is not counted in this rollout matrix.

## Canonical source and immutable artifacts

The source authority is [XGC-Team/xgc2-ui](https://github.com/XGC-Team/xgc2-ui). Consumer manifests and lockfiles must use its immutable release URLs; the former personal-owner URL is only a GitHub compatibility redirect and is not an accepted production source.

| Package | Canonical immutable asset | SHA-256 |
| --- | --- | --- |
| `@xgc2/ui-react@0.14.1` | [`v0.14.1/xgc2-ui-react-0.14.1.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/v0.14.1/xgc2-ui-react-0.14.1.tgz) | `cb8654828cda326b57c3d5a3e8a82d7e99ab1f4ad11b629c6fc1adb2e5746882` |
| `@xgc2/ui-workflow@0.3.0` | [`v0.14.0/xgc2-ui-workflow-0.3.0.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/v0.14.0/xgc2-ui-workflow-0.3.0.tgz) | `4104298c9e5a8ae73635cefee1e7c67549e2f575757f8b7a6a4a1d37ba828485` |
| `@xgc2/ui-policy@0.14.1` | [`policy-v0.14.1/xgc2-ui-policy-0.14.1.tgz`](https://github.com/XGC-Team/xgc2-ui/releases/download/policy-v0.14.1/xgc2-ui-policy-0.14.1.tgz) | `4a588ea714dd7496df738f9e006bd52c57a20a8dec010ed2489360f6010c27ef` |

The workflow package keeps its independent `0.3.0` package version and therefore remains attached to the immutable `v0.14.0` release. The policy package is independently tagged `policy-v0.14.1`; neither fact permits a consumer to substitute a moving branch or a legacy-owner URL.

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

This snapshot was verified on 2026-08-14 and records remote default branches, not local worktrees. A pull request is deliberately not reported as default-branch adoption. A green run is listed only when the checked revision actually executes `xgc2-style-policy` against product source; ordinary build success is not a substitute.

| Product repository / UI surface | Verified remote default | Shared package state | Gate evidence |
| --- | --- | --- | --- |
| XGC2 GCS (`xgc2-vibe-coding-temp`) | [`master@48137cd28b8acda6abd7d11da7e9e0a11b137048`](https://github.com/lxk36/xgc2-vibe-coding-temp/commit/48137cd28b8acda6abd7d11da7e9e0a11b137048) | React `0.14.1`, workflow `0.3.0`, policy `0.14.1`; all three use canonical `XGC-Team` assets. | **Complete.** [`web-ci` run 31693980510](https://github.com/lxk36/xgc2-vibe-coding-temp/actions/runs/31693980510) passed policy, repository gates, visual regression and the real Core-to-Agent lifecycle; [`secret-policy` run 31693980595](https://github.com/lxk36/xgc2-vibe-coding-temp/actions/runs/31693980595) also passed. |
| APT Repository (`xgc2-apt-repo`) | [`master@b4892f090e383eb17201a649172c283bd83ff959`](https://github.com/lxk36/xgc2-apt-repo/commit/b4892f090e383eb17201a649172c283bd83ff959) | React `0.14.1`, policy `0.14.1`; canonical `XGC-Team` assets. | **Complete and deployed.** [`Docker image` run 31692871551](https://github.com/lxk36/xgc2-apt-repo/actions/runs/31692871551) ran policy and passed; [`Deploy` run 31693116792](https://github.com/lxk36/xgc2-apt-repo/actions/runs/31693116792) passed, and the public dashboard/package API and health endpoint were verified after deployment. |
| Agent Hub (`xgc2-agent-hub`) | [`main@6c09f60f65cc60d2d46953ddad40100ce078ea4c`](https://github.com/lxk36/xgc2-agent-hub/commit/6c09f60f65cc60d2d46953ddad40100ce078ea4c) | React `0.14.1`, policy `0.14.1`; canonical `XGC-Team` assets. | **Complete.** [`Agent Hub CI` run 31692832261](https://github.com/lxk36/xgc2-agent-hub/actions/runs/31692832261) ran policy and passed. |
| Research OS (`xgc2-research-os`) | [`main@0c049463939a4dffcd795d97e5d1c60c4eaad79f`](https://github.com/lxk36/xgc2-research-os/commit/0c049463939a4dffcd795d97e5d1c60c4eaad79f) | React `0.14.1`, workflow `0.3.0`, policy `0.14.1`; all three use canonical `XGC-Team` assets. | **Complete.** [`CI` run 31693067538](https://github.com/lxk36/xgc2-research-os/actions/runs/31693067538) ran policy and passed. |
| STT Service (`xgc2-stt-service`) | [`main@961d5caa1d2f7f3a223faa0379a9d9d8254f6b68`](https://github.com/XGC-Team/xgc2-stt-service/commit/961d5caa1d2f7f3a223faa0379a9d9d8254f6b68) | Default branch contains React `0.14.1`, but its manifest/lockfile still use the legacy-owner redirect and it has no policy package or policy CI. | **Not complete on the default branch.** Open draft PR [#5](https://github.com/XGC-Team/xgc2-stt-service/pull/5) at `6bde7acb6e3d1bd8f33cb43d9a10092a76975c42` changes only the manifest/lockfile to canonical React `0.14.1` plus policy `0.14.1`; [`Review` run 31693406479](https://github.com/XGC-Team/xgc2-stt-service/actions/runs/31693406479) ran policy and passed. It remains draft and must not be counted as default-branch adoption. |
| Media Edge (`xgc2-media-edge`) | [`main@b614a685086fe48c73ecc3286341780ec2264034`](https://github.com/lxk36/xgc2-media-edge/commit/b614a685086fe48c73ecc3286341780ec2264034) | React `0.14.1`, policy `0.14.1`; canonical `XGC-Team` assets. | **Complete.** [`ci` run 31693067768](https://github.com/lxk36/xgc2-media-edge/actions/runs/31693067768) ran policy and passed; deterministic Go-embedded assets and the shared mobile contract remain intact. |
| Camera Calibration (`xgc2-camera-calibration-ros1`), intrinsic and extrinsic pages | [`main@9b30b00d2aa5cdf75b58bb20340c4efdd2aeab29`](https://github.com/lxk36/xgc2-camera-calibration-ros1/commit/9b30b00d2aa5cdf75b58bb20340c4efdd2aeab29) | React `0.14.1`, policy `0.14.1`; canonical `XGC-Team` assets for both packaged pages. | **Complete for both UI surfaces.** [`ci` run 31693066991](https://github.com/lxk36/xgc2-camera-calibration-ros1/actions/runs/31693066991) ran policy and passed. ROS transport, canvas interaction and calibration math remain domain-local. |
| Gazebo camera tool (`xgc2-gazebo-sim-camera`) | [`main@3ef30b89481610f01b4fdd3af0e3b6bb2d716608`](https://github.com/lxk36/xgc2-gazebo-sim-camera/commit/3ef30b89481610f01b4fdd3af0e3b6bb2d716608) | React `0.14.1`, policy `0.14.1`; canonical `XGC-Team` assets. | **Complete.** [`ci` run 31693068209](https://github.com/lxk36/xgc2-gazebo-sim-camera/actions/runs/31693068209) ran policy and passed. This is the standalone camera repository, not the aggregate `xgc2-gazebo-sim` repository's `noetic` branch. |

React `0.14.1` is present on **8 of 8 default branches and 9 of 9 UI surfaces**. The stricter canonical-source and policy gate is complete on **7 of 8 repositories and 8 of 9 UI surfaces**; STT remains the sole draft-only handoff. Workflow `0.3.0` is complete on both applicable default branches, XGC2 GCS and Research OS.

## Geometry and breakpoint contract

- `--space-*` tokens express rhythm only: gaps, padding and layout insets. They must not be used as component width, height, diameter, handle size, hit target or reserved dimension, nor aliased into a custom property that is then used as one.
- Reusable component geometry uses the finite shared semantic `--size-*` roles. Genuine charts, graphs, calibration canvases, robot instruments and simulation geometry use honest local values; inventing a shared or product token merely to hide a domain pixel value is prohibited.
- `packages/tokens/src/breakpoints.json` is the cross-runtime authority: `compact` is `820px` and `mobile` is `720px`. Generated TypeScript and generated CSS consume it. Handwritten CSS may retain the literal canonical `820px` and `720px` media-query values because CSS custom properties cannot govern media queries, but it must not introduce a competing product breakpoint.

## Release discipline

The shared package is not published after each extraction. Complete the batch, run policy/type/test/build/Storybook checks, publish one immutable release from `XGC-Team/xgc2-ui`, update every consumer manifest and lockfile to the canonical asset, validate each product under `@xgc2/ui-policy`, then deploy APT once and verify its remote workflow and service. Patch releases restart this consumer gate: a tagged package is not family-wide adoption until every applicable default branch and lockfile points at it and runs the matching policy in CI.
