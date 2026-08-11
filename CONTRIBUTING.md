# Contributing

Every reusable component change must include:

1. A typed public API with no product-domain imports.
2. Keyboard and accessible-name behavior.
3. Tests for behavior, not implementation details.
4. A gallery story covering light and dark skins where appearance changes.
5. A Changeset when a published package changes.

Do not copy component CSS into consumer applications. Extend the shared component API or add a documented product-owned layout wrapper instead.
