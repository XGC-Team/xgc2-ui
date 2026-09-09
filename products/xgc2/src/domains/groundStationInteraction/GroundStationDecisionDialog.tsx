import { Modal } from '../../components/Modal';
import { GroundStationDecisionResponseControls } from './GroundStationDecisionResponse';
import { useGroundStationText } from './groundStationMessages';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';
import './GroundStationDecisionDialog.css';

export function GroundStationDecisionDialog({
  interaction,
  onRespond,
  onClose,
}: {
  interaction: GroundStationDecisionInteraction;
  onRespond: GroundStationDecisionResponder;
  onClose: () => void;
}) {
  const t = useGroundStationText();
  return (
    <Modal
      title={interaction.title}
      description={t('Ground station confirmation')}
      onClose={onClose}
      closeLabel={t('Handle later')}
      size="small"
      alert
      dataXgcRole="ground-station-decision-dialog"
      dataXgcId={interaction.id}
    >
      <div className="xgc-ground-station-decision-dialog-copy">
        <p>{interaction.message}</p>
        <GroundStationDecisionResponseControls
          interaction={interaction}
          onRespond={onRespond}
          appearance="dialog"
          onResponded={onClose}
        />
      </div>
    </Modal>
  );
}
