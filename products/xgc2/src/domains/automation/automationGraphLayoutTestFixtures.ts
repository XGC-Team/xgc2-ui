import type { AutomationEdge,AutomationNode,AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { newAutomationNode } from './automationSpecModel';

// Topology and port geometry of the marked SCE1 workflow, without execution
// parameters, resource IDs or robot commands. Keep the independent actions and
// the context -> recorder edge that skips the robot-bindings rank.
export function sce1LayoutFixture() {
  const nodes: AutomationNode[] = [];
  const edges: AutomationEdge[] = [];
  const groups: string[][] = [];
  const catalog: AutomationNodeCatalogEntry[] = [
    ['trigger.manual',2,undefined],['process.run-bash',1,['completed','error']],
    ['ros1.wait-topic-message',1,['ready','error']],['ros1.publish-topic',3,['published','error']],
    ['experiment.session.context',3,['context']],['asset.experiment-robots',4,undefined],
    ['ros1.record-bag',1,['ready','stopped','error']],['ros1.wait-record-bag-ready',1,['ready','error']],
    ['automation.call',4,undefined],
  ].map(([kind,typeVersion,ports]) => ({
    kind: kind as string,typeVersion: typeVersion as number,label: kind as string,category: 'test',traits: [],parameterSchema: {},
    ...(!ports ? {} : { outputPorts: (ports as string[]).map((id) => ({ id,label: id })) }),
  }));
  const node = (id: string,kind: string) => {
    nodes.push({ ...newAutomationNode(kind,{},id,catalog.find((entry) => entry.kind === kind)!.typeVersion),id });
    return id;
  };
  const edge = (from: string,to: string,sourcePort?: string) => edges.push({ id: `${from}:${to}`,from,to,condition: 'success',...(sourcePort ? { sourcePort } : {}) });
  groups.push([
    node('manual','trigger.manual'),node('algorithm','process.run-bash'),node('wait-status','ros1.wait-topic-message'),
    node('publish-bootstrap-reset','ros1.publish-topic'),node('wait-algorithm-ready','ros1.wait-topic-message'),
    node('session-context','experiment.session.context'),node('robot-bindings','asset.experiment-robots'),node('recorder','ros1.record-bag'),
  ]);
  edge('manual','algorithm');edge('manual','wait-status');edge('wait-status','publish-bootstrap-reset','ready');
  edge('publish-bootstrap-reset','wait-algorithm-ready','published');edge('wait-algorithm-ready','session-context','ready');
  edge('session-context','robot-bindings');edge('session-context','recorder','context');edge('robot-bindings','recorder');
  for (const action of ['custom1','hold','land','start','takeoff']) {
    const chain = [
      node(`trigger-${action}`,'trigger.manual'),node(`wait-algorithm-ready-${action}`,'ros1.wait-topic-message'),
      node(`session-context-${action}`,'experiment.session.context'),node(`wait-recorder-${action}`,'ros1.wait-record-bag-ready'),
      node(`publish-${action}`,'ros1.publish-topic'),
    ];
    groups.push(chain);
    for (let index = 0;index < chain.length - 1;index += 1) edge(chain[index],chain[index + 1],[undefined,'ready','context','ready'][index]);
  }
  groups.push([node('trigger-reset','trigger.manual'),node('wait-status-reset','ros1.wait-topic-message'),node('publish-reset','ros1.publish-topic')]);
  edge('trigger-reset','wait-status-reset');edge('wait-status-reset','publish-reset','ready');
  groups.push([node('trigger-reset-pose','trigger.manual'),node('call-reset-pose','automation.call')]);
  edge('trigger-reset-pose','call-reset-pose');
  // API document serialization sorts node/edge IDs, not action traversal order.
  nodes.sort((a,b) => a.id.localeCompare(b.id));
  edges.sort((a,b) => a.id.localeCompare(b.id));
  return { nodes,edges,catalog,groups };
}
