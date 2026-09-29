import { useLayoutEffect,useRef } from 'react';
import type { PanelPluginContext,PanelPortsContext } from '../../../panels/types';
import { structuralEqual } from '../../../shared/structuralEqual';

type PortKind = 'actions' | 'authoring' | 'interactions';
type Command = (...args: unknown[]) => unknown;

const COMMAND_PORT_KINDS: readonly PortKind[] = ['actions','authoring','interactions'];

/**
 * The plugin context is rebuilt from Run state on every Run event, but most
 * Panels resolve to the same ports. Hand the plugin the previously committed
 * context while every value is structurally equal, so its memo boundary holds.
 *
 * Port commands (invoke/control/commit/signal) are closures over the host
 * snapshot. They are replaced by stable delegates that call the latest
 * committed context's command, so reusing an equal context never runs a
 * command against stale Run state, and every data field is still compared.
 */
export function useStablePanelContext(next: PanelPluginContext): PanelPluginContext {
  const latest = useRef(next);
  const committed = useRef<PanelPluginContext | undefined>(undefined);
  const commands = useRef(new Map<string,Command>());
  const bound = bindPortCommands(next,latest,commands.current);
  const value = committed.current && structuralEqual(committed.current,bound) ? committed.current : bound;
  useLayoutEffect(() => {
    latest.current = next;
    committed.current = value;
  });
  return value;
}

function bindPortCommands(
  context: PanelPluginContext,
  latest: { readonly current: PanelPluginContext },
  commands: Map<string,Command>,
): PanelPluginContext {
  const ports: Record<string,unknown> = { ...context.ports };
  for (const kind of COMMAND_PORT_KINDS) {
    const source = context.ports[kind] as Readonly<Record<string,object>>;
    ports[kind] = Object.fromEntries(Object.entries(source).map(([portId,port]) => {
      const bound: Record<string,unknown> = { ...port };
      for (const [field,value] of Object.entries(port)) {
        if (typeof value === 'function') bound[field] = delegate(kind,portId,field);
      }
      return [portId,bound];
    }));
  }
  return { ...context,ports:ports as PanelPortsContext };

  function delegate(kind: PortKind,portId: string,field: string): Command {
    const key = `${kind}\u0000${portId}\u0000${field}`;
    let command = commands.get(key);
    if (!command) {
      command = (...args) => {
        const port = (latest.current.ports[kind] as Readonly<Record<string,Record<string,unknown>>>)[portId];
        const current = port?.[field];
        if (typeof current !== 'function') {
          throw new Error(`Panel ${kind} port "${portId}" no longer provides ${field}.`);
        }
        return (current as Command)(...args);
      };
      commands.set(key,command);
    }
    return command;
  }
}
