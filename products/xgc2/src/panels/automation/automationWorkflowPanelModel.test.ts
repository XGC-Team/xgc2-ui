// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { newAutomationSpec,type AutomationDocument,type AutomationRun,type AutomationRunDetail } from '../../domains/automation/automationPublic';
import {
  activeAutomationRunsForDocument,
  automationRunBelongsToExperiment,
  automationRunProgress,
  automationRunsForDocument,
  automationWorkflowAuditView,
  automationWorkflowControlSwitcherView,
  automationWorkflowControlView,
  automationWorkflowFollowLogs,
  automationWorkflowHistoryLimit,
  automationWorkflowHistoryEntries,
  automationActionButtonLabel,
  automationWorkflowPanelRuntime,
  configuredAutomationResourceIds,
  validateAutomationWorkflowAuditOptions,
  validateAutomationWorkflowControlOptions,
} from './automationWorkflowPanelModel';

describe('automationWorkflowPanelModel', () => {
  it('normalizes persisted panel options without accepting arbitrary values', () => {
    expect(configuredAutomationResourceIds({ automationResourceIds: [' mission-a ',42,'mission-a',''] })).toEqual(['mission-a']);
    expect(configuredAutomationResourceIds({ automationResourceIds: 'mission-a' })).toEqual([]);
    expect(automationWorkflowControlView('whiteboard')).toBe('whiteboard');
    expect(automationWorkflowControlView('live')).toBe('controls');
    expect(automationWorkflowControlView('history')).toBe('history');
    expect(automationWorkflowControlView('logs')).toBe('logs');
    expect(automationWorkflowControlSwitcherView('whiteboard')).toBe('whiteboard');
    expect(automationWorkflowControlSwitcherView('history')).toBe('controls');
    expect(automationWorkflowControlSwitcherView('logs')).toBe('controls');
    expect(automationWorkflowControlView('unknown')).toBe('controls');
    expect(automationWorkflowAuditView('logs')).toBe('logs');
    expect(automationWorkflowAuditView('whiteboard')).toBe('history');
    expect(automationWorkflowAuditView('unknown')).toBe('history');
    expect(automationWorkflowHistoryLimit(100)).toBe(50);
    expect(automationWorkflowHistoryLimit(2.8)).toBe(2);
    expect(automationWorkflowHistoryLimit('10')).toBe(10);
    expect(automationWorkflowFollowLogs(false)).toBe(false);
    expect(automationWorkflowFollowLogs(undefined)).toBe(true);
  });

  it('uses short algorithm tile names when the experiment already supplies context',() => {
    expect(automationActionButtonLabel({
      id:'build',label:'build',action:{ label:'Build paper-leader' },
    })).toBe('Build');
    expect(automationActionButtonLabel({
      id:'build',action:{ label:'Build SCE1' },
    })).toBe('Build');
    expect(automationActionButtonLabel({
      id:'replay-3d',action:{ label:'Replay 3D visualization' },
    })).toBe('Replay 3D');
    expect(automationActionButtonLabel({
      id:'replay-image',action:{ label:'Replay augmented view' },
    })).toBe('Replay image');
    expect(automationActionButtonLabel({
      id:'replay-plot',action:{ label:'Plot bag' },
    })).toBe('Plot bag');
    expect(automationActionButtonLabel({
      id:'custom1',action:{ label:'Formation' },
    })).toBe('Algorithm');
    expect(automationActionButtonLabel({
      id:'custom1',action:{ label:'Custom1' },
    })).toBe('Algorithm');
  });

  it('selects one Automation resource across branches in newest-first order', () => {
    const document = documentFixture();
    const older = runFixture({ id: 'older',createdAt: '2026-07-14T08:00:00Z',status: 'succeeded' });
    const active = runFixture({ id: 'active',createdAt: '2026-07-14T09:00:00Z',status: 'running' });
    const candidateBranch = runFixture({ id: 'candidate',createdAt: '2026-07-14T10:00:00Z',branch: 'candidate',status: 'queued' });
    const otherAutomation = runFixture({
      id: 'other',automationResourceId: 'mission-b',createdAt: '2026-07-14T11:00:00Z',
      sourceRef: { ...older.sourceRef,resourceId: 'mission-b' },
    });
    expect(automationRunsForDocument(document, [older,candidateBranch,otherAutomation,active], 2)).toEqual([candidateBranch,active]);
    expect(activeAutomationRunsForDocument(document, [older,candidateBranch,active])).toEqual([active,candidateBranch]);
  });

  it('keeps an experiment-sourced run visible after its source Experiment is unavailable', () => {
    const document = documentFixture();
    const direct = runFixture({ id: 'direct',createdAt: '2026-07-14T08:00:00Z' });
    const experimentRun = runFixture({
      id: 'experiment-run',createdAt: '2026-07-14T09:00:00Z',status: 'waiting',sourceKind: 'experiment',
      sourceRef: { domain: 'experiment',resourceId: 'deleted-experiment',branch: 'main',commitId: 'experiment-commit',version: 1,digest: 'e'.repeat(64) },
      automationRef: { domain: 'automation',resourceId: document.head.resourceId,branch: 'main',commitId: 'commit-a',version: 1,digest: 'a'.repeat(64) },
    });

    expect(automationRunsForDocument(document, [direct,experimentRun], 10)).toEqual([experimentRun,direct]);
    expect(activeAutomationRunsForDocument(document, [direct,experimentRun])).toEqual([experimentRun]);
    expect(automationRunBelongsToExperiment(experimentRun, 'deleted-experiment')).toBe(true);
    expect(automationRunBelongsToExperiment(experimentRun, 'another-experiment')).toBe(false);
    expect(automationRunBelongsToExperiment(direct, 'deleted-experiment')).toBe(false);
  });

  it('summarizes occurrence progress without treating durable waits as ready', () => {
    const detail: AutomationRunDetail = {
      invocations: [],
      nodeSummaries: [
        node('done', 'process.run-definition', 'succeeded'),
        node('watch', 'process.run-definition', 'waiting'),
        node('failed', 'robot.ensure-connected', 'failed'),
        node('pending', 'notification', 'pending'),
      ],
      loading: false,error: '',
    };
    expect(automationRunProgress(detail)).toEqual({ total: 4,completed: 1,failed: 1,active: 1,ready: 1,percent: 25 });
    expect(automationRunProgress({
      ...detail,
      nodeSummaries: [
        node('first', 'process.run-definition', 'waiting'),
        node('second', 'robot.ensure-connected', 'compensated'),
      ],
    })).toEqual({ total: 2,completed: 1,failed: 0,active: 1,ready: 1,percent: 50 });
    expect(automationRunProgress({
      ...detail,
      nodeSummaries: [
        node('trigger', 'trigger.manual', 'succeeded'),
        node('service', 'process.run-definition', 'waiting'),
      ],
    })).toEqual({ total: 1,completed: 0,failed: 0,active: 1,ready: 0,percent: 0 });
    // ROS Control: triggers collapse to one unit so click → first bar step only once.
    expect(automationRunProgress({
      ...detail,
      nodeSummaries: [
        node('manual', 'trigger.manual', 'succeeded'),
        node('called', 'trigger.automation-call', 'succeeded'),
        node('service', 'process.run-definition', 'waiting'),
      ],
    }, [
      { id: 'manual',kind: 'trigger.manual' },
      { id: 'called',kind: 'trigger.automation-call' },
      { id: 'service',kind: 'process.run-definition' },
    ], { includeTriggers: true })).toEqual({
      total: 2,completed: 1,failed: 0,active: 1,ready: 1,percent: 50,
    });
    expect(automationRunProgress()).toEqual({ total: 0,completed: 0,failed: 0,active: 0,ready: 0,percent: 0 });
  });

  it('validates control and audit options against their own view contracts', () => {
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: [] })).toBe('');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: 'mission-a' })).toContain('array');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: [''] })).toContain('non-empty strings');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'table' })).toContain('Default view');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'live' })).toContain('Default view');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'controls',historyLimit: 0 })).toContain('integer');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'whiteboard' })).toBe('');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'history',historyLimit: 10 })).toBe('');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds: ['mission-a'],defaultView: 'logs',historyLimit: 10 })).toBe('');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds:['mission-a'],panelWorkflowControls:'hidden' })).toBe('');
    expect(validateAutomationWorkflowControlOptions({ automationResourceIds:['mission-a'],panelWorkflowControls:'magic' }))
      .toContain('visible or hidden');

    expect(validateAutomationWorkflowAuditOptions({ automationResourceIds: ['mission-a'],defaultView: 'live' })).toContain('Default view');
    expect(validateAutomationWorkflowAuditOptions({ automationResourceIds: ['mission-a'],defaultView: 'history',historyLimit: 0 })).toContain('integer');
    expect(validateAutomationWorkflowAuditOptions({ automationResourceIds: ['mission-a'],defaultView: 'logs',historyLimit: 10 })).toBe('');
  });

  it('normalizes the shared runtime projection and derives history from run summaries', () => {
    const document = documentFixture();
    const run = runFixture({ id:'run-runtime',status:'running' });
    const runtime = automationWorkflowPanelRuntime({
      targetId:'local',documents:[document],catalog:[],runSummaries:[run],runDetailsById:{},loading:false,error:'',
    });
    expect(runtime?.targetId).toBe('local');
    expect(automationWorkflowPanelRuntime({ targetId:'local' })).toBeUndefined();
    expect(automationWorkflowHistoryEntries(runtime!,document.head.resourceId,10).map((entry) => entry.runId)).toEqual(['run-runtime']);
  });
});

