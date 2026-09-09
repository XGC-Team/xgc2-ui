import { ControlButton } from '../../../components/controls/ControlButton';
import { Modal } from '../../../components/Modal';
import type { ExperimentDashboard } from '../experimentModel';
import { useExperimentText } from '../experimentMessages';

export function DashboardDeleteDialog({ dashboard,onClose,onConfirm }: {
  dashboard: ExperimentDashboard;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useExperimentText();
  return (
    <Modal
      title={t('Delete dashboard')}
      size="small"
      onClose={onClose}
      closeLabel={t('Close delete dashboard dialog')}
      ariaLabel={t('Delete dashboard {name}', { name: dashboard.name })}
      actions={(
        <>
          <ControlButton onClick={onClose} dataXgcRole="dashboard-delete-cancel" dataXgcId={dashboard.id}>{t('Cancel')}</ControlButton>
          <ControlButton tone="danger" onClick={onConfirm} dataXgcRole="dashboard-delete-confirm" dataXgcId={dashboard.id}>{t('Delete dashboard')}</ControlButton>
        </>
      )}
    >
      <p className="xgc-modal-copy">{t('Delete')} <strong>{dashboard.name}</strong>{t('?')} {t('Its panels will be removed when you save the experiment.')}</p>
    </Modal>
  );
}

export function DashboardExitEditDialog({ saving,onClose,onSave,onDiscard }: {
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useExperimentText();
  return (
    <Modal
      title={t('Exit edit mode')}
      size="small"
      onClose={onClose}
      dismissible={!saving}
      closeLabel={t('Close exit edit dialog')}
      ariaLabel={t('Exit dashboard edit mode')}
      actions={(
        <>
          <ControlButton onClick={onClose} disabled={saving} dataXgcRole="dashboard-edit-keep" dataXgcId="dashboard-edit-keep">{t('Keep editing')}</ControlButton>
          <ControlButton tone="danger" onClick={onDiscard} disabled={saving} dataXgcRole="dashboard-edit-discard" dataXgcId="dashboard-edit-discard">{t('Discard changes')}</ControlButton>
          <ControlButton tone="primary" onClick={onSave} disabled={saving} dataXgcRole="dashboard-edit-save" dataXgcId="dashboard-edit-save">{t(saving ? 'Saving' : 'Save and exit')}</ControlButton>
        </>
      )}
    >
      <p className="xgc-modal-copy">{t('Save dashboard changes before exiting?')}</p>
    </Modal>
  );
}
