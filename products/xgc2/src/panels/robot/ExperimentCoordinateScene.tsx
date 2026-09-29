import { useExperimentText,type ExperimentScene } from '../../domains/experiment/experimentPublic';
import sceneEntryUrl from './assets/scene-entry.png';
import worldOriginSceneUrl from './assets/world-origin-scene.png';
import startingPosesSceneUrl from './assets/starting-poses-scene.png';
import worldBoundarySceneUrl from './assets/world-boundary-scene.png';
import { Button } from '@xgc2/ui-react';
import { useRobotText } from '../../domains/robot/robotAssetPublic';
import './experiment-coordinate-scene.css';

type ExperimentCoordinateSceneProps = {
  scene?: ExperimentScene;
  onOpenScene: () => void;
  onOpenOrigin: () => void;
  onOpenStartingPoses: () => void;
  onOpenFence: () => void;
  motion?: boolean;
};

/** These are illustrations of coordinate settings, never live Robot telemetry. */
export function ExperimentCoordinateScene({
  scene,
  onOpenScene,
  onOpenOrigin,
  onOpenStartingPoses,
  onOpenFence,
  motion = true,
}: ExperimentCoordinateSceneProps) {
  const t = useRobotText();
  const sceneText = useExperimentText();

  return (
    <section
      className="experiment-coordinate-scene"
      data-xgc-role="experiment-robot-assets-coordinate-scene"
      data-xgc-id="experiment"
      data-motion={motion ? 'true' : 'false'}
      aria-label={t('Experiment coordinates')}
    >
      <Button appearance="ghost" type="button" className="experiment-coordinate-scene-entry experiment-coordinate-scene-selection"
        data-xgc-role="experiment-scene-entry" data-xgc-id="scene"
        aria-label={sceneText('Scene')} aria-haspopup="dialog" onClick={onOpenScene}>
        <img className="experiment-coordinate-scene-art experiment-coordinate-scene-art-image" src={sceneEntryUrl} alt="" aria-hidden="true" />
        <span className="experiment-coordinate-scene-copy">
          <span className="experiment-coordinate-scene-title" data-xgc-role="experiment-robot-assets-coordinate-title" data-xgc-id="scene">
            {sceneText('Scene')}<EntryArrow />
          </span>
          <span className="experiment-coordinate-scene-description" data-xgc-role="experiment-scene-summary" data-xgc-id="scene">
            {scene ? `${scene.asset} · ${scene.simulator === 'gazebo' ? 'Gazebo' : scene.simulator === 'lightweight' ? sceneText('Lightweight simulator') : scene.simulator}` : sceneText('Choose a scene and its simulator.')}
          </span>
        </span>
      </Button>

      <Button
        appearance="ghost"
        type="button"
        className="experiment-coordinate-scene-entry experiment-coordinate-scene-origin"
        data-xgc-role="experiment-robot-assets-world-origin"
        data-xgc-id="world-origin-offset"
        aria-label={t('World origin offset')}
        aria-haspopup="dialog"
        onClick={onOpenOrigin}
      >
        <img className="experiment-coordinate-scene-art experiment-coordinate-scene-art-image" src={worldOriginSceneUrl} alt="" aria-hidden="true" />
        <span className="experiment-coordinate-scene-copy">
          <span
            className="experiment-coordinate-scene-title"
            data-xgc-role="experiment-robot-assets-coordinate-title"
            data-xgc-id="world-origin-offset"
          >{t('World origin')}<EntryArrow /></span>
          <span
            className="experiment-coordinate-scene-description"
            data-xgc-role="experiment-robot-assets-coordinate-description"
            data-xgc-id="world-origin-offset"
          >{t('One shared reference for physical tracking. Simulation keeps its own coordinates.')}</span>
        </span>
      </Button>

      <Button
        appearance="ghost"
        type="button"
        className="experiment-coordinate-scene-entry experiment-coordinate-scene-start"
        data-xgc-role="experiment-robot-assets-starting-poses-entry"
        data-xgc-id="experiment"
        aria-label={t('Simulation starting poses')}
        aria-haspopup="dialog"
        onClick={onOpenStartingPoses}
      >
        <img className="experiment-coordinate-scene-art experiment-coordinate-scene-art-image" src={startingPosesSceneUrl} alt="" aria-hidden="true" />
        <span className="experiment-coordinate-scene-copy">
          <span
            className="experiment-coordinate-scene-title"
            data-xgc-role="experiment-robot-assets-coordinate-title"
            data-xgc-id="starting-poses"
          >{t('Starting poses')}<EntryArrow /></span>
          <span
            className="experiment-coordinate-scene-description"
            data-xgc-role="experiment-robot-assets-coordinate-description"
            data-xgc-id="starting-poses"
          >{t('Place each Robot for the next simulation. Physical tracking is unchanged.')}</span>
        </span>
      </Button>
      <Button appearance="ghost" type="button" className="experiment-coordinate-scene-entry experiment-coordinate-scene-fence"
        data-xgc-role="experiment-robot-assets-world-fence" data-xgc-id="world-boundary"
        aria-label={t('World fence')} aria-haspopup="dialog" onClick={onOpenFence}>
        <img className="experiment-coordinate-scene-art experiment-coordinate-scene-art-image" src={worldBoundarySceneUrl} alt="" aria-hidden="true" />
        <span className="experiment-coordinate-scene-copy">
          <span
            className="experiment-coordinate-scene-title"
            data-xgc-role="experiment-robot-assets-coordinate-title"
            data-xgc-id="world-boundary"
          >{t('World fence')}<EntryArrow /></span>
          <span
            className="experiment-coordinate-scene-description"
            data-xgc-role="experiment-robot-assets-coordinate-description"
            data-xgc-id="world-boundary"
          >{t('Set control bounds in the experiment world. Ground height stays independent.')}</span>
        </span>
      </Button>
    </section>
  );
}

function EntryArrow() {
  return (
    <svg className="experiment-coordinate-scene-arrow" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 15 15 5M5 5h10v10" />
    </svg>
  );
}
