import { useState } from 'react';

export type AutomationRuntimeViewMode = 'schema' | 'table' | 'json';
export type AutomationRuntimePane = 'input' | 'output';

export function useAutomationRuntimeViewMode(pane: AutomationRuntimePane) {
  const [mode, setMode] = useState<AutomationRuntimeViewMode>(() => readRuntimeMode(pane));

  function selectMode(nextMode: AutomationRuntimeViewMode) {
    setMode(nextMode);
    writeRuntimeMode(pane, nextMode);
  }

  return [mode,selectMode] as const;
}

function readRuntimeMode(pane: AutomationRuntimePane): AutomationRuntimeViewMode {
  try {
    const value = localStorage.getItem(runtimeModeKey(pane));
    if (value === 'schema' || value === 'table' || value === 'json') return value;
  } catch {
    // Display preferences are best-effort.
  }
  return pane === 'input' ? 'schema' : 'table';
}

function writeRuntimeMode(pane: AutomationRuntimePane, mode: AutomationRuntimeViewMode) {
  try {
    localStorage.setItem(runtimeModeKey(pane), mode);
  } catch {
    // Display preferences are best-effort.
  }
}

function runtimeModeKey(pane: AutomationRuntimePane) {
  return `xgc.automation.runtime.${pane}.mode`;
}
