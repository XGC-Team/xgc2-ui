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

const PAGE_GEOMETRY_FAMILIES = [
  {
    name: 'resource-directory',
    matches: (identifier) => identifier.startsWith('xgc-list-'),
  },
  {
    name: 'form-settings-operator',
    matches: (identifier) => /^(?:xgc-config-section|xgc-form-(?:field|group|section)|xgc-operator-workspace|xgc-setting-row|xgc-settings-list)/.test(identifier),
  },
];

const PAGE_GEOMETRY_DECLARATION = /(?:^|;)\s*(?:box-sizing|display|position|inset(?:-[a-z]+)?|top|right|bottom|left|width|min-width|max-width|height|min-height|max-height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|gap|row-gap|column-gap|grid(?:-[a-z]+)?|flex(?:-[a-z]+)?|align-(?:items|content|self)|justify-(?:items|content|self)|place-(?:items|content|self)|overflow(?:-[xy])?)\s*:/m;

/**
 * Shared CSS keeps page-family geometry in the component that owns it. A
 * selector may still give several families the same semantic color or type
 * treatment; only spatial declarations make that coupling architectural.
 */
export function pageFamilySelectorCouplingViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!PAGE_GEOMETRY_DECLARATION.test(rule[2])) continue;
    const identifiers = selectorIdentifiers(selector);
    const families = PAGE_GEOMETRY_FAMILIES
      .filter(({ matches }) => identifiers.some(matches))
      .map(({ name }) => name);
    if (families.length > 1) {
      violations.push(`page-family selector couples ${families.join(' and ')} in ${selector}`);
    }
  }
  return [...new Set(violations)];
}

function sourceWithoutComments(source) {
  let result = '';
  let state = 'code';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') {
        state = 'code';
        result += character;
      } else {
        result += ' ';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        result += '  ';
        index += 1;
        state = 'code';
      } else {
        result += character === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (state === 'code') {
      if (character === '/' && next === '/') {
        result += '  ';
        index += 1;
        state = 'line-comment';
        continue;
      }
      if (character === '/' && next === '*') {
        result += '  ';
        index += 1;
        state = 'block-comment';
        continue;
      }
      if (character === "'") state = 'single-quote';
      else if (character === '"') state = 'double-quote';
      else if (character === '`') state = 'template';
      result += character;
      continue;
    }
    result += character;
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (
      (state === 'single-quote' && character === "'")
      || (state === 'double-quote' && character === '"')
      || (state === 'template' && character === '`')
    ) {
      state = 'code';
    }
  }
  return result;
}

function sourceStructure(source) {
  let result = '';
  let quote = '';
  let escaped = false;
  for (const character of source) {
    if (!quote) {
      if (character === "'" || character === '"' || character === '`') quote = character;
      result += character;
    } else if (escaped) {
      result += character === '\n' ? '\n' : ' ';
      escaped = false;
    } else if (character === '\\') {
      result += ' ';
      escaped = true;
    } else if (character === quote) {
      result += character;
      quote = '';
    } else {
      result += character === '\n' ? '\n' : ' ';
    }
  }
  return result;
}

const THEME_STORAGE_KEY_LITERAL = /(?:^|[._:-])(?:skin|theme)(?:$|[._:-])/i;
const THEME_STORAGE_KEY_IDENTIFIER = /(?:skin|theme).*key|key.*(?:skin|theme)/i;

/**
 * Products consume the shared skin lifecycle. Direct document mutation and
 * theme-key persistence belong to ui-react's initializeSkin/useSkin contract.
 */
