import { describe,expect,it } from 'vitest';
import type { AutomationSpec } from '../../domains/automation/automationPublic';
import { newAutomationNode,newAutomationSpec } from '../../domains/automation/automationPublic';
import { resolveRosBasicServiceWorkflowCall } from './rosBasicServiceWorkflow';

type ActionGraph = {
  actionId:string;
  entryNodeId:string;
  callNodeIds?:string[];
};

function specWithActions(graphs:readonly ActionGraph[]):AutomationSpec {
  const spec = newAutomationSpec('ROS Control');
  const baseAction = spec.actions[0]!;
  spec.actions = graphs.map(({ actionId,entryNodeId }) => ({
    ...baseAction,id:actionId,entryNodeId,
  }));
  spec.nodes = [
    ...graphs.map(({ entryNodeId }) => ({
      ...newAutomationNode('trigger.manual'),id:entryNodeId,
    })),
    ...graphs.flatMap(({ actionId,callNodeIds = [] }) => callNodeIds.map((nodeId) => ({
      ...newAutomationNode('automation.call',{
        automationId:`${actionId}-automation`,actionId:`start-${actionId}`,
      }),id:nodeId,displayName:nodeId,
    }))),
  ];
  spec.edges = graphs.flatMap(({ actionId,entryNodeId,callNodeIds = [] }) => callNodeIds.map((nodeId,index) => ({
    id:`${actionId}-${index}`,from:entryNodeId,to:nodeId,condition:'success' as const,
  })));
  return spec;
}

describe('resolveRosBasicServiceWorkflowCall',() => {
  it.each(['call-gzserver','call-gzserver-diagnostic'])(
    'resolves the reachable call node by graph identity, including %s',
    (nodeId) => {
      const spec = specWithActions([{ actionId:'gzserver',entryNodeId:'panel-gzserver',callNodeIds:[nodeId] }]);
      spec.nodes.find((node) => node.id === nodeId)!.displayName = 'Renamed server call';

      expect(resolveRosBasicServiceWorkflowCall(spec,'gzserver')).toEqual({
        nodeId,automationResourceId:'gzserver-automation',actionId:'start-gzserver',
      });
    },
  );

  it('resolves the selected Action through automation.call nodes, not node labels or siblings',() => {
    const spec = specWithActions([
      { actionId:'roscore',entryNodeId:'entry-ros',callNodeIds:['call-ros'] },
      { actionId:'vrpn',entryNodeId:'entry-vrpn',callNodeIds:['call-vrpn-diagnostic'] },
      { actionId:'rviz',entryNodeId:'entry-rviz',callNodeIds:['call-rviz'] },
      { actionId:'gzclient',entryNodeId:'entry-gzclient',callNodeIds:['call-gzclient'] },
      { actionId:'adapters',entryNodeId:'entry-adapters',callNodeIds:['call-adapters'] },
    ]);
    spec.nodes.find((node) => node.id === 'call-vrpn-diagnostic')!.displayName = 'Anything';

    expect(resolveRosBasicServiceWorkflowCall(spec,'vrpn')).toEqual({
      nodeId:'call-vrpn-diagnostic',automationResourceId:'vrpn-automation',actionId:'start-vrpn',
    });
    expect(resolveRosBasicServiceWorkflowCall(spec,'adapters')).toEqual({
      nodeId:'call-adapters',automationResourceId:'adapters-automation',actionId:'start-adapters',
    });
  });

  it('returns no binding for a missing Action or one with no reachable call',() => {
    const spec = specWithActions([
      { actionId:'roscore',entryNodeId:'entry-ros',callNodeIds:['call-ros'] },
      { actionId:'gzserver',entryNodeId:'entry-gzserver' },
    ]);

    expect(resolveRosBasicServiceWorkflowCall(spec,'vrpn')).toBeUndefined();
    // automationActionWorkNodes intentionally falls back to the whole graph
    // for an entry with no work nodes; an unrelated sibling call still is not reachable.
    expect(resolveRosBasicServiceWorkflowCall(spec,'gzserver')).toBeUndefined();
  });

  it('returns no binding when an Action reaches multiple calls or incomplete call targets',() => {
    const multiple = specWithActions([{
      actionId:'gzserver',entryNodeId:'entry-gzserver',callNodeIds:['call-one','call-two'],
    }]);
    expect(resolveRosBasicServiceWorkflowCall(multiple,'gzserver')).toBeUndefined();

    const incomplete = specWithActions([{
      actionId:'gzserver',entryNodeId:'entry-gzserver',callNodeIds:['call-gzserver'],
    }]);
    incomplete.nodes.find((node) => node.id === 'call-gzserver')!.parameters.actionId = '';
    expect(resolveRosBasicServiceWorkflowCall(incomplete,'gzserver')).toBeUndefined();
  });
});
