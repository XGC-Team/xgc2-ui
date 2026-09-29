import { describe,expect,it } from 'vitest';
import type { AutomationExecutionRelations } from '../automation/automationPublic';
import { experimentChildRunBindingId } from './experimentChildRunBinding';

describe('experimentChildRunBindingId',() => {
  it('reads a binding directly from a remote target-root relation',() => {
    const ledger=relations({
      ...childRelation('remote-child','remote-parent','remote-producer'),
      targetRoot:true,targetRootBindingId:'xgc-world-runtime',
    });
    expect(experimentChildRunBindingId(ledger,'remote-child')).toBe('xgc-world-runtime');
  });

  it('reads a local binding from the matching child-group item key and producer invocation',() => {
    const ledger=relations(childRelation('a67c3022-e819-522c-b4a2-cd844dc56973','7c6fc08d-f4c7-56a5-acf1-8cc60f41d446','8119a01e-9fb9-583c-b2a9-1db9924ae23d'));
    ledger.childRunGroups.push({
      id:'679e8c82-4605-50d8-9255-1c0ddbc8df5f',targetId:'local',rootRunId:'root',
      parentRunId:'7c6fc08d-f4c7-56a5-acf1-8cc60f41d446',
      producerInvocationId:'8119a01e-9fb9-583c-b2a9-1db9924ae23d',producerNodeId:'runtime-direct',
      groupKey:'automation-call:fan-out',expectedMembers:1,memberCount:1,waitPolicy:'wait',joinMode:'join-all',
      failurePolicy:'fail-fast',remainingPolicy:'cancel',resultPolicy:'propagate',maxConcurrency:256,
      state:'resolved',outcome:'succeeded',terminalCount:1,createdAt:'t',updatedAt:'t',
      sealedAt:'t',resolvedAt:'t',revision:3,
    });
    ledger.childRunGroupMembers.push({
      id:'5aa7924d-1e46-5535-8fdc-b622924157b0',groupId:'679e8c82-4605-50d8-9255-1c0ddbc8df5f',
      ordinal:0,itemKey:'xgc-world-runtime',childRunId:'a67c3022-e819-522c-b4a2-cd844dc56973',
      state:'terminal',createdAt:'t',updatedAt:'t',dispatchedAt:'t',terminalAt:'t',revision:4,
    });
    expect(experimentChildRunBindingId(ledger,'a67c3022-e819-522c-b4a2-cd844dc56973'))
      .toBe('xgc-world-runtime');
  });

  it('ignores a member when its group is missing or its producer differs from the child relation',() => {
    const ledger=relations(childRelation('world-runtime','prep-owner','runtime-invocation'));
    ledger.childRunGroups.push({
      id:'group',targetId:'local',rootRunId:'root',parentRunId:'prep-owner',
      producerInvocationId:'different-invocation',producerNodeId:'runtime-direct',
      groupKey:'automation-call:fan-out',expectedMembers:1,memberCount:1,waitPolicy:'wait',joinMode:'join-all',
      failurePolicy:'fail-fast',remainingPolicy:'cancel',resultPolicy:'propagate',maxConcurrency:256,
      state:'resolved',outcome:'succeeded',terminalCount:1,createdAt:'t',updatedAt:'t',revision:1,
    });
    ledger.childRunGroupMembers.push({
      id:'member-missing-group',groupId:'missing',ordinal:0,itemKey:'xgc-world-runtime',childRunId:'world-runtime',
      state:'dispatched',createdAt:'t',updatedAt:'t',revision:1,
    },{
      id:'member-wrong-producer',groupId:'group',ordinal:1,itemKey:'xgc-world-runtime',childRunId:'world-runtime',
      state:'dispatched',createdAt:'t',updatedAt:'t',revision:1,
    });
    expect(experimentChildRunBindingId(ledger,'world-runtime')).toBeUndefined();
  });
});

function relations(child:AutomationExecutionRelations['childRuns'][number]):AutomationExecutionRelations {
  return {
    runId:child.parentRunId,childRuns:[child],childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],
    runtimeGroups:[],runtimes:[],resources:[],
  };
}

function childRelation(childRunId:string,parentRunId:string,parentInvocationId:string):AutomationExecutionRelations['childRuns'][number] {
  return {
    id:`relation-${childRunId}`,targetId:'local',rootRunId:'root',parentRunId,parentInvocationId,
    callNodeId:'runtime-direct',ordinal:0,childRunId,ownerRunId:parentRunId,childDefinitionId:'world-runtime',
    childDefinitionVersion:2,childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
    childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),triggerNodeId:'called',
    relation:'supervised',waitPolicy:'join-later',cancelPolicy:'cascade',resultPolicy:'propagate',
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:'succeeded',runRevision:2,revision:2,
  };
}
