import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AutomationParameterOptions } from '../AutomationParameterControls';
import type {
  AutomationNode,
  AutomationNodeCatalogEntry,
} from '../automationDefinitionContracts';

/**
 * Opaque process-local identity for one Automation node web contribution.
 * Pointer equality (token identity) is the only meaningful operation.
 */
export type AutomationNodeContributionIdentity = {
  readonly token: symbol;
  readonly diagnosticName: string;
};

export function defineAutomationNodeContributionIdentity(
  diagnosticName: string,
): AutomationNodeContributionIdentity {
  return Object.freeze({ token: Symbol(diagnosticName), diagnosticName });
}

/** Library presentation owned by a leaf contribution. */
export type AutomationNodeLibraryPresentation = {
  readonly label: string;
  readonly description: string;
  readonly category: string;
  /** Omit a leaf-owned item from the default authoring library. */
  readonly hiddenFromDefaultLibrary?: boolean;
  /** Leaf-owned category header copy projected by the drawer. */
  readonly categoryDescription?: string;
  readonly keywords: readonly string[];
};

/** Graph / drawer visual owned by a leaf contribution. */
export type AutomationNodeVisualContribution = {
  readonly icon: LucideIcon;
};

/** Minimal host surface available to a leaf-owned parameter editor. */
export type AutomationNodeParameterEditorProps = {
  readonly node: AutomationNode;
  readonly readOnly: boolean;
  readonly onChange: (patch: Partial<AutomationNode>) => void;
};

export type AutomationNodeParameterOptionsContext = {
  readonly node: AutomationNode;
  readonly inputSources: readonly { readonly id: string;readonly label: string }[];
  readonly baseOptions?: AutomationParameterOptions;
};

/**
 * Optional exact-version editor adapter owned by a leaf. Generic schema
 * controls remain in the Automation shell; only kind-specific rendering and
 * visibility policy belongs here.
 */
export type AutomationNodeEditorAdapter = {
  readonly validateCatalogEntry?: (entry: AutomationNodeCatalogEntry) => string | null;
  readonly validateParameters?: (node: AutomationNode) => string | null;
  readonly renderParameters?: (props: AutomationNodeParameterEditorProps) => ReactNode;
  readonly isParameterVisible?: (node: AutomationNode, name: string) => boolean;
  readonly parameterOptions?: (context: AutomationNodeParameterOptionsContext) => AutomationParameterOptions | undefined;
  readonly showRunParameters?: (node: AutomationNode) => boolean;
};

/**
 * Exact-version graph validation semantics owned by an optional node leaf.
 * The generic Automation shell must not infer these rules from kind strings:
 * a disabled leaf and an older pinned version intentionally resolve no rule.
 */
export type AutomationNodeGraphSemantics = {
  /** A terminal node rejects every outgoing connection and closes called flows. */
  readonly terminalLabel?: string;
  /** Successful routes which must each continue toward Return or a terminal. */
  readonly calledSuccessRoutes?: (node: AutomationNode) => readonly string[];
};

/** One typed Automation node web contribution. */
export type AutomationNodeWebContribution = {
  readonly identity: AutomationNodeContributionIdentity;
  readonly kind: string;
  readonly typeVersion: number;
  readonly library: AutomationNodeLibraryPresentation;
  readonly visual: AutomationNodeVisualContribution;
  readonly editor?: AutomationNodeEditorAdapter;
  readonly graphSemantics?: AutomationNodeGraphSemantics;
};

/**
 * Prevalidated, default-empty Automation node web composition.
 * The internal exact-identity index is closure-private via WeakMap and is never
 * exposed; callers resolve only through the versioned helpers below.
 */
export type AutomationNodeWebComposition = {
  readonly contributions: readonly AutomationNodeWebContribution[];
};

const compositionIndex = new WeakMap<
  AutomationNodeWebComposition,
  ReadonlyMap<string, AutomationNodeWebContribution>
>();

function identityKey(kind: string, typeVersion: number): string {
  return `${kind}@${typeVersion}`;
}

function indexFor(
  composition: AutomationNodeWebComposition | undefined,
): ReadonlyMap<string, AutomationNodeWebContribution> | undefined {
  if (!composition) return undefined;
  return compositionIndex.get(composition);
}

/** Default empty composition used when no product leaf is composed. */
export function emptyAutomationNodeWebComposition(): AutomationNodeWebComposition {
  const composition = Object.freeze({
    contributions: Object.freeze([] as AutomationNodeWebContribution[]),
  });
  compositionIndex.set(composition, new Map());
  return composition;
}

