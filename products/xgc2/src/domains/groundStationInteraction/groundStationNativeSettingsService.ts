import { createNativeAgentClient } from '@xgc2/native-agent/client';
import type { NativeProviderSettingsUpdate } from '@xgc2/native-agent/react';
import { fetchNativeAgent } from '../../api/nativeAgent';

// Both Settings and the Experiment composer consume the common workstation
// settings authority. No browser copy of provider configuration is persisted.
const client = createNativeAgentClient({ basePath:'/api/native-agents',fetch:fetchNativeAgent });

export function getNativeProviderSettings(signal?:AbortSignal) {
  return client.getNativeSettings(signal);
}

export function updateNativeProviderSettings(update:NativeProviderSettingsUpdate) {
  return client.updateNativeSettings(update);
}

export function refreshNativeProviderSettings(id:string) {
  return client.refreshNativeSettings(id);
}
