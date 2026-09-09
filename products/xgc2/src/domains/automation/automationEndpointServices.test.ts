import { beforeEach,describe,expect,it,vi } from 'vitest';
import { HTTPError,request,waitForTransportRetry } from '../../api/http';
import { workflowRuntimeActions } from '../../shared/workflowRuntimeProtocol';
import type { AutomationDocument } from './automationDefinitionContracts';
import type {
  AutomationActivation,
  AutomationTestListener,
} from './automationTriggerContracts';
import type { AutomationRun } from './automationRunContracts';
import { newAutomationSpec } from './automationSpecModel';
import {
  archiveAutomationDocument,
  archiveAutomationNamespace,
  commitAutomationDocument,
  createAutomationDocument,
  createAutomationNamespace,
  duplicateAutomationDocument,
  getAutomationDocument,
  listAutomationDocuments,
  listAutomationNamespaces,
  restoreAutomationDocument,
  updateAutomationNamespace,
} from './automationDocumentService';
import {
  AutomationStartOutcomeUnknownError,
  getAutomationExecutionRelations,
  getAutomationRunSnapshot,
  listAutomationNodeExecutionSummaries,
  listAutomationNodeInvocations,
  recoverAutomationStartOutcome,
  startAutomationRun,
  stopAutomationRun,
  stopAutomationRunSet,
} from './automationRunService';
import {
  cancelAutomationTestListener,
  createAutomationTestListener,
  enqueueAutomationRunOnce,
  getAutomationActivation,
  getAutomationTestListener,
  listAutomationActivations,
  putAutomationActivation,
  submitAutomationTestEvent,
} from './automationTriggerService';
import {
  listAutomationExecutionHistory,
  listAutomationIngressTransitions,
  retryAutomationExecutionIngress,
} from './automationExecutionHistoryService';
import { listAutomationNodeCatalog } from './automationCatalogService';
import {
  deleteMCPConnection,
  getMCPCatalog,
  listMCPConnections,
  putMCPConnection,
} from './automationMCPService';
import { getAutomationWorldPreview,listAutomationTargetFiles } from './automationTargetService';

vi.mock('../../api/http', () => ({
  HTTPError: class HTTPError<T = unknown> extends Error {
    readonly status: number;
    readonly body: T | undefined;

    constructor(status: number, statusText: string, body?: T) {
      const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? `: ${body.error}` : '';
      super(`${status} ${statusText}${detail}`);
      this.status = status;
      this.body = body;
    }
  },
  request: vi.fn(() => Promise.resolve([])),
  waitForTransportRetry: vi.fn(() => Promise.resolve()),
  withTerminalAuth: vi.fn((options?: Record<string,unknown>) => ({ ...options,auth: 'terminal' })),
}));