/**
 * Compose typed Automation node web contributions.
 * Duplicate identity tokens or kind/version pairs fail closed before any
 * host wiring can observe partial state.
 */
export function composeAutomationNodeWeb(
  ...contributions: readonly AutomationNodeWebContribution[]
): AutomationNodeWebComposition {
  if (contributions.length === 0) {
    return emptyAutomationNodeWebComposition();
  }

  const seenIdentity = new Map<symbol, number>();
  const seenKind = new Map<string, number>();
  const accepted: AutomationNodeWebContribution[] = [];

  for (let index = 0; index < contributions.length; index += 1) {
    const contribution = contributions[index]!;
    if (!contribution.identity?.token) {
      throw new Error(`Automation node contribution ${index} has a nil identity.`);
    }
    const priorIdentity = seenIdentity.get(contribution.identity.token);
    if (priorIdentity !== undefined) {
      throw new Error(
        `Automation node contribution identity "${contribution.identity.diagnosticName}" at index ${priorIdentity} is duplicated at index ${index}.`,
      );
    }
    const kind = contribution.kind?.trim();
    if (!kind || kind !== contribution.kind) {
      throw new Error(`Automation node contribution ${index} has an empty or whitespace kind.`);
    }
    if (!Number.isInteger(contribution.typeVersion) || contribution.typeVersion < 1) {
      throw new Error(`Automation node contribution ${index} has invalid typeVersion ${contribution.typeVersion}.`);
    }
    if (!contribution.library?.label?.trim() || !contribution.library.description?.trim()
      || !contribution.library.category?.trim()) {
      throw new Error(`Automation node contribution ${index} library presentation is incomplete.`);
    }
    if (!contribution.visual?.icon) {
      throw new Error(`Automation node contribution ${index} visual icon is required.`);
    }
    const kindKey = identityKey(kind, contribution.typeVersion);
    const priorKind = seenKind.get(kindKey);
    if (priorKind !== undefined) {
      throw new Error(
        `Automation node kind "${kind}" version ${contribution.typeVersion} is duplicated (indices ${priorKind}, ${index}).`,
      );
    }
    seenIdentity.set(contribution.identity.token, index);
    seenKind.set(kindKey, index);
    accepted.push(contribution);
  }

  // Exact kind@typeVersion index kept closure-private; never exposed on the
  // frozen composition object so callers cannot mutate or kind-only-lookup.
  const byIdentity = new Map<string, AutomationNodeWebContribution>();
  for (const contribution of accepted) {
    byIdentity.set(identityKey(contribution.kind, contribution.typeVersion), contribution);
  }

  const composition = Object.freeze({
    contributions: Object.freeze([...accepted]),
  });
  compositionIndex.set(composition, byIdentity);
  return composition;
}

/** Resolve the exact kind@typeVersion contribution, or undefined. */
export function automationNodeContributionFromComposition(
  composition: AutomationNodeWebComposition | undefined,
  kind: string,
  typeVersion: number,
): AutomationNodeWebContribution | undefined {
  if (!kind || !Number.isInteger(typeVersion) || typeVersion < 1) return undefined;
  return indexFor(composition)?.get(identityKey(kind, typeVersion));
}

/** Resolve library presentation for an exact catalog kind+version. */
export function automationNodeLibraryPresentationFromComposition(
  composition: AutomationNodeWebComposition | undefined,
  kind: string,
  typeVersion: number,
): AutomationNodeLibraryPresentation | undefined {
  return automationNodeContributionFromComposition(composition, kind, typeVersion)?.library;
}

/** Resolve a visual icon for an exact catalog kind+version. */
export function automationNodeIconFromComposition(
  composition: AutomationNodeWebComposition | undefined,
  kind: string,
  typeVersion: number,
): LucideIcon | undefined {
  return automationNodeContributionFromComposition(composition, kind, typeVersion)?.visual.icon;
}

/** Resolve an editor adapter for an exact catalog kind+version. */
export function automationNodeEditorFromComposition(
  composition: AutomationNodeWebComposition | undefined,
  kind: string,
  typeVersion: number,
): AutomationNodeEditorAdapter | undefined {
  return automationNodeContributionFromComposition(composition, kind, typeVersion)?.editor;
}

/** Resolve graph validation semantics for an exact persisted kind+version. */
export function automationNodeGraphSemanticsFromComposition(
  composition: AutomationNodeWebComposition | undefined,
  kind: string,
  typeVersion: number,
): AutomationNodeGraphSemantics | undefined {
  return automationNodeContributionFromComposition(composition, kind, typeVersion)?.graphSemantics;
}
