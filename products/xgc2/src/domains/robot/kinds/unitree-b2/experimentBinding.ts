import { protocolObject } from '../../../../shared/strictProtocolDecoder';
import type { RobotExperimentBindingAdapter } from '../../robotAssetKindComposition';
import { UNITREE_B2_WIRE_ARM } from './contracts';

/** Experiment marker owned by the leaf; Robot inventory remains on the asset. */
export const UNITREE_B2_EXPERIMENT_BINDING: RobotExperimentBindingAdapter = Object.freeze({
  wireArm: UNITREE_B2_WIRE_ARM,
  decode(value: unknown, path: string) {
    protocolObject(value, path, []);
    return {};
  },
  normalize() {
    return {};
  },
  validate(value: unknown, bindingId: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length > 0) {
      return `Experiment Robot "${bindingId}" Unitree B2 overrides must be empty; Robot assets own inventory identity.`;
    }
    return '';
  },
  authoring: Object.freeze({
    slotIdPrefix: 'b2',
    namespacePrefix: 'b2',
    initialPoseZ: 0.55,
    emptySettings: () => ({}),
  }),
});
