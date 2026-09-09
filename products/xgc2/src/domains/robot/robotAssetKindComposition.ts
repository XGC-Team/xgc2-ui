/**
 * Neutral Robot asset kind composition seam.
 *
 * Product/profile roots assemble typed leaf contributions into one
 * frozen composition and inject it via provider or explicit args. Shared Robot,
 * Experiment, and robot panel production hosts never import leaf owners.
 *
 * Product-root assembly:
 *   assembleRobotAssetKindComposition(
 *     ...builtInRobotAssetKindContributions,
 *     optionalLeafContribution, // e.g. the inventory-only quadruped leaf
 *   )
 * then wrap the product tree with RobotAssetKindCompositionProvider.
 * See web/test-fixtures/robot-kinds/ for true/false graph fixtures.
 */

import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from 'react';

/** Opaque process-local identity for one Robot asset kind contribution. */
export type RobotAssetKindContributionIdentity = {
  readonly token: symbol;
  readonly diagnosticName: string;
};

export function defineRobotAssetKindContributionIdentity(
  diagnosticName: string,
): RobotAssetKindContributionIdentity {
  return Object.freeze({ token: Symbol(diagnosticName), diagnosticName });
}

/** Admission / capability metadata owned by a kind contribution. */
export type RobotKindAdmission = {
  /** May be newly bound into Experiment authoring. */
  readonly experimentBinding: boolean;
  /** May be projected into Experiment runtime state. */
  readonly experimentProjection: boolean;
  /** Has a simulation product / model selector. */
  readonly simulation: boolean;
  /** Operator-facing reason when experimentBinding is false. */
  readonly experimentDisabledReason: string;
  /** Operator-facing reason when experimentProjection is false. */
  readonly experimentProjectionRefusal: string;
};

/** Folder / kind option entry for the Robots catalog UI. */
export type RobotAssetKindCatalogEntry = {
  readonly id: string;
  readonly label: string;
  /**
   * Dynamics / chassis class for Robot assets list folders.
   * Brand and firmware stay on vendorLabel, not this field.
   */
  readonly chassisClass?: string;
  /** Firmware / vendor shown after opening a robot asset. */
  readonly vendorLabel?: string;
};

export type RobotAssetOverviewAttr = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
};

export type RobotAssetCommonFields = {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly profileId: string;
};

type BuiltInRobotAssetKind = 'px4_multirotor' | 'scout_mini' | 'mecanum_ugv';

declare const contributedRobotAssetKindBrand: unique symbol;

/**
 * Leaf-owned protocol kind identity. A bare wire string is deliberately not
 * assignable: optional leaves must define their constant through
 * defineContributedRobotAssetKind before their spec can join RobotAssetSpec.
 */
export type ContributedRobotAssetKind = string & {
  readonly [contributedRobotAssetKindBrand]: true;
};

const BUILT_IN_ROBOT_ASSET_KINDS = new Set<string>([
  'px4_multirotor',
  'scout_mini',
  'mecanum_ugv',
]);

/** Define one optional leaf kind while refusing the three built-in identities. */
export function defineContributedRobotAssetKind<const Kind extends string>(
  kind: Kind & (Kind extends BuiltInRobotAssetKind ? never : unknown),
): Kind & ContributedRobotAssetKind {
  if (BUILT_IN_ROBOT_ASSET_KINDS.has(kind)) {
    throw new Error(`Built-in Robot asset kind "${kind}" cannot be contributed.`);
  }
  return kind as unknown as Kind & ContributedRobotAssetKind;
}

type ContributedRobotAssetSpecBase = {
  name: string;
  description: string;
  tags: string[];
  profileId: string;
};

/**
 * Optional leaves augment this map with their exact kind-to-spec contract.
 * Mapping by the protocol literal keeps real leaf fixtures ergonomic without
 * reopening the union to arbitrary or built-in string literals.
 */
export interface ContributedRobotAssetSpecRegistry {
  readonly [contributedRobotAssetKindBrand]?: never;
}

