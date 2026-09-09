// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { BindingResourceDocument,ExperimentDocument } from './experimentModel';
import { ExperimentCreateDialog,ExperimentSettingsDrawer } from './ExperimentResourceDrawers';

describe('Experiment resource drawers', () => {
  it('creates metadata without exposing or submitting Robot bindings', () => {
    const onCreate = vi.fn();
    const { container } = render(
      <ExperimentCreateDialog
        onClose={vi.fn()}
        onCreate={onCreate}
        onCreateNamespace={vi.fn()}
        namespaces={[]}
      />,
    );
    expect(container.querySelector('[data-xgc-role="experiment-robot-bindings"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'),{ target: { value: 'Experiment A' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Experiment A',
      tags: [],
      description: '',
      namespaceId: undefined,
    });
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('bindings');
  });

  it('saves only operator metadata and run modes', () => {
    const target = experiment();
    const onSave = vi.fn();
    const { container } = render(
      <ExperimentSettingsDrawer experiment={target} onClose={vi.fn()} onSave={onSave} />,
    );
    expectMagicSettingsControls(container);
    const descriptionField = container.querySelector('[data-xgc-role="experiment-settings-description-field"][data-xgc-id="exp-1"]');
    const descriptionLabel = container.querySelector('[data-xgc-role="experiment-settings-description-label"][data-xgc-id="exp-1"]');
    expect(descriptionField).not.toBeNull();
    expect(descriptionLabel).toHaveClass('xgc-form-field-label');
    expect(descriptionLabel).toHaveTextContent('Description');
    expect(container.querySelector('[data-xgc-role="experiment-settings-run-modes-label"][data-xgc-id="exp-1"]')).toHaveTextContent('Run modes');
    fireEvent.change(screen.getByLabelText('Description'),{ target: { value: 'Updated metadata' } });
    fireEvent.change(container.querySelector('[data-xgc-role="experiment-settings-run-modes"] input')!,{
      target:{ value:'simulation, night-field' },
    });
    fireEvent.click(screen.getByRole('button',{ name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Experiment',
      description: 'Updated metadata',
      tags: [],
      runModes: ['simulation','night-field'],
    });
    expect(Object.keys(onSave.mock.calls[0]?.[0] ?? {})).toEqual([
      'name','description','tags','runModes',
    ]);
    expect(target.spec.robots[0]?.ref.resourceId).toBe('robot-1');
    expect(target.spec.localizationOffset).toEqual({ x:0,y:0,z:0 });
    expect(target.spec.workflowInstances).toEqual([]);
  });

  it('does not render localization offset or workflow graph controls', () => {
    const target = experiment();
    target.spec.workflowInstances = [{
      id:'survey-workflow',
      ref:{ domain:'automation',resourceId:'survey-automation',branch:'main' },
      actionPresets:[{ id:'run',actionId:'run',inputs:{},parameterBindings:[] }],
    }];
    const { container } = render(
      <ExperimentSettingsDrawer experiment={target} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expectMagicSettingsControls(container);
    expect(screen.queryByText('Localization offset')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow graph')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{ name:'Add workflow' })).not.toBeInTheDocument();
  });

  it('accepts ordinary canonical run-mode strings without a product-owned mode list', () => {
    const target = experiment();
    target.spec.robots = [];
    const { container } = render(
      <ExperimentSettingsDrawer experiment={target} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    const input = container.querySelector('[data-xgc-role="experiment-settings-run-modes"] input');
    expect(input).toHaveValue('simulation, physical');
    fireEvent.change(input!,{ target:{ value:'night-field, simulation' } });
    expect(input).toHaveValue('night-field, simulation');
  });
});

function expectMagicSettingsControls(container: HTMLElement) {
  expect(container.querySelector('[data-xgc-role="experiment-robot-bindings"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-settings-localization-offset"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-localization-offset-x"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-settings-workflow-graph"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-workflow-instance"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-settings-parameter-binding-add"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="experiment-settings-stage-profile"]')).toBeNull();
}

function resource(domain: string,resourceId: string,name: string): BindingResourceDocument {
  return {
    head: { domain,resourceId,name,tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd'.repeat(64),revision: 1,createdAt: '',updatedAt: '' },
    branch: { domain,resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
  };
}

function experiment(): ExperimentDocument {
  return {
    ...resource('experiment','exp-1','Experiment'),
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],
      runModes: ['simulation','physical'],
      localizationOffset:{ x:0,y:0,z:0 },
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
      robots: [{
          id: 'px4-01',
          ref: { domain: 'robot',resourceId: 'robot-1',branch: 'main' },
          namespace: '/uav1',
          hybridSource: 'physical',
          runtimeParameters: {},
          initialPose: { x: 4,y: 2,z: 0,yaw: 0.5 },
          px4: {},
        }],
      workflowInstances: [],
    },
  };
}
