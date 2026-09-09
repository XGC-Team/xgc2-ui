// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { PX4RotorControlPanel } from './PX4RotorControlPanel';
import { PX4_SET_MODE_OPTIONS } from './px4RotorControlPanelModel';
import { RobotControlFrameProvider,RobotControlHeaderActions,RobotControlHeaderLeading } from './RobotPanelFrame';

const notificationMocks = vi.hoisted(() => ({ useError:vi.fn() }));
const chassisHoldMocks = vi.hoisted(() => ({ post:vi.fn(async () => ({ held:true,applied:['scout-01'],failed:[],skipped:0 })) }));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic',() => ({
  useGroundStationErrorNotification:notificationMocks.useError,
}));
vi.mock('../../domains/robot/robotPublic',async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object),postUgvChassisHold:chassisHoldMocks.post };
});

describe('PX4 set mode',() => {
  beforeEach(() => {
    window.localStorage.clear();
    notificationMocks.useError.mockReset();
    chassisHoldMocks.post.mockReset();
    chassisHoldMocks.post.mockResolvedValue({ held:true,applied:['scout-01'],failed:[],skipped:0 });
  });

  it('keeps shortcuts from sending a mode until Set mode is clicked',async () => {
    writeSelection(['px4-01']);
    const setMode = actionPort('set-flight-mode','Set mode');
    renderPanel({ 'set-flight-mode': setMode });
    expect(screen.getByLabelText('Flight mode')).toHaveTextContent('POSCTL');
    fireEvent.click(screen.getByRole('button',{ name:'Offboard' }));
    expect(screen.getByLabelText('Flight mode')).toHaveTextContent('OFFBOARD');
    expect(setMode.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Set mode' }));
    await waitFor(() => expect(setMode.invoke).toHaveBeenCalledWith(expect.objectContaining({
      robotIds:['px4-01'],mode:'OFFBOARD',
    }),'Invoke Set mode from Robot control'));
  });

  it('lists the xgc1 combobox modes and only applies the selected value',async () => {
    writeSelection(['px4-01']);
    const setMode = actionPort('set-flight-mode','Set mode');
    renderPanel({ 'set-flight-mode': setMode });
    fireEvent.click(screen.getByLabelText('Flight mode'));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([...PX4_SET_MODE_OPTIONS]);
    fireEvent.click(screen.getByRole('option',{ name:'ALTCTL' }));
    expect(setMode.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Set mode' }));
    await waitFor(() => expect(setMode.invoke).toHaveBeenCalledWith(expect.objectContaining({
      robotIds:['px4-01'],mode:'ALTCTL',
    }),'Invoke Set mode from Robot control'));
  });

  it('disables Set mode when no robot is selected and does not invent a Notice',() => {
    const setMode = actionPort('set-flight-mode','Set mode');
    const view = renderPanel({ 'set-flight-mode': setMode });
    const apply = screen.getByRole('button',{ name:'Set mode' });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute('title','Select at least one PX4 robot in Robot instruments.');
    const flightMode = screen.getByRole('button',{ name:'Flight mode' });
    expect(flightMode).toBeDisabled();
    expect(flightMode).toHaveAccessibleName('Flight mode');
    expect(flightMode.closest('.robot-px4-mode-select')).toHaveAttribute(
      'title','Select at least one PX4 robot in Robot instruments.',
    );
    for (const name of ['Position','Altitude','Offboard'] as const) {
      expect(screen.getByRole('button',{ name })).toBeDisabled();
      expect(screen.getByRole('button',{ name })).toHaveAttribute('title','Select at least one PX4 robot in Robot instruments.');
      expect(screen.getByRole('button',{ name })).toHaveAttribute('aria-description','Select at least one PX4 robot in Robot instruments.');
    }
    expect(view.container.querySelector('[data-xgc-role="px4-set-mode"]')).not.toHaveTextContent('Select at least one PX4 robot in Robot instruments.');
    expect(apply).toHaveAttribute('data-xgc-layout','tile');
    expect(apply).toHaveAttribute('data-xgc-role','px4-set-mode-apply');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(apply);
    expect(setMode.invoke).not.toHaveBeenCalled();
  });

  it('routes Action failures to notifications without rendering panel errors',async () => {
    writeSelection(['px4-01']);
    const error = '400 Bad Request: invalid run parameters';
    const arm = actionPort('arm','Arm');
    arm.invoke = vi.fn(async () => { throw new Error(error); });
    const view = renderPanel({ arm });
    fireEvent.click(screen.getByRole('button',{ name:'Arm' }));
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith('local',error,{
      title:'Robot control',source:'robot-control',dedupeKey:'robot-control:action-error',
    }));
    expect(view.container.querySelector('[data-xgc-role="robot-control-error"]')).toBeNull();
    expect(view.container).not.toHaveTextContent(error);
  });

  it('keeps Kill dangerous and refuses its action when no PX4 robot is selected',() => {
    const kill = actionPort('force-disarm','Kill');
    renderPanel({ 'force-disarm':kill });
    const button = screen.getByRole('button',{ name:'Kill' });
    expect(button).toHaveAttribute('data-xgc-role','robot-operation-force-disarm');
    expect(button).toHaveAttribute('data-xgc-id','robot-control:force-disarm');
    expect(button).toHaveAttribute('data-xgc-tone','danger');
    expect(button).toHaveAttribute('data-xgc-appearance','solid');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title','Select at least one PX4 robot in Robot instruments.');
    fireEvent.click(button);
    expect(kill.invoke).not.toHaveBeenCalled();
  });

  it('keeps Position/Altitude/Offboard as ghost shortcuts that only retarget the combobox',() => {
    writeSelection(['px4-01']);
    const setMode = actionPort('set-flight-mode','Set mode');
    renderPanel({ 'set-flight-mode': setMode });
    const shortcuts = screen.getAllByRole('button').filter((button) => button.getAttribute('data-xgc-role') === 'px4-set-mode-shortcut');
    expect(shortcuts.map((button) => [button.textContent,button.getAttribute('data-xgc-appearance'),button.getAttribute('data-xgc-id'),button.getAttribute('data-size')])).toEqual([
      ['Position','ghost','robot-control:POSCTL','compact'],
      ['Altitude','ghost','robot-control:ALTCTL','compact'],
      ['Offboard','ghost','robot-control:OFFBOARD','compact'],
    ]);
    fireEvent.click(screen.getByRole('button',{ name:'Position' }));
    expect(screen.getByLabelText('Flight mode')).toHaveTextContent('POSCTL');
    fireEvent.click(screen.getByRole('button',{ name:'Altitude' }));
    expect(screen.getByLabelText('Flight mode')).toHaveTextContent('ALTCTL');
    expect(setMode.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeEnabled();
  });

  it('packs Position/Altitude/Offboard left at equal content width under the combobox',() => {
    renderPanel({ 'set-flight-mode': actionPort('set-flight-mode','Set mode') });
    const group = document.querySelector('.robot-px4-mode-group');
    const select = group?.querySelector('.robot-px4-mode-select');
    const shortcuts = group?.querySelector('[data-xgc-role="px4-mode-shortcuts"]');
    const apply = screen.getByRole('button',{ name:'Set mode' });
    const armTest = screen.getByRole('button',{ name:'Arm test' });
    expect(group).toHaveAttribute('data-xgc-role','px4-set-mode');
    expect(select).toContainElement(screen.getByRole('button',{ name:/^Flight mode/ }));
    expect(shortcuts).toHaveClass('robot-px4-mode-shortcuts');
    expect(shortcuts?.parentElement).toBe(group);
    expect(shortcuts?.children).toHaveLength(3);
    expect(apply).toHaveClass('robot-px4-mode-apply');
    expect(apply).toHaveClass('robot-px4-action-card');
    expect(apply.parentElement).toBe(group);
    expect(armTest).toHaveClass('robot-px4-arm-test');
    expect(armTest.parentElement).toBe(group);
    expect(apply).toHaveAttribute('data-xgc-layout','tile');
    expect(document.querySelector('.robot-px4-mode-primary-row')).toBeNull();
  });

  it('renders Set mode followed by Arm test as equal first-row pictorial tiles',() => {
    writeSelection(['px4-01']);
    renderPanel({
      'set-flight-mode': actionPort('set-flight-mode','Set mode'),
      'preflight-arm-test': actionPort('preflight-arm-test','Arm test'),
    });
    const apply = screen.getByRole('button',{ name:'Set mode' });
    const armTest = screen.getByRole('button',{ name:'Arm test' });
    expect(apply).toHaveAttribute('data-xgc-role','px4-set-mode-apply');
    expect(apply).toHaveAttribute('data-xgc-id','robot-control');
    expect(apply).toHaveAttribute('data-xgc-layout','tile');
    expect(armTest).toHaveAttribute('data-xgc-layout','tile');
    expect(apply).toHaveClass('robot-px4-action-card');
    expect(armTest).toHaveClass('robot-px4-action-card');
    const group = document.querySelector('.robot-px4-mode-group');
    expect(apply.parentElement).toBe(group);
    expect(armTest.parentElement).toBe(group);
    expect(apply.compareDocumentPosition(armTest) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(apply).toHaveClass('robot-px4-mode-apply');
    expect(armTest).toHaveClass('robot-px4-arm-test');
    const applyIcon = apply.querySelector('svg.robot-px4-action-icon');
    expect(applyIcon).toHaveAttribute('aria-hidden','true');
    expect(applyIcon?.classList.contains('lucide-arrow-left-right')).toBe(true);
    expect(apply.querySelector('.robot-px4-action-title')?.textContent?.trim()).toBe('Set mode');
    expect(armTest.querySelector('.robot-px4-action-title')?.textContent?.trim()).toBe('Arm test');
    expect(apply.querySelector('[data-xgc-progress], .xgc-workflow-status-card-progress, .xgc-progress')).toBeTruthy();
    expect(armTest.querySelector('[data-xgc-progress], .xgc-workflow-status-card-progress, .xgc-progress')).toBeTruthy();
  });

  it('fills Set mode from work-node occupancy and keeps a red fill after a node failure',() => {
    writeSelection(['px4-01']);
    const setMode = actionPort('set-flight-mode','Set mode');
    setMode.activeInvocation = { id:'set-mode-run',status:'running',revision:1 };
    setMode.serviceStatus = { state:'starting',ready:0,total:1 };
    const view = renderPanel({ 'set-flight-mode': setMode });
    const button = () => screen.getByRole('button',{ name:'Set mode' });
    expect(button()).toHaveAttribute('data-xgc-tone','neutral');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    setMode.serviceStatus = { state:'running',ready:1,total:1 };
    view.rerender(panelTree({ 'set-flight-mode': setMode }));
    expect(button()).toHaveAttribute('data-xgc-progress','100');
    expect(button().querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
    delete setMode.activeInvocation;
    delete setMode.serviceStatus;
    setMode.latestInvocation = { id:'set-mode-run',status:'failed',revision:2 };
    setMode.serviceStatus = { state:'degraded',ready:1,total:1 };
    view.rerender(panelTree({ 'set-flight-mode': setMode }));
    expect(button()).toHaveAttribute('data-xgc-status','failed');
    expect(button()).toHaveAttribute('data-xgc-tone','neutral');
    expect(button()).toHaveAttribute('data-xgc-progress','100');
    expect(button().querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-failed)' });
    setMode.latestInvocation = { id:'set-mode-run',status:'succeeded',revision:3 };
    delete setMode.serviceStatus;
    view.rerender(panelTree({ 'set-flight-mode': setMode }));
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

  it('preserves each command selector when an invocation becomes active',() => {
    writeSelection(['px4-01']);
    const definitions = [
      ['arm','Arm','robot-operation-arm','robot-control:arm'],
      ['disarm','Disarm','robot-operation-disarm','robot-control:disarm'],
      ['force-disarm','Kill','robot-operation-force-disarm','robot-control:force-disarm'],
      ['reboot-autopilot','Reboot','robot-operation-reboot-autopilot','robot-control:reboot-autopilot'],
      ['preflight-arm-test','Arm test','robot-operation-arm-test','robot-control'],
      ['set-flight-mode','Set mode','px4-set-mode-apply','robot-control'],
    ] as const;
    const actions = Object.fromEntries(definitions.map(([id,label]) => [id,actionPort(id,label)]));
    const view = renderPanel(actions);
    const buttons = definitions.map(([,label,role,id]) => {
      const button = screen.getByRole('button',{ name:label });
      expect(button).toHaveAttribute('data-xgc-role',role);
      expect(button).toHaveAttribute('data-xgc-id',id);
      expect(button).toBeEnabled();
      return button;
    });
    const running = Object.fromEntries(Object.entries(actions).map(([id,port]) => [id,{
      ...port,activeInvocation:{ id:`invocation-${id}`,status:'running' as const,revision:1 },
    }]));
    view.rerender(panelTree(running));
    definitions.forEach(([actionId,label,role,id],index) => {
      const button = view.container.querySelector(`[data-xgc-role="${role}"][data-xgc-id="${id}"]`);
      expect(button).toBe(buttons[index]);
      expect(button).toHaveAccessibleName(label);
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-xgc-status','running');
      expect(button?.querySelector('[data-xgc-progress], .xgc-workflow-status-card-progress, .xgc-progress')).toBeTruthy();
      expect(actions[actionId].invoke).not.toHaveBeenCalled();
    });
  });

  it('keeps Arm/Disarm/Reboot/Kill on the second row without IDLE copy',() => {
    writeSelection(['px4-01']);
    renderPanel({
      arm: actionPort('arm','Arm'),
      disarm: actionPort('disarm','Disarm'),
      'force-disarm': actionPort('force-disarm','Kill'),
      'reboot-autopilot': actionPort('reboot-autopilot','Reboot'),
    });
    const grid = document.querySelector('[data-xgc-role="px4-action-grid"]');
    expect(grid).toHaveAttribute('data-xgc-columns','4');
    const cards = [...(grid?.querySelectorAll('.xgc-workflow-status-card') ?? [])];
    expect(cards.map((card) => card.textContent?.replace(/\s+/g,' ').trim())).toEqual([
      'Arm','Disarm','Reboot','Kill',
    ]);
    expect(screen.getByRole('button',{ name:'Kill' })).toHaveAttribute('data-xgc-tone','danger');
    expect(grid).not.toContainElement(screen.getByRole('button',{ name:'Arm test' }));
    for (const card of cards) {
      expect(card.textContent).not.toMatch(/idle|stopped|ready/i);
      expect(card).toHaveAttribute('data-xgc-layout','tile');
      expect(card).toHaveAttribute('data-xgc-status');
      expect(card.querySelector('[data-xgc-progress], .xgc-workflow-status-card-progress, .xgc-progress')).toBeTruthy();
    }
  });

  it('keeps XGC1 pictorial icons on Arm/Disarm/Kill/Reboot/Arm test without changing accessible names',() => {
    writeSelection(['px4-01']);
    renderPanel({
      arm: actionPort('arm','Arm'),
      disarm: actionPort('disarm','Disarm'),
      'force-disarm': actionPort('force-disarm','Kill'),
      'reboot-autopilot': actionPort('reboot-autopilot','Reboot'),
      'preflight-arm-test': actionPort('preflight-arm-test','Arm test'),
    });
    const icons = [
      ['Arm','robot-operation-arm','lucide-lock-open'],
      ['Disarm','robot-operation-disarm','lucide-lock'],
      ['Kill','robot-operation-force-disarm','lucide-octagon-x'],
      ['Reboot','robot-operation-reboot-autopilot','lucide-rotate-ccw'],
      ['Arm test','robot-operation-arm-test','lucide-activity'],
    ] as const;
    for (const [name,role,glyph] of icons) {
      const card = screen.getByRole('button',{ name });
      expect(card).toHaveAttribute('data-xgc-role',role);
      const icon = card.querySelector('svg.robot-px4-action-icon');
      expect(icon).toBeTruthy();
      expect(icon).toHaveAttribute('aria-hidden','true');
      expect(icon).not.toHaveAttribute('data-xgc-role');
      expect(icon?.classList.contains(glyph)).toBe(true);
      expect(card.querySelector('.robot-px4-action-title')?.contains(icon)).toBe(true);
      expect(card.querySelector('.robot-px4-action-title')?.textContent?.trim()).toBe(name);
    }
  });

  it('clicks all PX4 actions with only the compatible selected robots',async () => {
    writeSelection(['px4-01','scout-01','gone']);
    const setMode = actionPort('set-flight-mode','Set mode');
    const arm = actionPort('arm','Arm');
    const disarm = actionPort('disarm','Disarm');
    const kill = actionPort('force-disarm','Kill');
    const reboot = actionPort('reboot-autopilot','Reboot');
    const armTest = actionPort('preflight-arm-test','Arm test');
    renderPanel({
      'set-flight-mode': setMode,
      arm,disarm,'force-disarm': kill,'reboot-autopilot': reboot,'preflight-arm-test': armTest,
    });
    const cards = {
      setMode: screen.getByRole('button',{ name:'Set mode' }),
      arm: screen.getByRole('button',{ name:'Arm' }),
      disarm: screen.getByRole('button',{ name:'Disarm' }),
      kill: screen.getByRole('button',{ name:'Kill' }),
      reboot: screen.getByRole('button',{ name:'Reboot' }),
      armTest: screen.getByRole('button',{ name:'Arm test' }),
    };
    for (const card of Object.values(cards)) expect(card).toBeEnabled();
    fireEvent.click(cards.setMode);
    fireEvent.click(cards.arm);
    fireEvent.click(cards.disarm);
    fireEvent.click(cards.kill);
    fireEvent.click(cards.reboot);
    fireEvent.click(cards.armTest);
    await waitFor(() => {
      expect(setMode.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'],mode:'POSCTL' },'Invoke Set mode from Robot control');
      expect(arm.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'] },'Invoke Arm from Robot control');
      expect(disarm.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'] },'Invoke Disarm from Robot control');
      expect(kill.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'] },'Invoke Kill from Robot control');
      expect(reboot.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'] },'Invoke Reboot from Robot control');
      expect(armTest.invoke).toHaveBeenCalledWith({ robotIds:['px4-01'] },'Invoke Arm test from Robot control');
    });
  });

  it('disables Arm/Disarm/Kill/Reboot/Arm test together when no PX4 robot is selected',() => {
    const arm = actionPort('arm','Arm');
    const disarm = actionPort('disarm','Disarm');
    const kill = actionPort('force-disarm','Kill');
    const reboot = actionPort('reboot-autopilot','Reboot');
    const armTest = actionPort('preflight-arm-test','Arm test');
    const view = renderPanel({
      arm,disarm,'force-disarm': kill,'reboot-autopilot': reboot,'preflight-arm-test': armTest,
    });
    for (const name of ['Arm','Disarm','Kill','Reboot','Arm test'] as const) {
      const card = screen.getByRole('button',{ name });
      expect(card).toBeDisabled();
      expect(card).toHaveAttribute('title','Select at least one PX4 robot in Robot instruments.');
    }
    expect(view.container).not.toHaveTextContent('Select at least one PX4 robot in Robot instruments.');
    fireEvent.click(screen.getByRole('button',{ name:'Arm test' }));
    expect(armTest.invoke).not.toHaveBeenCalled();
  });

  it('keeps every view tab available without a selection for Scout, PX4, and Mecanum rosters',() => {
    const rosters = [
      [{ id:'scout-01',scout: {} }],
      [{ id:'px4-01',px4: {} }],
      [{ id:'mecanum-01',mecanum: {} }],
    ];
    for (const robots of rosters) {
      const view = renderPanel({},robots);
      const switcher = view.container.querySelector('[data-xgc-role="robot-control-view-switcher"][data-xgc-id="robot-control"]');
      expect(switcher).toBeInTheDocument();
      for (const name of ['UAV control','UGV control'] as const) {
        const tab = screen.getByRole('button',{ name });
        expect(tab).toBeEnabled();
        fireEvent.click(tab);
        expect(tab).toHaveAttribute('aria-pressed','true');
      }
      view.unmount();
    }
  });

  it('does not disable view navigation while editing and disables only the runtime launcher',() => {
    writeSelection(['scout-01']);
    const view = renderPanel({ 'remote-control':actionPort('remote-control','Remote control') },defaultRobots,true);
    for (const name of ['UAV control','UGV control'] as const) {
      expect(screen.getByRole('button',{ name })).toBeEnabled();
    }
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title','Remote control is unavailable while editing the dashboard.');
    expect(start).toHaveClass('xgc-panel-runtime-action');
    expect(start).toHaveAttribute('data-xgc-icon-only','true');
    view.unmount();
  });

  it('keeps the UAV view after a four-Scout rerender and selection changes',async () => {
    const fourScouts = [
      { id:'scout-01',scout: {} },
      { id:'scout-02',scout: {} },
      { id:'scout-03',scout: {} },
      { id:'scout-04',scout: {} },
    ];
    writeSelection(['scout-01']);
    const view = renderPanel({},fourScouts);
    fireEvent.click(screen.getByRole('button',{ name:'UGV control' }));
    fireEvent.click(screen.getByRole('button',{ name:'UAV control' }));
    expect(screen.getByRole('button',{ name:'UAV control' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'UGV control' })).toHaveAttribute('aria-pressed','false');
    expect(view.container.querySelector('[data-xgc-role="px4-multirotor-control"]')).toBeInTheDocument();

    act(() => writeSelection(['scout-02']));
    await waitFor(() => expect(screen.getByRole('button',{ name:'UAV control' })).toHaveAttribute('aria-pressed','true'));
    view.rerender(panelTree({},fourScouts));
    expect(screen.getByRole('button',{ name:'UAV control' })).toHaveAttribute('aria-pressed','true');
    expect(view.container.querySelector('[data-xgc-role="px4-multirotor-control"]')).toBeInTheDocument();

    act(() => writeSelection([]));
    await waitFor(() => expect(screen.getByRole('button',{ name:'UAV control' })).toHaveAttribute('aria-pressed','true'));
    expect(view.container.querySelector('[data-xgc-role="px4-multirotor-control"]')).toBeInTheDocument();
  });

  it('leaves the PX4 view visible for a Scout selection and disables only PX4 controls',() => {
    writeSelection(['scout-01']);
    const remote = actionPort('remote-control','Remote control');
    const view = renderPanel({
      'remote-control': remote,
      'set-flight-mode': actionPort('set-flight-mode','Set mode'),
      arm: actionPort('arm','Arm'),
      disarm: actionPort('disarm','Disarm'),
      'force-disarm': actionPort('force-disarm','Kill'),
      'reboot-autopilot': actionPort('reboot-autopilot','Reboot'),
      'preflight-arm-test': actionPort('preflight-arm-test','Arm test'),
    },[{ id:'scout-01',scout: {} }]);
    expect(screen.getByRole('button',{ name:'UAV control' })).toBeEnabled();
    const flightMode = screen.getByRole('button',{ name:'Flight mode' });
    expect(flightMode).toBeDisabled();
    expect(flightMode).toHaveAccessibleName('Flight mode');
    expect(flightMode.closest('.robot-px4-mode-select')).toHaveAttribute(
      'title','Select at least one PX4 robot in Robot instruments.',
    );
    for (const name of ['Position','Altitude','Offboard','Set mode','Arm','Disarm','Kill','Reboot','Arm test'] as const) {
      expect(screen.getByRole('button',{ name })).toBeDisabled();
    }
    expect(view.container).not.toHaveTextContent('Select at least one PX4 robot in Robot instruments.');
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeEnabled();
    expect(start).toHaveClass('xgc-panel-runtime-action');
    expect(start).toHaveAttribute('data-xgc-icon-only','true');
    expect(view.container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]')).toContainElement(start);
    expect(view.container.querySelector('[data-xgc-role="robot-control-header-actions"]')).not.toContainElement(start);
  });

  it('shows E-stop on the UGV view as the same action tile as Kill',async () => {
    writeSelection([]);
    const view = renderPanel({},[{ id:'scout-01',scout: {} },{ id:'mecanum-01',mecanum: {} }]);
    fireEvent.click(screen.getByRole('button',{ name:'UGV control' }));
    const estop = screen.getByRole('button',{ name:'E-stop' });
    expect(estop).toHaveAttribute('data-xgc-role','ugv-chassis-hold');
    expect(estop).toHaveAttribute('data-xgc-layout','tile');
    expect(estop).toHaveClass('robot-px4-action-card');
    expect(estop).toHaveAttribute('data-xgc-tone','danger');
    expect(estop).toHaveAttribute('data-xgc-appearance','solid');
    expect(estop).toHaveAttribute('aria-pressed','false');
    expect(estop.querySelector('svg.robot-px4-action-icon')?.classList.contains('lucide-octagon-x')).toBe(true);
    expect(estop.querySelector('.robot-px4-action-title')?.textContent?.trim()).toBe('E-stop');
    expect(estop.querySelector('[data-xgc-progress], .xgc-workflow-status-card-progress, .xgc-progress')).toBeTruthy();
    expect(estop.textContent).not.toMatch(/idle|stopped|ready/i);
    expect(view.container.querySelector('[data-xgc-role="ugv-action-grid"]')).toHaveAttribute('data-xgc-columns','4');
    expect(view.container.querySelector('[data-xgc-role="ugv-control-view"]')).toContainElement(estop);
    expect(screen.queryByRole('button',{ name:'Kill' })).not.toBeInTheDocument();
    fireEvent.click(estop);
    await waitFor(() => expect(chassisHoldMocks.post).toHaveBeenCalledWith('local',{
      experimentId:'experiment-a',held:true,
    }));
    expect(estop).toHaveAttribute('aria-pressed','true');
    chassisHoldMocks.post.mockResolvedValue({ held:false,applied:['scout-01'],failed:[],skipped:0 });
    fireEvent.click(estop);
    await waitFor(() => expect(chassisHoldMocks.post).toHaveBeenCalledWith('local',{
      experimentId:'experiment-a',held:false,
    }));
    await waitFor(() => expect(estop).toHaveAttribute('aria-pressed','false'));
  });
});

function renderPanel(actions: Record<string,PanelActionPortRuntime> = {},robots: readonly Record<string,unknown>[] = defaultRobots,editing = false) {
  return render(panelTree(actions,robots,editing));
}

function panelTree(actions: Record<string,PanelActionPortRuntime> = {},robots: readonly Record<string,unknown>[] = defaultRobots,editing = false) {
  const panel = panelFixture();
  return <RobotControlFrameProvider panel={panel}>
    <div data-xgc-role="experiment-panel-header-leading" data-xgc-id={panel.id}>
      <RobotControlHeaderLeading panel={panel} editing={editing} />
    </div>
    <div data-xgc-role="experiment-panel-header-trailing" data-xgc-id={panel.id}>
      <RobotControlHeaderActions panel={panel} editing={editing} />
    </div>
    <PX4RotorControlPanel panel={panel} context={context(actions,robots)} />
  </RobotControlFrameProvider>;
}

function writeSelection(ids: string[]) {
  window.localStorage.setItem('xgc.experiment.experiment-a.robot.selection', JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('xgc-panel-state', {
    detail:{ key:'xgc.experiment.experiment-a.robot.selection' },
  }));
}

const defaultRobots = [
  { id:'px4-01',px4: {} },
  { id:'scout-01',scout: {} },
];

function panelFixture():PanelInstance {
  return { id:'robot-control',pluginId:'px4-rotor-control-panel',title:'Robot control',gridPos:{ x:0,y:0,w:8,h:6 },query:{},options:{ dashboard:'gcs' },fieldConfig:{},portBindings:[] };
}

function actionPort(id: string,label: string):PanelActionPortRuntime {
  return { id,label,connected:true,disabledReason:'',
    action:{ id,label,kind:'command',controls:['cancel'] },
    defaults:{},invoke:vi.fn(async () => ({ id:'run-1',status:'running' as const,revision:1 })),
    control:vi.fn(async () => undefined),trace:{} };
}

function context(actions: Record<string,PanelActionPortRuntime>,robots: readonly Record<string,unknown>[] = defaultRobots):PanelPluginContext {
  return {
    executionTargetId: 'local',
    sharedStateScope: 'experiment',
    ports:{ actions,data:{ robots:{
      id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:true,
      value:{ head:{ resourceId:'experiment-a' },branch:{ name:'main' },spec:{ robots } },trace:{},
    } },authoring:{},interactions:{} } };
}