type RegisteredContributedRobotAssetKind = Exclude<
  Extract<keyof ContributedRobotAssetSpecRegistry, string>,
  BuiltInRobotAssetKind
>;

type RegisteredContributedRobotAssetSpec = {
  [Kind in RegisteredContributedRobotAssetKind]:
    ContributedRobotAssetSpecRegistry[Kind]
    & ContributedRobotAssetSpecBase
    & { kind: Kind; px4?: never; scout?: never; mecanum?: never };
}[RegisteredContributedRobotAssetKind];

type BrandedContributedRobotAssetSpec = ContributedRobotAssetSpecBase & {
  kind: ContributedRobotAssetKind;
  /** Opaque leaf payload arms remain leaf-owned. */
  [leafPayloadArm: string]: unknown;
  px4?: never;
  scout?: never;
  mecanum?: never;
};

/**
 * Extension-point asset spec for kinds contributed via the composition seam.
 * Registered real leaves or a branded new kind close the no-arm hole; explicit
 * never arms also keep partial built-in objects out of the extension union.
 */
export type ContributedRobotAssetSpec =
  | RegisteredContributedRobotAssetSpec
  | BrandedContributedRobotAssetSpec;

export type RobotModelOption = {
  readonly id: string;
  readonly label: string;
  readonly launchPackage: string;
  readonly launchFile: string;
};

/**
 * Semantic projection selected by one concrete product model.
 *
 * The visual family may be shared (for example both FS150 and Mocap Rotor use
 * the flight instrument), while the channel identities remain model-owned.
 * This prevents a shared panel from silently subscribing to another model's
 * MAVROS, simulator, or transport diagnostics.
 */
export type RobotProductTelemetryProjection = {
  readonly instrumentFamily: 'flight';
  readonly presentation: 'fs150' | 'mocap_rotor';
  readonly instrumentChannels: readonly string[];
  readonly listChannels: readonly string[];
  readonly poseChannelId: string;
  readonly velocityChannelId: string;
  readonly speedChannelId: string;
  readonly linkChannelId: string;
  readonly mocapPoseChannelId?: string;
  readonly localizationErrorChannelId?: string;
  readonly setpointChannelId?: string;
};

/** Concrete product model beneath a shared Robot kind. */
export type RobotProductModelOption = {
  readonly id: string;
  readonly label: string;
  readonly profileId: string;
  /** Present only when this concrete model owns a simulation product. */
  readonly simulation?: RobotModelOption;
  /** True only when this product lifecycle owns a ground-managed MAVROS link. */
  readonly directMavros: boolean;
  readonly telemetry: RobotProductTelemetryProjection;
};

export type RobotAssetKindInventoryEditorProps = {
  readonly fields: Readonly<Record<string, string>>;
  readonly onChange: (fields: Readonly<Record<string, string>>) => void;
};

/**
 * Inventory-only authoring adapter. Built-in physical kinds leave this unset
 * and keep their editor in shared UI; optional leaves own their form section.
 */
export type RobotAssetKindInventoryEditor = {
  readonly emptyFields: () => Readonly<Record<string, string>>;
  readonly fieldsFromSpec: (
    spec: ContributedRobotAssetSpec,
  ) => Readonly<Record<string, string>>;
  readonly specFromFields: (
    common: RobotAssetCommonFields,
    fields: Readonly<Record<string, string>>,
  ) => ContributedRobotAssetSpec;
  readonly Render: ComponentType<RobotAssetKindInventoryEditorProps>;
};

/**
 * Structural stand-in so contributions can type wire results without
 * circular imports into robotAssetContracts. Callers narrow via kind guards.
 */
export type RobotAssetWireResult = {
  name: string;
  description: string;
  tags: string[];
  profileId: string;
  kind: string;
};

