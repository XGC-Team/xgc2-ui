import { useSyncExternalStore } from 'react';

/**
 * Panel presence is the generic answer to "is a panel of this plugin mounted
 * right now, for this execution target". It is deliberately a module-level
 * registry rather than a React context: the panels that register and the
 * surfaces that read the count live on opposite sides of dashboard, provider,
 * and portal boundaries.
 *
 * The target is part of the key because presence answers a question about one
 * target's surfaces. Without it, a panel watching one robot would suppress the
 * fallback surface of an unrelated target that has no panel at all.
 *
 * Presence is runtime mount state only. Whether an Experiment *declares* a
 * panel is a separate, immutable question answered from the pinned commit by
 * the panel-inventory API and the experiment.panel.exists workflow node.
 */
const mountedPanelCounts = new Map<string,number>();
const presenceListeners = new Set<() => void>();

/**
 * Registers one mounted panel of pluginId on targetId and returns its unmount
 * callback. The callback is idempotent so a double invocation (React strict
 * mode, or a defensive caller) can never drive the count below zero.
 */
export function registerPanelPresence(pluginId: string, targetId: string) {
  const key = panelPresenceKey(pluginId, targetId);
  if (!key) return () => {};
  mountedPanelCounts.set(key, (mountedPanelCounts.get(key) ?? 0) + 1);
  notifyPanelPresence();
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const remaining = (mountedPanelCounts.get(key) ?? 0) - 1;
    if (remaining > 0) mountedPanelCounts.set(key, remaining);
    else mountedPanelCounts.delete(key);
    notifyPanelPresence();
  };
}

/** Reads how many panels of pluginId are mounted for targetId, re-rendering on change. */
export function usePanelPresenceCount(pluginId: string, targetId: string) {
  return useSyncExternalStore(
    subscribeToPanelPresence,
    () => panelPresenceCount(pluginId, targetId),
    () => panelPresenceCount(pluginId, targetId),
  );
}

export function panelPresenceCount(pluginId: string, targetId: string) {
  const key = panelPresenceKey(pluginId, targetId);
  return key ? mountedPanelCounts.get(key) ?? 0 : 0;
}

function panelPresenceKey(pluginId: string, targetId: string) {
  const plugin = pluginId.trim();
  const target = targetId.trim();
  return plugin && target ? `${plugin}@${target}` : '';
}

function subscribeToPanelPresence(listener: () => void) {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

function notifyPanelPresence() {
  presenceListeners.forEach((listener) => listener());
}
