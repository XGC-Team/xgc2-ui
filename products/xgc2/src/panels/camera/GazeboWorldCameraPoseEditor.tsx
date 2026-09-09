import { X } from 'lucide-react';
import { useState } from 'react';
import { Notice, Vector3Control } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import {
  validateGazeboWorldCameraPoseIssue,
  type GazeboWorldCameraPose,
} from './gazeboWorldCameraPoseModel';
import {
  localizeCameraMessage,
  localizeCameraValidationIssue,
  useCameraText,
} from './cameraMessages';

export function GazeboWorldCameraPoseEditor({
  id,panelId,initialPose,pending,error,disabledReason,onApply,onClose,
}: {
  id: string;
  panelId: string;
  initialPose: GazeboWorldCameraPose;
  pending: boolean;
  error: string;
  disabledReason: string;
  onApply: (pose: GazeboWorldCameraPose) => Promise<void>;
  onClose: () => void;
}) {
  const t = useCameraText();
  const [pose,setPose] = useState(initialPose);
  const validation = validateGazeboWorldCameraPoseIssue(pose);
  const refusal = disabledReason ? localizeCameraMessage(t,disabledReason) : '';
  const controlsDisabled = pending || Boolean(refusal);
  return (
    <aside
      id={id}
      className="gazebo-world-camera-pose-editor"
      data-xgc-role="gazebo-world-camera-pose-editor"
      data-xgc-id={panelId}
      data-xgc-available={refusal ? 'false' : 'true'}
      aria-label={t('Adjust world camera pose')}
      aria-disabled={refusal ? 'true' : undefined}
    >
      <header>
        <strong>{t('World camera pose')}</strong>
        <ControlButton iconOnly size="compact" aria-label={t('Close world camera pose controls')} dataXgcRole="world-camera-pose-close" dataXgcId="world-camera-pose-close"
          disabled={pending} onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </ControlButton>
      </header>
      <div className="gazebo-world-camera-pose-fields">
        <div className="gazebo-world-camera-pose-row">
          <span className="gazebo-world-camera-pose-row-label">{t('Position')}</span>
          <Vector3Control
            unit="m"
            disabled={controlsDisabled}
            dataXgcRole="gazebo-world-camera-pose-position"
            dataXgcId={panelId}
            axes={[
              { label: 'X',value: pose.x,step: 0.1,dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:x` },
              { label: 'Y',value: pose.y,step: 0.1,dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:y` },
              { label: 'Z',value: pose.z,step: 0.1,dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:z` },
            ]}
            onValueChange={(index, next) => {
              const key = (['x','y','z'] as const)[index];
              setPose((current) => ({ ...current,[key]: Number(next) }));
            }}
          />
        </div>
        <div className="gazebo-world-camera-pose-row">
          <span className="gazebo-world-camera-pose-row-label">{t('Attitude')}</span>
          <Vector3Control
            unit="°"
            disabled={controlsDisabled}
            dataXgcRole="gazebo-world-camera-pose-attitude"
            dataXgcId={panelId}
            axes={[
              { label: 'R',value: pose.rollDegrees,min: -360,max: 360,step: 1,ariaLabel: t('Roll'),dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:roll` },
              { label: 'P',value: pose.pitchDegrees,min: -360,max: 360,step: 1,ariaLabel: t('Pitch'),dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:pitch` },
              { label: 'Y',value: pose.yawDegrees,min: -360,max: 360,step: 1,ariaLabel: t('Yaw'),dataXgcRole: 'gazebo-world-camera-pose-field',dataXgcId: `${panelId}:yaw` },
            ]}
            onValueChange={(index, next) => {
              const key = (['rollDegrees','pitchDegrees','yawDegrees'] as const)[index];
              setPose((current) => ({ ...current,[key]: Number(next) }));
            }}
          />
        </div>
      </div>
      {(error || validation) && <Notice tone="danger" density="compact">
        {error ? localizeCameraMessage(t,error) : localizeCameraValidationIssue(t,validation!)}
      </Notice>}
      <footer>
        <ControlButton tone="primary" size="compact"
          dataXgcRole="gazebo-world-camera-apply-pose"
          dataXgcId={panelId}
          title={refusal || undefined}
          aria-description={refusal || undefined}
          aria-busy={pending || undefined}
          disabled={controlsDisabled || Boolean(validation)}
          onClick={() => void onApply(pose).catch(() => undefined)}>
          {t('Apply pose')}
        </ControlButton>
      </footer>
    </aside>
  );
}
