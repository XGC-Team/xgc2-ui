---
"@xgc2/ui-react": minor
"@xgc2/ui-policy": minor
"@xgc2/ui-workflow": patch
---

Replace implicit browser theme persistence with an explicit product-owned SkinStore. Share initialized snapshots through initializeSkin/useSkin, expose async commit failures, and provide an explicit memory-only store. Preserve the shared DOM policy and align the workflow React peer floor with the 0.17 family.
