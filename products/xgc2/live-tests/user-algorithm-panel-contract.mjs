/* global structuredClone */

const canonicalMarkerPattern=/^[a-z][a-z0-9-]{2,31}$/;
const activeStatuses=new Set(['accepted','queued','running','waiting','stopping']);

export const USER_ALGORITHM_PANEL_LANES=Object.freeze([
  Object.freeze({
    key:'four-scout',label:'4 Scout',experimentName:'4 Scout Mini vehicles experiment',
    requiredTags:Object.freeze(['devfixture','scout']),
    robotNamespaces:Object.freeze(['/ugv1','/ugv2','/ugv3','/ugv4']),
  }),
  Object.freeze({
    key:'six-fs150',label:'6 FS150',experimentName:'6 PX4 multirotors experiment',
    requiredTags:Object.freeze(['devfixture','px4']),
    robotNamespaces:Object.freeze(['/uav1','/uav2','/uav3','/uav4','/uav5','/uav6']),
  }),
]);

export const USER_ALGORITHM_PANEL_VARIANTS=Object.freeze([
  Object.freeze({ key:'live',label:'Algorithm',failCompile:false }),
  Object.freeze({ key:'failure',label:'Compile failure',failCompile:true }),
]);

export const USER_ALGORITHM_PANEL_MULTI_BINDINGS=Object.freeze([
  Object.freeze({ key:'primary',portId:'workflow',presetId:'primary' }),
  Object.freeze({ key:'secondary',portId:'fallback',presetId:'secondary' }),
]);

export function normalizeE2EMarker(value) {
  const marker=String(value??'').trim();
  if (!canonicalMarkerPattern.test(marker)) {
    throw new Error(`E2E marker must match ${canonicalMarkerPattern}: ${JSON.stringify(value)}`);
  }
  return marker;
}

export function resolveLaneExperiment(lane,documents) {
  const matches=(documents??[]).filter((document) => (
    document?.spec?.name===lane.experimentName
    && lane.requiredTags.every((tag) => document.spec.tags?.includes(tag))
    && !document?.head?.originResourceId
  ));
  if (matches.length!==1) {
    throw new Error(`expected one public ${lane.label} Experiment, found ${matches.length}`);
  }
  return assertLaneExperiment(lane,matches[0]);
}

export function assertLaneExperiment(lane,experiment) {
  if (experiment?.head?.domain!=='experiment'
    || typeof experiment.head.resourceId!=='string' || !experiment.head.resourceId
    || experiment?.branch?.name!=='main'
    || experiment?.spec?.schemaVersion!==15) {
    throw new Error(`${lane.label} Experiment is not one public schema-v15 main document`);
  }
  const runModes=[...(experiment.spec.runModes??[])].sort();
  if (JSON.stringify(runModes)!==JSON.stringify(['hybrid','physical','simulation'])) {
    throw new Error(`${lane.label} Experiment must author simulation, physical, and hybrid`);
  }
  const namespaces=(experiment.spec.robots??[]).map((robot) => robot.namespace).sort();
  if (JSON.stringify(namespaces)!==JSON.stringify([...lane.robotNamespaces].sort())) {
    throw new Error(`${lane.label} Experiment robot namespace roster drifted`);
  }
  if (!(experiment.spec.dashboards??[]).some((dashboard) => dashboard.id==='gcs')) {
    throw new Error(`${lane.label} Experiment has no GCS dashboard`);
  }
  return experiment;
}

