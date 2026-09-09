import type { RobotAssetKindPanelProjection } from '../../robotAssetKindComposition';
import {
  b2HealthTone,
  b2InstrumentChannels,
  b2ListChannels,
} from './instrumentModel';
import {
  UnitreeB2InstrumentProjection,
  UnitreeB2ListProjection,
} from './panelRenderers';

const POSE_CHANNEL = 'state.pose';
const VELOCITY_CHANNEL = 'state.velocity';
const SPEED_CHANNEL = 'state.speed';
const HEALTH_CHANNEL = 'state.health';
const LINK_CHANNEL = 'diagnostic.link';

export const UNITREE_B2_PANEL_PROJECTION: RobotAssetKindPanelProjection = Object.freeze({
  platform: 'b2',
  category: 'quadruped',
  instrumentChannels: b2InstrumentChannels,
  listChannels: b2ListChannels,
  poseChannelId: POSE_CHANNEL,
  velocityChannelId: VELOCITY_CHANNEL,
  speedChannelId: SPEED_CHANNEL,
  linkChannelId: LINK_CHANNEL,
  healthTone: (input) => b2HealthTone({
    hasRun: input.hasRun,
    connectionState: input.robot.connectionState,
    online: input.status.online,
    operationalReady: input.status.operationalReady,
    healthChannel: input.channels[HEALTH_CHANNEL],
    health: input.channels[HEALTH_CHANNEL]?.value ?? {},
    poseChannel: input.channels[POSE_CHANNEL],
  }),
  RenderInstrument: UnitreeB2InstrumentProjection,
  RenderList: UnitreeB2ListProjection,
});
