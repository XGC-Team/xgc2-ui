# @xgc2/ui-react

## 0.15.1

### Minor Changes

- Add embeddable speech-client chrome: connection fields for a user-supplied
  API origin and key, a live final/partial transcript surface, and a two-panel
  capture workspace. Products keep microphone access, streaming transport, and
  persistence; this package owns the shared page composition.

## 0.14.1

### Patch Changes

- Arbitrate Escape through one topmost overlay stack for SelectMenu, Popover,
  Tooltip, Modal, Drawer, and the mobile AppSidebar. Each key press dismisses
  only the innermost dismissible layer, restores its trigger, respects consumed
  and IME events, and leaves nondismissible owners in place.
- Let dialog focus containment recognize its portaled overlay descendants, so
  native Tab traversal is not intercepted by the parent Modal or Drawer.
- Extend the cross-product gate to executable entry-HTML scripts and inline
  handlers, including optional/window document access, and reject absolute
  component dimensions laundered through spacing arithmetic or unknown custom
  properties while preserving relative and genuine semantic-size layouts.

## 0.14.0

### Major corrective release

- Enforce one enabled roving listbox tab stop even when selection or explicit
  tab indexes conflict.
- Parse divider-free Markdown tables without dropping their first row and reject
  malformed table structures while preserving escaped source text.
- Complete mobile drawer modality with inert closed state, Escape dismissal,
  cyclic focus trapping, and trigger-focus restoration.
- Make queued text prompts identity-bound and exactly-once across stale callbacks,
  duplicate settlement, and unmount.
- Make skin persistence reactive to storage-key changes, external storage
  events, and same-document hooks through one subscription authority.
- Give statistic buttons an explicitly spaced accessible name and consume the
  generated breakpoint and semantic geometry contracts.

## 0.13.1

### Patch Changes

- Collapse the application shell to a single content column below the mobile
  breakpoint when its sidebar is configured as a drawer. This prevents an
  off-canvas drawer from retaining an implicit grid track and compressing
  narrow operator pages.

## 0.13.0

### Minor Changes

- Replace the withdrawn cool blue-gray foundation with a neutral graphite night
  material and a warm paper-gray light material. Keep semantic feedback and
  small data accents legible without tinting application surfaces.
- Add shared human/agent conversation regions, messages, composers, and neutral
  activity disclosures with accessible live-log, keyboard, IME, and reduced-
  motion behavior.
- Add engine-neutral composable workspaces and 34px workspace panels for fixed
  or drag/resizable operator layouts, including finite breakpoints, constraints,
  editing grids, selection, placeholder, and commit contracts.
- Make lifecycle status presentation a plain-text shared contract and add a
  compact bounded code viewport for one-screen command collections.

## 0.12.0

### Minor Changes

- Add selectable lists, sanitized Markdown, disclosures, notice regions, form
  sections, input actions, three-axis controls, text prompts, popovers, action
  menus, responsive mobile drawers, bounded workspace layouts, and shared skin
  initialization/persistence. Align every component with the finite semantic
  token scale and one refined light/dark theme contract.

## 0.11.0

### Minor Changes

- Industrialize the shared XGC2 frontend foundation with reusable application
  shell, navigation, workspace tabs, breadcrumbs, list-page, configuration,
  choice-card, color, workflow-status, modal/drawer, audio-capture, and sortable
  data-table capabilities. Standardize responsive operator layouts, real PCM
  waveforms, compact syntax-highlighted code blocks, global scrollbars, panel
  geometry, selection surfaces, and refined light/dark materials while enforcing
  the family-wide ban on left accent bars, status dots, pills, and decorative
  healthy-state chrome.

## 0.10.1

### Patch Changes

- Build workflow declarations before typechecking fresh workspace consumers.

## 0.10.0

### Minor Changes

- Add the shared spatial workflow canvas package and remove deprecated React compatibility APIs.

## 0.9.0

### Minor Changes

- Add the shared portaled SelectMenu and extend SegmentedControl with tab semantics, icons, stable selectors, and keyboard navigation.

## 0.8.0

### Minor Changes

- Expand the shared operator component set, preserve stable composite control metadata, and consolidate form, tooltip, and control styling for product migrations.

## 0.7.2

### Patch Changes

- Ensure compact single-column rules override every desktop split ratio instead of allowing the ratio selector to compress the primary pane beside a fixed secondary pane.

## 0.7.1

### Patch Changes

- Let document-flow shells choose the shared mobile or compact breakpoint so dense two-pane operator workspaces can stack before their controls become cramped.

## 0.7.0

### Minor Changes

- Fix panel headers and their action controls to semantic shared-token heights. Extend the compact copyable CodeBlock treatment with safe, theme-aware shell and JSON syntax highlighting. Add a generic sortable, selectable DataTable with accessible sort state, partial selection, and select-all behavior. Add shared responsive split panes, fixed/mobile-document shell modes, breakpoint constants, and media-query hooks. Apply restrained shared surface gradients across shell, panels, and controls.

## 0.6.0

### Minor Changes

- Add explicit page, panel, and code metadata header tokens. Align first-level panels to the compact 34px XGC2 experiment-panel chrome and replace the prominent CodeBlock header with a quiet, space-efficient metadata and copy row. Add shared semantic Tabs with keyboard navigation and complete-background selection styling.

## 0.5.0

### Minor Changes

- Promote the original XGC2 scrollbar tokens and global browser rules into the shared UI contract, including Firefox and WebKit interaction states. Enforce the family-wide prohibition on left-side accent bars and simplify the topbar contract to one title plus high-value actions without decorative healthy-state pills.

## 0.4.0

### Minor Changes

- Add shared button links, toolbars, statistic cards, data-table containers, and copyable code blocks.

## 0.3.0

### Minor Changes

- Add an accessible fieldset-based form group for segmented and compound controls.

## 0.2.0

### Minor Changes

- Add shared product branding, select and form-field primitives, segmented controls, audio waveforms, and a presentational audio capture control.
