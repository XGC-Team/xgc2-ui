// @vitest-environment jsdom

import { cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';
import type {
  ExperimentDocument,
  ExperimentRobotBinding,
} from './experimentModel';
import { newExperimentSpec } from './experimentModel';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import type { ExperimentSessionView } from './experimentWorkflowModel';
import {
  experimentRobotSourceSession,
  useExperimentRobotSources,
} from './useExperimentRobotSources';

const { getExperimentAtCommit } = vi.hoisted(() => ({ getExperimentAtCommit: vi.fn() }));

vi.mock('./experimentService', () => ({ getExperimentAtCommit }));

const composition = { kinds: [] } as unknown as RobotAssetKindComposition;

function binding(id: string, assetId: string, hybridSource: 'simulation' | 'physical'): ExperimentRobotBinding {
  return {
    id,
    ref: { domain: 'robot',resourceId: assetId,branch: 'main' },
    namespace: `/${id.replace('-', '')}`,
    hybridSource,
    runtimeParameters: {},
    initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
  };
}

function experimentDoc(robots: readonly ExperimentRobotBinding[], digest = 'a'.repeat(64)): ExperimentDocument {
  const now = '2026-01-01T00:00:00Z';
  return {
    head: {
      domain: 'experiment',resourceId: 'experiment-a',name: 'Experiment',tags: [],
      mainCommitId: 'commit-1',currentVersion: 1,digest,revision: 1,createdAt: now,updatedAt: now,
    },
    branch: {
      domain: 'experiment',resourceId: 'experiment-a',name: 'main',
      headCommitId: 'commit-1',headVersion: 1,revision: 1,createdAt: now,updatedAt: now,
    },
    spec: newExperimentSpec({ name: 'Experiment',robots: [...robots] }),
  };
}

function sessionView(overrides: Partial<ExperimentSessionView['session']> = {}): ExperimentSessionView {
  return {
    session: {
      id: 'session-1',targetId: 'local',experimentResourceId: 'experiment-a',
      experimentCommitId: 'commit-1',experimentDigest: 'a'.repeat(64),
      state: 'active',mode: 'full',runMode: 'hybrid',revision: 1,
      ...overrides,
    },
    members: [],
  };
}

function runtime(
  sessionViews: readonly ExperimentSessionView[] | undefined,
  selectedRunMode = '',
): ExperimentProcessRuntimeProjection {
  return {
    targetId: 'local',processInstances: [],documents: [],catalog: [],
    runSummaries: [],runDetailsById: {},loading: false,error: '',
    ...(sessionViews ? { sessionViews: [...sessionViews] } : {}),
    ...(selectedRunMode ? { selectedRunMode } : {}),
  };
}

function sourcesInput(
  projection: ExperimentProcessRuntimeProjection,
  bindings: readonly ExperimentRobotBinding[],
) {
  return {
    runtime: projection,targetId: 'local',experimentResourceId: 'experiment-a',bindings,composition,
  };
}

describe('experimentRobotSourceSession', () => {
  it('picks exactly one live Session for this target and Experiment', () => {
    const view = sessionView();
    expect(experimentRobotSourceSession(runtime([view]), 'local', 'experiment-a')).toBe(view);
    for (const state of ['opening','stopping'] as const) {
      expect(experimentRobotSourceSession(runtime([sessionView({ state })]), 'local', 'experiment-a'))
        .toMatchObject({ session: { state } });
    }
  });

  it('ignores foreign targets, foreign Experiments and terminal Sessions', () => {
    expect(experimentRobotSourceSession(runtime([sessionView({ targetId: 'agent-b' })]), 'local', 'experiment-a'))
      .toBeUndefined();
    expect(experimentRobotSourceSession(runtime([sessionView({ experimentResourceId: 'experiment-b' })]), 'local', 'experiment-a'))
      .toBeUndefined();
    expect(experimentRobotSourceSession(runtime([sessionView({ state: 'succeeded' })]), 'local', 'experiment-a'))
      .toBeUndefined();
    expect(experimentRobotSourceSession(runtime([]), 'local', 'experiment-a')).toBeUndefined();
    expect(experimentRobotSourceSession(undefined, 'local', 'experiment-a')).toBeUndefined();
  });

  it('treats multiple live candidates or a missing snapshot as ambiguous evidence', () => {
    expect(experimentRobotSourceSession(
      runtime([sessionView(), sessionView({ id: 'session-2' })]), 'local', 'experiment-a',
    )).toBe('ambiguous');
    expect(experimentRobotSourceSession(runtime(undefined), 'local', 'experiment-a')).toBe('ambiguous');
  });
});

describe('useExperimentRobotSources', () => {
  beforeEach(() => {
    getExperimentAtCommit.mockResolvedValue(experimentDoc([binding('px4-01','uav-01','simulation')]));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('idle slots follow the selected mode without fetching anything', () => {
    const draft = [binding('px4-01','uav-01','physical')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([], 'simulation'), draft),
    ));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'simulation' });
    expect(result.current.loading).toBe(false);
    expect(getExperimentAtCommit).not.toHaveBeenCalled();
  });

  it('idle hybrid reads each draft slot and leaves missing values unknown', () => {
    const draft = [binding('px4-01','uav-01','physical'), binding('scout-01','scout-1','simulation')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([], 'hybrid'), draft),
    ));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'physical' });
    expect(result.current.labels.get('scout-01')).toEqual({ current: 'simulation' });
    expect(getExperimentAtCommit).not.toHaveBeenCalled();
  });

  it('a running hybrid Session reads the frozen slot and flags a draft difference as next', async () => {
    const draft = [binding('px4-01','uav-01','physical')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView()]), draft),
    ));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getExperimentAtCommit).toHaveBeenCalledWith(
      'experiment-a','commit-1',expect.any(AbortSignal),composition,
    );
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'simulation',next: 'physical' });
  });

  it('a running pure Session unifies every slot and never paints authored hybridSource', async () => {
    let resolveFrozen!: (document: ExperimentDocument) => void;
    getExperimentAtCommit.mockImplementationOnce(
      () => new Promise<ExperimentDocument>((resolve) => { resolveFrozen = resolve; }),
    );
    const draft = [binding('px4-01','uav-01','simulation')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView({ runMode: 'physical' })]), draft),
    ));
    expect(result.current.loading).toBe(true);
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'physical' });
    resolveFrozen(experimentDoc([binding('px4-01','uav-01','physical')]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'physical' });
  });

  it('keeps a pure Session source unknown after the frozen read fails', async () => {
    getExperimentAtCommit.mockRejectedValueOnce(new Error('gone'));
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView({ runMode: 'simulation' })]), [binding('px4-01','uav-01','physical')]),
    ));
    expect(result.current.loading).toBe(true);
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'simulation' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'unknown' });
  });

  it('keeps a replaced slot unknown instead of inheriting the previous Robot source by slot', async () => {
    const draft = [binding('px4-01','uav-02','physical')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView()]), draft),
    ));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'unknown',next: 'physical' });
  });

  it('keeps a resolved pure Session non-member unknown and marks its next source', async () => {
    getExperimentAtCommit.mockResolvedValueOnce(experimentDoc([binding('px4-01','uav-02','simulation')]));
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView({ runMode: 'simulation' })]), [binding('px4-01','uav-01','physical')]),
    ));
    expect(result.current.loading).toBe(true);
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'simulation' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'unknown',next: 'simulation' });
  });

  it('reports unknown when the frozen read fails, is pinned elsewhere, or has no commit', async () => {
    const draft = [binding('px4-01','uav-01','physical')];
    getExperimentAtCommit.mockResolvedValue(experimentDoc([binding('px4-01','uav-01','simulation')], 'b'.repeat(64)));
    const mismatch = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView()]), draft),
    ));
    await waitFor(() => expect(mismatch.result.current.loading).toBe(false));
    expect(mismatch.result.current.labels.get('px4-01')).toEqual({ current: 'unknown' });

    getExperimentAtCommit.mockRejectedValue(new Error('gone'));
    const failed = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView({ id: 'session-2' })]), draft),
    ));
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    expect(failed.result.current.labels.get('px4-01')).toEqual({ current: 'unknown' });

    const noCommit = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView({ id: 'session-3',experimentCommitId: undefined })]), draft),
    ));
    expect(noCommit.result.current.loading).toBe(false);
    expect(noCommit.result.current.labels.get('px4-01')).toEqual({ current: 'unknown' });
  });

  it('claims nothing while Session ownership is ambiguous', () => {
    const draft = [binding('px4-01','uav-01','physical')];
    const { result } = renderHook(() => useExperimentRobotSources(
      sourcesInput(runtime([sessionView(), sessionView({ id: 'session-2' })]), draft),
    ));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'unknown' });
    expect(result.current.loading).toBe(false);
    expect(getExperimentAtCommit).not.toHaveBeenCalled();
  });

  it('discards a late frozen read after the Session identity changed', async () => {
    const draft = [binding('px4-01','uav-01','physical')];
    let resolveFirst!: (document: ExperimentDocument) => void;
    getExperimentAtCommit.mockImplementationOnce(
      () => new Promise<ExperimentDocument>((resolve) => { resolveFirst = resolve; }),
    );
    const first = runtime([sessionView()]);
    const { result,rerender } = renderHook(
      (props: ReturnType<typeof sourcesInput>) => useExperimentRobotSources(props),
      { initialProps: sourcesInput(first, draft) },
    );
    await waitFor(() => expect(getExperimentAtCommit).toHaveBeenCalledOnce());

    getExperimentAtCommit.mockResolvedValue(experimentDoc([binding('px4-01','uav-01','physical')]));
    const second = runtime([sessionView({ id: 'session-2',experimentCommitId: 'commit-2' })]);
    rerender(sourcesInput(second, draft));
    await waitFor(() => expect(result.current.labels.get('px4-01')).toEqual({ current: 'physical' }));

    resolveFirst(experimentDoc([binding('px4-01','uav-01','simulation')]));
    await waitFor(() => expect(getExperimentAtCommit).toHaveBeenCalledTimes(2));
    expect(result.current.labels.get('px4-01')).toEqual({ current: 'physical' });
  });
});
