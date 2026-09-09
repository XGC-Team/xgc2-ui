// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeAll,describe,expect,it } from 'vitest';
import type { AutomationDocument,AutomationRunDetail } from '../../domains/automation/automationPublic';
import { newAutomationNode,newAutomationSpec } from '../../domains/automation/automationPublic';
import { CameraCalibrationWorkflowView } from './CameraCalibrationWorkflowView';

beforeAll(() => {
  class TestResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      Object.defineProperty(target, 'offsetWidth', { configurable: true,value: 112 });
      Object.defineProperty(target, 'offsetHeight', { configurable: true,value: 92 });
      queueMicrotask(() => this.callback([{
        target,
        contentRect: { width: 112,height: 92 },
      } as ResizeObserverEntry], this as unknown as ResizeObserver));
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: TestResizeObserver,writable: true });
  if (!globalThis.DOMMatrixReadOnly) {
    Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
      configurable: true,
      value: class TestDOMMatrixReadOnly { m22 = 1; },
    });
  }
});

describe('CameraCalibrationWorkflowView', () => {
  it('shows readable running state from the Panel Workflow execution ledger', () => {
    const { container } = render(<div style={{ width: 800,height: 500 }}>
      <CameraCalibrationWorkflowView
        kind="intrinsic"
        panelId="intrinsic"
        workflow={workflow()}
        detail={runningDetail()}
        catalog={[]}
      />
    </div>);

    const waiting = container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="read-request"]')!;
    expect(waiting).toHaveAttribute('data-xgc-status', 'running');
    expect(waiting).toHaveAttribute('data-xgc-runtime-state', 'active');
    expect(waiting.querySelector('[data-xgc-role="automation-node-tile"]')).not.toHaveAttribute('data-running');
    expect(waiting.querySelector('[data-xgc-role="automation-node-operator-status"]')).toHaveTextContent('running');

    const succeeded = container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="managed"]')!;
    expect(succeeded).toHaveAttribute('data-xgc-status', 'passing');
    expect(succeeded).not.toHaveAttribute('data-xgc-runtime-state');
    expect(succeeded.querySelector('[data-xgc-role="automation-node-tile"]')).not.toHaveAttribute('data-running');
  });

  it('does not invent a running effect when the Panel Workflow has no live Run', () => {
    const { container } = render(<div style={{ width: 800,height: 500 }}>
      <CameraCalibrationWorkflowView
        kind="intrinsic"
        panelId="intrinsic"
        workflow={workflow()}
        catalog={[]}
      />
    </div>);
    const node = container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="read-request"]')!;
    expect(node).not.toHaveAttribute('data-xgc-runtime-state');
    expect(node.querySelector('[data-xgc-role="automation-node-tile"]')).not.toHaveAttribute('data-running');
    expect(container.querySelector('[data-xgc-role="camera-calibration-provider-lifecycle"]')).toBeNull();
  });

});

function workflow(): AutomationDocument {
  const spec = newAutomationSpec('Camera intrinsic');
  spec.nodes = [
    { ...newAutomationNode('trigger.automation-call'),id: 'managed',displayName: 'Run as managed Experiment Panel' },
    { ...newAutomationNode('wait.event'),id: 'read-request',displayName: 'Read calibration request' },
    { ...newAutomationNode('process.run-definition'),id: 'run-calibration',displayName: 'Run calibration' },
  ];
  spec.edges = [
    { id: 'managed-read',from: 'managed',to: 'read-request',condition: 'success' },
    { id: 'read-run',from: 'read-request',to: 'run-calibration',condition: 'success' },
  ];
  return {
    head: {
      domain: 'automation',resourceId: 'camera-physical',name: 'Physical',tags: [],
      mainCommitId: 'c',currentVersion: 1,digest: 'd'.repeat(64),revision: 1,createdAt: 't',updatedAt: 't',
    },
    branch: {
      domain: 'automation',resourceId: 'camera-physical',name: 'main',headCommitId: 'c',
      headVersion: 1,revision: 1,createdAt: 't',updatedAt: 't',
    },
    spec,
  };
}

function runningDetail(): AutomationRunDetail {
  const spec = workflow().spec;
  const ref = {
    domain: 'automation' as const,resourceId: 'camera-physical',branch: 'main',
    commitId: 'c',version: 1,digest: 'd'.repeat(64),
  };
  return {
    invocations: [],
    nodeSummaries: [
      {
        runId: 'panel-run',nodeId: 'managed',kind: 'trigger.automation-call',status: 'succeeded',
        attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,
        failedOccurrenceCount: 0,updatedAt: 't',revision: 1,
      },
      {
        runId: 'panel-run',nodeId: 'read-request',kind: 'wait.event',status: 'waiting',
        attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 1,completedOccurrenceCount: 0,
        failedOccurrenceCount: 0,updatedAt: 't',revision: 1,
      },
    ],
    snapshot: {
      runId: 'panel-run',targetId: 'local',sourceKind: 'automation',sourceRef: ref,
      automationRef: ref,assetContext: { schemaVersion: 1 },automationSpec: spec,
      definitionDigest: 'd'.repeat(64),digest: 'e'.repeat(64),createdAt: 't',
    },
    loading: false,
    error: '',
  };
}
