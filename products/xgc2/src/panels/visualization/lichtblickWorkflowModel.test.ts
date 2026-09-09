// @vitest-environment jsdom

import { execFileSync } from 'node:child_process';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';
import type {
  AutomationDocument,
  AutomationSpec,
} from '../../domains/automation/automationPublic';
import {
  LICHTBLICK_CAMERA_TOPICS,
  LICHTBLICK_SYSTEM_WORKFLOW_KEY,
  lichtblickCameraTopicsForRunMode,
  lichtblickWorkflowValidationError,
  resolveLichtblickSystemWorkflow,
} from './lichtblickWorkflowModel';

describe('lichtblickWorkflowModel', () => {
  it('accepts the real provision builder spec with its two canonical Actions', () => {
    const workflow = fixture();
    expect(workflow.spec.actions.map((action) => ({
      id:action.id,
      version:action.version,
      label:action.label,
      entryNodeId:action.entryNodeId,
      kind:action.kind,
      controls:action.controls,
      resultSchema:action.resultSchema,
      requiredCapabilities:action.requiredCapabilities,
      projectionContracts:action.projectionContracts,
    }))).toEqual([
      {
        id:'start',version:2,label:'Start Lichtblick visualization',entryNodeId:'manual',
        kind:'service',controls:['cancel','stop'],resultSchema:{ fields:[] },
        requiredCapabilities:[],projectionContracts:['visualization-layout.v1'],
      },
      {
        id:'start-for-experiment',version:2,label:'Start Lichtblick visualization for Experiment',
        entryNodeId:'called',kind:'service',controls:['cancel','stop'],resultSchema:{ fields:[] },
        requiredCapabilities:[],projectionContracts:['visualization-layout.v1'],
      },
    ]);
    expect(resolveLichtblickSystemWorkflow([workflow])).toEqual({ document:workflow,error:'' });
    expect(lichtblickCameraTopicsForRunMode(workflow, 'simulation')).toEqual(LICHTBLICK_CAMERA_TOPICS.simulation);
    expect(lichtblickCameraTopicsForRunMode(workflow, 'hybrid')).toEqual(LICHTBLICK_CAMERA_TOPICS.physical);
    expect(lichtblickCameraTopicsForRunMode(workflow, 'physical')).toEqual(LICHTBLICK_CAMERA_TOPICS.physical);
    expect(lichtblickCameraTopicsForRunMode(workflow, 'unknown')).toBeUndefined();
  });

  it('resolves only one protected canonical system workflow', () => {
    const workflow = fixture();
    const editable = fixture('editable');
    editable.head.system = false;
    expect(resolveLichtblickSystemWorkflow([editable]).error).toContain('unavailable');
    expect(resolveLichtblickSystemWorkflow([workflow,fixture('duplicate')]).error)
      .toContain('multiple protected');
  });

  it('fails closed for a legacy single Action or any extra Action', () => {
    const single = fixture();
    single.spec.actions = single.spec.actions.filter((action) => action.id === 'start');
    expect(lichtblickWorkflowValidationError(single)).toContain('start and start-for-experiment');
    expect(lichtblickCameraTopicsForRunMode(single, 'simulation')).toBeUndefined();

    const extra = fixture();
    extra.spec.actions.push({ ...clone(extra.spec.actions[0]!),id:'unexpected-start' });
    expect(lichtblickWorkflowValidationError(extra)).toContain('start and start-for-experiment');
  });

  it('validates each Action version, entry, kind, controls, and complete input schema independently', () => {
    const changedSchema = fixture();
    changedSchema.spec.actions[1]!.inputSchema.fields = changedSchema.spec.actions[1]!.inputSchema.fields
      .filter((field) => field.name !== 'runMode');
    expect(lichtblickWorkflowValidationError(changedSchema)).toContain('start and start-for-experiment');

    const mutations: Array<(document:AutomationDocument) => void> = [
      (document) => { document.spec.actions[0]!.version = 1; },
      (document) => { document.spec.actions[1]!.entryNodeId = 'manual'; },
      (document) => { document.spec.actions[0]!.kind = 'command'; },
      (document) => { document.spec.actions[1]!.controls = ['stop','cancel']; },
    ];
    for (const mutate of mutations) {
      const document = fixture();
      mutate(document);
      expect(lichtblickWorkflowValidationError(document)).toContain('start and start-for-experiment');
    }
  });

  it('fails closed when either Action envelope drifts from the real builder contract', () => {
    const mutations: Array<(document:AutomationDocument) => void> = [
      (document) => { document.spec.actions[0]!.label = 'Start visualization'; },
      (document) => { document.spec.actions[1]!.resultSchema.fields.push({ name:'legacy',kind:'string' }); },
      (document) => { document.spec.actions[0]!.requiredCapabilities = ['core.view']; },
      (document) => { document.spec.actions[1]!.projectionContracts = ['legacy-layout.v1']; },
      (document) => { document.spec.actions[0]!.description = 'Unexpected alternate semantics.'; },
    ];
    for (const mutate of mutations) {
      const document = fixture();
      mutate(document);
      expect(lichtblickWorkflowValidationError(document)).toContain('start and start-for-experiment');
    }
  });

  it('rejects removed topic inputs instead of dual-reading old Action schemas', () => {
    const oldTopicInputs = fixture();
    for (const action of oldTopicInputs.spec.actions) {
      action.inputSchema.fields = action.inputSchema.fields
        .filter((field) => field.name !== 'runMode')
        .concat(
          { name:'cameraImageTopic',label:'Camera image topic',kind:'string',required:true,
            string:{ default:'/usb_cam/video' } },
          { name:'cameraInfoTopic',label:'Camera info topic',kind:'string',required:true,
            string:{ default:'/usb_cam/camera_info' } },
        );
    }
    expect(lichtblickWorkflowValidationError(oldTopicInputs)).toContain('start and start-for-experiment');
  });

  it('requires the exact bounded explicit visualization topic schemas', () => {
    for (const fieldName of ['visualizationTopics','transformTopics']) {
      const missing = fixture();
      missing.spec.actions[0]!.inputSchema.fields = missing.spec.actions[0]!.inputSchema.fields
        .filter((field) => field.name !== fieldName);
      expect(lichtblickWorkflowValidationError(missing)).toContain('start and start-for-experiment');
    }

    const widened = fixture();
    const visualization = widened.spec.actions[1]!.inputSchema.fields
      .find((field) => field.name === 'visualizationTopics')!;
    visualization.array!.maxItems = 17;
    expect(lichtblickWorkflowValidationError(widened)).toContain('start and start-for-experiment');

    const changedRole = fixture();
    const role = changedRole.spec.actions[0]!.inputSchema.fields
      .find((field) => field.name === 'visualizationTopics')!.array!.items.object!.fields
      .find((field) => field.name === 'role')!;
    role.string!.enum = ['prediction','paper-specific'];
    expect(lichtblickWorkflowValidationError(changedRole)).toContain('start and start-for-experiment');
  });

  it('rejects the retired single layout@2 graph and any drift in the run-mode selector', () => {
    const legacyLayout = fixture();
    find(legacyLayout, 'simulation-layout').typeVersion = 2;
    legacyLayout.spec.nodes = legacyLayout.spec.nodes.filter((candidate) => (
      candidate.id !== 'is-physical'
      && candidate.id !== 'physical-layout'
      && candidate.id !== 'lichtblick-layout'
    ));
    expect(lichtblickWorkflowValidationError(legacyLayout)).toContain('runMode is physical or hybrid');

    const wrongCondition = fixture();
    find(wrongCondition, 'is-physical').parameters.conditions = [
      { path:'/runMode',operator:'equals',value:'physical' },
    ];
    expect(lichtblickWorkflowValidationError(wrongCondition)).toContain('runMode is physical or hybrid');

    const wrongMerge = fixture();
    find(wrongMerge, 'lichtblick-layout').parameters.inputOrder = ['physical-layout','simulation-layout'];
    expect(lichtblickWorkflowValidationError(wrongMerge)).toContain('canonical merge');
  });

  it('rejects mutable topics, unbound bridge allowlists, and graph bypasses', () => {
    const wrongPhysicalTopic = fixture();
    find(wrongPhysicalTopic, 'physical-layout').parameters.cameraImageTopic = '/usb_cam/video';
    expect(lichtblickWorkflowValidationError(wrongPhysicalTopic)).toContain('layout version 5');

    const topicBinding = fixture();
    find(topicBinding, 'simulation-layout').parameterBindings!.push({
      target:'/cameraImageTopic',
      expression:'{{ $inputs["entry"].cameraImageTopic }}',
      language:'xgc-expression-v2',
    });
    expect(lichtblickWorkflowValidationError(topicBinding)).toContain('layout version 5');

    const unboundBridge = fixture();
    find(unboundBridge, 'foxglove-bridge').parameterBindings = [];
    expect(lichtblickWorkflowValidationError(unboundBridge)).toContain('selected frozen layout');

    const bypass = fixture();
    bypass.spec.edges.push({ id:'bypass',from:'entry',to:'lichtblick-web',condition:'success' });
    expect(lichtblickWorkflowValidationError(bypass)).toContain('exact canonical');
  });
});

