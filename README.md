# XGC2 UI

Shared design tokens, React components, and application-shell primitives for XGC2 web products.

The normative family-wide rules live in [DESIGN_CONTRACT.md](./DESIGN_CONTRACT.md). Product-specific CSS may not override those interaction and chrome conventions.

The current remote-default-branch rollout is tracked in [MIGRATION_MATRIX.md](./MIGRATION_MATRIX.md). Its scope is 8 immutable-tarball consumer repositories and 9 UI surfaces (Camera Calibration contributes separate intrinsic and extrinsic pages). XGC2 Lichtblick remains an upstream MUI compatibility boundary and is not counted as a package consumer.

## Packages

- `@xgc2/ui-tokens`: the single source of truth for light/dark color, spacing, type, elevation, and motion tokens.
- `@xgc2/ui-react`: framework components and application-shell layout. React and React DOM are peer dependencies.
- `@xgc2/ui-workflow`: optional spatial workflow/topology canvas foundation. It keeps React Flow out of frontends that only need ordinary controls.
- `@xgc2/ui-manuscript`: optional source editor, PDF pane, and quote chip. It keeps Monaco / PDF.js out of GCS and `@xgc2/ui-react`. The private `apps/manuscript` host talks to `latex-service` on `127.0.0.1:3280`.
- `@xgc2/ui-policy`: version-locked, fail-closed consumer CI for the shared visual and interaction contract.
- `@xgc2/ui-gallery`: a private Storybook application used for documentation and visual review.

## Boundaries

This repository owns visual language, interaction behavior, accessibility, and reusable layout. It does not own product routing, API clients, authentication, or domain state. Consumers inject navigation items, breadcrumbs, topbar actions, and sidebar footer content.

## Local development

```bash
corepack enable
pnpm install
pnpm check
pnpm dev
```

The gallery runs on `http://127.0.0.1:6006` by default.

Formal package and policy publication uses the same immutable executor locally
and in GitHub Actions. See [Immutable releases](./docs/immutable-releases.md) for
the complete checks, exact source evidence, and local execution when hosted CI
is unavailable.

## Consumer usage

```tsx
import '@xgc2/ui-react/styles.css';
import {
  AudioCaptureControl,
  Button,
  FormField,
  Panel,
  Select,
  SpeechClientWorkspace,
} from '@xgc2/ui-react';
```

Applications initialize `data-skin="dark"` or `data-skin="light"` on the root HTML element with `initializeSkin`, then use `useSkin` for persisted operator changes. Both APIs intentionally default to light when no preference has been selected.

Production consumers install immutable npm tarballs attached to GitHub releases. Relative `file:` dependencies and direct imports from this repository are intentionally unsupported.

```json
{
  "dependencies": {
    "@xgc2/ui-react": "https://github.com/XGC-Team/xgc2-ui/releases/download/v0.16.8/xgc2-ui-react-0.16.8.tgz"
  }
}
```

The React package inlines the token contract into its published stylesheet, so consumers do not need registry access to resolve a transitive token package.

Every consumer installs the matching policy package and runs it against its
real product source. Missing paths and empty scans are errors; the CLI reports
the exact number of CSS and production script/HTML files checked. A React
family is ready for consumer rollout only after both its `vX.Y.Z` package
release and matching `policy-vX.Y.Z` policy release exist; source preparation
or a package tag alone is not a deployable family.

```bash
xgc2-style-policy --root src --html index.html
```

Release tags are created from the current protected `main` commit through the
`Prepare immutable release tag` workflow. It validates the release delta,
creates an annotated tag, then explicitly dispatches the matching publisher
(tag pushes made with GitHub's workflow token do not start another workflow).
The package and policy publishers reject lightweight tags or commits outside
`main`. The immutable-tag ruleset prevents
updates and deletion after creation. GitHub evaluates tag-push workflows only
after a ref exists, so a manually pushed malformed tag could still consume an
otherwise unused namespace even though it cannot publish an asset. Manual tag
creation is therefore prohibited; where organization rulesets support an
integration-only creation bypass, that bypass should be limited to GitHub
Actions and this workflow.

Reusable coverage includes:

- Foundation: an optical monochrome black/white/graphite hierarchy with semantic color reserved for data and decision-relevant state, theme and material tokens, spacing and type scales, semantic geometry, header/control heights, generated responsive breakpoints, and the global XGC2 scrollbar treatment.
- Controls: buttons and links, inputs, textarea, selects, labeled fields/groups, finite form sections, input actions, three-axis vector entry, checkbox, switch, segmented controls, semantic tabs, editable/reorderable workspace tabs, plain status text, notices, empty states, progress, and theme-aware highlighted code/Markdown.
- Data: selectable lists, disclosures, statistics, description/settings lists, toolbars, pagination, sortable/selectable tables with select-all, and a dense log-table page with its own scroll region.
- Layout: stack, inline, responsive grid, scroll region, fixed operator workspace, semantic PageFrame, section header, automatically flattening panels, composable grid workspaces, workspace panels, responsive split panes, application shell, collapsible sidebar, single-title topbar, breadcrumbs, and internally scrolling resource catalogs.
- Conversation, overlays, and media: shared agent/human timelines, streaming follow-tail viewports, messages, composers, tool activities, modal, queued confirmation and text prompts, viewport-aware popovers/action menus, dirty-state-aware right drawer, waveform, audio capture presentation, and embeddable speech-client capture/transcript chrome.
- Spatial editors: an optional workflow package owning canvas viewport defaults, grid, pan/zoom, selection, drag/drop coordinate conversion, empty state, neutral node surfaces, canvas and element toolbars, and editable sticky notes.

Product repositories keep routing, transport, device access, permissions, and domain state. Product-local wrappers should disappear once all required behavior exists here; they must not become a second visual system.

Spacing tokens are layout rhythm, never component dimensions. Shared widths, heights, handles and hit targets use finite semantic `--size-*` roles; genuine chart, calibration, robot and simulation geometry remains an honest local value. `breakpoints.json` is the runtime source of truth (`compact: 820px`, `mobile: 720px`); generated APIs consume it, while handwritten CSS may use those two literal canonical media-query values and no product-specific substitutes.

## Selection-state policy

Left-side accent bars are prohibited across the XGC2 UI family. Components must not use a left border, a pseudo-element stripe, or an inset left-edge shadow to communicate selection, active state, severity, or dialog hierarchy. Use a complete background, enclosing border, and text/icon color instead.

## Topbar policy

Every topbar has exactly one product title on the left and only high-value interactive controls on the right. Center copy, subtitles, helper descriptions, and decorative healthy-state pills such as Ready or Online are prohibited. Diagnostic status belongs beside the content it describes and should appear only when it helps the operator make a decision; normal health does not need a badge.

Status is plain text, not decoration. Use shared `StatusText` without a capsule, filled background, rounded enclosing border, or decorative dot. Wording is mandatory; restrained semantic text color is only a secondary cue.

Page chrome and first-level panel chrome use `--size-header-page` and `--size-header-panel`; the 0.16 family uses 40px page chrome and 38px panel chrome around 28px compact controls. Code labels and Copy actions use `--size-header-code` as quiet in-surface metadata, never a visually dominant nested topbar.
