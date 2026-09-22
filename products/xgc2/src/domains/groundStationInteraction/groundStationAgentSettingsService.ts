import { createAgentClient } from '@xgc2/agent-runtime/client';
import type { AgentProviderSettingsUpdate } from '@xgc2/agent-runtime/react';
import { fetchNativeAgent } from '../../api/nativeAgent';

// Both Settings and the Experiment composer consume the common workstation
// settings authority. No browser copy of provider configuration is persisted.
const client = createAgentClient({ basePath:'/api/agent-runtime',fetch:fetchNativeAgent });

export function getNativeProviderSettings(signal?:AbortSignal) {
  return client.getNativeSettings(signal);
}

export function updateNativeProviderSettings(update:AgentProviderSettingsUpdate) {
  return client.updateNativeSettings(update);
}

export function refreshNativeProviderSettings(id:string) {
  return client.refreshNativeSettings(id);
}