export function skinLifecycleViolations(source, { sourceType = 'script' } = {}) {
  const executableSource = sourceType === 'html'
    ? [
      ...[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
        .filter((match) => {
          if (/(?:^|\s)src\s*=/i.test(match[1])) return false;
          const type = match[1].match(/(?:^|\s)type\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))/i);
          const value = (type?.[2] ?? type?.[3] ?? '').trim().toLowerCase();
          return !value || value === 'module' || /^(?:application|text)\/(?:java|ecma)script(?:;|$)/.test(value);
        })
        .map((match) => match[2]),
      ...[...source.matchAll(/\son[a-z]+\s*=\s*(?:(['"])([\s\S]*?)\1|([^\s>]+))/gi)]
        .map((match) => match[2] ?? match[3] ?? ''),
    ].join('\n')
    : source;
  const code = sourceWithoutComments(executableSource);
  const structure = sourceStructure(code);
  const violations = [];
  const propertyAccess = String.raw`(?:\?\s*\.\s*|\.\s*)`;
  const documentElement = String.raw`(?:window\s*${propertyAccess})?document\s*${propertyAccess}documentElement`;

  const hasExecutableMatch = (pattern) => {
    for (const match of code.matchAll(pattern)) {
      if (structure[match.index] !== ' ') return true;
    }
    return false;
  };

  if (hasExecutableMatch(new RegExp(String.raw`\b${documentElement}\s*${propertyAccess}dataset\s*(?:${propertyAccess}skin\b|\[\s*['"]skin['"]\s*\])`, 'g'))) {
    violations.push('direct documentElement skin dataset access');
  }
  if (hasExecutableMatch(new RegExp(String.raw`\b${documentElement}\s*${propertyAccess}(?:setAttribute|removeAttribute)\s*\(\s*['"\`]data-skin['"\`]`, 'g'))) {
    violations.push('direct documentElement data-skin mutation');
  }

  const declaredThemeKeys = new Set();
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g)) {
    if (structure[match.index] !== ' ' && THEME_STORAGE_KEY_LITERAL.test(match[3])) declaredThemeKeys.add(match[1]);
  }

  const storageCall = /\b(?:window\s*\.\s*)?localStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*(?:('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|([a-zA-Z_$][\w$]*(?:\s*\.\s*[a-zA-Z_$][\w$]*)*))/g;
  for (const match of code.matchAll(storageCall)) {
    if (structure[match.index] === ' ') continue;
    const literal = match[2];
    const identifier = match[3];
    const key = literal ? literal.slice(1, -1) : identifier?.replace(/\s+/g, '') ?? '';
    const isThemeKey = literal
      ? THEME_STORAGE_KEY_LITERAL.test(key)
      : THEME_STORAGE_KEY_IDENTIFIER.test(key) || declaredThemeKeys.has(key);
    if (isThemeKey) violations.push(`direct localStorage ${match[1]} for skin/theme key ${key}`);
  }

  return [...new Set(violations)];
}

/** Test and story sources are not shipped product lifecycle implementations. */
export function isProductProductionSource(file) {
  const normalized = file.replaceAll('\\', '/');
  if (!/\.(?:html?|[cm]?[jt]sx?)$/i.test(normalized) || /\.d\.ts$/i.test(normalized)) return false;
  if (/(?:^|\/)(?:__tests__|tests?|__mocks__)(?:\/|$)/i.test(normalized)) return false;
  return !/\.(?:test|spec|stories|story)\.(?:html?|[cm]?[jt]sx?)$/i.test(normalized);
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

const GEOMETRY_PROPERTY = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size))$/i;
const GEOMETRY_TOKEN = /(?:size|width|height|handle|reserve|(?:^|[-_])track(?:$|[-_]))/i;
const RELATIVE_LAYOUT_BASIS = /(?:^|[^\w.-])(?:\d+(?:\.\d*)?|\.\d+)(?:%|[dls]?v[wh]|vmin|vmax|cq[whib]|cqmin|cqmax)\b/i;
const KNOWN_GEOMETRY_ROLE_TOKENS = new Set(['--xgc-control-height']);

function isGenuineGeometryVariable(variable) {
  return variable.startsWith('--size-') || KNOWN_GEOMETRY_ROLE_TOKENS.has(variable);
}

function isSpacingOnlyAbsoluteGeometry(expression) {
  if (!/var\(\s*--space-[\w-]+/i.test(expression)) return false;
  const variables = [...expression.matchAll(/var\(\s*(--[\w-]+)/gi)].map((match) => match[1]);
  if (variables.some((variable) => !variable.startsWith('--space-') && !isGenuineGeometryVariable(variable))) return true;
  if (RELATIVE_LAYOUT_BASIS.test(expression)) return false;
  if (variables.some(isGenuineGeometryVariable)) return false;

  const residual = expression
    .replace(/\s*!important\s*$/i, '')
    .replace(/var\(\s*--space-[\w-]+(?:\s*,\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[a-z]+)?)?\s*\)/gi, '')
    .replace(/\b(?:calc|min|max|clamp)\s*(?=\()/gi, '')
    .replace(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[a-z]+)?/gi, '')
    .replace(/[\s()+*/,.\-]/g, '');
  return residual.length === 0;
}

function splitFunctionArguments(content) {
  const argumentsList = [];
  let cursor = 0;
  let depth = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '(') depth += 1;
    else if (content[index] === ')') depth -= 1;
    else if (content[index] === ',' && depth === 0) {
      argumentsList.push(content.slice(cursor, index));
      cursor = index + 1;
    }
  }
  argumentsList.push(content.slice(cursor));
  return argumentsList;
}

function hasSpacingOnlyAbsoluteBranch(expression) {
  if (isSpacingOnlyAbsoluteGeometry(expression)) return true;

  for (let index = 0; index < expression.length; index += 1) {
    const functionMatch = expression.slice(index).match(/^([a-zA-Z][\w-]*)\s*\(/);
    if (!functionMatch) continue;
    const functionName = functionMatch[1].toLowerCase();
    const openIndex = index + functionMatch[0].lastIndexOf('(');
    let depth = 1;
    let closeIndex = openIndex + 1;
    for (; closeIndex < expression.length && depth > 0; closeIndex += 1) {
      if (expression[closeIndex] === '(') depth += 1;
      else if (expression[closeIndex] === ')') depth -= 1;
    }
    if (depth !== 0) return false;
    const content = expression.slice(openIndex + 1, closeIndex - 1);
    if (['min', 'max', 'clamp'].includes(functionName)
      && splitFunctionArguments(content).some((branch) => isSpacingOnlyAbsoluteGeometry(branch))) {
      return true;
    }
    if (hasSpacingOnlyAbsoluteBranch(content)) return true;
    index = closeIndex - 1;
  }
  return false;
}

/** Spacing rhythm may position content, but it cannot masquerade as component geometry. */
export function semanticGeometryViolations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const match of source.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g)) {
    const property = match[1];
    const value = match[2].trim();
    if (GEOMETRY_PROPERTY.test(property) && hasSpacingOnlyAbsoluteBranch(value)) {
      violations.push(`${property} uses spacing rhythm as geometry`);
    }
    if (property.startsWith('--')
      && !property.startsWith('--space-')
      && GEOMETRY_TOKEN.test(property)
      && /var\(--space-/.test(value)) {
      violations.push(`${property} derives geometry from spacing rhythm`);
    }
    if (/^inset(?:-[\w-]+)?$/i.test(property) && /calc\(\s*-1\s*\*\s*var\(--space-/.test(value)) {
      violations.push(`${property} derives a hit target from spacing rhythm`);
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

function isSolidDangerCommandSelector(selector) {
  // An explicit execution-button variant is not a status-colored card. Keep
  // this narrow enough that articles, descendants and state-inferred fills
  // still pass through the ordinary status material prohibition.
  const required = [
    /\[data-xgc-layout=(['"])tile\1\]/,
    /\[data-xgc-appearance=(['"])solid\1\]/,
    /\[data-xgc-tone=(['"])danger\1\]/,
  ];
  if (!required.every((attribute) => attribute.test(selector))) return false;
  let target = selector.trim();
  for (const attribute of required) target = target.replace(attribute, '');
  target = target
    .replace(/:not\(:disabled\)/g, '')
    .replace(/:(?:hover|active|focus-visible|disabled)\b/g, '')
    .replace(/\[aria-pressed=(['"])(?:true|false)\1\]/g, '');
  return target === 'button.xgc-workflow-status-card';
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
    const onlyExplicitCommandStatusTargets = selector.split(',').every((part) =>
      !selectorIdentifiers(part).some((identifier) => STATUS_TERM.test(identifier) && !STATUS_CONTROL_CONTEXT.test(identifier))
      || isSolidDangerCommandSelector(part));

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
            if (!onlyExplicitCommandStatusTargets) violations.push(`semantic status material in ${selector}`);
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
