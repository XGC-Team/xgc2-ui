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

/** Product CSS composes shared components through its own class hooks only. */
export function sharedSelectorViolations(css, sharedClasses) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set(
    [...source.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)]
      .map((match) => match[1])
      .filter((className) => sharedClasses.has(className))
      .map((className) => `shared selector .${className}`),
  )];
}

const MOTION_SHORTHAND = /^(?:animation|transition)$/i;
const MOTION_DURATION = /^(?:animation|transition)-duration$/i;
const MOTION_EASING = /^(?:animation|transition)-timing-function$/i;
const RAW_DURATION = /(?:^|[\s,(])((?:\d+\.?\d*|\.\d+)(?:ms|s))\b/gi;
const RAW_EASING = /\bease(?:-in-out|-in|-out)?\b/gi;

/** Ordinary UI consumes the finite opacity and motion contract directly. */
export function rawFoundationValueViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const match of source.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g)) {
    const property = match[1];
    const value = match[2].trim();
    if (/^opacity$/i.test(property) && /^(?:0(?:\.\d+)?|\.\d+|1(?:\.0+)?)\s*(?:!important)?$/i.test(value)) {
      violations.push(`raw opacity ${value.replace(/\s*!important$/i, '')}`);
    }
    if (MOTION_SHORTHAND.test(property) || MOTION_DURATION.test(property)) {
      for (const duration of value.matchAll(RAW_DURATION)) {
        const reducedMotionFloor = duration[1] === '0.01ms' && /!important/i.test(value);
        if (!reducedMotionFloor) violations.push(`raw motion duration ${duration[1]}`);
      }
    }
    if (MOTION_SHORTHAND.test(property) || MOTION_EASING.test(property)) {
      for (const easing of value.matchAll(RAW_EASING)) {
        violations.push(`raw motion easing ${easing[0]}`);
      }
    }
  }
  return [...new Set(violations)];
}

const EDGE_MARKER_CONTEXT = /(?:^|[-_])(?:active|current|dialog|modal|selected|selection)(?:$|[-_])/i;
const EDGE_MARKER_ATTRIBUTE = /\[(?:aria-(?:current|selected)|data-(?:xgc-)?(?:active|current|selected|selection))(?:\s*[~|^$*]?=|\])/i;

function declarationMap(body) {
  return new Map(body.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return [];
    return [[declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim()]];
  }));
}

/** Selection and hierarchy are never indicated by a colored left-edge strip. */
export function edgeMarkerViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    const identifiers = selectorIdentifiers(selector);
    const inContext = EDGE_MARKER_ATTRIBUTE.test(selector)
      || identifiers.some((identifier) => EDGE_MARKER_CONTEXT.test(identifier));
    if (!inContext) continue;
    const declarations = declarationMap(rule[2]);
    for (const property of ['border-left', 'border-inline-start']) {
      const value = declarations.get(property);
      if (value && !/^(?:0|0px|none|transparent|inherit|initial|unset)$/i.test(value)) {
        violations.push(`left edge marker in ${selector}`);
      }
    }
    const shadow = declarations.get('box-shadow');
    if (shadow && /\binset\b/i.test(shadow) && !/\binset\s+0(?:px)?\s+0(?:px)?\s+0(?:px)?\b/i.test(shadow)) {
      // An enclosing inset ring starts with zero x/y offsets; a non-zero first
      // offset is the historical left/right strip convention.
      if (!/\binset\s+0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+/i.test(shadow)) {
        violations.push(`inset edge marker in ${selector}`);
      }
    }
    const pseudo = /::(?:before|after)/i.test(selector);
    const edgePosition = declarations.get('left') ?? declarations.get('inset-inline-start');
    const width = declarations.get('width') ?? declarations.get('inline-size');
    const material = declarations.get('background') ?? declarations.get('background-color')
      ?? declarations.get('border') ?? declarations.get('border-color');
    if (pseudo && /^(?:0|0px)$/i.test(edgePosition ?? '') && width && material
      && !/^(?:none|transparent|inherit|initial|unset)$/i.test(material)) {
      violations.push(`pseudo-element edge marker in ${selector}`);
    }
  }
  return [...new Set(violations)];
}

