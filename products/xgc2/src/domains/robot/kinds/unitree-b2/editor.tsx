/**
 * Inventory-only authoring fields for Unitree B2.
 * Shared Robot UI mounts this via the typed contribution editor adapter.
 *
 * The drawer's full-width inventory slot gives this domain editor its own
 * responsive two-column field grid.
 */

import { FormField } from '../../../../components/FormPrimitives';
import { InputControl } from '../../../../components/controls/TextControls';
import type { RobotAssetKindInventoryEditorProps } from '../../robotAssetKindComposition';
import { useRobotText } from '../../robotMessages';
import {
  UNITREE_B2_ROS_DOMAIN_ID_MAX,
  UNITREE_B2_ROS_DOMAIN_ID_MIN,
} from './contracts';

export function UnitreeB2InventoryEditor({
  fields,
  onChange,
}: RobotAssetKindInventoryEditorProps) {
  const t = useRobotText();
  // Serial number is not operator-facing: wire still carries it, derived from
  // robot address on save (IP already uniquely identifies the dog).
  return (
    <div data-xgc-role="robot-asset-unitree-b2" data-xgc-id="robot-asset-unitree-b2">
      <TextField
        role="robot-asset-b2-robot-address"
        label={t('Robot address')}
        value={fields.robotAddress ?? ''}
        onChange={(robotAddress) => onChange({ ...fields, robotAddress })}
      />
      <NumberField
        role="robot-asset-b2-ros-domain-id"
        label={t('ROS domain ID')}
        value={fields.rosDomainId ?? String(UNITREE_B2_ROS_DOMAIN_ID_MIN)}
        min={String(UNITREE_B2_ROS_DOMAIN_ID_MIN)}
        max={String(UNITREE_B2_ROS_DOMAIN_ID_MAX)}
        onChange={(rosDomainId) => onChange({ ...fields, rosDomainId })}
      />
      <TextField
        role="robot-asset-b2-ssh-username"
        label={t('SSH username')}
        value={fields.sshUsername ?? ''}
        onChange={(sshUsername) => onChange({ ...fields, sshUsername })}
      />
      <TextField
        role="robot-asset-b2-ssh-password"
        label={t('SSH password')}
        value={fields.sshPassword ?? ''}
        onChange={(sshPassword) => onChange({ ...fields, sshPassword })}
      />
    </div>
  );
}

function TextField({
  role,
  label,
  value,
  onChange,
}: {
  role: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} dataXgcRole={`${role}-field`} dataXgcId={`${role}-field`}>
      <InputControl
        value={value}
        onChange={onChange}
        aria-label={label}
        data-xgc-role={role} data-xgc-id={role}
      />
    </FormField>
  );
}

function NumberField({
  role,
  label,
  value,
  min,
  max,
  onChange,
}: {
  role: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} dataXgcRole={`${role}-field`} dataXgcId={`${role}-field`}>
      <InputControl
        type="number"
        value={value}
        min={min}
        max={max}
        step="1"
        onChange={onChange}
        aria-label={label}
        data-xgc-role={role} data-xgc-id={role}
      />
    </FormField>
  );
}