export type RobotAssetKindWireAdapter = {
  /** Protocol kind string (wire identity). */
  readonly protocolKind: string;
  /** Wire JSON payload arms owned by this kind (e.g. px4). */
  readonly wireArms: readonly string[];
  readonly decode: (
    common: RobotAssetCommonFields,
    spec: Readonly<Record<string, unknown>>,
    path: string,
  ) => RobotAssetWireResult;
  readonly normalize: (
    spec: RobotAssetWireResult,
    common: RobotAssetCommonFields,
  ) => RobotAssetWireResult;
  readonly validate: (spec: RobotAssetWireResult) => string;
};

/**
 * Leaf-owned Experiment binding marker and authoring defaults.
 *
 * Experiment stores kind settings as one top-level wire arm. Shared Experiment
 * code owns the built-in arms, while optional product leaves provide their arm
 * through this adapter. The payload remains opaque outside the owning leaf.
 */
export type RobotExperimentBindingAdapter = {
  readonly wireArm: string;
  readonly decode: (value: unknown, path: string) => unknown;
  readonly normalize: (value: unknown) => unknown;
  readonly validate: (value: unknown, bindingId: string) => string;
  readonly authoring: {
    readonly slotIdPrefix: string;
    readonly namespacePrefix: string;
    readonly initialPoseZ: number;
    readonly emptySettings: () => unknown;
  };
};

export type RobotKindPanelHealthTone = 'idle' | 'healthy' | 'fault' | 'unavailable';

/** Structural channel snapshot passed to a leaf-owned panel renderer. */
export type RobotKindPanelChannel = {
  readonly channelId: string;
  readonly sequence: number;
  readonly observedAt: string;
  readonly stale: boolean;
  readonly value: Record<string, unknown>;
};

/** Runtime facts available to a leaf-owned instrument/list renderer. */
export type RobotKindPanelRenderProps = {
  readonly robot: {
    readonly id: string;
    readonly name: string;
    readonly connectionState: 'inactive' | 'opening' | 'live' | 'closed' | 'revoked';
    readonly hybridSource?: 'simulation' | 'physical';
  };
  readonly status: {
    readonly online: boolean;
    readonly operationalReady: boolean;
    readonly status: 'online' | 'limited' | 'offline';
  };
  readonly channels: Readonly<Record<string, RobotKindPanelChannel | undefined>>;
  readonly healthTone: RobotKindPanelHealthTone;
  /** Hybrid Session + authored simulation source. Pure modes never set this. */
  readonly showSimulationSourceMark?: boolean;
};

export type RobotKindPanelHealthInput = Omit<RobotKindPanelRenderProps, 'healthTone'> & {
  readonly hasRun: boolean;
};

/**
 * Optional leaf-owned runtime presentation. Shared panels select it by the
 * contributed protocol kind and never name or import the leaf implementation.
 */
export type RobotAssetKindPanelProjection = {
  readonly platform: string;
  readonly category: string;
  readonly instrumentChannels: readonly string[];
  readonly listChannels: readonly string[];
  readonly poseChannelId: string;
  readonly velocityChannelId: string;
  readonly speedChannelId: string;
  readonly linkChannelId?: string;
  readonly healthTone: (input: RobotKindPanelHealthInput) => RobotKindPanelHealthTone;
  readonly RenderInstrument: ComponentType<RobotKindPanelRenderProps>;
  readonly RenderList: ComponentType<RobotKindPanelRenderProps>;
};

