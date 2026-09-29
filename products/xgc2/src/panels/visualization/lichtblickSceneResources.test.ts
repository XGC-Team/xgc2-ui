import { describe,expect,it } from 'vitest';
import {
  newAutomationNode,
  newAutomationSpec,
  type AutomationDocument,
} from '../../domains/automation/automationPublic';
import {
  isOrdinarySceneWorkflow,
  ordinarySceneResources,
  sceneNamespaceFromWorkflow,
} from './lichtblickSceneResources';

function document(resourceId:string,spec = newAutomationSpec('Paper Leader Scene')):AutomationDocument {
  const time='2026-09-11T00:00:00Z';
  return {
    head:{
      domain:'automation',resourceId,namespaceId:'',name:'Paper Leader Scene',description:'',tags:[],
      mainCommitId:'commit-1',currentVersion:1,digest:'a'.repeat(64),revision:1,
      createdAt:time,updatedAt:time,
    },
    branch:{
      domain:'automation',resourceId,name:'main',headCommitId:'commit-1',
      headVersion:1,revision:1,createdAt:time,updatedAt:time,
    },
    spec,
  };
}

function sceneWorkflow(resourceId='scene-paper',namespace='/xgc/scene'):AutomationDocument {
  const spec=newAutomationSpec('Paper Leader Scene');
  spec.nodes.push({
    ...newAutomationNode('process.run-definition',{
      definitionId:'xgc2-scene-runtime-ros1',
      parameters:{ sceneNamespace:namespace },
    }),
    id:'scene-runtime',
  });
  return document(resourceId,spec);
}

describe('ordinary scene resources',() => {
  it('lists ordinary scene workflows and treats no scene as a legal empty set',() => {
    expect(ordinarySceneResources([])).toEqual([]);
    expect(ordinarySceneResources([sceneWorkflow()])).toEqual([
      { resourceId:'scene-paper',name:'Paper Leader Scene',namespace:'/xgc/scene' },
    ]);
  });

  it('rejects system, archived, derived, or namespace-invalid scene workflows',() => {
    const system=sceneWorkflow('system-scene');
    system.head.system=true;
    const archived=sceneWorkflow('archived-scene');
    archived.head.archived=true;
    const derived=sceneWorkflow('derived-scene');
    derived.head.originResourceId='scene-paper';
    const invalid=sceneWorkflow('bad-ns','scene');
    expect(isOrdinarySceneWorkflow(system)).toBe(false);
    expect(isOrdinarySceneWorkflow(archived)).toBe(false);
    expect(isOrdinarySceneWorkflow(derived)).toBe(false);
    expect(sceneNamespaceFromWorkflow(invalid)).toBe('');
    expect(ordinarySceneResources([system,archived,derived,invalid])).toEqual([]);
  });

  it('reads sceneNamespace from the scene-command Action default when the process node omits it',() => {
    const spec=newAutomationSpec('Fallback Scene');
    spec.nodes.push({
      ...newAutomationNode('process.run-definition',{ definitionId:'xgc2-scene-runtime-ros1' }),
      id:'scene-runtime',
    });
    spec.actions[0]!.inputSchema.fields=[{
      name:'sceneNamespace',label:'Obstacle scene namespace',kind:'string',string:{ default:'/xgc/scene' },
    }];
    const workflow=document('fallback-scene',spec);
    workflow.head.name='Fallback Scene';
    expect(ordinarySceneResources([workflow])).toEqual([
      { resourceId:'fallback-scene',name:'Fallback Scene',namespace:'/xgc/scene' },
    ]);
  });
});
