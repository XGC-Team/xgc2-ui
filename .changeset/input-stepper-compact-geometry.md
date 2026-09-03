---
'@xgc2/ui-react': patch
'@xgc2/ui-tokens': patch
---

Shrink the number-input stepper to native-spinner proportions: the column
drops from `--size-icon-xl` (24px) to `--size-icon-default` (16px), and the
chevrons drop from a 12px box to a new `--size-icon-2xs` (10px) box, so the
8×5 viewBox paints a ~7.5×3.75px glyph at a ~1.25px thin stroke. The arrows
now read as a subordinate detail of the 30px control instead of a heavy,
oversized arrowhead.