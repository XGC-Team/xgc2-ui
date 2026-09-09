import type { TerminalHost } from './terminalModel';
import { terminalHostCatalogAdapter } from './terminalResourceCatalogAdapters';
import { useTerminalResourceCatalog } from './useTerminalResourceCatalog';

export function useTerminalHostCatalog({
  persistenceScope,
  targetCoreId,
  enabled = true,
  onLoaded,
}: {
  persistenceScope: string;
  targetCoreId?: string;
  /** When false, skip network load (Agent identity uses synthetic local targets only). */
  enabled?: boolean;
  onLoaded?: (hosts: TerminalHost[]) => void;
}) {
  return useTerminalResourceCatalog({
    persistenceScope,
    targetCoreId: targetCoreId?.trim() || undefined,
    enabled,
    port: terminalHostCatalogAdapter,
    onLoaded,
  });
}
