import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { getAutomationObservations } from './automationObservationService';

vi.mock('../../api/http',() => ({ request:vi.fn() }));

describe('Automation observation compensation snapshots',() => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('parses the captured D compensation snapshot without treating completed execution as finished cleanup',async () => {
    const body=recordedCompensationBundle();
    vi.mocked(request).mockResolvedValue(body);
    const signal=new AbortController().signal;
    const parsed=await getAutomationObservations('local',[body.items[0].run.id],signal);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      `/execution-targets/local/orchestration-observations?rootRunId=${body.items[0].run.id}`,{ signal },
    );
    expect(parsed.cursor).toEqual(body.cursor);
    expect(parsed.items[0]?.run).toMatchObject({ status:'stopping',revision:5 });
    expect(parsed.items[0]?.nodeSummaries).toEqual(body.items[0].nodeSummaries);
    expect(parsed.items[0]?.relations).toEqual(body.items[0].relations);
  });

  it('preserves the subsequent captured terminal snapshot and exact revision',async () => {
    const body=recordedCompensationBundle();
    const finishedAt='2026-09-19T20:18:49.999089625Z';
    const item=body.items[0];
    const terminal={
      ...body,cursor:{ ...body.cursor,latestOffset:152057 },
      items:[{
        ...item,
        run:{ ...item.run,status:'stopped',revision:6,updatedAt:finishedAt,finishedAt },
        nodeSummaries:[{
          ...item.nodeSummaries[0],status:'compensated',activeOccurrenceCount:0,revision:12,
          finishedAt:'2026-09-19T20:18:49.991912152Z',updatedAt:'2026-09-19T20:18:49.991912152Z',
        }],
      }],
    };
    vi.mocked(request).mockResolvedValue(terminal);
    const parsed=await getAutomationObservations('local',[item.run.id],new AbortController().signal);
    expect(parsed.items[0]?.run).toMatchObject({ status:'stopped',revision:6,finishedAt });
    expect(parsed.items[0]?.nodeSummaries).toEqual(terminal.items[0].nodeSummaries);
    expect(parsed.cursor).toEqual(terminal.cursor);
  });

  it.each(['non-compensating-overlap','out-of-bounds','wrong-target','unknown-field'])(
    'still rejects the entire observation bundle for %s',async (kind) => {
      const body=recordedCompensationBundle();
      const item=body.items[0];
      if (kind==='non-compensating-overlap') item.nodeSummaries[0].status='running';
      if (kind==='out-of-bounds') item.nodeSummaries[0].activeOccurrenceCount=2;
      if (kind==='wrong-target') item.run.targetId='foreign';
      if (kind==='unknown-field') Object.assign(item.nodeSummaries[0],{ checkpoint:{ private:true } });
      vi.mocked(request).mockResolvedValue(body);
      await expect(getAutomationObservations('local',[item.run.id],new AbortController().signal)).rejects.toThrow();
    },
  );
});

// Cropped from real Four Mecanum reconnect D, observation 44 at
// 2026-09-19T20:18:47.448Z. Keep the Run identity/status, summary, lineage and cursor;
// select this leaf as the root; omit other nodes, parameters and trigger metadata.
// Its relation arrays were already empty. The terminal values above are from 48.
function recordedCompensationBundle() {
  const runId='2fa8b3d4-eb0d-5b3e-ab53-693a1fa22373';
  const automationId='c9a549e1-e0e2-5e11-8581-b185b234fa30';
  const sourceRef={
    domain:'automation',resourceId:automationId,branch:'main',
    commitId:'74ae8781-95cc-4595-a428-a05fddd3bf92',version:1,
    digest:'549e52b212348c09a7043410c8a9d09fcec99805fad6b66630e4024e8fb7454b',
  };
  return {
    cursor:{ streamId:'385221d92239e0b7881dbada75bd96c068cbb41abc57139adab7a312e8335e92',latestOffset:152028 },
    items:[{
      run:{
        id:runId,targetId:'local',automationResourceId:automationId,definitionId:automationId,definitionVersion:1,
        configDigest:sourceRef.digest,
        executionPlanDigest:'e92e9aa2b5fa34d6a82013ce7eee53bcbf295bdbcc9fb5b37bdbeeab937d0180',
        registryDigest:'b0b64fc98976db474e33c1393f0e7fb97be8e4a12c54796c9247c7ecaee39c70',
        definitionDigest:'a2f9302d34bd627ad8bb3c87c9d6944a133b8f66f99bec33c1c370cca8bdfa4c',
        actionId:'start-mecanum',actionVersion:1,executionModel:'orchestration-occurrence-v1',parameters:{},
        parentRunId:'aae8fddb-5b3f-5836-bfa9-99ea99ee55c2',rootRunId:'0483f5af-9ab6-59fe-8675-e97189b0160c',
        callNodeId:'call-sim-mecanum',depth:3,correlationId:'0483f5af-9ab6-59fe-8675-e97189b0160c',
        status:'stopping',admissionMode:'limited',admissionScope:'all',
        admissionKey:'family:sha256:24d5a017f06c89daee4192c02e97c1b2530bd58d3ffea6dca79be651bcf7af72',
        admissionLimit:1,admissionOnConflict:'replace',terminationKind:'stopped',reason:'Stop Panel robot-instruments',
        acceptedAt:'2026-09-19T20:18:41.228616896Z',createdAt:'2026-09-19T20:18:41.268510912Z',
        updatedAt:'2026-09-19T20:18:47.009832251Z',revision:5,startedAt:'2026-09-19T20:18:41.268510912Z',
        sourceKind:'automation',sourceRef,automationRef:sourceRef,
      },
      nodeSummaries:[{
        runId,nodeId:'mecanum-runtime',kind:'process.run-definition',status:'compensating',
        latestInvocationId:'04b79cca-06c5-5583-9b0a-d1de0ee2335d',
        occurrenceCount:1,activeOccurrenceCount:1,completedOccurrenceCount:1,failedOccurrenceCount:0,attemptCount:1,
        startedAt:'2026-09-19T20:18:42.331351181Z',finishedAt:'2026-09-19T20:18:47.023420206Z',
        updatedAt:'2026-09-19T20:18:47.037026717Z',revision:9,
      }],
      relations:{ runId,childRuns:[],childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] },
    }],
  };
}
