# `@xgc2/ui-policy`

This package is the executable design contract for XGC2 product frontends. It
is intentionally fail-closed and version-locked to `@xgc2/ui-react` so a clean
consumer checkout runs the same rules as the shared library repository.

```json
{
  "scripts": {
    "check:ui-policy": "xgc2-style-policy --root src --html index.html"
  }
}
```

```bash
npm run check:ui-policy
```

Every supplied path must exist, and a run that finds no CSS or no production
script/HTML source is a configuration error. The command prints the number of
roots and files it actually scanned.

The contract rejects product-owned theme/skin persistence, numeric spacing
tokens, spacing disguised as fixed geometry, shared component selector or
token overrides, raw foundation motion/opacity, semantic status ornaments and
materials, and left-edge selection/dialog markers. Product CSS must compose
shared components through public props and product-owned classes.
