---
'@xgc2/ui-react': patch
---

FormField and FormGroup forward their ref to the field root so products can
stamp labels without a display:contents wrapper. FormField tooltips attach to
the field label instead of wrapping the whole field, and the tooltip trigger
becomes display:contents (DOM stays for > selectors, refs, focus and pointer
events; no box, so parent grid/flex layouts are preserved).
