import { describe,expect,it } from 'vitest';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import type { AutomationRunDetail } from '../../domains/automation/automationPublic';
import type { PanelWorkflowRuntimeProjection } from '../types';
import { cameraMediaOwnerCandidates,cameraMediaOwnerForSource } from './cameraMediaOwnerModel';

const digest = `sha256:${'a'.repeat(64)}`;
function process(id = 'edge',ownerId = 'child'): ProcessInstance {
  return { id,targetId:'local',definitionId:'xgc-media-edge',definitionVersion:'1',definitionDigest:'digest',
    ownerType:'orchestration-run',ownerId,scope:'run',driver:'host',parameters:{ sourceRosterArtifactRef:'roster',sourceRosterDigest:digest },
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },
    revision:1,restartCount:0,createdAt:'now',updatedAt:'now' };
}
function runtime(): PanelWorkflowRuntimeProjection {
  const invocation: AutomationRunDetail['invocations'][number] = {
    id:'roster-node',runId:'child',nodeId:'roster',kind:'media.materialize-source-roster',status:'succeeded',
    compensationStatus:'none',createdAt:'now',updatedAt:'now',revision:1,attempts:[],inputRefs:[],
    outputRefs:[{ id:'output',runId:'child',invocationId:'roster-node',nodeId:'roster',port:'out',valueDigest:'digest',
      value:{ sourceRosterArtifactRef:'roster',sourceRosterDigest:digest,
        sourceRosterContent:JSON.stringify({ sources:[{ id:'front',rtpListenAddress:'127.0.0.1:5600',controlSocket:'/run/front.sock' }] }),sourceCount:1 } }],
  };
  // Only identity fields matter to this resolver; lifecycle ownership comes from the typed Process.
  const detail = { run:{ id:'child' },invocations:[invocation],nodeSummaries:[],loading:false,error:'' } as unknown as AutomationRunDetail;
  return { targetId:'local',experimentResourceId:'experiment',documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    runDetailsById:{ child:detail,root:{ invocations:[],nodeSummaries:[],loading:false,error:'',
      relations:{ runId:'root',childRuns:[{ parentRunId:'root',childRunId:'child' }],childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] },
    } as unknown as AutomationRunDetail } };
}

describe('camera Media Edge ownership',() => {
  it('uses exact durable descendants plus matching public roster identity and source membership',() => {
    const view = runtime();
    const owned = process();
    const unrelated = process('foreign','other-run');
    const wrongTarget = { ...owned,id:'remote-edge',targetId:'other' };
    const selected = cameraMediaOwnerCandidates([unrelated,wrongTarget,owned],view,'root');
    expect(selected).toEqual([owned]);
    expect(cameraMediaOwnerForSource(selected,view,'front')).toBe(owned);
    expect(cameraMediaOwnerForSource(selected,view,'rear')).toBeUndefined();
    expect(cameraMediaOwnerCandidates([owned],view,'unrelated-root')).toEqual([]);
  });
  it('rejects missing or mismatched public roster facts and ambiguous owners without URL guesses',() => {
    const view = runtime();const owned = process();
    expect(cameraMediaOwnerForSource([{ ...owned,parameters:{ sourceRosterContent:'configured' } }],view,'front')).toBeUndefined();
    expect(cameraMediaOwnerForSource([{ ...owned,parameters:{ ...owned.parameters,sourceRosterDigest:'different' } }],view,'front')).toBeUndefined();
    expect(cameraMediaOwnerForSource([owned,process('second')],view,'front')).toBeUndefined();
    view.runDetailsById.child.invocations[0].outputRefs[0].runId = 'unrelated-root';
    expect(cameraMediaOwnerForSource([owned],view,'front')).toBeUndefined();
  });
  it('does not connect a stopped or not-ready owner',() => {
    const owned = process();const view = runtime();
    expect(cameraMediaOwnerCandidates([{ ...owned,desiredState:'stopped' }],view,'root')).toEqual([]);
    expect(cameraMediaOwnerCandidates([{ ...owned,readiness:{ status:'failing' } }],view,'root')).toEqual([]);
  });
});
