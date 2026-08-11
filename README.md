# XGC2 UI

Shared design tokens, React components, and application-shell primitives for XGC2 web products.

## Packages

- `@xgc2/ui-tokens`: the single source of truth for light/dark color, spacing, type, elevation, and motion tokens.
- `@xgc2/ui-react`: framework components and application-shell layout. React and React DOM are peer dependencies.
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

## Consumer usage

```tsx
import '@xgc2/ui-react/styles.css';
import { AudioCaptureControl, Button, FormField, Panel, Select } from '@xgc2/ui-react';
```

Applications must set `data-skin="dark"` or `data-skin="light"` on the root HTML element. The default is dark for compatibility with the GCS.

Production consumers install immutable npm tarballs attached to GitHub releases. Relative `file:` dependencies and direct imports from this repository are intentionally unsupported.

```json
{
  "dependencies": {
    "@xgc2/ui-react": "https://github.com/lxk36/xgc2-ui/releases/download/v0.6.0/xgc2-ui-react-0.6.0.tgz"
  }
}
```

The React package inlines the token contract into its published stylesheet, so consumers do not need registry access to resolve a transitive token package.

Reusable coverage includes application shell, collapsible sidebar, topbar and product identity, panels, buttons and button links, inputs, selects, labeled fields, segmented controls, semantic tabs, modals, status badges, statistics, toolbars, data tables, code blocks, audio waveform/capture presentation, and the global XGC2 scrollbar treatment. Product repositories keep routing, transport, device access, and domain state.

## Selection-state policy

Left-side accent bars are prohibited across the XGC2 UI family. Components must not use a left border, a pseudo-element stripe, or an inset left-edge shadow to communicate selection, active state, severity, or dialog hierarchy. Use a complete background, enclosing border, and text/icon color instead.

## Topbar policy

Every topbar has exactly one product title on the left and only high-value interactive controls on the right. Center copy, subtitles, helper descriptions, and decorative healthy-state pills such as Ready or Online are prohibited. Diagnostic status belongs beside the content it describes and should appear only when it helps the operator make a decision; normal health does not need a badge.

Page chrome and first-level panel chrome use `--size-header-page` and `--size-header-panel`; the panel value is the compact 34px XGC2 experiment-panel baseline. Code labels and Copy actions use `--size-header-code` as quiet in-surface metadata, never a visually dominant nested topbar.
