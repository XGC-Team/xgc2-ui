import {
  BellRing,Camera,ChartNoAxesColumnIncreasing,CircleHelp,ClipboardClock,ClipboardPenLine,CornerUpLeft,ExternalLink,
  FileCode2,FileTerminal,GitMerge,GitPullRequestArrow,Hourglass,ListFilter,ListRestart,MessageCircleQuestion,
  MousePointerClick,Rocket,Route,ServerCog,ShieldX,Sigma,TerminalSquare,Workflow,
} from 'lucide-react';
import { describe,expect,it } from 'vitest';
import {
  automationNodeContributionFromComposition,
  automationNodeEditorFromComposition,
  automationNodeGraphSemanticsFromComposition,
  automationNodeIconFromComposition,
  automationNodeLibraryPresentationFromComposition,
  composeAutomationNodeWeb,
  defineAutomationNodeContributionIdentity,
  emptyAutomationNodeWebComposition,
  type AutomationNodeWebContribution,
} from './automationNodeWebComposition';
import {
  MEDIA_CAPTURE_SNAPSHOT_KIND,
  MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
  mediaCaptureSnapshotContribution,
  validateMediaCaptureSnapshotCatalogEntry,
} from './media/mediaCaptureSnapshotContribution';
import { buildAutomationNodeLibrary,defaultAutomationNodeLibraryItems } from '../automationNodeLibrary';
import { automationNodeIcon } from '../automationNodeVisuals';
import type { AutomationNodeCatalogEntry } from '../automationDefinitionContracts';
import { callGraphAutomationNodeContributions } from './callGraph/callGraphAutomationNodeContributions';
import {
  coreFlowAutomationNodeContributions,
  coreFlowMergeV2ParameterIsVisible,
} from './coreFlow/coreFlowAutomationNodeContributions';
import { groundStationAutomationNodeContributions } from './groundStation/groundStationAutomationNodeContributions';
import { manualTriggersAutomationNodeContributions } from './manualTriggers/manualTriggersAutomationNodeContributions';
import { processAutomationNodeContributions } from './process/processAutomationNodeContributions';

function contribution(overrides: Partial<AutomationNodeWebContribution> = {}): AutomationNodeWebContribution {
  return {
    identity: defineAutomationNodeContributionIdentity(overrides.kind ?? 'fixture'),
    kind: 'fixture.node',
    typeVersion: 1,
    library: {
      label: 'Fixture',
      description: 'Fixture node',
      category: 'test',
      keywords: ['fixture'],
    },
    visual: { icon: Workflow },
    ...overrides,
  };
}

