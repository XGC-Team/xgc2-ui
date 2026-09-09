import { describe,expect,it } from 'vitest';
import type { AutomationNodeExecutionSummary } from '../automation/automationPublic';
import type { ProcessInstance } from '../execution/executionPublic';
import {
  isLichtblickRuntimeProcessCandidate,
  resolveLichtblickRuntimeComponents,
  resolveLichtblickWorkflowRuntime,
} from './visualizationModel';

describe('Lichtblick workflow runtime requirements', () => {
  it('accepts exact no-scene-class telemetry mode while requiring Robot descriptions', () => {
    const descriptions = process('descriptions', 'lichtblick-robot-descriptions', 'run-1');
    const runtime = resolveLichtblickWorkflowRuntime('run-1', [
      process('bridge', 'foxglove-bridge', 'run-1'),
      process('web', 'lichtblick-web', 'run-1'),
      descriptions,
    ], [
      summary('run-1', 'descriptions', 'visualization.robot-descriptions', descriptions),
      summary('run-1', 'scene', 'visualization.robot-scene', noSceneClassOutput()),
    ]);

    expect(runtime?.requirements).toEqual({
      descriptions: { state:'process',instance:descriptions },
      scene: { state:'no-runtime' },
    });
    expect(resolveLichtblickRuntimeComponents(runtime, []).map(({ key }) => key)).toEqual([
      'bridge','web','descriptions',
    ]);
  });

  it('keeps missing node summaries converging instead of guessing from inventory', () => {
    const historical = process('historical-descriptions', 'lichtblick-robot-descriptions', 'other-run');
    const runtime = resolveLichtblickWorkflowRuntime('run-1', [
      process('bridge', 'foxglove-bridge', 'run-1'),
      process('web', 'lichtblick-web', 'run-1'),
      historical,
    ], []);
    const components = resolveLichtblickRuntimeComponents(runtime, [historical]);

    expect(runtime?.requirements?.descriptions.state).toBe('pending');
    expect(runtime?.requirements?.scene.state).toBe('pending');
    expect(components.find(({ key }) => key === 'descriptions')?.instance).toBeUndefined();
    expect(components.find(({ key }) => key === 'scene')?.instance).toBeUndefined();
  });

  it('fails malformed or foreign Process outputs closed', () => {
    const foreign = process('descriptions', 'lichtblick-robot-descriptions', 'other-run');
    const runtime = resolveLichtblickWorkflowRuntime('run-1', [], [
      summary('run-1', 'descriptions', 'visualization.robot-descriptions', foreign),
      summary('run-1', 'scene', 'visualization.robot-scene', {
        ...noSceneClassOutput(),unexpected:true,
      }),
    ]);

    expect(runtime?.requirements?.descriptions).toMatchObject({ state:'failed' });
    expect(runtime?.requirements?.scene).toMatchObject({ state:'failed' });
    expect(resolveLichtblickRuntimeComponents(runtime, []).filter(({ error }) => error)).toHaveLength(2);
  });

  it('requires an exact process-backed scene when the scene node materializes one', () => {
    const descriptions = process('descriptions', 'lichtblick-robot-descriptions', 'run-1');
    const scene = process('scene', 'lichtblick-robot-scene', 'run-1');
    const runtime = resolveLichtblickWorkflowRuntime('run-1', [descriptions,scene], [
      summary('run-1', 'descriptions', 'visualization.robot-descriptions', descriptions),
      summary('run-1', 'scene', 'visualization.robot-scene', processReadyOutput(scene)),
    ]);

    expect(runtime?.requirements?.scene).toEqual({ state:'process',instance:scene });
    expect(resolveLichtblickRuntimeComponents(runtime, []).find(({ key }) => key === 'scene')?.instance).toBe(scene);
  });

  it('includes Robot descriptions in the bounded process candidate set', () => {
    expect(isLichtblickRuntimeProcessCandidate(
      process('descriptions', 'lichtblick-robot-descriptions', 'run-1'),
    )).toBe(true);
    expect(isLichtblickRuntimeProcessCandidate(
      process('unrelated', 'arbitrary-history-process', 'run-1'),
    )).toBe(false);
  });

  it('keeps an exact unseen Process pending while rejecting malformed public results', () => {
    const descriptions = process('descriptions', 'lichtblick-robot-descriptions', 'run-1');
    const runtime = resolveLichtblickWorkflowRuntime('run-1', [], [
      summary('run-1', 'descriptions', 'visualization.robot-descriptions', descriptions),
      summary('run-1', 'scene', 'visualization.robot-scene', {
        ...processReadyOutput(process('scene', 'lichtblick-robot-scene', 'run-1')),
        unexpected:true,
      }),
    ]);

    expect(runtime?.requirements?.descriptions.state).toBe('pending');
    expect(runtime?.requirements?.scene.state).toBe('failed');
  });
});

function summary(
  runId: string,
  nodeId: string,
  kind: string,
  output: unknown,
): AutomationNodeExecutionSummary {
  return {
    runId,nodeId,kind,status:'waiting',occurrenceCount:1,activeOccurrenceCount:1,
    completedOccurrenceCount:0,failedOccurrenceCount:0,attemptCount:1,output,
    updatedAt:'2026-08-10T00:00:00Z',revision:1,
  };
}

function process(id: string,definitionId: string,ownerId: string): ProcessInstance {
  return {
    id,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'a'.repeat(64),
    ownerType:'orchestration-run',ownerId,scope:`automation/${ownerId}`,parameters:{},driver:'host',
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },
    revision:1,restartCount:0,createdAt:'2026-08-10T00:00:00Z',updatedAt:'2026-08-10T00:00:00Z',
  };
}

function processReadyOutput(instance: ProcessInstance) {
  return {
    definitionId:instance.definitionId,event:'ready',processInstanceId:instance.id,targetId:instance.targetId,
  };
}

function noSceneClassOutput() {
  return {
    definitionId:'lichtblick-robot-scene',event:'ready',reason:'no-scene-class',skipped:true,targetId:'local',
  };
}
