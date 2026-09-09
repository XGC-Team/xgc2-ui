import { useRef } from 'react';

export type AutomationTargetScope = Readonly<{ targetId: string;epoch: number }>;

export function useAutomationTargetScope(targetId: string) {
  const scopeRef = useRef<AutomationTargetScope>({ targetId,epoch: 0 });
  if (scopeRef.current.targetId !== targetId) {
    scopeRef.current = { targetId,epoch: scopeRef.current.epoch + 1 };
  }
  return scopeRef;
}