/** One typed Robot asset kind contribution (built-in or optional leaf). */
export type RobotAssetKindContribution = {
  readonly identity: RobotAssetKindContributionIdentity;
  readonly catalog: RobotAssetKindCatalogEntry;
  readonly defaultProfileId: string;
  readonly admission: RobotKindAdmission;
  readonly wire: RobotAssetKindWireAdapter;
  /** Optional Experiment marker/authoring adapter owned by this leaf. */
  readonly experimentBinding?: RobotExperimentBindingAdapter;
  /** Optional runtime presentation owned by this leaf. */
  readonly panelProjection?: RobotAssetKindPanelProjection;
  readonly endpoint: (spec: RobotAssetWireResult) => string;
  readonly overviewAttributes: (spec: RobotAssetWireResult) => readonly RobotAssetOverviewAttr[];
  readonly defaultName: (sequence: number) => string;
  readonly nameSequence?: (name: string) => number | undefined;
  /** Present only for inventory-only contributed kinds. */
  readonly inventoryEditor?: RobotAssetKindInventoryEditor;
  /** Present only when admission.simulation is true. */
  readonly simulationModels?: readonly RobotModelOption[];
  /** Optional concrete-model selection beneath this shared kind. */
  readonly productModels?: readonly RobotProductModelOption[];
};

/**
 * Prevalidated frozen Robot asset kind composition. Lookup indexes are held in
 * assembly-local closures: there is no process-global registry or mutable
 * feature table.
 */
export type RobotAssetKindComposition = {
  readonly contributions: readonly RobotAssetKindContribution[];
  readonly wireArms: readonly string[];
  readonly experimentBindingArms: readonly string[];
  readonly contributionByProtocolKind: (
    protocolKind: string,
  ) => RobotAssetKindContribution | undefined;
  readonly contributionByCatalogId: (
    catalogId: string,
  ) => RobotAssetKindContribution | undefined;
  readonly contributionByExperimentBindingArm: (
    wireArm: string,
  ) => RobotAssetKindContribution | undefined;
};

/** Experiment-capable admission shared by built-in PX4 / Scout / Mecanum. */
export const EXPERIMENT_CAPABLE_ROBOT_ADMISSION: RobotKindAdmission = Object.freeze({
  experimentBinding: true,
  experimentProjection: true,
  simulation: true,
  experimentDisabledReason: '',
  experimentProjectionRefusal: '',
});

/**
 * Fail-closed admission for unknown or inactive (not composed) kinds.
 * Operator copy is intentionally generic — leaf-specific reasons exist only
 * when that leaf contribution is present in the composition.
 */
export const UNKNOWN_ROBOT_KIND_ADMISSION: RobotKindAdmission = Object.freeze({
  experimentBinding: false,
  experimentProjection: false,
  simulation: false,
  experimentDisabledReason:
    'This Robot asset kind is not enabled for Experiments in this product.',
  experimentProjectionRefusal:
    'This Robot asset kind cannot be projected into Experiment runtime state.',
});

const RobotAssetKindCompositionContext = createContext<RobotAssetKindComposition | null>(null);

/** Inject a frozen kind composition for Robot / Experiment / panel hosts. */
export function RobotAssetKindCompositionProvider({
  children,
  composition,
}: {
  children: ReactNode;
  composition: RobotAssetKindComposition;
}) {
  return createElement(
    RobotAssetKindCompositionContext.Provider,
    { value: composition },
    children,
  );
}

/**
 * Resolve the active composition from context. Returns null when no provider
 * is mounted — use `useRobotAssetKindComposition` from robotAssetPublic for
 * the built-in fallback used by product roots that intentionally omit leaves.
 */
export function useOptionalRobotAssetKindComposition(): RobotAssetKindComposition | null {
  return useContext(RobotAssetKindCompositionContext);
}

/** Default empty composition (no kinds active). */
export function emptyRobotAssetKindComposition(): RobotAssetKindComposition {
  return Object.freeze({
    contributions: Object.freeze([] as RobotAssetKindContribution[]),
    wireArms: Object.freeze([] as string[]),
    experimentBindingArms: Object.freeze([] as string[]),
    contributionByProtocolKind: () => undefined,
    contributionByCatalogId: () => undefined,
    contributionByExperimentBindingArm: () => undefined,
  });
}

/**
 * Compose typed Robot asset kind contributions.
 * Duplicate identity tokens, protocol kinds, or catalog ids fail closed.
 */