const STATUS_TERM = /(?:^|[-_])(?:available|blocked|cancel(?:ed|led)?|complete(?:d)?|connected|connection|dead|degraded|disconnected|enabled|error|failed|failure|health|healthy|interrupted|live|lost|notice|offline|online|paused|pending|queued|ready|rejected|restarting|running|stale|starting|state|status|succeeded|success|unavailable|unhealthy|waiting|warning)(?:$|[-_])/i;
const STATUS_ORNAMENT = /(?:^|[-_])(?:badge|chip|dot|glow|halo|lamp|led|pill)(?:$|[-_])/i;
const NEUTRAL_STATUS_CONTAINER = /(?:^|[-_])(?:board|card|grid|instrument|notice|page|panel|region|surface)(?:$|[-_])/i;
const STATUS_CONTROL_CONTEXT = /(?:^|[-_])(?:actions?|control|filter|picker|selector|toggle)(?:$|[-_])/i;
const SEMANTIC_MATERIAL = /(?:color-(?:accent|danger|error|primary|success|warning)|semantic|status-tone)/i;
const MATERIAL_PROPERTY = /^(?:background(?:-color|-image)?|border(?:-(?:block|inline)(?:-(?:start|end))?|-(?:top|right|bottom|left)|-color)?|box-shadow|filter|text-shadow)$/i;
const LITERAL_COLOR = /(?:#[\da-f]{3,8}\b|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:blue|crimson|cyan|gold|green|lime|magenta|orange|pink|purple|red|tomato|yellow)\b)/i;

const prohibitedStatusDecoration = [
  { property: /^(?:background|background-color)$/i, allowed: /^(?:none|transparent|inherit|initial|unset)$/i, label: 'filled status background' },
  { property: /^border(?:-(?:left|inline-start))?$/i, allowed: /^(?:0|0px|none|transparent|inherit|initial|unset)$/i, label: 'status border or edge marker' },
  { property: /^border-radius$/i, allowed: /^(?:0|0px|none|inherit|initial|unset)$/i, label: 'rounded status shape' },
  { property: /^(?:box-shadow|filter|text-shadow)$/i, allowed: /^(?:none|inherit|initial|unset)$/i, label: 'status glow or shadow' },
];

function selectorIdentifiers(selector) {
  const identifiers = [
    ...[...selector.matchAll(/[.#]([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((match) => match[1]),
    ...[...selector.matchAll(/\[data-(?:xgc-)?([a-zA-Z0-9_-]+)/g)].map((match) => match[1]),
  ];
  return [...new Set(identifiers)];
}

/**
 * Status is information, never a miniature decorated object. This checker is
 * intentionally selector-driven so ordinary action tones, chart colors, map
 * nodes, and domain tags remain outside the status contract.
 */
export function statusVisualContractViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (/empty-state/i.test(selector)) continue;
    const identifiers = selectorIdentifiers(selector);
    const statusIdentifiers = identifiers.filter((identifier) => STATUS_TERM.test(identifier) && !STATUS_CONTROL_CONTEXT.test(identifier));
    if (statusIdentifiers.length === 0) continue;

    // Catch both compound names (`health-dot`) and nested markers
    // (`runtime-status .dot`). Once the selector is a status context, an
    // ornament-shaped descendant is still the same prohibited status light.
    const ornament = identifiers.find((identifier) => STATUS_ORNAMENT.test(identifier));
    if (ornament) {
      violations.push(`status ornament selector ${selector} (${ornament})`);
    }

    const neutralContainer = identifiers.some((identifier) => NEUTRAL_STATUS_CONTAINER.test(identifier));
    const stateDependentContainer = neutralContainer && /\[data-(?:xgc-)?(?:connection|health|ready|state|status)\b/i.test(selector);
    for (const declaration of rule[2].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (!property || !value) continue;
      if (neutralContainer) {
        if (stateDependentContainer) {
          const materialPolicy = prohibitedStatusDecoration.find((policy) => policy.property.test(property));
          if (materialPolicy && !materialPolicy.allowed.test(value)) {
            violations.push(`state-dependent ${materialPolicy.label} in ${selector}`);
            continue;
          }
        }
        if (MATERIAL_PROPERTY.test(property)) {
          if (SEMANTIC_MATERIAL.test(value)) {
            violations.push(`semantic status material in ${selector}`);
          } else if (LITERAL_COLOR.test(value)) {
            violations.push(`literal status material in ${selector}`);
          }
        }
        continue;
      }
      for (const policy of prohibitedStatusDecoration) {
        if (policy.property.test(property) && !policy.allowed.test(value)) {
          violations.push(`${policy.label} in ${selector}`);
        }
      }
    }
  }
  return [...new Set(violations)];
}