export function buildProbeUserScriptSpecs(markerValue) {
  const marker=normalizeE2EMarker(markerValue);
  return {
    compile:{
      schemaVersion:1,
      name:`xgc.e2e.user-algorithm.compile.${marker}`,
      description:'Compile-stage probe for public user Algorithm Panel acceptance.',
      tags:['compile','e2e','user'],
      interpreter:'bash',
      source:`#!/usr/bin/env bash
set -euo pipefail
lane="\${XGC_IN_LANE:?lane is required}"
fail_compile="\${XGC_IN_FAIL_COMPILE:?fail_compile is required}"
echo "xgc2-user-algorithm-panel compile started lane=$lane"
if [[ "$fail_compile" == true ]]; then
  echo "user-project ROS source is unavailable" >&2
  exit 42
fi
[[ "$fail_compile" == false ]] || { echo "invalid fail_compile input" >&2; exit 2; }
echo "xgc2-user-algorithm-panel compile completed lane=$lane"
`,
      package:'',executable:'',launchFile:'',defaultArgs:[],setupScripts:[],env:{},timeoutSeconds:60,
      inputs:[
        {name:'fail_compile',kind:'boolean',required:true,default:'false',description:'Inject the known compile-source failure.'},
        {name:'lane',kind:'string',required:true,default:'',description:'Acceptance lane identity.'},
      ],
    },
    runtime:{
      schemaVersion:1,
      name:`xgc.e2e.user-algorithm.runtime.${marker}`,
      description:'Long-running generic user Algorithm Panel probe stopped by Panel ownership.',
      tags:['e2e','runtime','user'],
      interpreter:'bash',
      source:`#!/usr/bin/env bash
set -euo pipefail
lane="\${XGC_IN_LANE:?lane is required}"
stopped=false
stop_runtime() {
  stopped=true
  echo "xgc2-user-algorithm-panel runtime stopped lane=$lane"
  exit 0
}
trap stop_runtime TERM INT
echo "xgc2-user-algorithm-panel runtime ready lane=$lane"
while [[ "$stopped" == false ]]; do sleep 1; done
`,
      package:'',executable:'',launchFile:'',defaultArgs:[],setupScripts:[],env:{},timeoutSeconds:600,
      inputs:[
        {name:'lane',kind:'string',required:true,default:'',description:'Acceptance lane identity.'},
      ],
    },
  };
}

export function buildProbeAutomationSpec({ marker:markerValue,compileAssetId,runtimeAssetId }) {
  const marker=normalizeE2EMarker(markerValue);
  requireResourceId(compileAssetId,'compileAssetId');
  requireResourceId(runtimeAssetId,'runtimeAssetId');
  const fields=[
    {name:'runMode',label:'Run mode',kind:'string',required:true,string:{default:'simulation',enum:['simulation','physical','hybrid']}},
    {name:'lane',label:'Lane',kind:'string',required:true,string:{default:'four-scout',enum:USER_ALGORITHM_PANEL_LANES.map(({ key }) => key)}},
    {name:'failCompile',label:'Fail compile',kind:'boolean',required:true,boolean:{default:false}},
  ];
  const admission={ concurrency:{ scope:'workflow',limit:1,onConflict:'reject',appliesTo:'all' } };
  return {
    schemaVersion:4,
    metadata:{
      name:`User Algorithm Panel E2E ${marker}`,
      description:'Disposable public-API acceptance workflow for generic user algorithms.',
      tags:['e2e','user',`xgc.e2e.user-algorithm-panel.${marker}`],
    },
    targetPolicy:{ mode:'fixed',executionTargetId:'local' },
    nodes:[
      {id:'manual',displayName:'Manual start',kind:'trigger.manual',typeVersion:2,parameters:{},position:{x:0,y:80}},
      {id:'called',displayName:'Experiment binding entry',kind:'trigger.automation-call',typeVersion:1,parameters:{},position:{x:0,y:240}},
      {id:'entry',displayName:'Read Panel inputs',kind:'merge',typeVersion:1,
        parameters:{mode:'choose-first',inputOrder:['manual','called']},position:{x:260,y:160}},
      {id:'simulation-mode',displayName:'IF simulation',kind:'condition',typeVersion:2,
        parameters:{source:'input',inputNode:'entry',itemsPath:'',combinator:'all',conditions:[
          {path:'/runMode',operator:'equals',value:'simulation'},
        ]},position:{x:520,y:160}},
      {id:'compile',displayName:'Compile user project',kind:'user.script',typeVersion:1,
        parameters:{assetResourceId:compileAssetId,inputs:{lane:'',fail_compile:false},timeoutSeconds:60},
        parameterBindings:[
          {target:'/inputs/lane',expression:'{{ $inputs["entry"].lane }}',language:'xgc-expression-v2'},
          {target:'/inputs/fail_compile',expression:'{{ $inputs["entry"].failCompile }}',language:'xgc-expression-v2'},
        ],position:{x:800,y:80}},
      {id:'algorithm',displayName:'Run user algorithm',kind:'user.script',typeVersion:1,
        parameters:{assetResourceId:runtimeAssetId,inputs:{lane:''},timeoutSeconds:600},
        parameterBindings:[
          {target:'/inputs/lane',expression:'{{ $inputs["entry"].lane }}',language:'xgc-expression-v2'},
        ],position:{x:1080,y:80}},
      {id:'result-merge',displayName:'Join selected mode result',kind:'merge',typeVersion:1,
        parameters:{mode:'choose-first',inputOrder:['algorithm','simulation-mode']},position:{x:1360,y:160}},
      {id:'return',displayName:'Return Panel result',kind:'automation.return',typeVersion:1,parameters:{},position:{x:1640,y:160}},
    ],
    edges:[
      {id:'manual-to-entry',from:'manual',to:'entry',condition:'always'},
      {id:'called-to-entry',from:'called',to:'entry',condition:'always'},
      {id:'entry-to-simulation-mode',from:'entry',to:'simulation-mode',condition:'success'},
      {id:'simulation-to-compile',from:'simulation-mode',to:'compile',sourcePort:'true',route:'true',condition:'success'},
      {id:'non-simulation-to-result',from:'simulation-mode',to:'result-merge',sourcePort:'false',route:'false',condition:'always'},
      {id:'compile-to-algorithm',from:'compile',to:'algorithm',sourcePort:'completed',route:'completed',condition:'success'},
      {id:'algorithm-to-result',from:'algorithm',to:'result-merge',sourcePort:'completed',route:'completed',condition:'always'},
      {id:'result-to-return',from:'result-merge',to:'return',condition:'success'},
    ],
    actions:[
      {id:'run',version:1,label:'Run user algorithm probe',entryNodeId:'manual',kind:'service',
        inputSchema:{title:'User Algorithm Panel E2E',fields},resultSchema:{fields:[]},controls:['cancel','stop'],
        admission,requiredCapabilities:[],projectionContracts:[]},
      {id:'run-for-experiment',version:1,label:'Run user algorithm probe for Experiment',entryNodeId:'called',kind:'service',
        inputSchema:{title:'User Algorithm Panel E2E',fields},resultSchema:{fields:[]},controls:['cancel','stop'],
        admission,requiredCapabilities:[],projectionContracts:[]},
    ],
  };
}

