// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { beforeEach,test,vi } from 'vitest';
import { getAutomationRun,stopAutomationRunSet,type AutomationRun,type AutomationStopRunSetResponse } from '../automation/automationPublic';
import { stopExperimentRunnerRoot,SYSTEM_EXPERIMENT_RUNNER } from './experimentWorkflowService';

vi.mock('../automation/automationPublic',() => ({
  getAutomationRun:vi.fn(),stopAutomationRunSet:vi.fn(),startAutomationRun:vi.fn(),
  isAutomationRunRevisionConflict:(cause:unknown) => cause instanceof Error && cause.message==='revision conflict',
}));
const control={ id:'panel-child',status:'waiting' as const,revision:4 };
function refreshed(overrides:Partial<AutomationRun>={}):AutomationRun {
  return { ...control,targetId:'local',revision:5,automationResourceId:'worker',actionId:'run',sourceKind:'automation',parentRunId:'total',rootRunId:'total',...overrides } as AutomationRun;
}
function response(error?:string):AutomationStopRunSetResponse {
  return { outcomes:[{ runId:control.id,priorStatus:'waiting',accepted:!error,alreadyTerminal:false,...(error ? { error } : {}) }] } as AutomationStopRunSetResponse;
}
beforeEach(() => { vi.mocked(getAutomationRun).mockReset();vi.mocked(stopAutomationRunSet).mockReset(); });

test('ordinary Panel child remains the exact stop-set anchor after a CAS conflict', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValueOnce(new Error('revision conflict')).mockResolvedValueOnce(response());
  vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed());
  await stopExperimentRunnerRoot('local',control,'Panel Stop');
  const calls=vi.mocked(stopAutomationRunSet).mock.calls;
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(call => [call[0],call[1],call[2].expectedRevision]),[['local','panel-child',4],['local','panel-child',5]]);
  assert.ok(calls.every(call => call[2].includeAnchor && call[2].includeDetached));
  assert.notEqual(calls[0]![2].idempotencyKey,calls[1]![2].idempotencyKey);
});

test('a refreshed System root cannot substitute for the requested child', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValueOnce(new Error('revision conflict'));
  vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed({ id:'total',parentRunId:undefined,rootRunId:'total',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment',branch:'main',commitId:'commit',version:1,digest:'d'.repeat(64) } }));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/identity/);
  assert.equal(vi.mocked(stopAutomationRunSet).mock.calls.length,1);
});

test('cross-target rereads fail closed without issuing a second Stop', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValueOnce(new Error('revision conflict'));
  vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed({ targetId:'remote' }));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/identity/);
  assert.equal(vi.mocked(stopAutomationRunSet).mock.calls.length,1);
});

test('stop-set member errors are not treated as successful Panel Stop', async () => {
  vi.mocked(stopAutomationRunSet).mockResolvedValueOnce(response('provider cleanup refused'));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/panel-child: provider cleanup refused/);
  assert.equal(vi.mocked(stopAutomationRunSet).mock.calls.length,1);
});

test('version conflicts are bounded to three attempts without widening the anchor', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValue(new Error('revision conflict'));
  vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed()).mockResolvedValueOnce(refreshed({ revision:6 }));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/revision conflict/);
  assert.equal(vi.mocked(stopAutomationRunSet).mock.calls.length,3);
  assert.equal(vi.mocked(getAutomationRun).mock.calls.length,2);
});

test('HTTP not-found remains an error, not cleanup confirmation', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValueOnce(new Error('HTTP 404'));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/HTTP 404/);
  assert.equal(vi.mocked(getAutomationRun).mock.calls.length,0);
});

test('an accepted stopping receipt is returned unchanged, not promoted to terminal truth', async () => {
  const accepted=response();
  vi.mocked(stopAutomationRunSet).mockResolvedValueOnce(accepted);
  assert.equal(await stopExperimentRunnerRoot('local',control,'Panel Stop'),accepted);
});


test('a same-revision conflicting status cannot become a retry anchor', async () => {
  vi.mocked(stopAutomationRunSet).mockRejectedValueOnce(new Error('revision conflict'));
  vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed({ revision:control.revision,status:'running' }));
  await assert.rejects(stopExperimentRunnerRoot('local',control,'Panel Stop'),/revision/);
  assert.equal(vi.mocked(stopAutomationRunSet).mock.calls.length,1);
});
