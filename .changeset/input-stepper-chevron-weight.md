---
'@xgc2/ui-react': patch
---

Number-input stepper chevrons render at half their previous stroke weight
(`--stroke-thin` instead of `--stroke-strong`). The 8×5 viewBox scales 1.5×
to a 12px box, so the strong stroke painted a ~3px chevron on a 9px glyph —
about twice the weight of the theme's other chevrons (e.g. lucide ~1.7px)
and out of proportion with the 30px control.