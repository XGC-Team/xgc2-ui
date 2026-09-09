import type { AutomationExecutionIngressStatus } from '../../shared/executionStatusVocabulary';

export function ingressStatusLabel(status: AutomationExecutionIngressStatus) {
  if (status === 'dead_letter') return 'Dead letter';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
