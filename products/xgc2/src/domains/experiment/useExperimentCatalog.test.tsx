// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExperimentDocument } from './experimentModel';

const service = vi.hoisted(() => ({
  listExperiments: vi.fn(),listExperimentNamespaces: vi.fn(),
  commitExperiment: vi.fn(),getExperiment: vi.fn(),isExperimentCASConflict: vi.fn(),
  createExperiment: vi.fn(),archiveExperiment: vi.fn(),
  createExperimentNamespace: vi.fn(),updateExperimentNamespace: vi.fn(),archiveExperimentNamespace: vi.fn(),
}));

vi.mock('./experimentService', () => service);

import { ExperimentCommitConflict,resetExperimentCatalogForTests,useExperimentCatalog } from './useExperimentCatalog';

describe('useExperimentCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExperimentCatalogForTests();
    service.listExperiments.mockResolvedValue([experiment()]);
    service.listExperimentNamespaces.mockResolvedValue([]);
    service.commitExperiment.mockResolvedValue(experiment({ revision: 2,commitId: 'c2' }));
  });

  it('loads only the authoritative Experiment tree and marks the document listing resolved', async () => {
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.experiments).toHaveLength(1);
    expect(result.current.namespaces).toEqual([]);
    expect(result.current.experimentsResolved).toBe(true);
    expect(service.listExperiments).toHaveBeenCalledOnce();
    expect(service.listExperimentNamespaces).toHaveBeenCalledOnce();
  });

  it('keeps a resolved Experiment list usable when its namespace request fails', async () => {
    service.listExperimentNamespaces.mockRejectedValueOnce(new Error('Folder catalog unavailable'));
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.experiments).toHaveLength(1);
    expect(result.current.experimentsResolved).toBe(true);
    expect(result.current.error).toContain('Folder catalog unavailable');
  });

  it('does not claim authoritative resolution when the Experiment request fails', async () => {
    service.listExperiments.mockRejectedValueOnce(new Error('Core unavailable'));
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.experiments).toEqual([]);
    expect(result.current.experimentsResolved).toBe(false);
    expect(result.current.error).toContain('Core unavailable');
  });

  it('commits the whole spec with branch and resource CAS revisions', async () => {
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.saveExperimentDraft(experiment()); });

    expect(service.commitExperiment).toHaveBeenCalledWith('exp-1', 'main', expect.objectContaining({
      baseCommitId: 'c1',expectedBranchRevision: 1,expectedResourceRevision: 1,
      spec: expect.objectContaining({ schemaVersion: 15,localizationOffset:{ x:0,y:0,z:0 } }),
    }), expect.objectContaining({ contributions: expect.any(Array) }));
    expect(result.current.experiments[0]?.branch.headCommitId).toBe('c2');
  });

  it('reloads only the current main document after a CAS conflict', async () => {
    const latest = experiment({ revision: 2,commitId: 'c2' });
    service.commitExperiment.mockRejectedValueOnce(new Error('409 Conflict: branch head changed'));
    service.isExperimentCASConflict.mockReturnValueOnce(true);
    service.getExperiment.mockResolvedValueOnce(latest);
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let conflict: unknown;
    await act(async () => {
      try {
        await result.current.saveExperimentDraft(experiment());
      } catch (cause) {
        conflict = cause;
      }
    });

    expect(service.getExperiment).toHaveBeenCalledWith(
      'exp-1',
      undefined,
      expect.objectContaining({ contributions: expect.any(Array) }),
    );
    expect(conflict).toBeInstanceOf(ExperimentCommitConflict);
    expect(result.current.experiments[0]?.branch.headCommitId).toBe('c2');
  });

  it('keeps a resolved catalog on screen while a later refresh is in flight', async () => {
    const first = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(first.result.current.experimentsResolved).toBe(true));
    first.unmount();

    let release: (value: ExperimentDocument[]) => void = () => undefined;
    service.listExperiments.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const second = renderHook(() => useExperimentCatalog());
    expect(second.result.current.experimentsResolved).toBe(true);
    expect(second.result.current.experiments).toHaveLength(1);
    release([experiment()]);
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    second.unmount();
  });

  it('owns created resources and preserves non-ASCII metadata outside mutation headers', async () => {
    const created = experiment();
    service.createExperiment.mockResolvedValue(created);
    service.createExperimentNamespace.mockResolvedValue({
      domain: 'experiment',namespaceId: 'validation',name: '验证实验',revision: 1,
      createdAt: '',updatedAt: '',
    });
    const { result } = renderHook(() => useExperimentCatalog());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const spec = structuredClone(experiment().spec);
    spec.name = '定位系统实验';
    spec.description = '中文实验描述';
    spec.tags = ['定位','回归测试'];

    await act(async () => {
      await result.current.createExperiment({ spec });
      await result.current.createNamespace('验证实验');
    });

    const input = service.createExperiment.mock.calls[0]?.[0];
    expect(input?.spec).toMatchObject({
      name: '定位系统实验',description: '中文实验描述',tags: ['定位','回归测试'],
    });
    expect(input?.requestId).toMatch(/^[\x20-\x7e]+$/);
    expect(input?.requestId).not.toContain('定位系统实验');
    expect(service.createExperimentNamespace).toHaveBeenCalledWith(expect.objectContaining({
      name: '验证实验',requestId: expect.stringMatching(/^[\x20-\x7e]+$/),
    }));
    expect(result.current.namespaces[0]?.name).toBe('验证实验');
  });
});

function experiment({ revision = 1,commitId = 'c1' }: { revision?: number;commitId?: string } = {}): ExperimentDocument {
  return {
    head: { domain: 'experiment',resourceId: 'exp-1',name: 'Experiment',tags: [],mainCommitId: commitId,currentVersion: revision,digest: 'd',revision,createdAt: '',updatedAt: '' },
    branch: { domain: 'experiment',resourceId: 'exp-1',name: 'main',headCommitId: commitId,headVersion: revision,revision,createdAt: '',updatedAt: '' },
    spec: { schemaVersion: 15,name: 'Experiment',description: '',tags: [],runModes: ['simulation','physical'],localizationOffset:{ x:0,y:0,z:0 },dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
      robots: [],workflowInstances: [] },
  };
}
