import { describe,expect,it } from 'vitest';
import type { AutomationChildRunRelation,AutomationRunDetail } from '../automation/automationPublic';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import {
  panelWorkflowRunTreeSelectorOptions,
  panelWorkflowTreeRootRunIds,
  projectPanelWorkflowRunTree,
  projectPanelWorkflowRunTrees,
  runRelationChildrenToHydrate,
} from './panelWorkflowRunTree';

describe('panelWorkflowRunTree',() => {
  it('projects root → panel child → nested automation child and omits sibling panels',() => {
    const value = runtime();
    value.runSummaries.push({
      ...run('old-panel-run','panel-workflow','start-for-experiment'),
      parentRunId:'root-run',rootRunId:'root-run',status:'stopped',revision:9,updatedAt:'s',
    });
    const roots = panelWorkflowTreeRootRunIds(value,['panel-workflow']);
    expect(roots).toEqual(['panel-run']);
    const tree = projectPanelWorkflowRunTree(value,'panel-run');
    expect(tree).toEqual(expect.objectContaining({
      runId:'panel-run',action:'start-for-experiment',automation:'panel-workflow',target:'local',
      status:'waiting',progress:'1/2',
    }));
    expect(tree?.children).toEqual([expect.objectContaining({
      runId:'nested-run',action:'run',automation:'nested-workflow',workflow:'nested-workflow',target:'local',
      status:'running',progress:'0/1',error:'nested failed to bind',
      children:[],
    })]);
    const trees = projectPanelWorkflowRunTrees(value,['panel-workflow']);
    expect(trees.map((node) => node.runId)).toEqual(['panel-run']);
    expect(JSON.stringify(trees)).not.toContain('sibling-run');
    expect(JSON.stringify(trees)).not.toContain('root-run');
  });

  it('preserves direct, grandchild, and deeper hierarchy in selector options',() => {
    const value = runtime();
    value.runSummaries.push(
      { ...run('grandchild-run','ros-core-workflow','start-ros-core'),parentRunId:'nested-run',rootRunId:'root-run' },
      { ...run('deeper-run','ros-provider-workflow','start-provider'),parentRunId:'grandchild-run',rootRunId:'root-run' },
    );
    value.runDetailsById['nested-run']!.relations = relations('nested-run',[
      child('grandchild-run',{
        parentRunId:'nested-run',ownerRunId:'nested-run',callNodeId:'call-ros-core',
        childDefinitionId:'ros-core-workflow',runRevision:2,revision:2,
      }),
    ]);
    value.runDetailsById['grandchild-run'] = detail('grandchild-run',[
      summary('grandchild-run','call-provider','waiting'),
    ],[
      child('deeper-run',{
        parentRunId:'grandchild-run',ownerRunId:'grandchild-run',callNodeId:'call-provider',
        childDefinitionId:'ros-provider-workflow',runStatus:'waiting',runRevision:2,revision:2,
      }),
    ]);
    value.runDetailsById['deeper-run'] = detail('deeper-run',[
      summary('deeper-run','provider','running'),
    ],[]);

    const trees = projectPanelWorkflowRunTrees(value,['panel-workflow']);
    expect(trees[0]?.children[0]?.children[0]?.children[0]?.runId).toBe('deeper-run');
    const options = panelWorkflowRunTreeSelectorOptions(trees);
    expect(options.map(({ runId,depth }) => ({ runId,depth }))).toEqual([
      { runId:'panel-run',depth:0 },
      { runId:'nested-run',depth:1 },
      { runId:'grandchild-run',depth:2 },
      { runId:'deeper-run',depth:3 },
    ]);
    expect(options[2]?.label).toContain('↳ ↳ ros-core-workflow · start-ros-core · local · running');
    expect(options[3]?.label).toContain('↳ ↳ ↳ ros-provider-workflow');
    expect(options.map((option) => option.runId)).not.toContain('sibling-run');
    expect(options.map((option) => option.runId)).not.toContain('root-run');
  });

  it('anchors the Panel root to the active command root instead of a newer same-Automation descendant',() => {
    const value = runtime();
    value.runSummaries.push({
      ...run('same-automation-child','panel-workflow','start-service'),
      parentRunId:'nested-run',rootRunId:'root-run',revision:20,updatedAt:'z',
    });
    value.runDetailsById['nested-run']!.relations = relations('nested-run',[
      child('same-automation-child',{
        parentRunId:'nested-run',ownerRunId:'nested-run',callNodeId:'call-service',
        childDefinitionId:'panel-workflow',runRevision:20,revision:20,
      }),
    ]);
    value.runDetailsById['same-automation-child'] = detail('same-automation-child',[],[]);

    expect(panelWorkflowTreeRootRunIds(value,['panel-workflow'])).toEqual(['panel-run']);
    const tree=projectPanelWorkflowRunTrees(value,['panel-workflow'])[0];
    expect(tree?.runId).toBe('panel-run');
    expect(tree?.children[0]?.children[0]?.runId).toBe('same-automation-child');
  });

  it('restores a direct Panel root from exact detail when bounded summaries only contain the command root',() => {
    const value = runtime();
    value.runSummaries = value.runSummaries.filter((candidate) => candidate.id!=='panel-run');
    value.runDetailsById['panel-run']!.run = {
      ...run('panel-run','panel-workflow','start-for-experiment'),
      parentRunId:'root-run',rootRunId:'root-run',status:'waiting',revision:3,
    } as NonNullable<AutomationRunDetail['run']>;

    expect(panelWorkflowTreeRootRunIds(value,['panel-workflow'])).toEqual(['panel-run']);
    expect(projectPanelWorkflowRunTrees(value,['panel-workflow'])[0]).toMatchObject({
      runId:'panel-run',status:'waiting',
    });
  });

  it('clears retained Panel trees when Stop removes every active Experiment lifecycle root',() => {
    const value = runtime();
    value.activeRun=undefined;
    value.activeRuns=[];

    expect(panelWorkflowTreeRootRunIds(value,['panel-workflow'])).toEqual([]);
    expect(projectPanelWorkflowRunTrees(value,['panel-workflow'])).toEqual([]);
  });

  it('excludes disconnected detached, abandoned, and remote targetRoot children',() => {
    const value = runtime();
    value.runDetailsById['panel-run']!.relations!.childRuns.push(
      child('detached-run',{ relation:'detached',runStatus:'running' }),
      child('abandoned-run',{ launchAbandonedAt:'t',launchAbandonedReason:'launch dropped',runStatus:'failed' }),
      child('remote-run',{ targetRoot:true,targetId:'agent/scout',observedStatus:'waiting' }),
    );
    value.runSummaries.push(
      run('detached-run','detached-workflow'),
      run('abandoned-run','abandoned-workflow'),
      run('remote-run','remote-workflow'),
    );
    const tree = projectPanelWorkflowRunTree(value,'panel-run');
    expect(tree?.children.map((node) => node.runId)).toEqual(['nested-run']);
    const hydrate = runRelationChildrenToHydrate(value.runDetailsById,['panel-run']);
    expect(hydrate.map((key) => key.runId)).toEqual(['nested-run']);
  });
});

