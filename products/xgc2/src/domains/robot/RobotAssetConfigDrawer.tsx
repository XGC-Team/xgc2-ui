import { useMemo, useState, type FormEvent } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { InputControl } from '../../components/controls/TextControls';
import { FormSection, FormSectionSpan, Notice } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { listObjectFieldChanges } from '../../shared/draftChangeSummary';
import {
  DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
  DEFAULT_POSITIONING_FRAME_NUMBER,
  DEFAULT_SCOUT_CONNECTOR,
  MECANUM_UGV_KIND,
  PX4_MODEL_FS150,
  PX4_MODEL_MOCAP_ROTOR,
  PX4_MULTIROTOR_KIND,
  SCOUT_CONNECTORS,
  SCOUT_MINI_KIND,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  type ContributedRobotAssetSpec,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import {
  defaultRobotProfileIds,
  isBuiltinRobotCatalogKind,
  robotAssetKind,
  supportedPX4ProductModels,
  supportedRobotModels,
  type SupportedRobotKind,
} from './robotAssetCatalog';
import {
  robotChassisClassForDraftKind,
  robotChassisSelectOptions,
  robotFirstVendorCatalogIdForChassis,
  robotVendorOptionsForChassis,
} from './robotAssetChassis';
import {
  defaultPhysicalMavrosLocalPort,
  defaultSimulationMavrosLocalPort,
  defaultSimulationPx4RemotePort,
} from './robotAssetDecoder';
import { mavrosFcuUrl, vrpnPoseTopic } from './robotAssetConnectionAuthoring';
import {
  robotAssetKindContributionByCatalogId,
  type RobotAssetKindComposition,
  type RobotProductModelOption,
} from './robotAssetKindComposition';
import { useRobotAssetKindComposition } from './useRobotAssetKindComposition';
import { useRobotText } from './robotMessages';

/**
 * Lab companion-computer SSH account (username and password are the same value).
 * Prefills the Configure robot drawer as a visible memo for trusted field networks;
 * operators may still edit either field. Intentionally plain text — not masked.
 */
const DEFAULT_LAB_SSH_ACCOUNT = 'marvsmart';

/** Scout Mini board login — plain-text lab memo, same spirit as PX4. */
const DEFAULT_SCOUT_SSH_USERNAME = 'agilex';
const DEFAULT_SCOUT_SSH_PASSWORD = 'agx';
/** Mecanum UGV board login — family account, same for 01–0n. */
const DEFAULT_MECANUM_SSH_USERNAME = 'wheeltec';
const DEFAULT_MECANUM_SSH_PASSWORD = 'dongguan';
/** Shared vehicle-side Scout telemetry port. */
const DEFAULT_SCOUT_TELEMETRY_REMOTE_PORT = 3001;
const ROBOT_ASSET_CONFIG_FORM_ID = 'robot-asset-config-form';

type RobotAssetDraft = {
  name: string;
  kind: SupportedRobotKind;
  profileId: string;
  /** Concrete PX4 model ID. Empty for non-PX4 kinds. */
  modelId: string;
  /** Simulation product ID. Kept separate from the concrete PX4 model. */
  simulationProductId: string;
  launchPackage: string;
  launchFile: string;
  mavSystemId: string;
  physicalMavrosLocalPort: string;
  physicalFcuRemotePort: string;
  simulationLocalPort: string;
  simulationRemotePort: string;
  managementAddress: string;
  scoutConnector: string;
  sshUsername: string;
  sshPassword: string;
  scoutTelemetryRemotePort: string;
  scoutControlLocalPort: string;
  mocapRigidBodyName: string;
  positioningFrameNumber: string;
  positioningComparisonThresholdM: string;
  /** Opaque inventory fields owned by a contributed kind's editor adapter. */
  contributedFields: Readonly<Record<string, string>>;
};

export function RobotAssetConfigDrawer({
  document,
  assets,
  onClose,
  onSave,
  onError,
  composition: compositionProp,
}: {
  document?: RobotAssetDocument;
  assets: readonly RobotAssetDocument[];
  onClose: () => void;
  onSave: (spec: RobotAssetSpec) => Promise<void>;
  onError?: (message: string) => void;
  composition?: RobotAssetKindComposition;
}) {
  const compositionFromContext = useRobotAssetKindComposition();
  const composition = compositionProp ?? compositionFromContext;
  const t = useRobotText();
  const chassisOptions = robotChassisSelectOptions(composition, t);
  const profileIds = defaultRobotProfileIds(composition);
  const models = supportedRobotModels(composition);
  const px4ProductModels = supportedPX4ProductModels(composition);
  const initialDraft = useMemo(
    () => draftFor(document, assets, composition),
    [assets, composition, document],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(document);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const contributed = robotAssetKindContributionByCatalogId(composition, draft.kind);
  const inventoryOnly = Boolean(contributed?.inventoryEditor);
  const chassisClass = robotChassisClassForDraftKind(draft.kind, composition);
  const vendorOptions = robotVendorOptionsForChassis(chassisClass, composition);
  const selectedPX4Model = draft.kind === 'px4'
    ? px4ProductModels.find((model) => model.id === draft.modelId)
    : undefined;
  const px4DirectMavros = selectedPX4Model?.directMavros ?? draft.modelId === PX4_MODEL_FS150;
  const simulationAvailable = draft.kind === 'px4'
    ? Boolean(selectedPX4Model?.simulation)
    : isBuiltinRobotCatalogKind(draft.kind) && models[draft.kind].length > 0;

  function changeChassis(nextChassis: string) {
    const nextKind = robotFirstVendorCatalogIdForChassis(nextChassis, composition);
    if (!nextKind || nextKind === draft.kind) return;
    changeKind(nextKind);
  }

  function changeKind(kind: SupportedRobotKind) {
    // Sequence is per kind: 20 PX4s must not make the next Scout "Scout 21".
    const sequence = nextSequence(assets, kind, composition);
    const padded = String(sequence).padStart(2, '0');
    const nextContribution = robotAssetKindContributionByCatalogId(composition, kind);
    if (nextContribution?.inventoryEditor) {
      setDraft({
        ...draft,
        name: nextContribution.defaultName(sequence),
        kind,
        profileId: nextContribution.defaultProfileId,
        modelId: '',
        simulationProductId: '',
        launchPackage: '',
        launchFile: '',
        mavSystemId: '',
        physicalMavrosLocalPort: '',
        physicalFcuRemotePort: '',
        simulationLocalPort: '',
        simulationRemotePort: '',
        managementAddress: '',
        scoutConnector: '',
        sshUsername: '',
        sshPassword: '',
        scoutTelemetryRemotePort: '',
        scoutControlLocalPort: '',
        mocapRigidBodyName: '',
        positioningFrameNumber: '',
        positioningComparisonThresholdM: '',
        contributedFields: nextContribution.inventoryEditor.emptyFields(),
      });
      return;
    }
    if (!isBuiltinRobotCatalogKind(kind)) return;
    const px4Model = kind === 'px4' ? px4ProductModels[0] : undefined;
    const simulation = kind === 'px4' ? px4Model?.simulation : models[kind][0];
    if (kind === 'px4' && !px4Model) return;
    if (kind !== 'px4' && !simulation) return;
    const directMavros = px4Model?.directMavros ?? false;
    const next: RobotAssetDraft = {
      ...draft,
      name: nextContribution?.defaultName(sequence)
        ?? (kind === 'px4' ? `UAV ${padded}` : kind === 'scout' ? `Scout ${padded}` : `Mecanum ${padded}`),
      kind,
      profileId: px4Model?.profileId ?? profileIds[kind] ?? '',
      modelId: px4Model?.id ?? '',
      simulationProductId: simulation?.id ?? '',
      launchPackage: simulation?.launchPackage ?? '',
      launchFile: simulation?.launchFile ?? '',
      mavSystemId: kind === 'px4' ? String(sequence) : '',
      physicalMavrosLocalPort: directMavros ? String(defaultPhysicalMavrosLocalPort(sequence)) : '0',
      physicalFcuRemotePort: directMavros ? '14560' : '0',
      simulationLocalPort: directMavros ? String(defaultSimulationMavrosLocalPort(sequence)) : '0',
      simulationRemotePort: directMavros ? String(defaultSimulationPx4RemotePort(sequence)) : '0',
      managementAddress: kind === 'px4'
        ? directMavros ? defaultPX4RemoteIP(sequence) : '0.0.0.0'
        : kind === 'scout' ? defaultScoutRemoteIP(sequence) : defaultMecanumRemoteIP(sequence),
      scoutConnector: kind === 'px4' ? '' : DEFAULT_SCOUT_CONNECTOR,
      sshUsername: kind === 'px4'
        ? directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'operator'
        : kind === 'scout' ? DEFAULT_SCOUT_SSH_USERNAME : DEFAULT_MECANUM_SSH_USERNAME,
      sshPassword: kind === 'px4'
        ? directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'unset'
        : kind === 'scout' ? DEFAULT_SCOUT_SSH_PASSWORD : DEFAULT_MECANUM_SSH_PASSWORD,
      scoutTelemetryRemotePort: kind === 'px4' ? '' : String(DEFAULT_SCOUT_TELEMETRY_REMOTE_PORT),
      scoutControlLocalPort: kind === 'px4'
        ? ''
        : String(kind === 'scout'
          ? defaultScoutControlLocalPort(sequence)
          : defaultMecanumControlLocalPort(sequence)),
      mocapRigidBodyName: kind === 'px4'
        ? directMavros ? `uav${sequence}` : `mocap_rotor${sequence}`
        : `ugv${sequence}`,
      positioningFrameNumber: kind === 'px4' && !directMavros
        ? '0' : String(DEFAULT_POSITIONING_FRAME_NUMBER),
      positioningComparisonThresholdM: kind === 'px4' && !directMavros
        ? '0' : String(DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M),
      contributedFields: {},
    };
    setDraft(kind === 'px4' ? applyMavSystemId(next, String(sequence)) : next);
  }

  function changeModel(modelId: string) {
    if (draft.kind !== 'px4') return;
    const model = px4ProductModels.find((candidate) => candidate.id === modelId);
    if (!model) return;
    setDraft(applyPX4ProductModel(draft, model));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    onError?.('');
    setSaving(true);
    try {
      await onSave(specFromDraft(draft, document, composition));
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('Failed to save robot asset.');
      setError(message);
      onError?.(message);
    } finally {
      setSaving(false);
    }
  }

  const InventoryEditor = contributed?.inventoryEditor?.Render;

  return (
    <ConfigDrawer
      title={editing ? t('Configure robot') : t('New robot')}
      onClose={onClose}
      className="config-drawer-wide"
      closeOnBackdrop={!saving}
      dismissible={!saving}
      showClose={false}
      dataXgcRole="robot-asset-config-drawer"
      dataXgcId={document?.head.resourceId ?? 'new'}
      dirty={dirty}
      discardChanges={dirty ? listObjectFieldChanges(initialDraft, draft) : []}
      actions={({ requestClose }) => (
        <>
          <ControlButton
            form={ROBOT_ASSET_CONFIG_FORM_ID}
            type="submit"
            size="compact"
            tone="primary"
            disabled={saving || !draft.name.trim() || (editing && !dirty)}
            dataXgcRole="robot-asset-config-save"
            dataXgcId={document?.head.resourceId ?? 'new'}
          >
            {saving ? t('Saving') : editing ? t('Save robot') : t('Create robot')}
          </ControlButton>
          <ControlButton
            type="button"
            size="compact"
            disabled={saving}
            onClick={requestClose}
            dataXgcRole="robot-asset-config-cancel"
            dataXgcId={document?.head.resourceId ?? 'new'}
          >
            {t('Cancel')}
          </ControlButton>
        </>
      )}
    >
      <form id={ROBOT_ASSET_CONFIG_FORM_ID} className="xgc-config-form" autoComplete="off" data-form-type="other" onSubmit={(event) => void submit(event)}>
        {error && <Notice tone="danger" data-xgc-role="robot-asset-form-error" data-xgc-id="robot-asset-form-error">{error}</Notice>}
        <FormSection title={t('Identity')} dataXgcRole="robot-asset-identity" dataXgcId="robot-asset-identity">
          <TextField role="robot-asset-name" label={t('Name')} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <FormField label={t('Chassis')} dataXgcRole="robot-asset-chassis-field" dataXgcId="robot-asset-chassis-field">
            <SelectControl
              fill
              value={chassisClass}
              options={chassisOptions.map((option) => ({ value: option.id, label: option.label }))}
              onChange={changeChassis}
              ariaLabel={t('Chassis')}
              dataXgcRole="robot-asset-chassis" dataXgcId="robot-asset-chassis"
            />
          </FormField>
          <FormField label={t('Firmware / vendor')} dataXgcRole="robot-asset-firmware-field" dataXgcId="robot-asset-firmware-field">
            <SelectControl
              fill
              value={draft.kind}
              options={vendorOptions.map((option) => ({ value: option.id, label: option.label }))}
              onChange={(kind) => changeKind(kind)}
              ariaLabel={t('Firmware / vendor')}
              dataXgcRole="robot-asset-firmware" dataXgcId="robot-asset-firmware"
            />
          </FormField>
          {/*
            PX4 may ship multiple airframes (FS150, …). Other chassis stacks
            are one vendor per chassis today; Firmware / vendor already
            selects the product. Inventory-only kinds have no model selector.
          */}
          {draft.kind === 'px4' && (
            <FormField label={t('Model')} dataXgcRole="robot-asset-model-field" dataXgcId="robot-asset-model-field">
              <SelectControl
                fill
                value={draft.modelId}
                options={px4ProductModels.map((model) => ({ value: model.id, label: model.label }))}
                onChange={changeModel}
                ariaLabel={t('Robot model')}
                dataXgcRole="robot-asset-model" dataXgcId="robot-asset-model"
              />
            </FormField>
          )}
        </FormSection>

        {inventoryOnly && InventoryEditor ? (
          <FormSection title={t('Inventory')} dataXgcRole="robot-asset-inventory" dataXgcId="robot-asset-inventory">
            <FormSectionSpan className="robot-asset-inventory-fields">
              <InventoryEditor
                fields={draft.contributedFields}
                onChange={(contributedFields) => setDraft({ ...draft, contributedFields })}
              />
            </FormSectionSpan>
          </FormSection>
        ) : (
          <>
            <FormSection title={t('Physical experiment')} dataXgcRole="robot-asset-physical" dataXgcId="robot-asset-physical">
              {draft.kind === 'px4' && (
                <>
                  <NumberField
                    role="robot-asset-mav-system-id"
                    label={t('MAV system ID')}
                    value={draft.mavSystemId}
                    min="1"
                    max="245"
                    onChange={(mavSystemId) => setDraft(applyMavSystemId(draft, mavSystemId))}
                  />
                  <TextField
                    role="robot-asset-management-address"
                    label={t(px4DirectMavros ? 'Remote IP' : 'Onboard computer IP')}
                    value={draft.managementAddress}
                    onChange={(managementAddress) => setDraft({ ...draft, managementAddress })}
                  />
                  {px4DirectMavros && (
                    <>
                      <NumberField role="robot-asset-physical-mavros-local-port" label={t('MAVLink local port')} value={draft.physicalMavrosLocalPort} min="1" max="65535" onChange={(physicalMavrosLocalPort) => setDraft({ ...draft, physicalMavrosLocalPort })} />
                      <NumberField role="robot-asset-physical-fcu-remote-port" label={t('MAVLink remote port')} value={draft.physicalFcuRemotePort} min="1" max="65535" onChange={(physicalFcuRemotePort) => setDraft({ ...draft, physicalFcuRemotePort })} />
                      <TextField
                        role="robot-asset-mavros-fcu-url"
                        label={t('MAVROS FCU URL')}
                        value={mavrosFcuUrl(draft.physicalMavrosLocalPort, draft.managementAddress, draft.physicalFcuRemotePort)}
                        readOnly
                        onChange={() => undefined}
                      />
                    </>
                  )}
                  <TextField role="robot-asset-ssh-username" label={t('SSH username')} value={draft.sshUsername} autoComplete="off" onChange={(sshUsername) => setDraft({ ...draft, sshUsername })} />
                  {/* Plain text on purpose: trusted lab memo for rapid SSH debug; not a masked secret field. */}
                  <TextField role="robot-asset-ssh-password" label={t('SSH password')} value={draft.sshPassword} autoComplete="off" onChange={(sshPassword) => setDraft({ ...draft, sshPassword })} />
                </>
              )}
              {(draft.kind === 'scout' || draft.kind === 'mecanum') && (
                <>
                  {/* UGV physical order matches Scout: Remote IP → Connector → Telemetry → Local control → SSH → VRPN. */}
                  <TextField role="robot-asset-management-address" label={t('Remote IP')} value={draft.managementAddress} onChange={(managementAddress) => setDraft({ ...draft, managementAddress })} />
                  <FormField label={t('Connector')} dataXgcRole="robot-asset-ugv-connector-field" dataXgcId="robot-asset-ugv-connector-field">
                    <SelectControl
                      fill
                      value={draft.scoutConnector}
                      options={SCOUT_CONNECTORS.map((connector) => ({ value: connector, label: connector }))}
                      onChange={(scoutConnector) => setDraft({ ...draft, scoutConnector })}
                      ariaLabel={t('Connector')}
                      dataXgcRole="robot-asset-ugv-connector" dataXgcId="robot-asset-ugv-connector"
                    />
                  </FormField>
                  <NumberField
                    role="robot-asset-ugv-telemetry-remote-port"
                    label={t('Telemetry remote port')}
                    value={draft.scoutTelemetryRemotePort}
                    min="1"
                    max="65535"
                    onChange={(scoutTelemetryRemotePort) => setDraft({ ...draft, scoutTelemetryRemotePort })}
                  />
                  <NumberField
                    role="robot-asset-ugv-control-local-port"
                    label={t('Control local port')}
                    value={draft.scoutControlLocalPort}
                    min="1"
                    max="65535"
                    onChange={(scoutControlLocalPort) => setDraft({ ...draft, scoutControlLocalPort })}
                  />
                  <TextField role="robot-asset-ssh-username" label={t('SSH username')} value={draft.sshUsername} autoComplete="off" onChange={(sshUsername) => setDraft({ ...draft, sshUsername })} />
                  {/* Plain text on purpose: trusted lab memo for rapid SSH debug; not a masked secret field. */}
                  <TextField role="robot-asset-ssh-password" label={t('SSH password')} value={draft.sshPassword} autoComplete="off" onChange={(sshPassword) => setDraft({ ...draft, sshPassword })} />
                </>
              )}
              <TextField
                role="robot-asset-mocap"
                label={t(draft.kind === 'px4' && !px4DirectMavros
                  ? 'Onboard mocap rigid body'
                  : 'Mocap rigid body')}
                value={draft.mocapRigidBodyName}
                onChange={(mocapRigidBodyName) => setDraft({ ...draft, mocapRigidBodyName })}
              />
              {draft.kind === 'px4' && !px4DirectMavros ? (
                <TextField
                  role="robot-asset-ground-telemetry"
                  label={t('Ground telemetry')}
                  value={t('Zenoh · read only')}
                  readOnly
                  onChange={() => undefined}
                />
              ) : (
                <TextField
                  role="robot-asset-vrpn-topic"
                  label={t('VRPN pose topic')}
                  value={vrpnPoseTopic(draft.mocapRigidBodyName)}
                  readOnly
                  // Derived from mocap rigid body — not authorable inventory truth.
                  onChange={() => undefined}
                />
              )}
              {(draft.kind !== 'px4' || px4DirectMavros) && (
                <>
                  <NumberField
                    role="robot-asset-positioning-frame-number"
                    label={t('Positioning repeat frames')}
                    value={draft.positioningFrameNumber}
                    min="1"
                    max="999"
                    onChange={(positioningFrameNumber) => setDraft({ ...draft, positioningFrameNumber })}
                  />
                  <NumberField
                    role="robot-asset-positioning-comparison-threshold"
                    label={t('Positioning comparison threshold')}
                    value={draft.positioningComparisonThresholdM}
                    min="0.0000000001"
                    max="10"
                    step="0.0000000001"
                    onChange={(positioningComparisonThresholdM) => setDraft({ ...draft, positioningComparisonThresholdM })}
                  />
                </>
              )}
            </FormSection>

            {simulationAvailable && (
            <FormSection title={t('Simulation experiment')} dataXgcRole="robot-asset-simulation" dataXgcId="robot-asset-simulation">
              <TextField role="robot-asset-product" label={t('Product ID')} value={draft.simulationProductId} readOnly onChange={() => undefined} />
              <TextField role="robot-asset-launch-package" label={t('Launch package')} value={draft.launchPackage} readOnly onChange={() => undefined} />
              <TextField role="robot-asset-launch-file" label={t('Launch file')} value={draft.launchFile} readOnly onChange={() => undefined} />
              {draft.kind === 'px4' && px4DirectMavros && (
                <>
                  <NumberField role="robot-asset-simulation-local-port" label={t('Simulation MAVLink local port')} value={draft.simulationLocalPort} min="1" max="65535" readOnly onChange={() => undefined} />
                  <NumberField role="robot-asset-simulation-remote-port" label={t('Simulation MAVLink remote port')} value={draft.simulationRemotePort} min="1" max="65535" readOnly onChange={() => undefined} />
                  <TextField
                    role="robot-asset-simulation-mavros-fcu-url"
                    label={t('Simulation MAVROS FCU URL')}
                    value={mavrosFcuUrl(draft.simulationLocalPort, '127.0.0.1', draft.simulationRemotePort)}
                    readOnly
                    onChange={() => undefined}
                  />
                </>
              )}
            </FormSection>
            )}
          </>
        )}
      </form>
    </ConfigDrawer>
  );
}

function draftFor(
  document: RobotAssetDocument | undefined,
  assets: readonly RobotAssetDocument[],
  composition: RobotAssetKindComposition,
): RobotAssetDraft {
  const profileIds = defaultRobotProfileIds(composition);
  const px4ProductModels = supportedPX4ProductModels(composition);
  if (!document) {
    const sequence = nextSequence(assets, 'px4', composition);
    const model = px4ProductModels[0]!;
    const simulation = model.simulation;
    const directMavros = model.directMavros;
    const contribution = robotAssetKindContributionByCatalogId(composition, 'px4');
    return {
      name: contribution?.defaultName(sequence) ?? `UAV ${String(sequence).padStart(2, '0')}`,
      kind: 'px4',
      profileId: model.profileId || profileIds.px4 || '',
      modelId: model.id,
      simulationProductId: simulation?.id ?? '',
      launchPackage: simulation?.launchPackage ?? '',
      launchFile: simulation?.launchFile ?? '',
      mavSystemId: String(sequence),
      physicalMavrosLocalPort: directMavros ? String(defaultPhysicalMavrosLocalPort(sequence)) : '0',
      physicalFcuRemotePort: directMavros ? '14560' : '0',
      simulationLocalPort: directMavros ? String(defaultSimulationMavrosLocalPort(sequence)) : '0',
      simulationRemotePort: directMavros ? String(defaultSimulationPx4RemotePort(sequence)) : '0',
      managementAddress: directMavros ? defaultPX4RemoteIP(sequence) : '0.0.0.0',
      scoutConnector: '',
      sshUsername: directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'operator',
      sshPassword: directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'unset',
      scoutTelemetryRemotePort: '',
      scoutControlLocalPort: '',
      mocapRigidBodyName: directMavros ? `uav${sequence}` : `mocap_rotor${sequence}`,
      positioningFrameNumber: directMavros ? String(DEFAULT_POSITIONING_FRAME_NUMBER) : '0',
      positioningComparisonThresholdM: directMavros ? String(DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M) : '0',
      contributedFields: {},
    };
  }
  const spec = document.spec;
  const kind = robotAssetKind(spec, composition);
  const contribution = robotAssetKindContributionByCatalogId(composition, kind);
  if (contribution?.inventoryEditor) {
    return {
      name: spec.name,
      kind,
      profileId: spec.profileId,
      modelId: '',
      simulationProductId: '',
      launchPackage: '',
      launchFile: '',
      mavSystemId: '',
      physicalMavrosLocalPort: '',
      physicalFcuRemotePort: '',
      simulationLocalPort: '',
      simulationRemotePort: '',
      managementAddress: '',
      scoutConnector: '',
      sshUsername: '',
      sshPassword: '',
      scoutTelemetryRemotePort: '',
      scoutControlLocalPort: '',
      mocapRigidBodyName: '',
      positioningFrameNumber: '',
      positioningComparisonThresholdM: '',
      contributedFields: contribution.inventoryEditor.fieldsFromSpec(
        spec as ContributedRobotAssetSpec,
      ),
    };
  }
  const config = isPX4RobotAsset(spec)
    ? spec.px4
    : isMecanumRobotAsset(spec) ? spec.mecanum : isScoutRobotAsset(spec) ? spec.scout : undefined;
  if (!config) {
    return {
      name: spec.name,
      kind,
      profileId: spec.profileId,
      modelId: '',
      simulationProductId: '',
      launchPackage: '',
      launchFile: '',
      mavSystemId: '',
      physicalMavrosLocalPort: '',
      physicalFcuRemotePort: '',
      simulationLocalPort: '',
      simulationRemotePort: '',
      managementAddress: '',
      scoutConnector: '',
      sshUsername: '',
      sshPassword: '',
      scoutTelemetryRemotePort: '',
      scoutControlLocalPort: '',
      mocapRigidBodyName: '',
      positioningFrameNumber: '',
      positioningComparisonThresholdM: '',
      contributedFields: {},
    };
  }
  return {
    name: spec.name,
    kind,
    profileId: spec.profileId,
    modelId: isPX4RobotAsset(spec) ? px4RobotModelId(spec) : '',
    simulationProductId: config.simulation.productId,
    launchPackage: config.simulation.launchPackage,
    launchFile: config.simulation.launchFile,
    mavSystemId: isPX4RobotAsset(spec) ? String(spec.px4.mavSystemId) : '',
    physicalMavrosLocalPort: isPX4RobotAsset(spec) ? String(spec.px4.physicalMavrosLocalPort) : '',
    physicalFcuRemotePort: isPX4RobotAsset(spec) ? String(spec.px4.physicalFcuRemotePort) : '',
    simulationLocalPort: isPX4RobotAsset(spec) ? String(spec.px4.simulationLocalPort) : '',
    simulationRemotePort: isPX4RobotAsset(spec) ? String(spec.px4.simulationRemotePort) : '',
    managementAddress: isPX4RobotAsset(spec)
      ? spec.px4.managementIp
      : isMecanumRobotAsset(spec) ? spec.mecanum.managementAddress : isScoutRobotAsset(spec) ? spec.scout.managementAddress : '',
    scoutConnector: isScoutRobotAsset(spec)
      ? spec.scout.connector
      : isMecanumRobotAsset(spec) ? spec.mecanum.connector : '',
    sshUsername: isPX4RobotAsset(spec)
      ? spec.px4.sshUsername
      : isMecanumRobotAsset(spec) ? spec.mecanum.sshUsername : isScoutRobotAsset(spec) ? spec.scout.sshUsername : '',
    sshPassword: isPX4RobotAsset(spec)
      ? spec.px4.sshPassword
      : isMecanumRobotAsset(spec) ? spec.mecanum.sshPassword : isScoutRobotAsset(spec) ? spec.scout.sshPassword : '',
    scoutTelemetryRemotePort: isScoutRobotAsset(spec)
      ? String(spec.scout.telemetryRemotePort)
      : isMecanumRobotAsset(spec) ? String(spec.mecanum.telemetryRemotePort) : '',
    scoutControlLocalPort: isScoutRobotAsset(spec)
      ? String(spec.scout.controlLocalPort)
      : isMecanumRobotAsset(spec) ? String(spec.mecanum.controlLocalPort) : '',
    mocapRigidBodyName: isPX4RobotAsset(spec)
      ? spec.px4.mocapRigidBodyName
      : isMecanumRobotAsset(spec)
        ? spec.mecanum.mocapRigidBodyName
        : isScoutRobotAsset(spec) ? spec.scout.mocapRigidBodyName : '',
    positioningFrameNumber: isPX4RobotAsset(spec)
      ? String(spec.px4.positioningFrameNumber ?? (px4RobotModelId(spec) === PX4_MODEL_FS150 ? DEFAULT_POSITIONING_FRAME_NUMBER : 0))
      : isMecanumRobotAsset(spec)
        ? String(spec.mecanum.positioningFrameNumber ?? DEFAULT_POSITIONING_FRAME_NUMBER)
        : isScoutRobotAsset(spec) ? String(spec.scout.positioningFrameNumber ?? DEFAULT_POSITIONING_FRAME_NUMBER) : '',
    positioningComparisonThresholdM: isPX4RobotAsset(spec)
      ? String(spec.px4.positioningComparisonThresholdM ?? (px4RobotModelId(spec) === PX4_MODEL_FS150 ? DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M : 0))
      : isMecanumRobotAsset(spec)
        ? String(spec.mecanum.positioningComparisonThresholdM ?? DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M)
        : isScoutRobotAsset(spec) ? String(spec.scout.positioningComparisonThresholdM ?? DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M) : '',
    contributedFields: {},
  };
}

function specFromDraft(
  draft: RobotAssetDraft,
  document: RobotAssetDocument | undefined,
  composition: RobotAssetKindComposition,
): RobotAssetSpec {
  // Description / tags / profile are not user-configurable on the Robots page.
  // Preserve existing values on edit; use defaults for new assets.
  const common = {
    name: draft.name,
    description: document?.spec.description ?? '',
    tags: document?.spec.tags ?? [],
    profileId: draft.profileId,
  };
  const contribution = robotAssetKindContributionByCatalogId(composition, draft.kind);
  if (contribution?.inventoryEditor) {
    return contribution.inventoryEditor.specFromFields(common, draft.contributedFields);
  }
  const simulation = {
    productId: draft.simulationProductId,
    launchPackage: draft.launchPackage,
    launchFile: draft.launchFile,
  };
  if (draft.kind === 'px4') {
    return {
      ...common,
      kind: PX4_MULTIROTOR_KIND,
      px4: {
        modelId: draft.modelId as typeof PX4_MODEL_FS150 | typeof PX4_MODEL_MOCAP_ROTOR,
        mavSystemId: Number(draft.mavSystemId),
        managementIp: draft.managementAddress,
        sshUsername: draft.sshUsername,
        sshPassword: draft.sshPassword,
        mocapRigidBodyName: draft.mocapRigidBodyName,
        positioningFrameNumber: Number(draft.positioningFrameNumber),
        positioningComparisonThresholdM: Number(draft.positioningComparisonThresholdM),
        physicalMavrosLocalPort: Number(draft.physicalMavrosLocalPort),
        physicalFcuRemotePort: Number(draft.physicalFcuRemotePort),
        simulationLocalPort: Number(draft.simulationLocalPort),
        simulationRemotePort: Number(draft.simulationRemotePort),
        simulation,
      },
    };
  }
  if (draft.kind === 'mecanum') {
    return {
      ...common,
      kind: MECANUM_UGV_KIND,
      mecanum: {
        managementAddress: draft.managementAddress,
        connector: draft.scoutConnector || DEFAULT_SCOUT_CONNECTOR,
        sshUsername: draft.sshUsername,
        sshPassword: draft.sshPassword,
        telemetryRemotePort: Number(draft.scoutTelemetryRemotePort),
        controlLocalPort: Number(draft.scoutControlLocalPort),
        mocapRigidBodyName: draft.mocapRigidBodyName,
        positioningFrameNumber: Number(draft.positioningFrameNumber),
        positioningComparisonThresholdM: Number(draft.positioningComparisonThresholdM),
        simulation,
      },
    };
  }
  return {
    ...common,
    kind: SCOUT_MINI_KIND,
    scout: {
      managementAddress: draft.managementAddress,
      connector: draft.scoutConnector,
      sshUsername: draft.sshUsername,
      sshPassword: draft.sshPassword,
      telemetryRemotePort: Number(draft.scoutTelemetryRemotePort),
      controlLocalPort: Number(draft.scoutControlLocalPort),
      mocapRigidBodyName: draft.mocapRigidBodyName,
      positioningFrameNumber: Number(draft.positioningFrameNumber),
      positioningComparisonThresholdM: Number(draft.positioningComparisonThresholdM),
      simulation,
    },
  };
}

/**
 * Next free index for the selected robot kind.
 * PX4 uses MAV system IDs; other kinds use that kind's fleet count and
 * trailing numbers already used in names / identity fields.
 */
function nextSequence(
  assets: readonly RobotAssetDocument[],
  kind: SupportedRobotKind,
  composition: RobotAssetKindComposition,
) {
  if (kind === 'px4') {
    return Math.max(
      0,
      ...assets.flatMap((asset) => (isPX4RobotAsset(asset) ? [asset.spec.px4.mavSystemId] : [])),
    ) + 1;
  }
  const ofKind = assets.filter((asset) => robotAssetKind(asset.spec, composition) === kind);
  const used = ofKind.flatMap((asset) => identitySequenceHints(asset, kind, composition));
  return Math.max(ofKind.length, ...used, 0) + 1;
}

function identitySequenceHints(
  asset: RobotAssetDocument,
  kind: SupportedRobotKind,
  composition: RobotAssetKindComposition,
) {
  const hints: number[] = [];
  const name = asset.spec.name.trim();
  const contribution = robotAssetKindContributionByCatalogId(composition, kind);
  if (contribution?.nameSequence) {
    const sequence = contribution.nameSequence(name);
    if (sequence != null) hints.push(sequence);
    return hints;
  }
  const nameMatch = kind === 'scout'
    ? name.match(/^Scout(?:\s+Mini)?\s*0*(\d+)$/i)
    : name.match(/^Mecanum(?:\s+UGV)?\s*0*(\d+)$/i);
  if (nameMatch) hints.push(Number(nameMatch[1]));
  const mocap = isScoutRobotAsset(asset)
    ? asset.spec.scout.mocapRigidBodyName
    : isMecanumRobotAsset(asset) ? asset.spec.mecanum.mocapRigidBodyName : '';
  // Scout/Mecanum default to ugvN; still accept kind-specific aliases if renamed.
  const mocapMatch = kind === 'scout'
    ? mocap.match(/^(?:ugv|scout)\s*0*(\d+)$/i)
    : mocap.match(/^(?:ugv|mecanum)\s*0*(\d+)$/i);
  if (mocapMatch) hints.push(Number(mocapMatch[1]));
  return hints;
}

function applyPX4ProductModel(
  draft: RobotAssetDraft,
  model: RobotProductModelOption,
): RobotAssetDraft {
  const parsedSystemId = Number(draft.mavSystemId);
  const systemId = Number.isInteger(parsedSystemId) && parsedSystemId >= 1 && parsedSystemId <= 245
    ? parsedSystemId
    : 1;
  const directMavros = model.directMavros;
  const automaticName = /^(?:UAV|Mocap Rotor)\s+\d+$/i.test(draft.name.trim());
  return {
    ...draft,
    name: automaticName
      ? directMavros
        ? `UAV ${String(systemId).padStart(2, '0')}`
        : `Mocap Rotor ${String(systemId).padStart(2, '0')}`
      : draft.name,
    profileId: model.profileId,
    modelId: model.id,
    simulationProductId: model.simulation?.id ?? '',
    launchPackage: model.simulation?.launchPackage ?? '',
    launchFile: model.simulation?.launchFile ?? '',
    physicalMavrosLocalPort: directMavros ? String(defaultPhysicalMavrosLocalPort(systemId)) : '0',
    physicalFcuRemotePort: directMavros ? '14560' : '0',
    simulationLocalPort: directMavros ? String(defaultSimulationMavrosLocalPort(systemId)) : '0',
    simulationRemotePort: directMavros ? String(defaultSimulationPx4RemotePort(systemId)) : '0',
    managementAddress: directMavros ? defaultPX4RemoteIP(systemId) : '0.0.0.0',
    sshUsername: directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'operator',
    sshPassword: directMavros ? DEFAULT_LAB_SSH_ACCOUNT : 'unset',
    mocapRigidBodyName: directMavros ? `uav${systemId}` : `mocap_rotor${systemId}`,
    positioningFrameNumber: directMavros ? draft.positioningFrameNumber || String(DEFAULT_POSITIONING_FRAME_NUMBER) : '0',
    positioningComparisonThresholdM: directMavros ? draft.positioningComparisonThresholdM || String(DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M) : '0',
  };
}

/**
 * FS150 uses MAV system ID to partition MAVROS/SITL ports and its legacy
 * mocap alias. Mocap Rotor has no direct-MAVROS port ownership, so changing
 * its MAV identity must not stamp FS150 wiring over its onboard-link fields.
 */
function applyMavSystemId(draft: RobotAssetDraft, mavSystemId: string): RobotAssetDraft {
  const id = Number(mavSystemId);
  if (!Number.isInteger(id) || id < 1 || id > 245) {
    return { ...draft, mavSystemId };
  }
  if (draft.modelId === PX4_MODEL_MOCAP_ROTOR) {
    return { ...draft, mavSystemId };
  }
  return {
    ...draft,
    mavSystemId,
    physicalMavrosLocalPort: String(defaultPhysicalMavrosLocalPort(id)),
    simulationLocalPort: String(defaultSimulationMavrosLocalPort(id)),
    simulationRemotePort: String(defaultSimulationPx4RemotePort(id)),
    mocapRigidBodyName: `uav${id}`,
    positioningFrameNumber: draft.positioningFrameNumber || String(DEFAULT_POSITIONING_FRAME_NUMBER),
    positioningComparisonThresholdM: draft.positioningComparisonThresholdM || String(DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M),
  };
}

/** Lab remote address: 192.168.51.10+N for the Nth PX4 multirotor. */
function defaultPX4RemoteIP(sequence: number) {
  const index = sequence < 1 ? 1 : sequence;
  return `192.168.51.${10 + index}`;
}

/** UI hint only: 192.168.51.200+N for the Nth Scout Mini (1 → .201). Lab inventory is authored by the provision script. */
function defaultScoutRemoteIP(sequence: number) {
  const index = sequence < 1 ? 1 : sequence;
  return `192.168.51.${200 + index}`;
}

/** GCS cmd_vel bind: 3300+N for the Nth Scout Mini (1 → 3301). Disjoint from Mecanum 3001–3009. */
function defaultScoutControlLocalPort(sequence: number) {
  const index = sequence < 1 ? 1 : sequence;
  return 3300 + index;
}

/** UI hint only: 192.168.51.110+N for the Nth Mecanum UGV (1 → .111). Lab inventory is authored by the provision script. */
function defaultMecanumRemoteIP(sequence: number) {
  const index = sequence < 1 ? 1 : sequence;
  return `192.168.51.${110 + index}`;
}

/** GCS cmd_vel bind: 3000+N for the Nth Mecanum UGV (1 → 3001, 9 → 3009). Disjoint from Scout 3301–3305. */
function defaultMecanumControlLocalPort(sequence: number) {
  const index = sequence < 1 ? 1 : sequence;
  return 3000 + index;
}

function TextField({ role, label, value, onChange, readOnly = false, autoComplete }: {
  role: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  autoComplete?: 'off';
}) {
  const ignoreCredentialManager = autoComplete === 'off';
  return (
    <FormField label={label} htmlFor={role} dataXgcRole={`${role}-field`} dataXgcId={`${role}-field`}>
      <InputControl
        id={role}
        value={value}
        readOnly={readOnly}
        autoComplete={autoComplete}
        data-1p-ignore={ignoreCredentialManager ? 'true' : undefined}
        data-bwignore={ignoreCredentialManager ? 'true' : undefined}
        data-form-type={ignoreCredentialManager ? 'other' : undefined}
        data-lpignore={ignoreCredentialManager ? 'true' : undefined}
        onChange={onChange}
      />
    </FormField>
  );
}

function NumberField({ role, label, value, onChange, min, max, step = '1', readOnly = false }: {
  role: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  step?: string;
  readOnly?: boolean;
}) {
  return (
    <FormField label={label} htmlFor={role} dataXgcRole={`${role}-field`} dataXgcId={`${role}-field`}>
      <InputControl id={role} type="number" value={value} min={min} max={max} step={step} readOnly={readOnly} onChange={onChange} />
    </FormField>
  );
}
