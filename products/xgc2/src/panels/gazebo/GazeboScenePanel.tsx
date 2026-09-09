import { Box,Move3d,Plus,Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import { Vector3Control } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { useGroundStationNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import type { PanelPluginProps } from '../types';
import {
  defaultGazeboObstacleDraft,
  gazeboObstacleDraftError,
  gazeboObstacleModels,
  gazeboSceneRunParameters,
  type GazeboObstacleDraft,
  type GazeboObstacleModel,
  type GazeboSceneAction,
} from './gazeboScenePanelModel';

export function GazeboScenePanel({ panel,context }: PanelPluginProps<readonly ['experiment','automation']>) {
  const confirmation = useConfirmationDialog();
  const [draft,setDraft] = useState<GazeboObstacleDraft>(defaultGazeboObstacleDraft);
  const [busyAction,setBusyAction] = useState<GazeboSceneAction>();
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const disabledReason = context.disabledReason
    || '';
  const draftError = gazeboObstacleDraftError(draft);
  useGroundStationNotification(context.executionTargetId || 'local', error || message, {
    title: 'Gazebo scene',severity: error ? 'error' : 'success',source: panel.id,dedupeKey: `${panel.id}:action`,
  });

  function updateDraft<K extends keyof GazeboObstacleDraft>(key: K, value: GazeboObstacleDraft[K]) {
    setDraft((current) => ({ ...current,[key]: value }));
  }

  async function run(actionId: GazeboSceneAction) {
    if (busyAction || disabledReason) return;
    if (actionId !== 'clear' && draftError) {
      setError(draftError);
      return;
    }
    const port = context.ports.actions[actionId];
    if (!port?.connected || port.disabledReason) {
      setError(port?.disabledReason || `Action port "${actionId}" is not connected.`);
      return;
    }
    setBusyAction(actionId);
    setError('');
    setMessage('');
    try {
      const parameters = actionId === 'clear' ? {} : gazeboSceneRunParameters(draft, actionId);
      await port.invoke(parameters,`${actionId} Gazebo obstacle from scene panel ${panel.id}`);
      setMessage(`${port.label} operation started.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyAction(undefined);
    }
  }

  const controlsDisabled = Boolean(disabledReason || busyAction);
  const actionDisabled = (actionId: GazeboSceneAction) => controlsDisabled
    || !context.ports.actions[actionId]?.connected
    || Boolean(context.ports.actions[actionId]?.disabledReason);
  return (
    <div className="gazebo-scene-panel-root" data-xgc-role="gazebo-scene-panel" data-xgc-id={panel.id}>
      <div className="gazebo-scene-panel-fields">
        <FormField label="Obstacle" className="gazebo-scene-panel-model-field">
          <SelectControl
            value={draft.model}
            options={gazeboObstacleModels.map((model) => ({ value: model.id,label: model.label }))}
            onChange={(value) => updateDraft('model', value as GazeboObstacleModel)}
            ariaLabel="Obstacle model"
            dataXgcRole="gazebo-obstacle-model"
            dataXgcId={panel.id}
            fill
            disabled={controlsDisabled}
            icon={<Box size={14} aria-hidden="true" />}
          />
        </FormField>
        <FormField label="Name" className="gazebo-scene-panel-name-field">
          <InputControl
            value={draft.name}
            onChange={(value) => updateDraft('name', value)}
            dataXgcRole="gazebo-obstacle-name"
            dataXgcId={panel.id}
            disabled={controlsDisabled}
          />
        </FormField>
        <div className="gazebo-scene-panel-pose" data-xgc-role="gazebo-obstacle-pose" data-xgc-id={panel.id}>
          <FormField className="gazebo-scene-panel-pose-field" label="Position">
            <Vector3Control
              unit="m"
              disabled={controlsDisabled}
              dataXgcRole="gazebo-obstacle-pose-position"
              dataXgcId={panel.id}
              axes={[
                { label: 'X',value: String(draft.x),step: 0.1,dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:x` },
                { label: 'Y',value: String(draft.y),step: 0.1,dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:y` },
                { label: 'Z',value: String(draft.z),step: 0.1,dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:z` },
              ]}
              onValueChange={(index, value) => {
                const key = (['x','y','z'] as const)[index];
                updateDraft(key, value === '' ? Number.NaN : Number(value));
              }}
            />
          </FormField>
          <FormField className="gazebo-scene-panel-pose-field" label="Attitude">
            <Vector3Control
              unit="rad"
              disabled={controlsDisabled}
              dataXgcRole="gazebo-obstacle-pose-attitude"
              dataXgcId={panel.id}
              axes={[
                { label: 'R',value: String(draft.roll),step: 0.1,ariaLabel: 'Roll',dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:roll` },
                { label: 'P',value: String(draft.pitch),step: 0.1,ariaLabel: 'Pitch',dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:pitch` },
                { label: 'Y',value: String(draft.yaw),step: 0.1,ariaLabel: 'Yaw',dataXgcRole: 'gazebo-obstacle-pose-field',dataXgcId: `${panel.id}:yaw` },
              ]}
              onValueChange={(index, value) => {
                const key = (['roll','pitch','yaw'] as const)[index];
                updateDraft(key, value === '' ? Number.NaN : Number(value));
              }}
            />
          </FormField>
        </div>
      </div>
      <div className="gazebo-scene-panel-actions" data-xgc-role="gazebo-scene-actions" data-xgc-id={panel.id}>
        <ControlButton tone="primary" disabled={actionDisabled('spawn') || Boolean(draftError)} dataXgcRole="gazebo-obstacle-place" dataXgcId={panel.id} onClick={() => void run('spawn')}>
          <Plus size={15} aria-hidden="true" /> Place
        </ControlButton>
        <ControlButton disabled={actionDisabled('move') || Boolean(draftError)} dataXgcRole="gazebo-obstacle-move" dataXgcId={panel.id} onClick={() => void run('move')}>
          <Move3d size={15} aria-hidden="true" /> Move
        </ControlButton>
        <ControlButton
          tone="danger"
          disabled={actionDisabled('clear')}
          dataXgcRole="gazebo-obstacles-clear"
          dataXgcId={panel.id}
          onClick={() => void (async () => {
            if (await confirmation.confirm({
              title: 'Clear Gazebo scene',
              message: 'Clear every XGC-managed obstacle from Gazebo?',
              confirmLabel: 'Clear all',
            })) await run('clear');
          })()}
        >
          <Trash2 size={15} aria-hidden="true" /> Clear all
        </ControlButton>
      </div>
      {confirmation.dialog}
    </div>
  );
}