describe('automation endpoint services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(request).mockResolvedValue([]);
  });

  it('reads definitions only through typed Automation and configuration APIs', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(documentFixture())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await listAutomationDocuments();
    await listAutomationDocuments({ namespaceId: 'flight/test',includeArchived: true });
    await getAutomationDocument('automation/a');
    await listAutomationNamespaces();
    await listAutomationNodeCatalog('agent/a');

    expect(request).toHaveBeenNthCalledWith(1, '/automations', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(2, '/automations?namespaceId=flight%2Ftest&includeArchived=true', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(3, '/automations/automation%2Fa?branch=main', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(4, '/configuration/domains/automation/namespaces', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(5, '/execution-targets/agent%2Fa/orchestration-node-catalog', { signal: undefined });
    expect(vi.mocked(request).mock.calls.flatMap((call) => call[0])).not.toEqual(expect.arrayContaining([
      expect.stringContaining('/orchestration-folders'),
      expect.stringContaining('/orchestration-entries'),
      expect.stringMatching(/\/orchestrations(?:\/|$)/),
    ]));
  });

  it.each([null,undefined])('rejects a missing collection response instead of normalizing %s to an empty array', async (response) => {
    vi.mocked(request).mockResolvedValueOnce(response);

    await expect(listAutomationDocuments()).rejects.toThrow('Expected an array from /automations');
  });

  it.each([null,undefined])('rejects a missing Run ledger instead of normalizing %s to an empty collection', async (response) => {
    vi.mocked(request).mockResolvedValueOnce(response);

    await expect(listAutomationNodeInvocations('agent/a', 'run/a'))
      .rejects.toThrow('must be an array');
  });

  it('lists paths on the execution host instead of the browser filesystem', async () => {
    vi.mocked(request).mockResolvedValue({ path: '/opt/ros',parent: '/opt',entries: [] });

    await listAutomationTargetFiles('local', '/opt/ros');
    await listAutomationTargetFiles('core:edge', '/opt/ros');
    await listAutomationTargetFiles('agent/a', '/managed/worlds');

    expect(request).toHaveBeenNthCalledWith(1, '/host/files?path=%2Fopt%2Fros', undefined, { auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(2, '/host/files?path=%2Fopt%2Fros', undefined, { targetCoreId: 'edge',auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/managed-hosts/agent%2Fa/fs/list?path=%2Fmanaged%2Fworlds', undefined, { auth: 'terminal' });
  });

  it('can treat an absent picker directory as an empty collection on every target kind', async () => {
    vi.mocked(request).mockResolvedValue({ path: '/cal/phy/camera',parent: '/cal/phy',entries: [] });

    await listAutomationTargetFiles('local', '/cal/phy/camera', { missing:'empty' });
    await listAutomationTargetFiles('core:edge', '/cal/phy/camera', { missing:'empty' });
    await listAutomationTargetFiles('agent/a', '/cal/phy/camera', { missing:'empty' });

    expect(request).toHaveBeenNthCalledWith(1, '/host/files?path=%2Fcal%2Fphy%2Fcamera&missing=empty', undefined, { auth:'terminal' });
    expect(request).toHaveBeenNthCalledWith(2, '/host/files?path=%2Fcal%2Fphy%2Fcamera&missing=empty', undefined, { targetCoreId:'edge',auth:'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/managed-hosts/agent%2Fa/fs/list?path=%2Fcal%2Fphy%2Fcamera&missing=empty', undefined, { auth:'terminal' });
  });

  it('loads world companions relative to the selected execution-host file', async () => {
    vi.mocked(request).mockResolvedValue({ worldPath: '/worlds/empty/empty.world' });

    await getAutomationWorldPreview('local', '/worlds/empty/empty.world');
    await getAutomationWorldPreview('core:edge', '/worlds/empty/empty.world');
    await getAutomationWorldPreview('agent/a', '/managed/worlds/empty/empty.world');

    expect(request).toHaveBeenNthCalledWith(1, '/host/files/world-preview?path=%2Fworlds%2Fempty%2Fempty.world', undefined, { auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(2, '/host/files/world-preview?path=%2Fworlds%2Fempty%2Fempty.world', undefined, { targetCoreId: 'edge',auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/managed-hosts/agent%2Fa/fs/world-preview?path=%2Fmanaged%2Fworlds%2Fempty%2Fempty.world', undefined, { auth: 'terminal' });
  });

  it('rejects malformed target file and world-preview transport responses', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ path: '/opt',parent: '/',entries: null })
      .mockResolvedValueOnce({ worldPath: 'relative.world' });

    await expect(listAutomationTargetFiles('local', '/opt'))
      .rejects.toThrow('entries must be an array');
    await expect(getAutomationWorldPreview('local', '/worlds/relative.world'))
      .rejects.toThrow('must be an absolute execution-host path');
  });

  it('reads strict unified execution history and retries one dead-letter revision', async () => {
    const ingress = triggerIngressFixture({ eventId: 'event/dead',runId: 'run-dead',status: 'dead_letter',revision: 4 });
    vi.mocked(request)
      .mockResolvedValueOnce({
        entries: [{
          id: 'run-dead',runId: 'run-dead',targetId: 'agent/a',automationResourceId: 'automation/a',
          acceptedAt: ingress.receivedAt,phase: 'ingress',ingress,
        }],
        complete: false,unavailableSources: ['agent'],
      })
      .mockResolvedValueOnce({ ingress: { ...ingress,status: 'pending',revision: 5 } });

    const page = await listAutomationExecutionHistory('agent/a', {
      automationResourceId: 'automation/a',ingressStatuses: ['dead_letter'],limit: 25,cursor: 'cursor/1',
    });
    expect(page).toMatchObject({ complete: false,unavailableSources: ['agent'],entries: [{ id: 'run-dead' }] });
    await expect(retryAutomationExecutionIngress('agent/a', 'event/dead', 4))
      .resolves.toMatchObject({ eventId: 'event/dead',runId: 'run-dead',status: 'pending',revision: 5 });
    expect(request).toHaveBeenNthCalledWith(1,
      '/execution-targets/agent%2Fa/automation-execution-history?automationResourceId=automation%2Fa&ingressStatus=dead_letter&limit=25&cursor=cursor%2F1',
      { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(2,
      '/execution-targets/agent%2Fa/automation-trigger-events/event%2Fdead/retry',
      { method: 'POST',body: JSON.stringify({ expectedRevision: 4 }) });
  });

  it('reads the selected ingress transition ledger by Run identity and revision cursor', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      transitions: [{
        eventId: 'event/dead',revision: 5,kind: 'operator_retried',fromStatus: 'dead_letter',toStatus: 'pending',
        attemptCount: 1,actor: 'operator',occurredAt: '2026-07-19T00:00:05Z',
      }],
      nextAfterRevision: 5,complete: true,
    });

    await expect(listAutomationIngressTransitions('agent/a', 'run/dead', {
      automationResourceId: 'automation/a',eventId: 'event/dead',afterRevision: 4,limit: 25,
    })).resolves.toMatchObject({
      transitions: [{ eventId: 'event/dead',revision: 5,kind: 'operator_retried' }],nextAfterRevision: 5,
    });
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/agent%2Fa/automation-execution-history/run%2Fdead/ingress-transitions?automationResourceId=automation%2Fa&afterRevision=4&limit=25',
      { signal: undefined },
    );
  });

  it('parses and preserves trusted node catalog traits', async () => {
    const entry = {
      kind: 'process.run-definition',typeVersion: 1,label: 'Run process',category: 'process',
      traits: ['effect','resource','wait'],parameterSchema: { type: 'object' },outputPorts: null,
      canCompensate: true,
    };
    vi.mocked(request).mockResolvedValueOnce([entry]);

    await expect(listAutomationNodeCatalog('local')).resolves.toEqual([entry]);
  });

  it.each([
    ['missing traits', undefined, 'traits must be a non-empty array'],
    ['invalid traits', ['effect','unknown'], 'traits contains invalid value "unknown"'],
    ['duplicate traits', ['effect','effect'], 'traits contains duplicate value "effect"'],
    ['unsorted traits', ['wait','effect'], 'traits must be sorted lexicographically'],
  ])('rejects catalog entries with %s', async (_case, traits, message) => {
    vi.mocked(request).mockResolvedValueOnce([{
      kind: 'notification',typeVersion: 1,label: 'Notification',category: 'ground-station',
      traits,parameterSchema: { type: 'object' },
    }]);

    await expect(listAutomationNodeCatalog('local')).rejects.toThrow(message);
  });

  it('reads the occurrence ledger through the run invocation endpoint and validates its identity', async () => {
    const invocation = {
      id: 'invocation-1',runId: 'run/a',nodeId: 'worker',kind: 'process.run-definition',
      status: 'running',compensationStatus: 'none',
      activeAttemptId: 'attempt-1',
      createdAt: '2026-07-19T00:00:00Z',updatedAt: '2026-07-19T00:00:01Z',revision: 2,
      attempts: [{
        id: 'attempt-1',runId: 'run/a',invocationId: 'invocation-1',phase: 'execution',number: 1,status: 'running',
        createdAt: '2026-07-19T00:00:00Z',
        startedAt: '2026-07-19T00:00:00Z',updatedAt: '2026-07-19T00:00:01Z',revision: 2,
      }],
      inputRefs: [],outputRefs: [],
    };
    vi.mocked(request).mockResolvedValueOnce([invocation]);

    await expect(listAutomationNodeInvocations('agent/a', 'run/a')).resolves.toEqual([invocation]);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/agent%2Fa/orchestration-runs/run%2Fa/invocations',
      { signal: undefined },
    );

    vi.mocked(request).mockResolvedValueOnce([{ ...invocation,attempts: [{ ...invocation.attempts[0],runId: 'other-run' }] }]);
    await expect(listAutomationNodeInvocations('agent/a', 'run/a')).rejects.toThrow('identity does not match its invocation');
  });

  it('reads strict server-projected node summaries without interpreting runtime receipts', async () => {
    const projectedOutput = {
      definitionId: 'gazebo-robot-descriptions',
      event: 'ready',
      processInstanceId: 'process-1',
      targetId: 'local',
    };
    const summary = {
      runId: 'run/a',nodeId: 'descriptions',kind: 'process.run-definition',status: 'succeeded',
      latestInvocationId: 'invocation-1',occurrenceCount: 1,activeOccurrenceCount: 0,
      completedOccurrenceCount: 1,failedOccurrenceCount: 0,attemptCount: 1,
      output: projectedOutput,startedAt: '2026-07-19T00:00:00Z',finishedAt: '2026-07-19T00:00:01Z',
      updatedAt: '2026-07-19T00:00:01Z',revision: 2,
    };
    vi.mocked(request).mockResolvedValueOnce([summary]);

    await expect(listAutomationNodeExecutionSummaries('agent/a', 'run/a')).resolves.toEqual([summary]);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/agent%2Fa/orchestration-runs/run%2Fa/node-summaries',
      { signal: undefined },
    );

    vi.mocked(request).mockResolvedValueOnce([{ ...summary,internalReceipt: { schemaVersion: 2 } }]);
    await expect(listAutomationNodeExecutionSummaries('agent/a', 'run/a'))
      .rejects.toThrow('contains unknown property "internalReceipt"');

    vi.mocked(request).mockResolvedValueOnce([{ ...summary,runId: 'another-run' }]);
    await expect(listAutomationNodeExecutionSummaries('agent/a', 'run/a'))
      .rejects.toThrow('contains summary for unexpected run "another-run"');
  });

  it('reads the exact target-scoped execution relation graph and rejects another Run', async () => {
    const relations = {
      ...emptyRelations('run/a'),
      childRuns: [{
        id: 'child-link',targetId: 'agent/a',rootRunId: 'run/a',parentRunId: 'run/a',
        parentInvocationId: 'parent-invocation',callNodeId: 'call-child',ordinal: 0,childRunId: 'child-run',
        ownerRunId: 'run/a',childDefinitionId: 'child-definition',childDefinitionVersion: 3,
        childConfigDigest: 'a'.repeat(64),childExecutionPlanDigest: 'b'.repeat(64),
        childRegistryDigest: 'c'.repeat(64),childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',
        relation: 'attached',waitPolicy: 'wait',cancelPolicy: 'cascade',resultPolicy: 'propagate',
        createdAt: '2026-07-19T00:00:00Z',updatedAt: '2026-07-19T00:00:01Z',revision: 1,
      }],
    };
    vi.mocked(request).mockResolvedValueOnce(relations);
    await expect(getAutomationExecutionRelations('agent/a', 'run/a')).resolves.toMatchObject({
      childRuns: [{
        childRunId: 'child-run',
        childConfigDigest: 'a'.repeat(64),
        childExecutionPlanDigest: 'b'.repeat(64),
      }],
    });
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/agent%2Fa/orchestration-runs/run%2Fa/relations',
      { signal: undefined },
    );

    vi.mocked(request).mockResolvedValueOnce(emptyRelations('another-run'));
    await expect(getAutomationExecutionRelations('agent/a', 'run/a')).rejects.toThrow('unexpected Run');
  });

  it('manages MCP connections through the selected execution target', async () => {
    const connection = {
      id: 'aircraft-local',name: 'Aircraft local MCP',transport: 'streamable-http' as const,
      endpoint: 'https://mcp.example.test/stream',enabled: true,revision: 1,
      headerEnvironment: {},
      createdAt: '2026-07-18T00:00:00Z',updatedAt: '2026-07-18T00:00:00Z',
    };
    vi.mocked(request)
      .mockResolvedValueOnce([connection])
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce({ connectionId: connection.id,tools: [],resources: [],resourceTemplates: [],prompts: [] })
      .mockResolvedValueOnce({ id: connection.id });

    await listMCPConnections('agent/a');
    await putMCPConnection('agent/a', connection.id, {
      name: connection.name,transport: 'streamable-http',endpoint: connection.endpoint,
      headerEnvironment: {},enabled: true,expectedRevision: 0,
    });
    await getMCPCatalog('agent/a', connection.id);
    await deleteMCPConnection('agent/a', connection.id, 1);

    const base = '/execution-targets/agent%2Fa/mcp/connections/aircraft-local';
    expect(request).toHaveBeenNthCalledWith(1, '/execution-targets/agent%2Fa/mcp/connections', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(2, base, {
      method: 'PUT',body: JSON.stringify({
        name: connection.name,transport: 'streamable-http',endpoint: connection.endpoint,
        headerEnvironment: {},enabled: true,expectedRevision: 0,
      }),
    });
    expect(request).toHaveBeenNthCalledWith(3, `${base}/catalog`, { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(4, base, { method: 'DELETE',body: JSON.stringify({ expectedRevision: 1 }) });
  });

  it('writes whole typed snapshots with flat mutation metadata and explicit CAS', async () => {
    const create = {
      namespaceId: 'missions',spec: newAutomationSpec('Mission', 'local'),reason: 'Create',
      requestId: 'create-1',idempotencyKey: 'create-1',
    };
    const commit = {
      spec: newAutomationSpec('Mission', 'local'),baseCommitId: 'commit-1',
      expectedBranchRevision: 3,expectedResourceRevision: 5,reason: 'Edit',
      requestId: 'commit-2',idempotencyKey: 'commit-2',
    };
    const state = { expectedRevision: 6,reason: 'Archive',requestId: 'archive-1',idempotencyKey: 'archive-1' };
    vi.mocked(request)
      .mockResolvedValueOnce(documentFixture())
      .mockResolvedValueOnce(documentFixture())
      .mockResolvedValueOnce(documentFixture())
      .mockResolvedValueOnce(documentFixture())
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined);
    await createAutomationDocument(create);
    await commitAutomationDocument('automation/a', 'candidate/test', commit);
    await archiveAutomationDocument('automation/a', state);
    await restoreAutomationDocument('automation/a', { ...state,reason: 'Restore' });
    await createAutomationNamespace({ name: 'Missions',requestId: 'namespace-1',idempotencyKey: 'namespace-1' });
    await updateAutomationNamespace('mission/folder', {
      name: 'Flights',expectedRevision: 2,requestId: 'namespace-2',idempotencyKey: 'namespace-2',
    });
    await archiveAutomationNamespace('mission/folder', {
      expectedRevision: 3,requestId: 'namespace-3',idempotencyKey: 'namespace-3',
    });

    expect(request).toHaveBeenNthCalledWith(1, '/automations', mutation('POST', create));
    expect(request).toHaveBeenNthCalledWith(2, '/automations/automation%2Fa/branches/candidate%2Ftest/commits', mutation('POST', commit));
    expect(request).toHaveBeenNthCalledWith(3, '/automations/automation%2Fa', mutation('DELETE', state));
    expect(request).toHaveBeenNthCalledWith(4, '/automations/automation%2Fa/restore', mutation('POST', { ...state,reason: 'Restore' }));
    expect(request).toHaveBeenNthCalledWith(5, '/configuration/domains/automation/namespaces', mutation('POST', {
      name: 'Missions',requestId: 'namespace-1',idempotencyKey: 'namespace-1',
    }));
    expect(request).toHaveBeenNthCalledWith(6, '/configuration/domains/automation/namespaces/mission%2Ffolder', mutation('PATCH', {
      name: 'Flights',expectedRevision: 2,requestId: 'namespace-2',idempotencyKey: 'namespace-2',
    }));
    expect(request).toHaveBeenNthCalledWith(7, '/configuration/domains/automation/namespaces/mission%2Ffolder', mutation('DELETE', {
      expectedRevision: 3,requestId: 'namespace-3',idempotencyKey: 'namespace-3',
    }));
  });

  it('hydrates required Automation arrays at every HTTP document boundary', async () => {
    const incomplete = {
      ...documentFixture(),
      head: { ...documentFixture().head,tags: null },
      spec: {
        ...documentFixture().spec,
        metadata: { name: 'New Automation' },
        admission: null,
        parameterSchema: {},
        edges: null,
      },
    } as unknown as AutomationDocument;
    vi.mocked(request)
      .mockResolvedValueOnce([incomplete])
      .mockResolvedValueOnce(incomplete);

    const listed = await listAutomationDocuments();
    const created = await createAutomationDocument({
      spec: newAutomationSpec('New Automation'),reason: 'Create',requestId: 'create-empty',idempotencyKey: 'create-empty',
    });

    for (const document of [listed[0],created]) {
      expect(document.head.tags).toEqual([]);
      expect(document.spec.metadata).toEqual({ name: 'New Automation',description: '',tags: [] });
      expect(document.spec.actions[0]!.admission).toEqual({});
      expect(document.spec.actions[0]!.inputSchema.fields).toEqual([]);
      expect(document.spec.edges).toEqual([]);
    }
  });

  it('duplicates the exact Automation commit through the configuration clone API and reloads the typed document', async () => {
    const input = {
      sourceCommitId: 'commit-7',targetNamespaceId: 'flight/test',name: 'Mission copy',expectedRevision: 9,
      reason: 'Duplicate Automation definition',requestId: 'duplicate-1',idempotencyKey: 'duplicate-1',
    };
    vi.mocked(request)
      .mockResolvedValueOnce({ ...documentFixture().head,resourceId: 'automation-copy' })
      .mockResolvedValueOnce(documentFixture());

    await duplicateAutomationDocument('automation/a', input);

    expect(request).toHaveBeenNthCalledWith(1, '/configuration/domains/automation/resources/automation%2Fa/clone', mutation('POST', input));
    expect(request).toHaveBeenNthCalledWith(2, '/automations/automation-copy?branch=main', { signal: undefined });
  });

  it('reads and updates activation state through its target-scoped CAS contract', async () => {
    const activation = activationFixture();
    vi.mocked(request)
      .mockResolvedValueOnce({ activation })
      .mockResolvedValueOnce({ activation,credential: { publicId: 'public-a',token: 'secret-once' } });

    await expect(getAutomationActivation('agent/a', 'automation/a', 'trigger-a')).resolves.toEqual(activation);
    await expect(putAutomationActivation('agent/a', 'automation/a', {
      commitId: 'commit-2',entrypointNodeId: 'trigger-a',desiredState: 'active',expectedRevision: 4,
    })).resolves.toEqual({ activation,credential: { publicId: 'public-a',token: 'secret-once' } });

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/execution-targets/agent%2Fa/automation-activations/automation%2Fa?entrypointNodeId=trigger-a',
      { signal: undefined },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/execution-targets/agent%2Fa/automation-activations/automation%2Fa',
      {
        method: 'PUT',
        body: JSON.stringify({ commitId: 'commit-2',entrypointNodeId: 'trigger-a',desiredState: 'active',expectedRevision: 4 }),
      },
    );
  });

  it('keeps multiple activation rows for the same resource distinct by entrypoint', async () => {
    const webhook = activationFixture();
    const schedule = {
      ...webhook,entrypointNodeId: 'schedule-a',triggerKind: 'trigger.schedule' as const,
      scheduleId: 'schedule-a',publicId: undefined,revision: 2,
    };
    delete schedule.publicId;
    vi.mocked(request).mockResolvedValueOnce([webhook,schedule]);

    await expect(listAutomationActivations('agent/a')).resolves.toEqual([webhook,schedule]);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/agent%2Fa/automation-activations?limit=1000',
      { signal: undefined },
    );
  });

  it('accepts only the strict null lookup envelope and propagates HTTP failures', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ activation: null })
      .mockRejectedValueOnce(new HTTPError(404, 'Not Found'))
      .mockRejectedValueOnce(new HTTPError(500, 'Server Error'));

    await expect(getAutomationActivation('local', 'automation-a', 'start')).resolves.toBeUndefined();
    await expect(getAutomationActivation('local', 'automation-a', 'start')).rejects.toThrow('404 Not Found');
    await expect(getAutomationActivation('local', 'automation-a', 'start')).rejects.toThrow('500 Server Error');
  });

  it('creates, reads and cancels a temporary listener with exact request bodies', async () => {
    const listener = listenerFixture();
    const response = { listener,credential: { publicId: listener.publicId,token: 'test-token' } };
    vi.mocked(request)
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ listener })
      .mockResolvedValueOnce({ listener: { ...listener,status: 'cancelled',revision: 2 } });

    await createAutomationTestListener('local', {
      resourceId: 'automation/a',commitId: 'commit-2',entrypointNodeId: 'trigger-a',ttlSeconds: 90,
    });
    await getAutomationTestListener('local', 'listener/a');
    await cancelAutomationTestListener('local', 'listener/a', 1);

    expect(request).toHaveBeenNthCalledWith(1, '/execution-targets/local/automation-test-listeners', {
      method: 'POST',body: JSON.stringify({
        resourceId: 'automation/a',commitId: 'commit-2',entrypointNodeId: 'trigger-a',ttlSeconds: 90,
      }),
    });
    expect(request).toHaveBeenNthCalledWith(2, '/execution-targets/local/automation-test-listeners/listener%2Fa', { signal: undefined });
    expect(request).toHaveBeenNthCalledWith(3, '/execution-targets/local/automation-test-listeners/listener%2Fa', {
      method: 'DELETE',body: JSON.stringify({ expectedRevision: 1 }),
    });
  });

  it('submits a token-authenticated test payload and queues schedule Run once', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ eventId: 'event-test',runId: 'run-test',status: 'dispatched',created: true })
      .mockResolvedValueOnce({ ingress: triggerIngressFixture({ eventId: 'event-once',runId: 'run-once' }) });

    await expect(submitAutomationTestEvent(
      'public/a',
      { publicId: 'public/a',token: 'secret-test' },
      { message: 'hello' },
      'source-event-a',
    )).resolves.toEqual({ eventId: 'event-test',runId: 'run-test',created: true });
    await expect(enqueueAutomationRunOnce('agent/a', {
      resourceId: 'automation/a',commitId: 'commit-2',entrypointNodeId: 'trigger-a',sourceEventKey: 'run-once-request-a',
    })).resolves.toEqual({ eventId: 'event-once',runId: 'run-once' });

    expect(request).toHaveBeenNthCalledWith(1, '/automation-trigger-ingress/test/public%2Fa', {
      method: 'POST',
      headers: { 'X-XGC-Trigger-Token': 'secret-test','X-XGC-Event-ID': 'source-event-a' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(request).toHaveBeenNthCalledWith(2, '/execution-targets/agent%2Fa/automation-trigger-events/run-once', {
      method: 'POST',
      headers: { 'X-Request-ID': 'run-once-request-a','Idempotency-Key': 'run-once-request-a' },
      body: JSON.stringify({
        resourceId: 'automation/a',commitId: 'commit-2',entrypointNodeId: 'trigger-a',sourceEventKey: 'run-once-request-a',
      }),
    });
  });

  it('starts runs with a ConfigRef and never submits runtime definition identity', async () => {
    const run = runFixture();
    vi.mocked(request).mockResolvedValueOnce({ run,receipt: {} });
    await expect(startAutomationRun('local', {
      actionId: 'inspect',
      automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'candidate' },
      parameters: { altitude: 3 },reason: 'Operator start',requestId: 'run-1',idempotencyKey: 'run-1',
      throughNodeId: 'asset-query',
    })).resolves.toEqual(run);

    const [path,init,options] = vi.mocked(request).mock.calls[0];
    expect(path).toBe('/execution-targets/local/orchestration-runs');
    expect(options).toEqual({ timeoutMs: 60_000 });
    expect(init).toEqual({
      method: 'POST',headers: { 'X-Request-ID': 'run-1','Idempotency-Key': 'run-1' },
      body: JSON.stringify({
        actionId: 'inspect',
        automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'candidate' },
        throughNodeId: 'asset-query',parameters: { altitude: 3 },
        requestId: 'run-1',idempotencyKey: 'run-1',reason: 'Operator start',
      }),
    });
    expect(init?.body).not.toContain('definitionId');
    expect(init?.body).not.toContain('definitionVersion');
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('id');
  });

  it('keeps a safety-critical workflow start alive without changing its canonical request body', async () => {
    const run = runFixture();
    vi.mocked(request).mockResolvedValueOnce({ run,receipt: {} });
    await startAutomationRun('local', {
      actionId: 'stop',
      automationRef: { domain: 'automation',resourceId: 'scout-motion-control',branch: 'main' },
      parameters: { robotIds: ['scout-01'],gear: 1,longitudinal: 0,yaw: 0 },
      reason: 'best-effort Scout STOP',requestId: 'stop-run',idempotencyKey: 'stop-run',keepalive: true,
    });

    const [,init] = vi.mocked(request).mock.calls[0];
    expect(init).toMatchObject({ method: 'POST',keepalive: true });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('keepalive');
  });

  it('recovers an ambiguous accepted start with the same idempotency identity', async () => {
    const run = runFixture();
    vi.mocked(request)
      .mockResolvedValueOnce({ receipt: { status: 'accepted' } })
      .mockResolvedValueOnce({ run,receipt: { status: 'succeeded' } });

    await expect(startAutomationRun('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'main' },
      requestId: 'request-exact',idempotencyKey: 'intent-exact',
    })).resolves.toEqual(run);

    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.mocked(request).mock.calls[1]).toEqual(vi.mocked(request).mock.calls[0]);
  });

  it('reports an unknown outcome after two transport failures without changing the start identity', async () => {
    const run = runFixture();
    vi.mocked(request)
      .mockRejectedValueOnce(new HTTPError(500, 'Internal Server Error', { receipt: { status: 'accepted' } }))
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockRejectedValueOnce(new HTTPError(500, 'Internal Server Error', { receipt: { status: 'succeeded' } }))
      .mockResolvedValueOnce({ run,receipt: { status: 'succeeded' } });

    const start = startAutomationRun('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'main' },
      requestId: 'request-unknown',idempotencyKey: 'intent-unknown',
    });
    const error = await start.catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AutomationStartOutcomeUnknownError);
    expect(error).toMatchObject({
      name: 'AutomationStartOutcomeUnknownError',requestId: 'request-unknown',
      idempotencyKey: 'intent-unknown',recoverable: true,
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.mocked(request).mock.calls[1]).toEqual(vi.mocked(request).mock.calls[0]);
    await expect(recoverAutomationStartOutcome(error as AutomationStartOutcomeUnknownError)).resolves.toEqual(run);
    expect(waitForTransportRetry).toHaveBeenCalledTimes(1);
    expect(waitForTransportRetry).toHaveBeenCalledWith(150);
    expect(request).toHaveBeenCalledTimes(4);
    expect(vi.mocked(request).mock.calls[2]).toEqual(vi.mocked(request).mock.calls[0]);
    expect(vi.mocked(request).mock.calls[3]).toEqual(vi.mocked(request).mock.calls[0]);
  });

  it('surfaces a receiptless server rejection instead of masking it as an unknown outcome', async () => {
    vi.mocked(request).mockRejectedValueOnce(new HTTPError(500, 'Internal Server Error', {
      error: 'resolve automation: configuration: resource not found',
    }));

    const error = await startAutomationRun('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation/rviz',branch: 'main' },
      requestId: 'request-rejected',idempotencyKey: 'intent-rejected',
    }).catch((cause: unknown) => cause);

    expect(error).not.toBeInstanceOf(AutomationStartOutcomeUnknownError);
    expect(error).toMatchObject({ status: 500 });
    expect((error as Error).message).toContain('resolve automation: configuration: resource not found');
    expect(request).toHaveBeenCalledTimes(1);
    expect(waitForTransportRetry).not.toHaveBeenCalled();
  });

  it('reads the Core-owned immutable canvas snapshot for a run', async () => {
    const spec = newAutomationSpec('Pinned mission');
    vi.mocked(request).mockResolvedValueOnce({
      runId: 'run/a',targetId: 'agent/a',sourceKind: 'automation',
      sourceRef: { domain: 'automation',resourceId: 'automation/a',branch: 'main',commitId: 'commit-2',version: 2,digest: 'd'.repeat(64) },
      automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'main',commitId: 'commit-2',version: 2,digest: 'd'.repeat(64) },
      assetContext: { schemaVersion: 1 },
      automationSpec: spec,definitionDigest: 'd'.repeat(64),digest: 'e'.repeat(64),createdAt: '2026-07-14T00:00:00Z',
    });
    const snapshot = await getAutomationRunSnapshot('agent/a', 'run/a');
    expect(request).toHaveBeenCalledWith('/execution-targets/agent%2Fa/orchestration-runs/run%2Fa/snapshot', { signal: undefined });
    expect(snapshot.automationSpec.nodes).toEqual(spec.nodes);
    expect(snapshot.automationSpec.stickyNotes).toEqual([]);
    expect(snapshot.assetContext.schemaVersion).toBe(1);
  });

  it('rejects a snapshot that is not the exact selected Run and target', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      runId: 'another-run',targetId: 'agent/a',automationSpec: newAutomationSpec('Wrong run'),
    });
    await expect(getAutomationRunSnapshot('agent/a', 'run/a')).rejects.toThrow('does not match the selected Run');

    vi.mocked(request).mockResolvedValueOnce({
      runId: 'run/a',targetId: 'another-target',automationSpec: newAutomationSpec('Wrong target'),
    });
    await expect(getAutomationRunSnapshot('agent/a', 'run/a')).rejects.toThrow('does not match the selected Run');

    vi.mocked(request).mockResolvedValueOnce({
      runId: 'run/a',targetId: 'local',automationSpec: newAutomationSpec('Remote Core local target'),
    });
    await expect(getAutomationRunSnapshot('core:edge/core', 'run/a')).resolves.toMatchObject({
      runId: 'run/a',targetId: 'local',
    });
  });

  it('requires one Automation source and optionally freezes an Experiment source ref', async () => {
    await expect(startAutomationRun('local', { actionId:'run' } as never)).rejects.toThrow('automationRef is required');
    expect(request).not.toHaveBeenCalled();

    const run = runFixture();
    vi.mocked(request).mockResolvedValueOnce({ run,receipt: {} });
    await expect(startAutomationRun('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'a',branch: 'main' },
    })).resolves.toEqual(run);
    expect(JSON.parse(String(vi.mocked(request).mock.calls[0]?.[1]?.body))).toEqual(expect.objectContaining({
      automationRef: { domain: 'automation',resourceId: 'a',branch: 'main' },
    }));
    expect(JSON.parse(String(vi.mocked(request).mock.calls[0]?.[1]?.body))).not.toHaveProperty('experimentRef');

    vi.mocked(request).mockResolvedValueOnce({ run: {
      ...run,sourceKind:'experiment',sourceRef:{
        domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'experiment-commit',
        version:1,digest:'e'.repeat(64),
      },automationRef:{ ...run.sourceRef },
    },receipt:{} });
    await startAutomationRun('local', {
      actionId:'run',automationRef:{ domain:'automation',resourceId:'a',branch:'main' },
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    });
    expect(JSON.parse(String(vi.mocked(request).mock.calls[1]?.[1]?.body))).toEqual(expect.objectContaining({
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    }));
    await expect(startAutomationRun('local', {
      actionId:'run',automationRef:{ domain:'automation',resourceId:'a',branch:'main' },
      experimentRef:{ domain:'automation',resourceId:'not-an-experiment',branch:'main' },
    })).rejects.toThrow('requires an Experiment resource reference');
  });

  it('returns the distinct failed run from a resource-conflict response', async () => {
    const run = {
      ...runFixture(),status: 'failed' as const,finishedAt: '2026-07-14T00:00:00Z',
      terminationKind: 'failed' as const,primaryError: 'resource robot:alpha is already claimed',
      reason: 'resource claim failed',
    };
    vi.mocked(request).mockRejectedValueOnce(new HTTPError(409, 'Conflict', {
      error: 'orchestration: exclusive resource is held by another run: robot:alpha',
      run,
    }));

    await expect(startAutomationRun('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation/a',branch: 'main' },
    })).resolves.toEqual(run);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('controls returned runtime facts by revision', async () => {
    const run = runFixture();
    vi.mocked(request).mockResolvedValueOnce({
      run: { ...run,status: 'stopping',terminationKind: 'stopped',revision: 5 },receipt: {},
    });
    await stopAutomationRun('local', run, 'Operator stop');
    const [path,init] = vi.mocked(request).mock.calls[0];
    expect(path).toBe('/execution-targets/local/orchestration-runs/run-1/stop');
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({ expectedRevision: 4,reason: 'Operator stop' }));
  });

  it('submits an exact durable stop-set intent and strictly parses its outcomes', async () => {
    const input = {
      expectedRevision: 4,includeAnchor: false,includeDetached: true,reason: 'Stop ROS children',
      requestId: 'request-stop-set',idempotencyKey: 'intent-stop-set',
    };
    const outcomes = [
      { runId: 'child-1',priorStatus: 'running',accepted: true,alreadyTerminal: false,error: '' },
      { runId: 'event-1',priorStatus: 'dead_letter',accepted: false,alreadyTerminal: true,error: '' },
    ] as const;
    const response = {
      anchorRunId: 'run-1',
      outcomes,
      receipt: {
        commandId: 'command-1',requestId: input.requestId,idempotencyKey: input.idempotencyKey,
        actor: 'operator',risk: 'moderate',target: 'orchestration-run:run-1',action: workflowRuntimeActions.stopSet,
        reason: input.reason,payload: {
          expectedRevision: input.expectedRevision,includeAnchor: input.includeAnchor,
          includeDetached: input.includeDetached,reason: input.reason,
        },
        status: 'succeeded',resultRef: 'orchestration-stop-set:command-1',
        result: { anchorRunId: 'run-1',outcomes },
        createdAt: '2026-07-21T00:00:00Z',completedAt: '2026-07-21T00:00:01Z',
      },
    };
    vi.mocked(request).mockResolvedValueOnce(response);

    await expect(stopAutomationRunSet('agent/a', 'run-1', { ...input,ignored: true } as typeof input)).resolves.toEqual(response);
    const [path,init] = vi.mocked(request).mock.calls[0];
    expect(path).toBe('/execution-targets/agent%2Fa/orchestration-runs/run-1/stop-set');
    expect(init?.headers).toEqual({ 'X-Request-ID': input.requestId,'Idempotency-Key': input.idempotencyKey });
    expect(JSON.parse(String(init?.body))).toEqual(input);

    vi.mocked(request).mockResolvedValueOnce({
      ...response,
      outcomes: [{ ...response.outcomes[0],unknown: 'must fail closed' }],
    });
    await expect(stopAutomationRunSet('local', 'run-1', input)).rejects.toThrow(
      'contains unknown property "unknown"',
    );

    vi.mocked(request).mockResolvedValueOnce({
      ...response,
      outcomes: [{ ...response.outcomes[0],priorStatus: 'dispatched' }],
    });
    await expect(stopAutomationRunSet('local', 'run-1', input)).rejects.toThrow(
      'priorStatus: has unsupported value "dispatched"',
    );

    vi.mocked(request).mockResolvedValueOnce({
      ...response,receipt: { ...response.receipt,target: 'orchestration-run:run-forged' },
    });
    await expect(stopAutomationRunSet('local', 'run-1', input)).rejects.toThrow(
      'is not bound to the completed stop-set command',
    );

    vi.mocked(request).mockResolvedValueOnce({
      ...response,outcomes: [{ ...response.outcomes[0],accepted: false }],
    });
    await expect(stopAutomationRunSet('local', 'run-1', input)).rejects.toThrow(
      'must report an accepted stop, an already-terminal Run, or an error',
    );

    vi.mocked(request).mockResolvedValueOnce({
      ...response,receipt: { ...response.receipt,result: { anchorRunId: 'run-1',outcomes: [] } },
    });
    await expect(stopAutomationRunSet('local', 'run-1', input)).rejects.toThrow(
      'does not match the returned stop-set result',
    );
  });
});