function documentFixture(): AutomationDocument {
  const timestamp = '2026-07-14T00:00:00Z';
  return {
    head: {
      domain: 'automation',resourceId: 'mission-a',name: 'Mission A',tags: [],mainCommitId: 'commit-a',
      currentVersion: 1,digest: 'a'.repeat(64),revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId: 'mission-a',name: 'main',headCommitId: 'commit-a',headVersion: 1,
      revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec: newAutomationSpec('Mission A'),
  };
}

function runFixture(overrides: Partial<AutomationRun> & { branch?: string } = {}): AutomationRun {
  const { branch = 'main',...runOverrides } = overrides;
  return {
    id: 'run-a',targetId: 'local',automationResourceId: 'mission-a',actionId:'run',actionVersion:1,definitionId: 'definition-a',definitionVersion: 1,
    definitionDigest: 'd'.repeat(64),
    sourceKind: 'automation',sourceRef: {
      domain: 'automation',resourceId: 'mission-a',branch,commitId: 'commit-a',version: 1,digest: 'a'.repeat(64),
    },
    status: 'succeeded',revision: 1,parameters: {},admissionMode: 'limited',admissionScope: 'root',
    createdAt: '2026-07-14T08:00:00Z',
    startedAt: '2026-07-14T08:00:01Z',updatedAt: '2026-07-14T08:01:00Z',finishedAt: '2026-07-14T08:01:00Z',
    ...runOverrides,
    configDigest: runOverrides.configDigest ?? 'a'.repeat(64),executionPlanDigest: runOverrides.executionPlanDigest ?? 'b'.repeat(64),registryDigest: runOverrides.registryDigest ?? 'c'.repeat(64),
    acceptedAt: runOverrides.acceptedAt ?? '2026-07-14T08:00:00Z',
    rootRunId: runOverrides.rootRunId ?? runOverrides.id ?? 'run-a',depth: runOverrides.depth ?? 0,
    correlationId: runOverrides.correlationId ?? runOverrides.rootRunId ?? runOverrides.id ?? 'run-a',
    executionModel: 'orchestration-occurrence-v1',
  };
}

function node(nodeId: string, kind: string, status: AutomationRunDetail['nodeSummaries'][number]['status']) {
  const active = status === 'waiting' || status === 'running' || status === 'compensating';
  return {
    runId: 'active',nodeId,kind,status,attemptCount: 1,occurrenceCount: 1,
    activeOccurrenceCount: active ? 1 : 0,completedOccurrenceCount: active ? 0 : 1,
    failedOccurrenceCount: status === 'failed' ? 1 : 0,updatedAt: '2026-07-14T09:00:00Z',revision: 1,
  };
}
