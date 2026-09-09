import { executionRequestId } from '../execution/executionPublic';

export function appStoreJobIntent(action: string, id: string, targetId = 'local') {
  const requestId = executionRequestId(action, id);
  return {
    targetId: targetId.trim() || 'local',
    requestId,
    idempotencyKey: requestId,
    reason: 'operator request',
  };
}

export function appOperationAcceptedMessage(action: string) {
  switch (action) {
    case 'sync': return 'Catalog refresh started.';
    case 'install': return 'Installation started.';
    case 'upgrade': return 'Update started.';
    case 'uninstall': return 'Uninstall started.';
    case 'start': return 'App start requested.';
    case 'stop': return 'App stop requested.';
    case 'restart': return 'App restart requested.';
    default: return 'Operation started.';
  }
}