function emptyRelations(runId: string) {
  return { runId,childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],runtimes: [],resources: [] };
}

function mutation<T extends { requestId?: string;idempotencyKey?: string }>(method: 'POST' | 'PATCH' | 'DELETE', body: T) {
  return {
    method,
    headers: { 'X-Request-ID': body.requestId!,'Idempotency-Key': body.idempotencyKey! },
    body: JSON.stringify(body),
  };
}

function runFixture(): AutomationRun {
  return {
    id: 'run-1',targetId: 'local',automationResourceId: 'automation/a',definitionId: 'automation/a',definitionVersion: 2,actionId:'run',actionVersion:1,
    configDigest: 'a'.repeat(64),executionPlanDigest: 'b'.repeat(64),registryDigest: 'c'.repeat(64),
    definitionDigest: 'd'.repeat(64),executionModel: 'orchestration-occurrence-v1',sourceKind: 'automation',
    sourceRef: { domain: 'automation',resourceId: 'automation/a',branch: 'candidate',commitId: 'commit-2',version: 2,digest: 'd'.repeat(64) },
    status: 'running',revision: 4,parameters: { altitude: 3 },rootRunId: 'run-1',depth: 0,correlationId: 'run-1',
    admissionMode: 'limited',admissionScope: 'root',
    admissionKey: 'definition:definition-1',admissionLimit: 1,admissionOnConflict: 'queue',
    acceptedAt: '2026-07-14T00:00:00Z',createdAt: '2026-07-14T00:00:00Z',startedAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
  };
}

