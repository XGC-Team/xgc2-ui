# @xgc2/ui-policy

## 0.16.1

### Patch Changes

- Keep the policy version and exact React peer aligned with the 0.16.1 sidebar and table-header fixes. Existing policy gates remain unchanged.

## 0.16.0

### Minor Changes

- Lock the policy package to `@xgc2/ui-react@0.16.0` so every 0.16 consumer validates against the same monochrome foundation and shared layout/interaction family.
- Carry the 0.16 product-system baseline forward as a fail-closed consumer contract; additional Workbench and advanced-surface rules can now evolve on the same versioned family instead of drifting behind React.
- Updated dependencies
  - @xgc2/ui-react@0.16.0

## 0.15.13

### Patch Changes

- Lock the shared Panel header spacing and regular-title contract.
- Updated dependencies
  - @xgc2/ui-react@0.15.13

## 0.15.12

### Patch Changes

- Require the bounded data-table sticky-header and themed scrollbar contract.
- Updated dependencies
  - @xgc2/ui-react@0.15.12

## 0.15.11

### Patch Changes

- Reserve a shared ListPage clip margin so control focus rings remain visible at
  the page edge without product-specific padding workarounds.
- Updated dependencies
  - @xgc2/ui-react@0.15.11

## 0.15.10

### Patch Changes

- Allow `WorkflowStatusCard` progress to select its own semantic tone and fill
  color without recoloring the card status label.
- Updated dependencies
  - @xgc2/ui-react@0.15.10

## 0.15.9

### Patch Changes

- Updated dependencies
  - @xgc2/ui-react@0.15.9

## 0.15.8

### Patch Changes

- Separate resource-directory and form/settings layout ownership, mark each
  shared family in the DOM, and reject selectors that couple their geometry.
  Keep Settings on the compact control-height rhythm.
- Updated dependencies
  - @xgc2/ui-react@0.15.8
