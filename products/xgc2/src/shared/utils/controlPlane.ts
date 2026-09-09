type LocalCoreLike = {
  profile: string;
  baseUrl: string;
  metadata?: Record<string, unknown>;
};

type RoutedCoreLike = LocalCoreLike & {
  id: string;
};

type CoreLike = RoutedCoreLike & {
  name: string;
  capabilities: string[];
};

type PanelBindingLike = {
  capability: string;
  resource?: string;
  config?: Record<string, unknown>;
};

type PanelLike = {
  targetCoreId?: string;
};

export function parseTags(value: string): string[] {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
}

export function isLocalCore(core: LocalCoreLike) {
  return core.profile === 'ground' || core.profile === 'gcs' || core.metadata?.local === true || core.baseUrl.trim() === '';
}

export function targetPermissionReason(core: CoreLike | undefined, capabilities: string[], action: string) {
  if (!core) return '';
  if (capabilities.some((capability) => core.capabilities.includes(capability))) return '';
  return `${core.name} cannot provide ${action}; missing ${capabilities.join(' or ')}.`;
}

export function routedCoreIdForPanel(panel: PanelLike, cores: RoutedCoreLike[], fallback?: string) {
  if (!panel.targetCoreId) return fallback;
  const core = cores.find((item) => item.id === panel.targetCoreId);
  return core && !isLocalCore(core) ? core.id : undefined;
}

export function parseJsonRecord(value: string, label: string): { value: Record<string, unknown>; error?: string } {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { value: {}, error: `${label} must be a JSON object.` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch (error) {
    return { value: {}, error: `${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function parseJsonArray<T = PanelBindingLike>(value: string, label: string): { value: T[]; error?: string } {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) {
      return { value: [], error: `${label} must be a JSON array.` };
    }
    return { value: parsed as T[] };
  } catch (error) {
    return { value: [], error: `${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}
