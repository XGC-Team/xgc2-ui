import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { getExperiment,getExperimentAtCommit,isExperimentCASConflict,listExperiments } from './experimentService';

vi.mock('../../api/http', () => ({ request: vi.fn() }));

describe('experimentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(request).mockResolvedValue(document());
  });

  it('loads only the current main experiment document', async () => {
    const controller = new AbortController();
    await getExperiment('experiment/a', controller.signal);
    expect(request).toHaveBeenCalledWith('/experiments/experiment%2Fa?branch=main', { signal: controller.signal });
  });

  it('reads an exact immutable Experiment commit with cancellation', async () => {
    const controller = new AbortController();
    await getExperimentAtCommit('experiment/a','commit/one',controller.signal);
    expect(request).toHaveBeenCalledWith('/experiments/experiment%2Fa?commitId=commit%2Fone',{
      signal:controller.signal,
    });
  });

  it('fails the catalog when any Experiment carries a retired field', async () => {
    const stale = document();
    (stale.spec as Record<string,unknown>).compositionProfile = 'retired.unknown-profile';
    vi.mocked(request).mockResolvedValueOnce([document(), stale]);

    await expect(listExperiments()).rejects.toThrow(/unknown field .*compositionProfile/);
  });

  it('does not misclassify the active-Session Robot binding fence as a CAS conflict', () => {
    expect(isExperimentCASConflict(
      new Error('409 Conflict: experiment has a live Session; stop the Experiment before changing its Robot bindings'),
    )).toBe(false);
    expect(isExperimentCASConflict(new Error('409 Conflict: branch head revision conflict'))).toBe(true);
  });
});

function document() {
  const timestamp = '2026-07-22T00:00:00Z';
  return {
    head: {
      domain: 'experiment',resourceId: 'experiment-1',name: 'Experiment',description: '',tags: [],
      mainCommitId: 'commit-1',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'experiment',resourceId: 'experiment-1',name: 'main',headCommitId: 'commit-1',
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],
      localizationOffset:{ x:0,y:0,z:0 },
      runModes: ['simulation','physical'],
      robots:[],workflowInstances:[],
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
    },
  };
}