export function buildLanePanelFixtures({ lane,automationResourceId,marker:markerValue }) {
  const marker=normalizeE2EMarker(markerValue);
  requireResourceId(automationResourceId,'automationResourceId');
  return USER_ALGORITHM_PANEL_VARIANTS.map((variant) => {
    const id=`${marker}-${lane.key}-${variant.key}`;
    return {
      variant,
      workflow:{
        id,ref:{domain:'automation',resourceId:automationResourceId,branch:'main'},
        actionPresets:[{
          id:'run',actionId:'run-for-experiment',
          inputs:{runMode:'simulation',lane:lane.key,failCompile:variant.failCompile},
          parameterBindings:[{target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2'}],
        }],
      },
      panel:{
        schemaVersion:4,id,pluginId:'automation-workflow-control',
        title:`E2E ${lane.label} ${variant.label}`,
        grid:{x:0,y:0,w:7,h:4},
        view:{query:{},options:{dashboard:'gcs',gridColumns:30,automationResourceIds:[automationResourceId],
          defaultView:'controls',historyLimit:10,followLogs:true},fieldConfig:{}},
        portBindings:[
          {portId:'panel-workflow',kind:'workflow',workflowInstanceId:id,presetId:'run',managed:true,
            relation:'supervised',failurePolicy:'keep-experiment'},
          {portId:'workflow',kind:'action',presetId:'run'},
          {portId:'trace',kind:'data',projection:'workflowruntime.run.logs'},
        ],
      },
    };
  });
}

export function buildMultiBindingPanelFixture({ lane,automationResourceId,marker:markerValue }) {
  const marker=normalizeE2EMarker(markerValue);
  requireResourceId(automationResourceId,'automationResourceId');
  const id=`${marker}-${lane.key}-multi`;
  return {
    variant:{ key:'multi',label:'Multiple bindings',failCompile:false },
    bindings:USER_ALGORITHM_PANEL_MULTI_BINDINGS,
    workflow:{
      id,ref:{domain:'automation',resourceId:automationResourceId,branch:'main'},
      actionPresets:USER_ALGORITHM_PANEL_MULTI_BINDINGS.map(({ presetId }) => ({
        id:presetId,actionId:'run-for-experiment',
        inputs:{runMode:'simulation',lane:lane.key,failCompile:false},
        parameterBindings:[{target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2'}],
      })),
    },
    panel:{
      schemaVersion:4,id,pluginId:'automation-workflow-control',
      title:`E2E ${lane.label} multiple bindings`,
      grid:{x:0,y:0,w:14,h:4},
      view:{query:{},options:{dashboard:'gcs',gridColumns:30,automationResourceIds:[automationResourceId],
        defaultView:'controls',historyLimit:10,followLogs:true},fieldConfig:{}},
      portBindings:[
        {portId:'panel-workflow',kind:'workflow',workflowInstanceId:id,presetId:'primary',managed:true,
          relation:'supervised',failurePolicy:'keep-experiment'},
        ...USER_ALGORITHM_PANEL_MULTI_BINDINGS.map(({ portId,presetId }) => (
          {portId,kind:'action',presetId}
        )),
        {portId:'trace',kind:'data',projection:'workflowruntime.run.logs'},
      ],
    },
  };
}

export function attachLanePanelFixtures(experiment,fixtures) {
  const next=structuredClone(experiment.spec);
  const gcs=next.dashboards?.find((dashboard) => dashboard.id==='gcs');
  if (!gcs) throw new Error('Experiment has no GCS dashboard');
  next.workflowInstances??=[];
  gcs.panels??=[];
  const newIds=new Set(fixtures.flatMap(({ workflow,panel }) => [workflow.id,panel.id]));
  if (newIds.size!==fixtures.length) throw new Error('Panel fixture identities must pair one Workflow and one Panel');
  if (next.workflowInstances.some(({ id }) => newIds.has(id))
    || gcs.panels.some(({ id }) => newIds.has(id))) {
    throw new Error('Experiment already contains this E2E Panel fixture identity');
  }
  const positions=firstAvailablePanelGrids(gcs.panels,fixtures.length,{ w:7,h:4 });
  fixtures.forEach(({ workflow,panel },index) => {
    next.workflowInstances.push(workflow);
    gcs.panels.push({ ...panel,grid:positions[index] });
  });
  next.workflowInstances.sort((left,right) => left.id.localeCompare(right.id));
  gcs.panels.sort((left,right) => left.id.localeCompare(right.id));
  return next;
}

export function createConfigurationRequest(spec,{ requestId,reason }) {
  requireIntent(requestId,reason);
  return { namespaceId:'',spec,reason,requestId,idempotencyKey:requestId };
}

export function commitConfigurationRequest(document,spec,{ requestId,reason }) {
  requireIntent(requestId,reason);
  if (!document?.branch?.headCommitId
    || !Number.isSafeInteger(document.branch.revision)
    || !Number.isSafeInteger(document?.head?.revision)) {
    throw new Error('configuration document is missing exact CAS revisions');
  }
  return {
    spec,baseCommitId:document.branch.headCommitId,
    expectedBranchRevision:document.branch.revision,
    expectedResourceRevision:document.head.revision,
    reason,requestId,idempotencyKey:requestId,
  };
}

export function archiveConfigurationRequest(document,{ requestId,reason }) {
  requireIntent(requestId,reason);
  if (!Number.isSafeInteger(document?.head?.revision)) {
    throw new Error('configuration document is missing resource revision');
  }
  return { expectedRevision:document.head.revision,reason,requestId,idempotencyKey:requestId };
}

export function assertOrdinaryCreatedResource(document,domain) {
  if (document?.head?.domain!==domain
    || typeof document.head.resourceId!=='string' || !document.head.resourceId
    || document.head.system===true || document.head.systemKey || document.head.originResourceId
    || document?.branch?.name!=='main') {
    throw new Error(`public ${domain} Create did not return one ordinary main-branch resource`);
  }
  return document;
}

export function assertUserScriptModeExecution(mode,nodeSummaries,{ failCompile=false }={}) {
  if (!['simulation','physical','hybrid'].includes(mode)) throw new Error(`unknown run mode ${mode}`);
  const scripts=(nodeSummaries??[]).filter((node) => node.kind==='user.script');
  const byId=new Map(scripts.map((node) => [node.nodeId,node]));
  const compile=byId.get('compile');
  const algorithm=byId.get('algorithm');
  const compileOccurrences=occurrences(compile);
  const algorithmOccurrences=occurrences(algorithm);
  if (mode!=='simulation') {
    if (compileOccurrences!==0 || algorithmOccurrences!==0) {
      throw new Error(`${mode} executed user.script nodes: compile=${compileOccurrences} algorithm=${algorithmOccurrences}`);
    }
    return { compile:0,algorithm:0 };
  }
  if (compileOccurrences!==1) throw new Error(`simulation compile occurrences=${compileOccurrences}, expected 1`);
  if (failCompile) {
    if (algorithmOccurrences!==0) throw new Error(`failed simulation executed algorithm ${algorithmOccurrences} times`);
    if (!(Number(compile?.failedOccurrenceCount)>0 || compile?.status==='failed' || compile?.status==='compensated')
      || !String(compile?.error??'').includes('user-project ROS source is unavailable')) {
      throw new Error('failed simulation compile summary does not expose the source-unavailable error');
    }
    return { compile:1,algorithm:0 };
  }
  if (algorithmOccurrences!==1) throw new Error(`simulation algorithm occurrences=${algorithmOccurrences}, expected 1`);
  if (Number(compile?.failedOccurrenceCount)>0 || Number(algorithm?.failedOccurrenceCount)>0) {
    throw new Error('successful simulation recorded a failed user.script occurrence');
  }
  return { compile:1,algorithm:1 };
}

export function assertPanelTraceText(text,{ failCompile=false }={}) {
  const value=String(text??'').trim();
  if (!value) throw new Error('Algorithm Panel trace is blank');
  if (!value.includes('compile')) throw new Error('Algorithm Panel trace omits the compile node');
  if (failCompile) {
    if (!value.includes('user-project ROS source is unavailable')) {
      throw new Error('Algorithm Panel trace omits the compile failure log');
    }
  } else if (!value.includes('algorithm')) {
    throw new Error('Algorithm Panel trace omits the algorithm node');
  }
  return value;
}

export function panelSelectors(panelId) {
  requireResourceId(panelId,'panelId');
  return Object.freeze({
    frame:`[data-xgc-role="experiment-panel"][data-xgc-id="${panelId}"]`,
    header:`[data-xgc-role="experiment-panel-header"][data-xgc-id="${panelId}"]`,
    run:`[data-xgc-role="panel-workflow-run"][data-xgc-id="${panelId}"]`,
    stop:`[data-xgc-role="panel-workflow-stop"][data-xgc-id="${panelId}"]`,
    trace:`[data-xgc-role="automation-workflow-trace"]`,
  });
}

export function multiBindingPanelSelectors(panelId,portId) {
  requireResourceId(panelId,'panelId');
  requireResourceId(portId,'portId');
  const frame=`[data-xgc-role="experiment-panel"][data-xgc-id="${panelId}"]`;
  return Object.freeze({
    frame,
    actionInvoke:`${frame} [data-xgc-role="panel-action-invoke"][data-xgc-id="${portId}"]`,
    headerStop:`${frame} [data-xgc-role="panel-workflow-stop"][data-xgc-id="${panelId}"]`,
    trace:`[data-xgc-role="automation-workflow-trace"]`,
  });
}

export function isRunActive(status) {
  return activeStatuses.has(status);
}

function firstAvailablePanelGrids(existing,count,{ w,h }) {
  const result=[];
  for (let y=0;y<1000 && result.length<count;y+=1) {
    for (let x=0;x+w<=30 && result.length<count;x+=w) {
      const candidate={ x,y,w,h };
      if ([...existing.map(({ grid }) => grid),...result].every((grid) => !overlaps(candidate,grid))) {
        result.push(candidate);
      }
    }
  }
  if (result.length!==count) throw new Error(`cannot place ${count} E2E Panels without overlap`);
  return result;
}

function overlaps(left,right) {
  return !((left.x+left.w)<=right.x || (right.x+right.w)<=left.x
    || (left.y+left.h)<=right.y || (right.y+right.h)<=left.y);
}

function occurrences(node) {
  return Number.isSafeInteger(node?.occurrenceCount) ? node.occurrenceCount : 0;
}

function requireIntent(requestId,reason) {
  if (typeof requestId!=='string' || !requestId.trim()
    || typeof reason!=='string' || !reason.trim()) {
    throw new Error('configuration mutation requires non-empty requestId and reason');
  }
}

function requireResourceId(value,label) {
  if (typeof value!=='string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} must be a non-empty resource identity`);
  }
  return value;
}