export function assembleRobotAssetKindComposition(
  ...contributions: readonly RobotAssetKindContribution[]
): RobotAssetKindComposition {
  if (contributions.length === 0) {
    return emptyRobotAssetKindComposition();
  }

  const seenIdentity = new Map<symbol, number>();
  const seenProtocol = new Map<string, number>();
  const seenCatalog = new Map<string, number>();
  const seenWireArm = new Map<string, number>();
  const seenExperimentBindingArm = new Map<string, number>();
  const accepted: RobotAssetKindContribution[] = [];
  const wireArmSet = new Set<string>();

  for (let index = 0; index < contributions.length; index += 1) {
    const contribution = contributions[index]!;
    if (!contribution.identity?.token) {
      throw new Error(`Robot asset kind contribution ${index} has a nil identity.`);
    }
    const priorIdentity = seenIdentity.get(contribution.identity.token);
    if (priorIdentity !== undefined) {
      throw new Error(
        `Robot asset kind contribution identity "${contribution.identity.diagnosticName}" at index ${priorIdentity} is duplicated at index ${index}.`,
      );
    }
    const protocolKind = contribution.wire?.protocolKind?.trim();
    if (!protocolKind || protocolKind !== contribution.wire.protocolKind) {
      throw new Error(`Robot asset kind contribution ${index} has an empty protocol kind.`);
    }
    const catalogId = contribution.catalog?.id?.trim();
    if (!catalogId || catalogId !== contribution.catalog.id) {
      throw new Error(`Robot asset kind contribution ${index} has an empty catalog id.`);
    }
    if (!contribution.catalog.label?.trim()) {
      throw new Error(`Robot asset kind contribution ${index} catalog label is required.`);
    }
    if (!contribution.defaultProfileId?.trim()
      || contribution.defaultProfileId.trim() !== contribution.defaultProfileId) {
      throw new Error(`Robot asset kind contribution ${index} defaultProfileId is required.`);
    }
    if (!contribution.admission) {
      throw new Error(`Robot asset kind contribution ${index} admission is required.`);
    }
    if (!Array.isArray(contribution.wire.wireArms) || contribution.wire.wireArms.length === 0) {
      throw new Error(`Robot asset kind contribution ${index} wireArms must be non-empty.`);
    }
    if (typeof contribution.wire.decode !== 'function'
      || typeof contribution.wire.normalize !== 'function'
      || typeof contribution.wire.validate !== 'function') {
      throw new Error(`Robot asset kind contribution ${index} wire adapter is incomplete.`);
    }
    const priorProtocol = seenProtocol.get(protocolKind);
    if (priorProtocol !== undefined) {
      throw new Error(
        `Robot asset protocol kind "${protocolKind}" is duplicated (indices ${priorProtocol}, ${index}).`,
      );
    }
    const priorCatalog = seenCatalog.get(catalogId);
    if (priorCatalog !== undefined) {
      throw new Error(
        `Robot asset catalog id "${catalogId}" is duplicated (indices ${priorCatalog}, ${index}).`,
      );
    }
    if (contribution.admission.simulation) {
      if (!contribution.simulationModels || contribution.simulationModels.length === 0) {
        throw new Error(
          `Robot asset kind contribution ${index} requires simulationModels when admission.simulation is true.`,
        );
      }
    } else if (contribution.simulationModels && contribution.simulationModels.length > 0) {
      throw new Error(
        `Robot asset kind contribution ${index} must not declare simulationModels when admission.simulation is false.`,
      );
    }
    if (!contribution.admission.simulation && !contribution.inventoryEditor
      && (!contribution.productModels || contribution.productModels.length === 0)) {
      throw new Error(
        `Robot asset kind contribution ${index} requires inventoryEditor or productModels when admission.simulation is false.`,
      );
    }
    if (contribution.productModels) {
      const modelIds = new Set<string>();
      for (const model of contribution.productModels) {
        if (!model.id.trim() || model.id.trim() !== model.id || modelIds.has(model.id)) {
          throw new Error(`Robot asset kind contribution ${index} has a duplicate or non-canonical product model.`);
        }
        if (!model.label.trim() || !model.profileId.trim()) {
          throw new Error(`Robot asset kind contribution ${index} product model metadata is incomplete.`);
        }
        const telemetry = model.telemetry;
        const requiredChannelIds = [
          telemetry?.poseChannelId,
          telemetry?.velocityChannelId,
          telemetry?.speedChannelId,
          telemetry?.linkChannelId,
        ];
        if (telemetry?.instrumentFamily !== 'flight'
          || !['fs150', 'mocap_rotor'].includes(telemetry.presentation)
          || !Array.isArray(telemetry.instrumentChannels)
          || telemetry.instrumentChannels.length === 0
          || !Array.isArray(telemetry.listChannels)
          || telemetry.listChannels.length === 0
          || requiredChannelIds.some((channelId) => !channelId?.trim())) {
          throw new Error(`Robot asset kind contribution ${index} product model telemetry is incomplete.`);
        }
        const declared = new Set([...telemetry.instrumentChannels, ...telemetry.listChannels]);
        const projected = [
          ...requiredChannelIds,
          telemetry.mocapPoseChannelId,
          telemetry.localizationErrorChannelId,
          telemetry.setpointChannelId,
        ].filter((channelId): channelId is string => Boolean(channelId));
        if ([...declared, ...projected].some((channelId) => (
          !channelId.trim() || channelId.trim() !== channelId
        )) || projected.some((channelId) => !declared.has(channelId))) {
          throw new Error(`Robot asset kind contribution ${index} product model telemetry channels are inconsistent.`);
        }
        modelIds.add(model.id);
      }
    }
    if (contribution.experimentBinding) {
      const adapter = contribution.experimentBinding;
      const wireArm = adapter.wireArm?.trim();
      if (!contribution.admission.experimentBinding) {
        throw new Error(
          `Robot asset kind contribution ${index} cannot declare an Experiment binding adapter when admission is disabled.`,
        );
      }
      if (!wireArm || wireArm !== adapter.wireArm) {
        throw new Error(`Robot asset kind contribution ${index} has a non-canonical Experiment binding arm.`);
      }
      const priorBindingArm = seenExperimentBindingArm.get(wireArm);
      if (priorBindingArm !== undefined) {
        throw new Error(
          `Robot Experiment binding arm "${wireArm}" is duplicated (indices ${priorBindingArm}, ${index}).`,
        );
      }
      if (typeof adapter.decode !== 'function'
        || typeof adapter.normalize !== 'function'
        || typeof adapter.validate !== 'function'
        || typeof adapter.authoring?.emptySettings !== 'function'
        || !/^[a-z][a-z0-9-]{0,31}$/.test(adapter.authoring.slotIdPrefix)
        || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(adapter.authoring.namespacePrefix)
        || !Number.isFinite(adapter.authoring.initialPoseZ)) {
        throw new Error(`Robot asset kind contribution ${index} Experiment binding adapter is incomplete.`);
      }
      seenExperimentBindingArm.set(wireArm, index);
    }
    if (contribution.panelProjection) {
      const projection = contribution.panelProjection;
      const channels = [...projection.instrumentChannels, ...projection.listChannels];
      const requiredChannelIds = [
        projection.poseChannelId,
        projection.velocityChannelId,
        projection.speedChannelId,
      ];
      if (!contribution.admission.experimentProjection
        || !projection.platform?.trim()
        || !projection.category?.trim()
        || projection.instrumentChannels.length === 0
        || projection.listChannels.length === 0
        || requiredChannelIds.some((channelId) => !channelId?.trim())
        || channels.some((channelId) => !channelId.trim() || channelId.trim() !== channelId)
        || requiredChannelIds.some((channelId) => !channels.includes(channelId))
        || (projection.linkChannelId !== undefined
          && (!projection.linkChannelId.trim() || !channels.includes(projection.linkChannelId)))
        || typeof projection.healthTone !== 'function'
        || typeof projection.RenderInstrument !== 'function'
        || typeof projection.RenderList !== 'function') {
        throw new Error(`Robot asset kind contribution ${index} panel projection is incomplete.`);
      }
    }

    seenIdentity.set(contribution.identity.token, index);
    seenProtocol.set(protocolKind, index);
    seenCatalog.set(catalogId, index);
    for (const arm of contribution.wire.wireArms) {
      if (!arm.trim() || arm.trim() !== arm) {
        throw new Error(`Robot asset kind contribution ${index} has a non-canonical wire arm.`);
      }
      const priorWireArm = seenWireArm.get(arm);
      if (priorWireArm !== undefined) {
        throw new Error(
          `Robot asset wire arm "${arm}" is duplicated (indices ${priorWireArm}, ${index}).`,
        );
      }
      seenWireArm.set(arm, index);
      wireArmSet.add(arm);
    }
    accepted.push(contribution);
  }

  const byProtocolKind = new Map<string, RobotAssetKindContribution>();
  const byCatalogId = new Map<string, RobotAssetKindContribution>();
  const byExperimentBindingArm = new Map<string, RobotAssetKindContribution>();
  for (const contribution of accepted) {
    byProtocolKind.set(contribution.wire.protocolKind, contribution);
    byCatalogId.set(contribution.catalog.id, contribution);
    if (contribution.experimentBinding) {
      byExperimentBindingArm.set(contribution.experimentBinding.wireArm, contribution);
    }
  }

  return Object.freeze({
    contributions: Object.freeze([...accepted]),
    wireArms: Object.freeze([...wireArmSet]),
    experimentBindingArms: Object.freeze([...byExperimentBindingArm.keys()]),
    contributionByProtocolKind: (protocolKind: string) => byProtocolKind.get(protocolKind),
    contributionByCatalogId: (catalogId: string) => byCatalogId.get(catalogId),
    contributionByExperimentBindingArm: (wireArm: string) => byExperimentBindingArm.get(wireArm),
  });
}