const provisionedSpec = readProvisionedSpec();

function readProvisionedSpec(): AutomationSpec {
  const productRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const provisioner = join(productRoot, 'scripts/provision-lichtblick-automation.sh');
  const digest = (character:string) => character.repeat(64);
  const command = `
set -euo pipefail
source <(sed '/^wait_for_core$/,$d' "$1")
BRIDGE_DEFINITION_DIGEST="${digest('a')}"
LICHTBLICK_DEFINITION_DIGEST="${digest('b')}"
SCENE_DEFINITION_DIGEST="${digest('c')}"
DESCRIPTIONS_DEFINITION_DIGEST="${digest('d')}"
automation_spec
`;
  return JSON.parse(execFileSync('bash', ['-c',command,'lichtblick-builder',provisioner], {
    cwd:productRoot,
    encoding:'utf8',
  })) as AutomationSpec;
}

function fixture(resourceId = 'lichtblick-workflow'): AutomationDocument {
  const spec = clone(provisionedSpec);
  return {
    head:{
      domain:'automation',resourceId,name:spec.metadata.name,tags:[],mainCommitId:'commit',
      currentVersion:1,digest:'c'.repeat(64),revision:1,system:true,
      systemKey:LICHTBLICK_SYSTEM_WORKFLOW_KEY,createdAt:timestamp,updatedAt:timestamp,
    },
    branch:{
      domain:'automation',resourceId,name:'main',headCommitId:'commit',headVersion:1,
      revision:1,createdAt:timestamp,updatedAt:timestamp,
    },
    spec,
  };
}

function clone<T>(value:T):T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function find(document:AutomationDocument, id:string) {
  return document.spec.nodes.find((candidate) => candidate.id === id)!;
}

const timestamp = '2026-08-30T00:00:00Z';
