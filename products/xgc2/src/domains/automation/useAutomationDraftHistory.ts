import { useCallback,useState } from 'react';
import type { AutomationSpec } from './automationDefinitionContracts';
import { cloneAutomationSpec } from './automationSpecModel';

type EditorHistory = { past: AutomationSpec[];present: AutomationSpec;future: AutomationSpec[] };

export function useAutomationDraftHistory(initialSpec: AutomationSpec) {
  const initial = cloneAutomationSpec(initialSpec);
  const [history, setHistory] = useState<EditorHistory>(() => freshHistory(initial));
  const [savedFingerprint, setSavedFingerprint] = useState(() => draftFingerprint(initial));
  const draft = history.present;
  const dirty = draftFingerprint(draft) !== savedFingerprint;

  const commitChange = useCallback((change: (current: AutomationSpec) => AutomationSpec) => {
    setHistory((current) => {
      const next = change(current.present);
      if (draftFingerprint(next) === draftFingerprint(current.present)) return current;
      return {
        past: [...current.past,cloneAutomationSpec(current.present)].slice(-60),
        present: cloneAutomationSpec(next),
        future: [],
      };
    });
  }, []);

  const adopt = useCallback((spec: AutomationSpec) => {
    const next = cloneAutomationSpec(spec);
    setHistory(freshHistory(next));
    setSavedFingerprint(draftFingerprint(next));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),present: cloneAutomationSpec(previous),
        future: [cloneAutomationSpec(current.present),...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past,cloneAutomationSpec(current.present)],present: cloneAutomationSpec(next),
        future: current.future.slice(1),
      };
    });
  }, []);

  return { draft,dirty,commitChange,adopt,undo,redo };
}

function freshHistory(spec: AutomationSpec): EditorHistory {
  return { past: [],present: cloneAutomationSpec(spec),future: [] };
}

function draftFingerprint(spec: AutomationSpec) {
  return JSON.stringify(spec);
}