/** Resolve contribution by protocol kind string, or undefined. */
export function robotAssetKindContributionByProtocolKind(
  composition: RobotAssetKindComposition | undefined,
  protocolKind: string,
): RobotAssetKindContribution | undefined {
  if (!protocolKind) return undefined;
  return composition?.contributionByProtocolKind(protocolKind);
}

/** Resolve contribution by catalog / UI kind id, or undefined. */
export function robotAssetKindContributionByCatalogId(
  composition: RobotAssetKindComposition | undefined,
  catalogId: string,
): RobotAssetKindContribution | undefined {
  if (!catalogId) return undefined;
  return composition?.contributionByCatalogId(catalogId);
}

/** All wire payload arms known to the composition (for strict protocol allow-lists). */
export function robotAssetKindCompositionWireArms(
  composition: RobotAssetKindComposition | undefined,
): readonly string[] {
  return composition?.wireArms ?? [];
}

/** Catalog folder entries projected from the composition (stable contribution order). */
export function robotAssetKindCatalogEntries(
  composition: RobotAssetKindComposition,
): readonly RobotAssetKindCatalogEntry[] {
  return composition.contributions.map((contribution) => contribution.catalog);
}

/** Default profile id map keyed by catalog id. */
export function robotAssetKindDefaultProfileIds(
  composition: RobotAssetKindComposition,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const contribution of composition.contributions) {
    result[contribution.catalog.id] = contribution.defaultProfileId;
  }
  return result;
}

/**
 * Resolve admission for a protocol kind. Unknown / inactive kinds fail closed.
 */
export function robotAssetKindAdmissionForProtocolKind(
  composition: RobotAssetKindComposition | undefined,
  protocolKind: string,
): RobotKindAdmission {
  const contribution = robotAssetKindContributionByProtocolKind(composition, protocolKind);
  return contribution?.admission ?? UNKNOWN_ROBOT_KIND_ADMISSION;
}