describe('runRelationChildrenToHydrate',() => {
  it('emits nested children when parent detail is loaded and revisions advance',() => {
    const details = runtime().runDetailsById;
    expect(runRelationChildrenToHydrate(details,['panel-run'])).toEqual([
      { runId:'nested-run',runRevision:3,relationRevision:4 },
    ]);
    details['panel-run']!.relations!.childRuns[0].runRevision = 5;
    details['panel-run']!.relations!.childRuns[0].revision = 6;
    expect(runRelationChildrenToHydrate(details,['panel-run'])).toEqual([
      { runId:'nested-run',runRevision:5,relationRevision:6 },
    ]);
  });
});

function runtime():ExperimentProcessRuntimeProjection {
  return {
    targetId:'local',loading:false,error:'',processInstances:[],documents:[],catalog:[],
    runSummaries:[
      run('root-run','system-runner','run'),
      { ...run('panel-run','panel-workflow','start-for-experiment'),parentRunId:'root-run',rootRunId:'root-run',status:'waiting' },
      { ...run('nested-run','nested-workflow','run'),parentRunId:'panel-run',rootRunId:'root-run' },
      { ...run('sibling-run','sibling-workflow','run'),parentRunId:'root-run',rootRunId:'root-run' },
    ],
    runDetailsById:{
      'panel-run':detail('panel-run',[
        summary('panel-run','called','succeeded'),
        summary('panel-run','call-nested','waiting'),
      ],[child('nested-run',{ runStatus:'running',runRevision:3,revision:4 })]),
      'nested-run':{
        ...detail('nested-run',[summary('nested-run','work','running')],[ ]),
        run:{ id:'nested-run',targetId:'local',automationResourceId:'nested-workflow',actionId:'run',primaryError:'nested failed to bind' } as AutomationRunDetail['run'],
        error:'',
      },
    },
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'running',revision:1,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'panel',automationRef:{ domain:'automation',resourceId:'panel-workflow',branch:'main' },
        executionTargetId:'local',actionPresetIds:['start-for-experiment'],
      }],
    },
  };
}

function run(id:string,automationResourceId:string,actionId = 'run') {
  return {
    id,targetId:'local',automationResourceId,actionId,actionVersion:1,sourceKind:'experiment' as const,
    sourceRef:{ domain:'experiment' as const,resourceId:'experiment-1',branch:'main',commitId:'c',version:1,digest:'a'.repeat(64) },
    status:'running' as const,revision:1,rootRunId:id,createdAt:'t',updatedAt:'t',
  };
}

function detail(
  runId:string,
  nodeSummaries:AutomationRunDetail['nodeSummaries'],
  childRuns:AutomationChildRunRelation[],
):AutomationRunDetail {
  return {
    invocations:[],nodeSummaries,loading:false,error:'',
    relations:relations(runId,childRuns),
  };
}

function relations(runId:string,childRuns:AutomationChildRunRelation[]) {
  return { runId,childRuns,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] };
}

function summary(runId:string,nodeId:string,status:'succeeded'|'waiting'|'running') {
  return {
    runId,nodeId,kind:'automation.call',status,occurrenceCount:1,
    activeOccurrenceCount:status === 'running' || status === 'waiting' ? 1 : 0,
    completedOccurrenceCount:status === 'succeeded' ? 1 : 0,failedOccurrenceCount:0,
    attemptCount:1,updatedAt:'t',revision:1,
  };
}

function child(childRunId:string,overrides:Partial<AutomationChildRunRelation> = {}):AutomationChildRunRelation {
  return {
    id:`rel-${childRunId}`,targetId:'local',rootRunId:'root-run',parentRunId:'panel-run',
    parentInvocationId:'invoke-call',callNodeId:'call-nested',ordinal:0,childRunId,ownerRunId:'panel-run',
    childDefinitionId:'nested-workflow',childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
    childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',
    cancelPolicy:'cascade',resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',
    runStatus:'running',runRevision:3,revision:4,...overrides,
  };
}
