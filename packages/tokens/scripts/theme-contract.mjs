export const ACHROMATIC_MAX_CHANNEL_DELTA = 2;

const allowedNeutralMaterialIdentifiers = new Set([
  'at',
  'calc',
  'circle',
  'color-mix',
  'deg',
  'in',
  'inset',
  'linear-gradient',
  'px',
  'radial-gradient',
  'rem',
  'rgb',
  'rgba',
  'srgb',
  'transparent',
  'var',
]);

export function rgbFromHex(value) {
  return value.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
}

export function literalRgbColors(value) {
  const literals = [];
  for (const match of value.matchAll(/#[\da-f]+\b/gi)) {
    const literal = match[0].toLowerCase();
    const digits = literal.slice(1);
    if (![3, 4, 6, 8].includes(digits.length)) {
      throw new Error(`unsupported hex color literal ${literal}`);
    }
    const opaqueDigits = digits.length <= 4 ? digits.slice(0, 3) : digits.slice(0, 6);
    const expanded = opaqueDigits.length === 3
      ? [...opaqueDigits].map((channel) => `${channel}${channel}`).join('')
      : opaqueDigits;
    literals.push({ literal, channels: rgbFromHex(`#${expanded}`) });
  }

  for (const match of value.matchAll(/rgba?\(([^)]*)\)/gi)) {
    const channelsSource = match[1].split('/')[0].trim();
    const parts = channelsSource.includes(',')
      ? channelsSource.split(',').slice(0, 3).map((part) => part.trim())
      : channelsSource.split(/\s+/).slice(0, 3);
    if (parts.length !== 3) throw new Error(`unsupported RGB color literal ${match[0]}`);
    const channels = parts.map((part) => {
      const percentage = part.endsWith('%');
      const numeric = Number.parseFloat(part);
      const valueInRgbRange = percentage ? numeric * 2.55 : numeric;
      if (!Number.isFinite(valueInRgbRange) || valueInRgbRange < 0 || valueInRgbRange > 255) {
        throw new Error(`unsupported RGB channel ${part} in ${match[0]}`);
      }
      return Math.round(valueInRgbRange);
    });
    literals.push({
      literal: match[0],
      channels,
    });
  }
  return literals;
}

export function assertRestrictedNeutralMaterialSyntax(
  value,
  context,
  allowedVariables = new Set(),
) {
  literalRgbColors(value);
  const withoutLiterals = value
    .replace(/#[\da-f]+\b/gi, '')
    .replace(/rgba?\([^)]*\)/gi, '');
  const identifiers = withoutLiterals.match(/--[\w-]+|[a-z][\w-]*/gi) ?? [];
  for (const identifier of identifiers) {
    if (identifier.startsWith('--')) {
      if (allowedVariables.has(identifier)) continue;
      throw new Error(`${context} references an unapproved material variable: ${identifier}`);
    }
    if (allowedNeutralMaterialIdentifiers.has(identifier.toLowerCase())) continue;
    throw new Error(`${context} uses unsupported color or material syntax: ${identifier}`);
  }
}

export function assertNotBlueBiased(value, context) {
  const [red, green, blue] = rgbFromHex(value);
  if (blue > red || blue > green) {
    throw new Error(`${context} (${value}) reintroduces a blue-grey bias`);
  }
}

export function assertAchromaticChannels(
  channels,
  context,
  maximumDelta = ACHROMATIC_MAX_CHANNEL_DELTA,
) {
  const delta = Math.max(...channels) - Math.min(...channels);
  if (delta > maximumDelta) {
    throw new Error(
      `${context} (${channels.join(', ')}) is chromatically biased; `
      + `light foundation colors allow at most ${maximumDelta} RGB levels of channel drift`,
    );
  }
}

export function assertAchromatic(value, context, maximumDelta = ACHROMATIC_MAX_CHANNEL_DELTA) {
  assertAchromaticChannels(rgbFromHex(value), `${context} ${value}`, maximumDelta);
}
