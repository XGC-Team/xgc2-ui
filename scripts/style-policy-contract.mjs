/**
 * Product CSS may tune shared control geometry only where the component API
 * exposes a stable composition hook. Appearance remains owned by ui-react.
 */
export const PRODUCT_CONTROL_GEOMETRY_HOOKS = new Set([
  '--xgc-control-button-padding',
  '--xgc-control-button-padding-block',
  '--xgc-control-button-padding-inline',
  '--xgc-control-height',
  '--xgc-control-input-padding-inline',
]);

export function forbiddenControlAppearanceDefinitions(css) {
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...declarations.matchAll(/(--xgc-control-[a-zA-Z0-9_-]+)\s*:/g)]
    .map((match) => match[1])
    .filter((token) => !PRODUCT_CONTROL_GEOMETRY_HOOKS.has(token));
}