describe('composeAutomationNodeWeb', () => {
  it('returns empty composition for no contributions', () => {
    const composition = composeAutomationNodeWeb();
    expect(composition.contributions).toEqual([]);
    expect(emptyAutomationNodeWebComposition().contributions).toEqual([]);
  });

  it('keeps composition index private and immutable across empty instances', () => {
    const first = emptyAutomationNodeWebComposition();
    const second = composeAutomationNodeWeb();
    // External surface has no byKind; only contributions is public.
    expect('byKind' in first).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.contributions)).toBe(true);
    // Resolvers stay independent per composition instance.
    expect(automationNodeContributionFromComposition(first, 'poison', 1)).toBeUndefined();
    expect(automationNodeContributionFromComposition(second, 'poison', 1)).toBeUndefined();
  });

  it('rejects duplicate identity and kind/version', () => {
    const shared = defineAutomationNodeContributionIdentity('shared');
    expect(() => composeAutomationNodeWeb(
      contribution({ identity: shared,kind: 'a' }),
      contribution({ identity: shared,kind: 'b' }),
    )).toThrow(/duplicated at index/);

    expect(() => composeAutomationNodeWeb(
      contribution({ kind: 'same.kind',typeVersion: 1 }),
      contribution({ kind: 'same.kind',typeVersion: 1 }),
    )).toThrow(/is duplicated/);
  });

  it('resolves by exact kind@typeVersion and rejects wrong version', () => {
    const v1 = contribution({
      kind: 'versioned.node',
      typeVersion: 1,
      library: { label: 'V1', description: 'version 1', category: 'test', keywords: [] },
    });
    const v2 = contribution({
      kind: 'versioned.node',
      typeVersion: 2,
      library: { label: 'V2', description: 'version 2', category: 'test', keywords: [] },
    });
    const composition = composeAutomationNodeWeb(v1, v2);

    expect(automationNodeLibraryPresentationFromComposition(composition, 'versioned.node', 1)?.label).toBe('V1');
    expect(automationNodeLibraryPresentationFromComposition(composition, 'versioned.node', 2)?.label).toBe('V2');
    expect(automationNodeLibraryPresentationFromComposition(composition, 'versioned.node', 3)).toBeUndefined();
    expect(automationNodeContributionFromComposition(composition, 'versioned.node', 99)).toBeUndefined();
    expect(automationNodeIconFromComposition(composition, 'versioned.node', 1)).toBe(Workflow);
    expect(automationNodeEditorFromComposition(composition, 'versioned.node', 1)).toBeUndefined();
  });

  it('composes explicit Media leaf with library, visual, and editor', () => {
    const composition = composeAutomationNodeWeb(mediaCaptureSnapshotContribution);
    expect(automationNodeLibraryPresentationFromComposition(
      composition, MEDIA_CAPTURE_SNAPSHOT_KIND, MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
    )?.label).toBe('Capture camera snapshot');
    expect(automationNodeLibraryPresentationFromComposition(
      composition, MEDIA_CAPTURE_SNAPSHOT_KIND, MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
    )?.categoryDescription).toMatch(/camera snapshots/);
    expect(automationNodeIconFromComposition(
      composition, MEDIA_CAPTURE_SNAPSHOT_KIND, MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
    )).toBe(Camera);
    expect(automationNodeEditorFromComposition(
      composition, MEDIA_CAPTURE_SNAPSHOT_KIND, MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
    )?.validateCatalogEntry).toBeTypeOf('function');
    // Wrong version must not resolve Media presentation.
    expect(automationNodeLibraryPresentationFromComposition(
      composition, MEDIA_CAPTURE_SNAPSHOT_KIND, 99,
    )).toBeUndefined();

    const catalog: AutomationNodeCatalogEntry[] = [{
      kind: MEDIA_CAPTURE_SNAPSHOT_KIND,
      typeVersion: 1,
      label: 'Capture camera snapshot',
      category: 'media',
      traits: ['effect','wait'],
      parameterSchema: {
        type: 'object',
        properties: {
          sourceId: { type: 'string',enum: ['world'],enumNames: ['World camera'] },
          imageFormat: { type: 'string',enum: ['jpeg','png'] },
          includeRawRGB: { type: 'boolean' },
          label: { type: 'string' },
        },
        required: ['sourceId','imageFormat','includeRawRGB','label'],
      },
    }];
    const items = buildAutomationNodeLibrary(catalog, [], composition);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      runtimeKind: MEDIA_CAPTURE_SNAPSHOT_KIND,
      label: 'Capture camera snapshot',
      category: 'media',
      description: expect.stringContaining('evidence'),
    });
    expect(automationNodeIcon(
      MEDIA_CAPTURE_SNAPSHOT_KIND, 'media', MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION, composition,
    )).toBe(Camera);

    const valid = validateMediaCaptureSnapshotCatalogEntry(catalog[0]!);
    expect(valid).toBeNull();
    const invalid = validateMediaCaptureSnapshotCatalogEntry({
      ...catalog[0]!,
      parameterSchema: { type: 'object',properties: { sourceId: { type: 'string',enum: [] } } },
    });
    expect(invalid).toMatch(/sourceId\.enum must be a non-empty array/);
  });

  it('omits invalid catalog entries from the library (fail closed)', () => {
    const composition = composeAutomationNodeWeb(mediaCaptureSnapshotContribution);
    const catalog: AutomationNodeCatalogEntry[] = [{
      kind: MEDIA_CAPTURE_SNAPSHOT_KIND,
      typeVersion: 1,
      label: 'Capture camera snapshot',
      category: 'media',
      traits: ['effect','wait'],
      parameterSchema: {
        type: 'object',
        properties: {
          sourceId: { type: 'string',enum: [] },
        },
      },
    }];
    const items = buildAutomationNodeLibrary(catalog, [], composition);
    expect(items).toHaveLength(0);
  });

  it('composes the complete exact-version CoreFlow web leaf', () => {
    const composition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);
    expect(composition.contributions.map(({ kind,typeVersion,library }) => ({
      kind,typeVersion,label: library.label,category: library.category,
    }))).toEqual([
      { kind: 'delay',typeVersion: 2,label: 'Delay',category: 'control' },
      { kind: 'condition',typeVersion: 2,label: 'IF',category: 'control' },
      { kind: 'filter',typeVersion: 1,label: 'Filter',category: 'control' },
      { kind: 'merge',typeVersion: 1,label: 'Merge',category: 'control' },
      { kind: 'merge',typeVersion: 2,label: 'Merge',category: 'data' },
      { kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control' },
      { kind: 'stop-and-error',typeVersion: 1,label: 'Stop and Error',category: 'control' },
      { kind: 'collection.tally',typeVersion: 1,label: 'Tally',category: 'data' },
    ]);

    expect(automationNodeIconFromComposition(composition, 'delay', 2)).toBe(Hourglass);
    expect(automationNodeIconFromComposition(composition, 'filter', 1)).toBe(ListFilter);
    expect(automationNodeIconFromComposition(composition, 'merge', 1)).toBe(GitMerge);
    expect(automationNodeIconFromComposition(composition, 'merge', 2)).toBe(GitMerge);
    expect(automationNodeIconFromComposition(composition, 'switch', 1)).toBe(Route);
    expect(automationNodeIconFromComposition(composition, 'stop-and-error', 1)).toBe(ShieldX);
    expect(automationNodeIconFromComposition(composition, 'collection.tally', 1)).toBe(Sigma);
    const conditionEditor = automationNodeEditorFromComposition(composition, 'condition', 2);
    expect(conditionEditor?.renderParameters).toBeTypeOf('function');
    expect(conditionEditor?.showRunParameters?.({
      id: 'condition',kind: 'condition',typeVersion: 2,displayName: 'IF',parameters: { source: 'run' },
      retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
    })).toBe(true);
    expect(automationNodeEditorFromComposition(composition, 'filter', 1)?.showRunParameters).toBeTypeOf('function');
    expect(automationNodeEditorFromComposition(composition, 'switch', 1)?.showRunParameters).toBeTypeOf('function');
    const mergeV2Editor = automationNodeEditorFromComposition(composition, 'merge', 2);
    expect(mergeV2Editor?.isParameterVisible).toBe(coreFlowMergeV2ParameterIsVisible);
    expect(mergeV2Editor?.parameterOptions?.({
      node: {
        id: 'merge',kind: 'merge',typeVersion: 2,displayName: 'Merge',parameters: {},
        retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
      },
      inputSources: [{ id: 'left',label: 'Left source' },{ id: 'right',label: 'Right source' }],
      baseOptions: { inherited: ['base'] },
    })).toEqual({
      inherited: ['base'],
      selectedInput: [{ value: 'left',label: 'Left source' },{ value: 'right',label: 'Right source' }],
    });
    expect(automationNodeEditorFromComposition(composition, 'merge', 1)).toBeUndefined();

    expect(automationNodeGraphSemanticsFromComposition(
      composition,'stop-and-error',1,
    )?.terminalLabel).toBe('Stop and Error');
    expect(automationNodeGraphSemanticsFromComposition(
      composition,'condition',2,
    )?.calledSuccessRoutes?.({
      id: 'condition',kind: 'condition',typeVersion: 2,displayName: 'IF',parameters: {},
      retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
    })).toEqual(['true','false']);
    expect(automationNodeGraphSemanticsFromComposition(
      composition,'filter',1,
    )?.calledSuccessRoutes?.({
      id: 'filter',kind: 'filter',typeVersion: 1,displayName: 'Filter',parameters: {},
      retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
    })).toEqual(['kept','']);
    expect(automationNodeGraphSemanticsFromComposition(
      composition,'switch',1,
    )?.calledSuccessRoutes?.({
      id: 'switch',kind: 'switch',typeVersion: 1,displayName: 'Switch',parameters: { rules: [{},{}] },
      retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
    })).toEqual(['case-1','case-2','fallback']);
    expect(automationNodeGraphSemanticsFromComposition(
      composition,'stop-and-error',2,
    )).toBeUndefined();

    for (const [kind,version] of [
      ['delay',1],['condition',1],['filter',2],['merge',3],['switch',2],
      ['stop-and-error',2],['collection.tally',2],
    ] as const) {
      expect(automationNodeContributionFromComposition(composition, kind, version)).toBeUndefined();
    }
  });

  it('composes exclusive ManualTriggers, Parameter, Process, GroundStation, and CallGraph leaves', () => {
    const composition = composeAutomationNodeWeb(
      ...manualTriggersAutomationNodeContributions,
      ...processAutomationNodeContributions,
      ...groundStationAutomationNodeContributions,
      ...callGraphAutomationNodeContributions,
    );

    expect(automationNodeIconFromComposition(composition, 'trigger.manual', 2)).toBe(MousePointerClick);
    expect(automationNodeLibraryPresentationFromComposition(composition, 'trigger.manual', 2)?.description)
      .toMatch(/on demand/i);
    expect(automationNodeContributionFromComposition(composition, 'trigger.manual', 1)).toBeUndefined();

    expect(automationNodeIconFromComposition(composition, 'process.run-definition', 1)).toBe(ServerCog);
    expect(automationNodeLibraryPresentationFromComposition(composition, 'process.run-bash', 1)?.label)
      .toBe('Run Bash command');
    expect(automationNodeLibraryPresentationFromComposition(composition, 'ros1.run', 2)?.label)
      .toBe('ROS1 Run / Launch');
    expect(automationNodeIconFromComposition(composition, 'ros1.run', 2)).toBe(TerminalSquare);
    expect(automationNodeIconFromComposition(composition, 'ros2.run', 1)).toBe(TerminalSquare);
    expect(automationNodeIconFromComposition(composition, 'ros2.launch', 1)).toBe(Rocket);
    expect(automationNodeIconFromComposition(composition, 'process.run-shell-script', 1)).toBe(FileTerminal);
    expect(automationNodeIconFromComposition(composition, 'process.run-python-script', 1)).toBe(FileCode2);
    expect(automationNodeContributionFromComposition(composition, 'ros1.run', 1)).toBeUndefined();
    expect(automationNodeContributionFromComposition(composition, 'ros1.launch', 1)).toBeUndefined();

    const ros1Catalog: AutomationNodeCatalogEntry[] = [{
      kind: 'ros1.run',typeVersion: 2,label: 'ROS1 Run / Launch',category: 'ros1',traits: ['effect','wait'],
      parameterSchema: { type: 'object',properties: {
        setupBash: { type: 'string',default: '/opt/ros/noetic/setup.bash' },
        command: { type: 'string',default: '' },
      } },
    }];
    const ros1Library = buildAutomationNodeLibrary(ros1Catalog, [], composition);
    expect(ros1Library.map(({ runtimeKind,runtimeTypeVersion }) => ({ runtimeKind,runtimeTypeVersion })))
      .toEqual([{ runtimeKind: 'ros1.run',runtimeTypeVersion: 2 }]);
    expect(defaultAutomationNodeLibraryItems(ros1Library).map((item) => item.runtimeKind))
      .toEqual(['ros1.run']);
    expect(automationNodeEditorFromComposition(composition, 'ros1.run', 2)?.validateParameters)
      .toBeTypeOf('function');
    expect(automationNodeGraphSemanticsFromComposition(
      composition, 'human.wait-confirmation', 1,
    )?.calledSuccessRoutes?.({
      id: 'wait',kind: 'human.wait-confirmation',typeVersion: 1,displayName: 'Wait',
      parameters: {},retry: { maxAttempts: 1,initialBackoff: 1,maxBackoff: 1 },
    })).toEqual(['confirmed', 'canceled', 'timed-out']);
    expect(automationNodeGraphSemanticsFromComposition(
      composition, 'human.wait-form', 1,
    )?.calledSuccessRoutes?.({
      id: 'wait-form',kind: 'human.wait-form',typeVersion: 1,displayName: 'Wait form',
      parameters: {},retry: { maxAttempts: 1,initialBackoff: 1,maxBackoff: 1 },
    })).toEqual(['submitted', 'canceled', 'timed-out']);

    for (const [kind,version,Icon] of [
      ['gcs.request-confirmation',1,CircleHelp],
      ['human.wait-confirmation',1,MessageCircleQuestion],
      ['gcs.request-form',1,ClipboardPenLine],
      ['human.wait-form',1,ClipboardClock],
      ['notification',2,BellRing],
      ['gcs.status-card',1,ChartNoAxesColumnIncreasing],
      ['gcs.offer-context',1,ExternalLink],
      ['trigger.automation-call',1,GitPullRequestArrow],
      ['automation.call',4,Workflow],
      ['automation.call-each',1,ListRestart],
    ] as const) {
      expect(automationNodeIconFromComposition(composition, kind, version), kind).toBe(Icon);
    }

    expect(automationNodeIconFromComposition(composition, 'automation.return', 1)).toBe(CornerUpLeft);
    expect(automationNodeGraphSemanticsFromComposition(
      composition, 'automation.return', 1,
    )?.terminalLabel).toBe('Return');
    expect(automationNodeLibraryPresentationFromComposition(
      composition, 'automation.call', 4,
    )?.label).toBe('Call Automation');
    expect(automationNodeContributionFromComposition(composition, 'automation.call', 3)).toBeUndefined();
  });
});
