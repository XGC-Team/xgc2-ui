// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { AutomationWorkspaceTopbar,type AutomationWorkspaceTopbarProps } from './AutomationWorkspaceTopbar';

describe('AutomationWorkspaceTopbar', () => {
  it('keeps the manual run control width stable while its run state changes', () => {
    const props: AutomationWorkspaceTopbarProps = {
      resourceId: 'automation-a',
      view: 'editor',
      action: {
        id: 'run',version: 1,label: 'Run',entryNodeId: 'manual',kind: 'command',
        inputSchema: { fields: [] },resultSchema: { fields: [] },controls: ['cancel'],
        admission: {},requiredCapabilities: [],projectionContracts: [],
      },
      canEdit: true,
      busy: '',
      dirty: false,
      archived: false,
      editorRunActive: false,
      editorRunStopping: false,
      triggerKind: 'trigger.manual',
      onViewChange: vi.fn(),
      onActionChange: vi.fn(),
      onSave: vi.fn(async () => undefined),
      onStop: vi.fn(),
      onPrepareRun: vi.fn(),
    };
    const topbar = (next: AutomationWorkspaceTopbarProps) => <>
      <header className="topbar"><div id="xgc-page-topbar-actions" /></header>
      <AutomationWorkspaceTopbar {...next} />
    </>;
    const view = render(topbar(props));

    const save = screen.getByRole('button', { name: 'Save' });
    const run = screen.getByRole('button', { name: 'Run' });
    expect(save).toHaveClass('automation-workspace-command-control');
    expect(run).toHaveClass('automation-workspace-command-control');

    view.rerender(topbar({ ...props,editorRunId: 'run-12345678',editorRunActive: true }));
    const stop = screen.getByRole('button', { name: /^Stop run/ });
    expect(stop).toHaveClass('automation-workspace-command-control');
    expect(stop).toHaveTextContent('Stop');

    view.rerender(topbar({
      ...props,
      editorRunId: 'run-12345678',
      editorRunActive: true,
      editorRunStopping: true,
    }));
    const stopping = screen.getByRole('button', { name: /^Stopping run/ });
    expect(stopping).toHaveClass('automation-workspace-command-control');
    expect(stopping).toHaveTextContent('Stop');
    expect(stopping).not.toHaveTextContent('Stopping');
  });

  it('unmounts the workspace topbar portal while its parked route is inactive', () => {
    const props: AutomationWorkspaceTopbarProps = {
      resourceId: 'automation-a',
      view: 'editor',
      action: {
        id: 'run',version: 1,label: 'Run',entryNodeId: 'manual',kind: 'command',
        inputSchema: { fields: [] },resultSchema: { fields: [] },controls: ['cancel'],
        admission: {},requiredCapabilities: [],projectionContracts: [],
      },
      canEdit: true,
      busy: '',
      dirty: false,
      archived: false,
      editorRunActive: false,
      editorRunStopping: false,
      triggerKind: 'trigger.manual',
      onViewChange: vi.fn(),
      onActionChange: vi.fn(),
      onSave: vi.fn(async () => undefined),
      onStop: vi.fn(),
      onPrepareRun: vi.fn(),
    };
    const tree = (visible: boolean) => (
      <ProductRouteVisibilityProvider visible={visible}>
        <header className="topbar"><div id="xgc-page-topbar-actions" /></header>
        <AutomationWorkspaceTopbar {...props} />
      </ProductRouteVisibilityProvider>
    );
    const view = render(tree(true));
    const slot = () => document.getElementById('xgc-page-topbar-actions');
    expect(slot()?.querySelector('[data-xgc-role="automation-workspace-view-switch"]')).not.toBeNull();
    expect(slot()?.querySelector('[data-xgc-role="automation-run-open"]')).not.toBeNull();
    expect(slot()?.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeNull();

    view.rerender(tree(false));
    expect(slot()?.querySelector('[data-xgc-role="automation-workspace-view-switch"]')).toBeNull();
    expect(slot()?.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(slot()?.querySelector('[data-xgc-role="automation-definition-save"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-workspace-view-switch"]')).toBeNull();

    view.rerender(tree(true));
    expect(slot()?.querySelector('[data-xgc-role="automation-workspace-view-switch"]')).not.toBeNull();
    expect(slot()?.querySelector('[data-xgc-role="automation-run-open"]')).not.toBeNull();
  });
});