function documentFixture(): AutomationDocument {
  const spec = newAutomationSpec('Mission', 'local');
  return {
    head: {
      domain: 'automation',resourceId: 'automation-a',name: 'Mission',description: '',tags: [],mainCommitId: 'commit-1',
      currentVersion: 1,digest: 'a'.repeat(64),revision: 1,createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
    },
    branch: {
      domain: 'automation',resourceId: 'automation-a',name: 'main',headCommitId: 'commit-1',headVersion: 1,revision: 1,
      createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
    },
    spec,
  };
}

function activationFixture(): AutomationActivation {
  return {
    resourceId: 'automation/a',revision: 4,desiredState: 'active',observedState: 'active',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation/a',branch: 'main',commitId: 'commit-2',version: 2,digest: 'a'.repeat(64),
    },
    targetId: 'agent/a',entrypointNodeId: 'trigger-a',triggerKind: 'trigger.webhook',triggerVersion: 1,
    publicId: 'public-a',requiredCapabilities: [],reachability: 'reachable',lastObservedAt: '2026-07-14T00:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
  };
}

function listenerFixture(): AutomationTestListener {
  return {
    id: 'listener/a',resourceId: 'automation/a',revision: 1,status: 'listening',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation/a',branch: 'main',commitId: 'commit-2',version: 2,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'trigger-a',triggerKind: 'trigger.form-submission',triggerVersion: 1,
    oneShot: true,publicId: 'test-public-a',expiresAt: '2026-07-18T12:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
  };
}

function triggerIngressFixture(overrides: Record<string,unknown> = {}) {
  return {
    eventId: 'event-a',revision: 1,status: 'dispatched',sourceKind: 'webhook',
    entrypointNodeId: 'trigger-a',triggerKind: 'trigger.webhook',runId: 'run-a',attemptCount: 1,
    occurredAt: '2026-07-14T00:00:00Z',receivedAt: '2026-07-14T00:00:00Z',
    ...overrides,
  };
}
