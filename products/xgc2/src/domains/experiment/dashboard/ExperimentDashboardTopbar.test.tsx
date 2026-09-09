// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { ExperimentRunView } from '../experimentWorkflowService';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';
import type { ExperimentRunModeControl } from './useExperimentRunMode';
import {
  ExperimentDashboardTopbar,
  type DashboardTopbarEditSession,
  type DashboardTopbarNavigation,
  type DashboardTopbarPanelActions,
} from './ExperimentDashboardTopbar';

describe('ExperimentDashboardTopbar', () => {
  it('keeps Run and Stop available when System Experiment authoring is read only', () => {
    const editor = editorFixture({ readOnly:true });
    editor.session.visibleExperiment!.head.system = true;
    const startExperiment = vi.fn(async () => undefined);
    const stopExperiment = vi.fn(async () => undefined);
    const props = {
      session:editor.session,dashboards:editor.dashboards,panels:editor.panels,
      runMode:runModeFixture(),gcsMode:false,onGcsModeChange:vi.fn(),
    };
    const { rerender } = render(
      <ExperimentDashboardTopbar {...props} actions={actionsFixture({ startExperiment })} />,
    );
    expect(screen.getByRole('button', { name:'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name:'Run experiment' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name:'Run experiment' }));
    expect(startExperiment).toHaveBeenCalledOnce();
    rerender(
      <ExperimentDashboardTopbar {...props} actions={actionsFixture({
        experimentIsRunning:true,activeRun:planRunFixture(),canStopExperiment:true,stopExperiment,
      })} />,
    );
    expect(screen.getByRole('button', { name:'Stop experiment' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name:'Stop experiment' }));
    expect(stopExperiment).toHaveBeenCalledOnce();
  });

  it('leaves GCS mode and starts editing the selected dashboard', () => {
    const editor = editorFixture();
    const onGcsModeChange = vi.fn();

    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode
        onGcsModeChange={onGcsModeChange}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    // Experiment name belongs in the app breadcrumbs; the dashboard slot only hosts tabs/actions.
    expect(document.querySelector('[data-xgc-role="experiment-topbar-title"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    // Dashboard structure controls appear only after Edit starts.
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')).toBeNull();
    expect(edit).toBeEnabled();
    expect(edit).toHaveAttribute('data-xgc-role', 'experiment-dashboard-edit');
    expect(edit).toHaveAttribute('data-xgc-id', 'gcs');
    expect(document.querySelector('[data-xgc-role="experiment-active-session"]')).toBeNull();

    fireEvent.click(edit);

    expect(onGcsModeChange).toHaveBeenCalledWith(false);
    expect(editor.session.start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Config','GCS'],
    ['配置','地面站'],
  ] as const)('keeps %s / %s dashboard tabs in the experiment topbar context', (configName,gcsName) => {
    const editor = editorFixture();
    const config = { id: 'config',name: configName,description: '',panels: [] };
    const gcs = { id: 'gcs',name: gcsName,description: '',panels: [] };
    editor.dashboards.items = [config, gcs];
    editor.dashboards.selected = config;

    const { container } = render(
      <header className="topbar" style={{ height: 'var(--size-header-page)' }}>
        <div className="experiment-topbar-slot">
          <ExperimentDashboardTopbar
            session={editor.session}
            dashboards={editor.dashboards}
            panels={editor.panels}
            actions={actionsFixture()}
            runMode={runModeFixture()}
            gcsMode={false}
            onGcsModeChange={vi.fn()}
          />
        </div>
      </header>,
    );

    const context = container.querySelector('.experiment-topbar-context');
    const tabs = container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]');
    const scroll = container.querySelector('[data-xgc-role="experiment-dashboard-tabs-scroll"]');
    const configTab = screen.getByRole('tab', { name: configName });
    const gcsTab = screen.getByRole('tab', { name: gcsName });
    expect(context).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(scroll).not.toBeNull();
    expect(context?.contains(tabs)).toBe(true);
    expect(tabs?.contains(scroll)).toBe(true);
    expect(configTab).toHaveAttribute('aria-selected', 'true');
    expect(gcsTab).toHaveAttribute('aria-selected', 'false');
    expect(configTab).toHaveAttribute('data-xgc-role', 'experiment-dashboard-tab-control');
    expect(configTab.parentElement).toHaveAttribute('data-xgc-role', 'experiment-dashboard-tab');
    expect(container.querySelector('[data-xgc-role="experiment-run-mode"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="experiment-run-mode-select"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="experiment-gcs-mode"]')).toBeInTheDocument();
    configTab.focus();
    expect(document.activeElement).toBe(configTab);
    gcsTab.focus();
    expect(document.activeElement).toBe(gcsTab);
  });

  it('keeps shared GCS mode active while the operator switches dashboard tabs',() => {
    const editor = editorFixture();
    editor.dashboards.items = [
      { id:'config',name:'Config',description:'',panels:[] },
      { id:'gcs',name:'GCS',description:'',panels:[] },
    ];
    editor.dashboards.selected = editor.dashboards.items[1]!;
    const onGcsModeChange = vi.fn();
    render(<ExperimentDashboardTopbar
      session={editor.session}
      dashboards={editor.dashboards}
      panels={editor.panels}
      actions={actionsFixture()}
      runMode={runModeFixture()}
      gcsMode
      onGcsModeChange={onGcsModeChange}
    />);

    expect(document.querySelector('[data-xgc-role="experiment-gcs-mode"][data-xgc-id="global"]'))
      .toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('tab',{ name:'Config' }));
    expect(editor.dashboards.select).toHaveBeenCalledWith('config');
    expect(onGcsModeChange).not.toHaveBeenCalled();
  });

  it('gates add, rename, delete and reorder behind the dashboard edit session', () => {
    const viewing = editorFixture();
    viewing.dashboards.items = [
      viewing.dashboards.items[0]!,
      { id: 'ops',name: 'Operations',description: '',panels: [] },
    ];
    const first = render(
      <ExperimentDashboardTopbar
        session={viewing.session}
        dashboards={viewing.dashboards}
        panels={viewing.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const viewingTab = document.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-dashboard-tab-control"][data-xgc-id="gcs"]',
    )!;
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')).toBeNull();
    expect(screen.queryByTitle('Delete dashboard')).toBeNull();
    expect(viewingTab).not.toHaveAttribute('title');
    expect(viewingTab.parentElement).not.toHaveAttribute('draggable', 'true');
    fireEvent.doubleClick(viewingTab);
    expect(screen.queryByRole('textbox')).toBeNull();
    first.unmount();

    const editing = editorFixture({ editing: true });
    editing.dashboards.items = [
      editing.dashboards.items[0]!,
      { id: 'ops',name: 'Operations',description: '',panels: [] },
    ];
    render(
      <ExperimentDashboardTopbar
        session={editing.session}
        dashboards={editing.dashboards}
        panels={editing.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    const editingTab = document.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-dashboard-tab-control"][data-xgc-id="gcs"]',
    )!;
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')).not.toBeNull();
    expect(screen.getAllByTitle('Delete dashboard')).toHaveLength(2);
    expect(editingTab).toHaveAttribute('title', 'Drag to reorder · Double click to rename');
    expect(editingTab.parentElement).toHaveAttribute('draggable', 'true');
    fireEvent.doubleClick(editingTab);
    const input = screen.getByRole('textbox', { name: 'Rename dashboard GCS' });
    fireEvent.change(input, { target: { value: 'Ground station' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(editing.dashboards.rename).toHaveBeenCalledWith('gcs', 'Ground station');
    fireEvent.click(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')!);
    expect(editing.dashboards.create).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByTitle('Delete dashboard')[0]!);
    expect(editing.dashboards.requestDelete).toHaveBeenCalledWith('gcs');
  });

  it('does not allow GCS mode to trap an active edit session', () => {
    const editor = editorFixture({ editing: true });

    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-xgc-role="experiment-gcs-mode"]')).toBeDisabled();
    // Visible label stays "Edit"; exit semantics live on aria-label / title so equal-width tracks stay stable.
    const exit = screen.getByRole('button', { name: 'Exit edit' });
    expect(exit).toHaveTextContent('Edit');
    expect(exit).toBeEnabled();
    fireEvent.click(exit);
    expect(editor.session.requestExit).toHaveBeenCalledOnce();
  });

  it('disables Run while editing and freezes dashboard structure during a Run', () => {
    const editing = editorFixture({ editing: true });
    const first = render(
      <ExperimentDashboardTopbar session={editing.session} dashboards={editing.dashboards} panels={editing.panels} actions={actionsFixture()} runMode={runModeFixture()} gcsMode={false} onGcsModeChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Run experiment' })).toBeDisabled();
    expect(document.querySelector('[data-xgc-role="experiment-run-blocked"]')).toBeNull();
    first.unmount();

    const running = editorFixture();
    const view = render(
      <ExperimentDashboardTopbar
        session={running.session}
        dashboards={running.dashboards}
        panels={running.panels}
        actions={actionsFixture({ experimentIsRunning: true,activeRun: planRunFixture() })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')).toBeNull();
    const edit = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-dashboard-edit"]')!;
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute(
      'title','Dashboard editing is unavailable while the Experiment is running.',
    );
    fireEvent.click(edit);
    expect(screen.queryByRole('button',{ name:'Panel library' })).toBeNull();
    expect(running.session.start).not.toHaveBeenCalled();

    view.rerender(
      <ExperimentDashboardTopbar
        session={running.session}
        dashboards={running.dashboards}
        panels={running.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    expect(document.querySelector('[data-xgc-role="experiment-dashboard-add"]')).toBeNull();
    const idleEdit = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-dashboard-edit"]')!;
    expect(idleEdit).toBe(edit);
    expect(idleEdit).toBeEnabled();
    expect(idleEdit).toHaveAttribute('title','Edit');
  });

  it('uses one Run/Stop control for the protected System Runner roots',() => {
    const startExperiment = vi.fn(async () => undefined);
    const stopExperiment = vi.fn(async () => undefined);
    const activeRun = planRunFixture('run-plan-abcdefgh');
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({
          activeRun,canStopExperiment:true,stopExperiment,
          canStartExperiment: false,startExperiment,experimentIsRunning: true,
        })}
        runMode={runModeFixture({ value: 'simulation',locked: true })}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    // Single affordance: no separate Run beside Stop.
    expect(screen.queryByRole('button', { name: 'Run experiment' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-active-session"]')).toBeNull();
    // Run mode sits beside the control; locked while a Session is active.
    const runMode = document.querySelector('[data-xgc-role="experiment-run-mode"][data-xgc-id="experiment-a"]');
    expect(runMode).not.toBeNull();
    expect(runMode).toHaveAttribute('data-xgc-value', 'simulation');
    expect(document.querySelector('[data-xgc-role="experiment-run-mode-select"]')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Run mode' })).toBeDisabled();
    const stop = screen.getByRole('button', { name: 'Stop experiment' });
    expect(stop).toHaveAttribute('data-xgc-role','experiment-stop');
    expect(stop).toHaveAttribute('data-xgc-mode', 'stop');
    expect(stop).toHaveAttribute('data-xgc-id', 'experiment-a');
    expect(stop).toHaveAttribute('title','Stop this Experiment Run and its owned process closure');
    expect(stop).toHaveTextContent('Stop');
    fireEvent.click(stop);
    expect(stopExperiment).toHaveBeenCalledOnce();
    expect(startExperiment).not.toHaveBeenCalled();
  });

  it('names a frozen run mode the Experiment no longer declares instead of falling back', () => {
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture({ value: 'bench',options: ['simulation','physical'],locked: true })}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const control = document.querySelector('[data-xgc-role="experiment-run-mode"]');
    expect(control).toHaveAttribute('data-xgc-value', 'bench');
    expect(control).toHaveAttribute('data-xgc-state', 'undeclared');
    expect(control).toHaveAttribute(
      'title',
      'This Experiment Run is frozen in run mode "bench", which this Experiment no longer declares.',
    );
    // The Session's real mode is displayed; the first declared option is not.
    expect(screen.getByRole('button', { name: 'Run mode' })).toHaveTextContent('bench');
  });

  it('flips the single control to Stop as soon as native Start is in flight',() => {
    const stopExperiment = vi.fn(async () => undefined);
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({
          startInFlight: true,canStartExperiment: false,canStopExperiment: true,stopExperiment,
        })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    const stop = screen.getByRole('button', { name: 'Stop experiment' });
    expect(stop).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Run experiment' })).toBeNull();
    fireEvent.click(stop);
    expect(stopExperiment).toHaveBeenCalledOnce();
  });

  it('keeps Run mode disabled while Start hands off to the hydrated Session Run',() => {
    const editor = editorFixture();
    const view = render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ experimentIsRunning:true,startInFlight:true })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    const runMode = () => screen.getByRole('button',{ name:'Run mode' });
    expect(runMode()).toBeDisabled();

    // Station Session truth can arrive before the Automation Run detail that
    // makes runMode.locked true. The selector must not flash enabled in between.
    view.rerender(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ experimentIsRunning:true })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    expect(runMode()).toBeDisabled();

    view.rerender(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ experimentIsRunning:true,activeRun:planRunFixture() })}
        runMode={runModeFixture({ locked:true })}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );
    expect(runMode()).toBeDisabled();
  });

  it('disables Run when another Experiment already occupies the station', () => {
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({
          canStartExperiment: false,
          startDisabledReason: 'Another Experiment is already running.',
        })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const run = screen.getByRole('button', { name: 'Run experiment' });
    expect(run).toBeDisabled();
    expect(run).toHaveAttribute('data-xgc-role', 'experiment-run');
    expect(run).toHaveAttribute('title', 'Another Experiment is already running.');
    expect(document.querySelector('[data-xgc-role="experiment-run-blocked"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop experiment' })).toBeNull();
  });

  it('shows Run when idle and starts the experiment through the same control', () => {
    const startExperiment = vi.fn(async () => undefined);
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ canStartExperiment: true,startExperiment })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const run = screen.getByRole('button', { name: 'Run experiment' });
    expect(run).toHaveAttribute('data-xgc-role', 'experiment-run');
    expect(run).toHaveAttribute('data-xgc-mode', 'run');
    expect(run).toHaveTextContent('Run');
    expect(screen.queryByRole('button', { name: 'Stop experiment' })).toBeNull();
    fireEvent.click(run);
    expect(startExperiment).toHaveBeenCalledOnce();
  });

  it('shows an explicit non-action state while native lifecycle state is restored',() => {
    const editor = editorFixture();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ lifecycleStateLoading:true,canStartExperiment:false })}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const checking = screen.getByRole('button',{ name:'Checking experiment state' });
    expect(checking).toBeDisabled();
    expect(checking).toHaveAttribute('data-xgc-role','experiment-state-loading');
    expect(checking).toHaveAttribute('data-xgc-mode','loading');
    expect(checking).toHaveAttribute('aria-busy','true');
    expect(checking).toHaveTextContent('Checking');
    expect(screen.queryByRole('button',{ name:'Run experiment' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop experiment' })).toBeNull();
  });

  it('offers experiment run modes next to Run and reports the selection to its owner', () => {
    const editor = editorFixture();
    editor.session.visibleExperiment!.spec.runModes = ['simulation','physical'];
    const select = vi.fn();
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture({ select })}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const control = document.querySelector('[data-xgc-role="experiment-run-mode-select"]');
    expect(control).not.toBeNull();
    // fill cancels the shared compact min-width so the chip cannot paint over Run.
    expect(control).toHaveAttribute('data-xgc-fill', 'true');
    expect(control).toHaveAttribute('data-xgc-compact', 'true');
    expect(control).not.toBeDisabled();
    expect(document.querySelector('[data-xgc-role="experiment-topbar-actions"]'))
      .toHaveAttribute('data-xgc-id', 'experiment-a');
    fireEvent.click(screen.getByRole('button', { name: 'Run mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'physical' }));
    // The Topbar never owns the selection: the run-mode control is the authority
    // so a live Session's frozen mode can dominate the local preference.
    expect(select).toHaveBeenCalledWith('physical');
  });

  it('does not start the experiment when the operator only changes run mode', () => {
    const startExperiment = vi.fn(async () => undefined);
    const select = vi.fn();
    const editor = editorFixture();
    editor.session.visibleExperiment!.spec.runModes = ['simulation','physical'];
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({ canStartExperiment: true,startExperiment })}
        runMode={runModeFixture({ select })}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'physical' }));
    expect(select).toHaveBeenCalledWith('physical');
    expect(startExperiment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Run experiment' }));
    expect(startExperiment).toHaveBeenCalledOnce();
  });

  it('shows Mixed as the composition of an explicit Hybrid Experiment Run',() => {
    const editor = editorFixture();
    editor.session.visibleExperiment!.spec.runModes = ['simulation','physical','hybrid'];
    editor.session.visibleExperiment!.spec.robots = [
      robotBinding('physical-leader','physical'),
      robotBinding('sim-wingman','simulation'),
    ];
    const runMode = runModeFixture({
      value: 'hybrid',
      options: ['simulation','physical','hybrid'],
      locked: true,
    });
    render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runMode}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />,
    );

    const control = document.querySelector('[data-xgc-role="experiment-run-mode"]');
    expect(control).toHaveAttribute('data-xgc-value', 'hybrid');
    expect(screen.getByRole('button', { name: 'Run mode' })).toHaveTextContent('hybrid');
    expect(document.querySelector('[data-xgc-role="experiment-run-mode-composition"]'))
      .toHaveTextContent('Mixed');
    expect(document.querySelector('[data-xgc-role="experiment-run-mode-composition"]'))
      .toHaveAttribute(
        'title',
        'Hybrid Experiment Run: each robot uses its frozen simulation or physical source partition.',
      );
    expect(runMode.options).toEqual(['simulation','physical','hybrid']);
  });

  it.each(['simulation','physical'] as const)(
    'does not show Mixed when the same authored fleet runs in pure %s mode',
    (pureMode) => {
      const editor = editorFixture();
      editor.session.visibleExperiment!.spec.robots = [
        robotBinding('physical-leader','physical'),
        robotBinding('sim-wingman','simulation'),
      ];
      render(
        <ExperimentDashboardTopbar
          session={editor.session}
          dashboards={editor.dashboards}
          panels={editor.panels}
          actions={actionsFixture()}
          runMode={runModeFixture({ value: pureMode })}
          gcsMode={false}
          onGcsModeChange={vi.fn()}
        />,
      );

      expect(document.querySelector('[data-xgc-role="experiment-run-mode-composition"]')).toBeNull();
    },
  );

  it('toggles one global GCS mode across experiments and dashboard tabs', () => {
    const onGcsModeChange = vi.fn();
    const editor = editorFixture();
    editor.dashboards.selected = { id: 'config',name: 'Config',description: '',panels: [] };
    editor.dashboards.items = [
      editor.dashboards.selected,
      { id: 'gcs',name: 'GCS',description: '',panels: [] },
    ];
    const { container,rerender } = render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode={false}
        onGcsModeChange={onGcsModeChange}
      />,
    );
    const gcs = () => container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-gcs-mode"][data-xgc-id="global"]',
    )!;
    expect(gcs()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(gcs());
    expect(editor.dashboards.select).not.toHaveBeenCalled();
    const enable = onGcsModeChange.mock.calls.at(-1)?.[0];
    expect(enable).toBeTypeOf('function');
    expect(typeof enable === 'function' ? enable(false) : undefined).toBe(true);

    editor.session.visibleExperiment = {
      ...editor.session.visibleExperiment!,
      head: {
        ...editor.session.visibleExperiment!.head,
        resourceId: 'experiment-b',
        name: 'Experiment B',
      },
    };
    editor.dashboards.selected = { id: 'analysis',name: 'Analysis',description: '',panels: [] };
    rerender(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture()}
        runMode={runModeFixture()}
        gcsMode
        onGcsModeChange={onGcsModeChange}
      />,
    );
    expect(gcs()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(gcs());
    expect(editor.dashboards.select).not.toHaveBeenCalled();
    const disable = onGcsModeChange.mock.calls.at(-1)?.[0];
    expect(disable).toBeTypeOf('function');
    expect(typeof disable === 'function' ? disable(true) : undefined).toBe(false);
  });

  it('disables dashboard editing for protected experiments while preserving GCS and Stop', () => {
    const stopExperiment = vi.fn(async () => undefined);
    const onGcsModeChange = vi.fn();
    const editor = editorFixture({ readOnly: true });
    const { container } = render(
      <ExperimentDashboardTopbar
        session={editor.session}
        dashboards={editor.dashboards}
        panels={editor.panels}
        actions={actionsFixture({
          activeRun: planRunFixture(),
          canStopExperiment:true,stopExperiment,experimentIsRunning:true,
        })}
        runMode={runModeFixture({ locked: true })}
        gcsMode={false}
        onGcsModeChange={onGcsModeChange}
      />,
    );

    expect(container.querySelector('[data-xgc-role="experiment-readonly"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'title','This Experiment is read only.',
    );
    const gcs = container.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-gcs-mode"]')!;
    expect(gcs).toBeEnabled();
    fireEvent.click(gcs);
    expect(editor.dashboards.select).not.toHaveBeenCalled();
    const enable = onGcsModeChange.mock.calls.at(-1)?.[0];
    expect(enable).toBeTypeOf('function');
    expect(typeof enable === 'function' ? enable(false) : undefined).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop experiment' }));
    expect(stopExperiment).toHaveBeenCalledOnce();
    expect(editor.session.start).not.toHaveBeenCalled();
  });
});

function editorFixture(overrides: Partial<DashboardTopbarEditSession> = {}): {
  session: DashboardTopbarEditSession;
  dashboards: DashboardTopbarNavigation;
  panels: DashboardTopbarPanelActions;
} {
  const dashboard = { id: 'gcs',name: 'GCS',description: '',panels: [] };
  return {
    session: {
    visibleExperiment: {
      head: { domain: 'experiment',resourceId: 'experiment-a',name: 'Experiment A',tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '' },
      branch: { domain: 'experiment',resourceId: 'experiment-a',name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
      spec: { schemaVersion: 15,name: 'Experiment A',description: '',tags: [],runModes: ['simulation','physical'],localizationOffset:{ x:0,y:0,z:0 },
        robots: [],workflowInstances: [],
        dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }] },
    },
    editing: false,
    readOnly: false,
    saving: false,
    start: vi.fn(),
    requestExit: vi.fn(),
    ...overrides,
    },
    dashboards: {
      items: [dashboard],
      selected: dashboard,
      select: vi.fn(),
      rename: vi.fn(),
      requestDelete: vi.fn(),
      create: vi.fn(),
      reorder: vi.fn(),
    },
    panels: { openLibrary: vi.fn() },
  };
}

function actionsFixture(overrides: Partial<ExperimentDashboardActions> = {}): ExperimentDashboardActions {
  return {
    experimentIsRunning: false,
    activeRun: undefined,
    runMode:'simulation',
    stopAllInFlight: false,
    startInFlight: false,
    lifecycleStateLoading:false,
    actionError:'',
    startDisabledReason:'',
    canStartExperiment: true,
    canStopExperiment: false,
    startExperiment: vi.fn(async () => undefined),
    stopExperiment: vi.fn(async () => undefined),
    updateRobotBindings:vi.fn(),
    updateRobotBindingsDisabledReason:vi.fn(() => '' as const),
    ...overrides,
  } as unknown as ExperimentDashboardActions;
}

function planRunFixture(id = 'run-plan'): ExperimentRunView {
  return {
    id,targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:'system-experiment-runner',actionId:'run',runMode:'simulation',
    status:'running',revision:1,rootRunId:id,createdAt:timestamp,startedAt:timestamp,updatedAt:timestamp,
    workflowTargets:[],
  };
}

const timestamp = '2026-07-21T00:00:00Z';

function runModeFixture(overrides: Partial<ExperimentRunModeControl> = {}): ExperimentRunModeControl {
  return {
    value: 'simulation',
    options: ['simulation','physical'],
    select: vi.fn(),
    locked: false,
    ...overrides,
  };
}

function robotBinding(id: string, hybridSource: 'physical' | 'simulation') {
  return {
    id,
    ref: { domain: 'robot' as const,resourceId: id,branch: 'main' },
    namespace: `/${id}`,
    hybridSource,
    runtimeParameters: {},
    initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
  };
}
