export const LICHTBLICK_EMBED_CHANNEL = 'xgc2.lichtblick.embed';
export const LICHTBLICK_EMBED_VERSION = 2;
export const LICHTBLICK_EMBED_SURFACES = [
  '3d-tools',
  'panel-controls',
  'panel-settings',
  'alerts',
  'topics',
  'layouts',
  'variables',
] as const;

export type LichtblickEmbedSurface = typeof LICHTBLICK_EMBED_SURFACES[number];

export type LichtblickEmbedReadyMessage = {
  channel: typeof LICHTBLICK_EMBED_CHANNEL;
  version: typeof LICHTBLICK_EMBED_VERSION;
  sender: 'lichtblick';
  type: 'ready';
  capabilities: readonly LichtblickEmbedSurface[];
  visibleSurfaces: readonly LichtblickEmbedSurface[];
};

export type LichtblickEmbedToggleSurfaceMessage = {
  channel: typeof LICHTBLICK_EMBED_CHANNEL;
  version: typeof LICHTBLICK_EMBED_VERSION;
  sender: 'xgc2';
  type: 'toggle-surface';
  surface: LichtblickEmbedSurface;
};

const readyMessageKeys = ['channel','version','sender','type','capabilities','visibleSurfaces'] as const;

export function isLichtblickEmbedSurface(value: unknown): value is LichtblickEmbedSurface {
  return typeof value === 'string'
    && LICHTBLICK_EMBED_SURFACES.includes(value as LichtblickEmbedSurface);
}

export function isLichtblickEmbedReadyMessage(value: unknown): value is LichtblickEmbedReadyMessage {
  if (!isPlainObject(value) || !hasExactKeys(value, readyMessageKeys)) return false;
  if (value.channel !== LICHTBLICK_EMBED_CHANNEL
    || value.version !== LICHTBLICK_EMBED_VERSION
    || value.sender !== 'lichtblick'
    || value.type !== 'ready'
    || !Array.isArray(value.capabilities)) {
    return false;
  }
  return value.capabilities.every(isLichtblickEmbedSurface)
    && new Set(value.capabilities).size === value.capabilities.length
    && Array.isArray(value.visibleSurfaces)
    && value.visibleSurfaces.every((surface) => isLichtblickEmbedSurface(surface) && (value.capabilities as unknown[]).includes(surface))
    && new Set(value.visibleSurfaces).size === value.visibleSurfaces.length;
}

export function lichtblickEmbedToggleSurfaceMessage(
  surface: LichtblickEmbedSurface,
): LichtblickEmbedToggleSurfaceMessage {
  return {
    channel: LICHTBLICK_EMBED_CHANNEL,
    version: LICHTBLICK_EMBED_VERSION,
    sender: 'xgc2',
    type: 'toggle-surface',
    surface,
  };
}

function isPlainObject(value: unknown): value is Record<string,unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Record<string,unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value);
  return actual.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
