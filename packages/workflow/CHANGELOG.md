# @xgc2/ui-workflow

## 0.4.0

### Minor Changes

- Raise the shared React compatibility floor to `>=0.16 <1` so workflow surfaces consume the 0.16 monochrome foundation and application geometry instead of remaining compatible with the withdrawn 0.15 family.
- Keep XYFlow-specific spatial behavior isolated in the workflow package while inheriting the shared 0.16 chrome, typography, focus, motion, and performance contracts from `@xgc2/ui-react`.

## 0.3.2

### Patch Changes

- Lock `WorkflowNodeSurface` chrome and handle geometry to the shared 0.15.5
  surface contract.

## 0.3.1

### Patch Changes

- Raise the shared React compatibility floor to 0.15 so the workflow package
  can accompany the speech-client family without reusing the immutable 0.3.0
  asset namespace.

## 0.3.0

### Major corrective release

- Require React 0.14 and replace spacing arithmetic with semantic toolbar,
  canvas, node-handle, and handle-hit-target geometry.
- Consume the generated single-source responsive and accessibility foundation.

## 0.2.1

### Patch Changes

- Align neutral workflow canvas and node materials with the rebuilt graphite and
  paper-gray shared themes.
- Use the shared finite easing contract for canvas interactions and require the
  React 0.13 material/status foundation.
- Updated dependencies
  - @xgc2/ui-react@0.13.0

## 0.2.0

### Minor Changes

- Add `WorkflowNodeSurface`, a neutral, slot-based node shell with shared
  padding, complete selection/focus rings, accessible handles, and stable
  metadata. Align canvas, toolbar, note, edge, and node materials with the
  bounded semantic spacing and unified light/dark theme contract. Centralize
  a finite low-saturation workflow tone palette so consumers map their domain
  taxonomy without carrying synonymous light/dark colors in product skins.

### Patch Changes

- Updated dependencies
  - @xgc2/ui-react@0.12.0

## 0.1.1

### Patch Changes

- Build workflow declarations before typechecking fresh workspace consumers.
- Updated dependencies
  - @xgc2/ui-react@0.10.1

## 0.1.0

### Minor Changes

- Add the shared spatial workflow canvas package and remove deprecated React compatibility APIs.

### Patch Changes

- Updated dependencies
  - @xgc2/ui-react@0.10.0
