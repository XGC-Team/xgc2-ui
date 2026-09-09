import { useId } from 'react';
import { useRobotText } from '../../domains/robot/robotAssetPublic';
import './experiment-coordinate-scene.css';

type ExperimentCoordinateSceneProps = {
  onOpenOrigin: () => void;
  onOpenStartingPoses: () => void;
  motion?: boolean;
};

/** These are illustrations of coordinate settings, never live Robot telemetry. */
export function ExperimentCoordinateScene({
  onOpenOrigin,
  onOpenStartingPoses,
  motion = true,
}: ExperimentCoordinateSceneProps) {
  const t = useRobotText();

  return (
    <section
      className="experiment-coordinate-scene"
      data-xgc-role="experiment-robot-assets-coordinate-scene"
      data-xgc-id="experiment"
      data-motion={motion ? 'true' : 'false'}
      aria-label={t('Experiment coordinates')}
    >
      <button
        type="button"
        className="experiment-coordinate-scene-entry experiment-coordinate-scene-origin"
        data-xgc-role="experiment-robot-assets-world-origin"
        data-xgc-id="world-origin-offset"
        aria-label={t('World origin offset')}
        aria-haspopup="dialog"
        onClick={onOpenOrigin}
      >
        <OriginIllustration />
        <span className="experiment-coordinate-scene-copy">
          <span
            className="experiment-coordinate-scene-eyebrow"
            data-xgc-role="experiment-robot-assets-coordinate-kind"
            data-xgc-id="world-origin-offset"
          >{t('VRPN')}</span>
          <span
            className="experiment-coordinate-scene-title"
            data-xgc-role="experiment-robot-assets-coordinate-title"
            data-xgc-id="world-origin-offset"
          >{t('World origin')}<EntryArrow /></span>
        </span>
      </button>

      <button
        type="button"
        className="experiment-coordinate-scene-entry experiment-coordinate-scene-start"
        data-xgc-role="experiment-robot-assets-starting-poses-entry"
        data-xgc-id="experiment"
        aria-label={t('Simulation starting poses')}
        aria-haspopup="dialog"
        onClick={onOpenStartingPoses}
      >
        <StartingPosesIllustration />
        <span className="experiment-coordinate-scene-copy">
          <span
            className="experiment-coordinate-scene-eyebrow"
            data-xgc-role="experiment-robot-assets-coordinate-kind"
            data-xgc-id="starting-poses"
          >{t('Simulation')}</span>
          <span
            className="experiment-coordinate-scene-title"
            data-xgc-role="experiment-robot-assets-coordinate-title"
            data-xgc-id="starting-poses"
          >{t('Starting poses')}<EntryArrow /></span>
        </span>
      </button>
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

function OriginIllustration() {
  const instanceId = useId().replace(/:/g,'');
  const light = `${instanceId}-origin-light`;
  const glass = `${instanceId}-origin-glass`;
  const core = `${instanceId}-origin-core`;
  const shadow = `${instanceId}-origin-shadow`;

  return (
    <svg className="experiment-coordinate-scene-art" viewBox="0 0 300 250" aria-hidden="true">
      <defs>
        <radialGradient id={light}>
          <stop className="experiment-coordinate-scene-light-center" />
          <stop offset="1" className="experiment-coordinate-scene-light-edge" />
        </radialGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <stop className="experiment-coordinate-scene-glass-light" />
          <stop offset="1" className="experiment-coordinate-scene-glass-low" />
        </linearGradient>
        <radialGradient id={core} cx="32%" cy="24%" r="82%">
          <stop className="experiment-coordinate-scene-core-light" />
          <stop offset="0.42" className="experiment-coordinate-scene-core-mid" />
          <stop offset="1" className="experiment-coordinate-scene-core-low" />
        </radialGradient>
        <radialGradient id={shadow}>
          <stop className="experiment-coordinate-scene-shadow-center" />
          <stop offset="1" className="experiment-coordinate-scene-shadow-edge" />
        </radialGradient>
      </defs>

      <ellipse cx="150" cy="148" rx="132" ry="102" fill={`url(#${light})`} />
      <ellipse cx="150" cy="208" rx="89" ry="19" fill={`url(#${shadow})`} />
      <g className="experiment-coordinate-scene-floor">
        <ellipse cx="150" cy="208" rx="109" ry="27" />
        <ellipse cx="150" cy="208" rx="76" ry="19" />
        <path d="m40 208 110-55 111 55-111 55ZM93 181l111 54M95 235l110-55" />
      </g>

      <g className="experiment-coordinate-scene-origin-attention">
        <g className="experiment-coordinate-scene-origin-float">
          <g className="experiment-coordinate-scene-back-edge">
            <path d="m79 82 71-38 71 38v83l-71 39-71-39Z" />
            <path d="M150 44v82l71 39M150 126l-71 39" />
          </g>
          <path d="m79 82 71-38 71 38-71 40Z" fill={`url(#${glass})`} />
          <path d="m150 122 71-40v83l-71 39Z" fill={`url(#${glass})`} opacity="0.5" />
          <path d="m79 82 71 40v82l-71-39Z" fill={`url(#${glass})`} opacity="0.28" />
          <g className="experiment-coordinate-scene-glass-edge">
            <path d="m79 82 71 40 71-40M150 122v82M79 82v83l71 39 71-39V82" />
          </g>

          <g className="experiment-coordinate-scene-axis">
            <path d="M150 126V34m0 92 91 49m-91-49-90 49" />
            <path d="m145 41 5-7 5 7m79 129 7 5-9 1m-163-6-9 5 9 1" />
          </g>
          <path d="m150 126 37-20m-37 20-36-20m36 20v47" className="experiment-coordinate-scene-inner-axis" />
          <circle cx="150" cy="126" r="22" fill={`url(#${light})`} />
          <circle cx="150" cy="126" r="11" fill={`url(#${core})`} className="experiment-coordinate-scene-core" />
          <circle cx="147" cy="122" r="2.2" className="experiment-coordinate-scene-core-glint" />
          <g className="experiment-coordinate-scene-axis-label">
            <text x="246" y="185">x</text>
            <text x="49" y="185">y</text>
            <text x="147" y="25">z</text>
          </g>
        </g>
      </g>
    </svg>
  );
}

function StartingPosesIllustration() {
  const instanceId = useId().replace(/:/g,'');
  const floor = `${instanceId}-starting-floor`;
  const marker = `${instanceId}-starting-marker`;
  const shadow = `${instanceId}-starting-shadow`;

  return (
    <svg className="experiment-coordinate-scene-art" viewBox="0 0 300 250" aria-hidden="true">
      <defs>
        <linearGradient id={floor} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop className="experiment-coordinate-scene-glass-light" />
          <stop offset="1" className="experiment-coordinate-scene-glass-low" />
        </linearGradient>
        <linearGradient id={marker} x1="0" y1="0" x2="0.6" y2="1">
          <stop className="experiment-coordinate-scene-core-light" />
          <stop offset="0.48" className="experiment-coordinate-scene-core-mid" />
          <stop offset="1" className="experiment-coordinate-scene-core-low" />
        </linearGradient>
        <radialGradient id={shadow}>
          <stop className="experiment-coordinate-scene-shadow-center" />
          <stop offset="1" className="experiment-coordinate-scene-shadow-edge" />
        </radialGradient>
      </defs>

      <ellipse cx="150" cy="188" rx="117" ry="35" fill={`url(#${shadow})`} opacity="0.6" />
      <path d="m38 155 108-59 114 61-108 59Z" fill={`url(#${floor})`} />
      <g className="experiment-coordinate-scene-floor experiment-coordinate-scene-starting-grid">
        <path d="m38 155 108-59 114 61-108 59ZM65 140l114 61M92 126l114 61M119 111l114 61M66 170l108-59M95 186l108-59M123 201l108-59" />
      </g>
      <path d="m108 145 75-26 8 59-83-33" className="experiment-coordinate-scene-constellation" />

      <g className="experiment-coordinate-scene-start-attention">
        <g className="experiment-coordinate-scene-start-marker experiment-coordinate-scene-start-marker-back">
          <ellipse cx="183" cy="119" rx="21" ry="7" fill={`url(#${shadow})`} />
          <ellipse cx="183" cy="119" rx="15" ry="5" className="experiment-coordinate-scene-marker-ring" />
          <path d="M183 78c-13 0-20 8-17 18 2 7 11 15 17 20 6-5 15-13 17-20 3-10-4-18-17-18Z" fill={`url(#${marker})`} className="experiment-coordinate-scene-marker-shell" />
          <path d="m183 87-6 11 6-3 6 3Z" className="experiment-coordinate-scene-marker-heading" />
        </g>
        <g className="experiment-coordinate-scene-start-marker experiment-coordinate-scene-start-marker-middle">
          <ellipse cx="108" cy="145" rx="25" ry="8" fill={`url(#${shadow})`} />
          <ellipse cx="108" cy="145" rx="18" ry="6" className="experiment-coordinate-scene-marker-ring" />
          <path d="M108 99c-15 0-23 9-20 21 3 9 13 18 20 24 7-6 17-15 20-24 3-12-5-21-20-21Z" fill={`url(#${marker})`} className="experiment-coordinate-scene-marker-shell" />
          <path d="m108 110-7 12 7-3 7 3Z" className="experiment-coordinate-scene-marker-heading" />
        </g>
        <g className="experiment-coordinate-scene-start-marker experiment-coordinate-scene-start-marker-front">
          <ellipse cx="191" cy="178" rx="31" ry="10" fill={`url(#${shadow})`} />
          <ellipse cx="191" cy="178" rx="24" ry="8" className="experiment-coordinate-scene-marker-ring" />
          <path d="M191 121c-18 0-28 11-24 25 3 11 15 22 24 29 9-7 21-18 24-29 4-14-6-25-24-25Z" fill={`url(#${marker})`} className="experiment-coordinate-scene-marker-shell" />
          <path d="m191 134-9 15 9-4 9 4Z" className="experiment-coordinate-scene-marker-heading" />
          <path d="M178 127q13-7 26 0" className="experiment-coordinate-scene-marker-glint" />
        </g>
      </g>
    </svg>
  );
}
