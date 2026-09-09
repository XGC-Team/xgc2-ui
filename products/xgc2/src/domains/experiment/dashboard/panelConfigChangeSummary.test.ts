import { describe,expect,it } from 'vitest';
import { listPanelConfigChanges } from './panelConfigChangeSummary';

describe('listPanelConfigChanges', () => {
  it('uses plain-language labels for option toggles and execution target', () => {
    const changes = listPanelConfigChanges(
      {
        options: { autoStartRviz: false,gridColor: '#248eff' },
        portBindings: [],
        targetCoreId: '',
      },
      {
        options: { autoStartRviz: true,gridColor: '#112233' },
        portBindings: [{ name: 'a' }],
        targetCoreId: 'core-1',
      },
      {
        includeExecutionTarget: true,
        formatExecutionTarget: (id) => (id ? `Node ${id}` : 'Local'),
      },
    );

    expect(changes).toEqual([
      'Execution target: Local → Node core-1',
      'Autostart RViz: Off → On',
      'Grid color: #248eff → #112233',
      'Panel connections',
    ]);
  });

  it('describes automation workflow selection with names instead of UUIDs', () => {
    const workflowId = '29042e08-7aa7-470b-8c2f-75ece2da39aa';
    const changes = listPanelConfigChanges(
      {
        options: { automationResourceIds: [workflowId] },
        portBindings: [],
        targetCoreId: '',
      },
      {
        options: { automationResourceIds: [] },
        portBindings: [],
        targetCoreId: '',
      },
      {
        resolveName: (id) => (id === workflowId ? 'Camera intrinsic calibration' : undefined),
      },
    );

    expect(changes).toEqual([
      'Automation workflows: deselected “Camera intrinsic calibration”',
    ]);
    expect(changes.join('\n')).not.toMatch(/29042e08/);
  });

  it('describes newly selected workflows by name', () => {
    const changes = listPanelConfigChanges(
      { options: { automationResourceIds: [] },portBindings: [],targetCoreId: '' },
      { options: { automationResourceIds: ['wf-1'] },portBindings: [],targetCoreId: '' },
      { resolveName: (id) => (id === 'wf-1' ? 'Survey mission' : undefined) },
    );
    expect(changes).toEqual(['Automation workflows: selected “Survey mission”']);
  });

  it('falls back without dumping UUIDs when a name is missing', () => {
    const changes = listPanelConfigChanges(
      { options: { automationResourceIds: ['29042e08-7aa7-470b-8c2f-75ece2da39aa'] },portBindings: [],targetCoreId: '' },
      { options: { automationResourceIds: [] },portBindings: [],targetCoreId: '' },
    );
    expect(changes).toEqual(['Automation workflows: deselected “unknown workflow”']);
  });

  it('returns an empty list when snapshots match', () => {
    const snapshot = {
      options: { shown: true,automationResourceIds: ['a'] },
      portBindings: [{ id: 'b1' }],
      targetCoreId: 'core-a',
    };
    expect(listPanelConfigChanges(snapshot, snapshot, { includeExecutionTarget: true })).toEqual([]);
  });

  it('expands nested processParameters into concrete field lines', () => {
    const changes = listPanelConfigChanges(
      {
        options: {
          processParameters: {
            gazeboVrpnPort: 3884,
            gazeboVrpnAutoTrackKnownModels: true,
            gazeboWorld: '/opt/worlds/empty.world',
          },
        },
        portBindings: [],
        targetCoreId: '',
      },
      {
        options: {
          processParameters: {
            gazeboVrpnPort: 3885,
            gazeboVrpnAutoTrackKnownModels: false,
            gazeboWorld: '/opt/worlds/lab.world',
            gazeboVrpnTrackerPatterns: 'uav,ugv,mecanum',
          },
        },
        portBindings: [],
        targetCoreId: '',
      },
    );

    expect(changes).toEqual([
      'Process parameters · Auto-track known models: On → Off',
      'Process parameters · Port: 3884 → 3885',
      'Process parameters · Tracker patterns: — → uav,ugv,mecanum',
      'Process parameters · Gazebo world: /opt/worlds/empty.world → /opt/worlds/lab.world',
    ]);
    // Never collapse the whole bag into an opaque "changed" line when fields differ.
    expect(changes.join('\n')).not.toContain('Process parameters changed');
  });
});
