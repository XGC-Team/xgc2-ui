import { Notice } from '@xgc2/ui-react';
import { useAutomationAuthoringText } from './automationAuthoringMessages';

export function AutomationWorkspaceProtectionNotice({ resourceId }: { resourceId: string }) {
  const t = useAutomationAuthoringText();
  return (
    <Notice tone="info" data-xgc-role="automation-definition-readonly" data-xgc-id={resourceId}>
      {t('This protected Automation is read-only. You can still run it and inspect execution history.')}
    </Notice>
  );
}

export function AutomationWorkspaceMutationMessages({ resourceId,error,conflict,onDismissError,onDismissConflict }: {
  resourceId: string;
  error: string;
  conflict: string;
  onDismissError: () => void;
  onDismissConflict: () => void;
}) {
  const t = useAutomationAuthoringText();
  return <>
    {error && <Notice className="automation-canvas-message" tone="danger" density="compact" data-xgc-role="automation-definition-error" data-xgc-id={resourceId} onDismiss={onDismissError} dismissLabel={t('Dismiss error')}>{error}</Notice>}
    {conflict && (
      <Notice
        className="automation-canvas-message automation-conflict-message"
        tone="danger"
        density="compact"
        heading={t('This Automation changed while you were editing.')}
        data-xgc-role="automation-save-conflict"
        data-xgc-id={resourceId}
        onDismiss={onDismissConflict}
        dismissLabel={t('Dismiss conflict')}
      >{conflict} {t('Your draft remains available.')}</Notice>
    )}
  </>;
}
