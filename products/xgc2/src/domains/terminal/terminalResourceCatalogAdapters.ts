import {
  createEmptyTerminalHost,
  projectTerminalHosts,
} from './terminalCatalogModel';
import {
  deleteTerminalHost,
  listTerminalHosts,
  saveTerminalHost,
} from './terminalCatalogActions';
import type { TerminalHost } from './terminalModel';
import type { TerminalResourceCatalogPort } from './useTerminalResourceCatalog';

export const terminalHostCatalogAdapter: TerminalResourceCatalogPort<TerminalHost> = {
  persistenceKind: 'hosts',
  empty: createEmptyTerminalHost,
  project: projectTerminalHosts,
  list: listTerminalHosts,
  save: saveTerminalHost,
  delete: deleteTerminalHost,
};
