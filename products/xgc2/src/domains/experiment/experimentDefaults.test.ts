import { describe,expect,it } from 'vitest';

import {
  clipExperimentDashboardTabName,
  EXPERIMENT_DASHBOARD_TAB_NAME_MAX_LENGTH,
  managedExperimentWorkflowInstanceIds,
  newPanelWorkflowBinding,
  newSystemPanelWorkflowInstance,
  PANEL_SCHEMA_VERSION,
  defaultDashboard,
  defaultDashboards,
  normalizeExperimentDashboards,
  uniqueDashboardId,
} from './experimentModel';

describe('experiment dashboard defaults', () => {
  it('normalizes dashboard definitions and generates unique dashboard ids', () => {
    const dashboards = normalizeExperimentDashboards([
      { id: ' gcs ', name: ' GCS ', description: undefined as unknown as string,panels: [] },
      { id: 'gcs', name: 'Duplicate', description: '',panels: [] },
      { id: 'ops', name: '', description: 'Ops',panels: [] },
    ]);

    expect(dashboards).toEqual([
      { id: 'gcs', name: 'GCS', description: '',panels: [] },
      { id: 'ops', name: 'Dashboard', description: 'Ops',panels: [] },
    ]);
    expect(uniqueDashboardId(dashboards, 'gcs')).toBe('dashboard-3');
    expect(uniqueDashboardId(dashboards, 'analysis')).toBe('analysis');
  });

  it('caps dashboard tab names at twelve characters without rewriting saved dashboards', () => {
    expect(EXPERIMENT_DASHBOARD_TAB_NAME_MAX_LENGTH).toBe(12);
    expect(clipExperimentDashboardTabName('  GCS  ')).toBe('GCS');
    expect(clipExperimentDashboardTabName('Config')).toBe('Config');
    expect(clipExperimentDashboardTabName('Algorithm')).toBe('Algorithm');
    expect(clipExperimentDashboardTabName('Calibration')).toBe('Calibration');
    expect(clipExperimentDashboardTabName('Ground station')).toBe('Ground stati');
    expect(clipExperimentDashboardTabName('一二三四五六七八九十ab')).toBe('一二三四五六七八九十ab');
    expect(clipExperimentDashboardTabName('一二三四五六七八九十abc')).toBe('一二三四五六七八九十ab');
    expect(clipExperimentDashboardTabName('   ')).toBe('');
    expect(normalizeExperimentDashboards([
      { id: 'ops', name: 'Ground station', description: '', panels: [] },
    ])[0]?.name).toBe('Ground station');
  });

  it('uses Config as the sole system-created dashboard', () => {
    expect(defaultDashboard).toBe(defaultDashboards[0]);
    expect(defaultDashboards.map((dashboard) => dashboard.id)).toEqual(['config']);
    expect(defaultDashboards[0]?.panels).toEqual([
      expect.objectContaining({
        id: 'robot-assets',
        pluginId: 'experiment-robot-assets',
        grid: { x: 0,y: 0,w: 30,h: 16 },
        portBindings:expect.arrayContaining([expect.objectContaining({
          kind:'workflow',workflowInstanceId:'panel-robot-assets',managed:false,
        })]),
      }),
    ]);
  });

  it('preserves authored panel titles', () => {
    const panel = (id: string, pluginId: string, title: string) => ({
      schemaVersion: PANEL_SCHEMA_VERSION,id,pluginId,title,grid: { x: 0,y: 0,w: 6,h: 4 },
      view: { query: {},options: {},fieldConfig: {} },portBindings: [],
    });
    const [dashboard] = normalizeExperimentDashboards([{
      id: 'gcs',name: 'GCS',description: '',panels: [
        panel('control', 'automation-workflow-control', 'Automation workflows'),
        panel('logs', 'automation-workflow-audit', 'Automation audit'),
        panel('custom', 'automation-workflow-control', 'Flight launch controls'),
      ],
    }]);

    expect(dashboard?.panels.map((item) => item.title)).toEqual([
      'Automation workflows',
      'Automation audit',
      'Flight launch controls',
    ]);
  });

  it('derives managed workflow ownership from system refs and Panel bindings', () => {
    const systemWorkflow = { ...newSystemPanelWorkflowInstance('opaque'),id:'system-owned' };
    const managedWorkflow = {
      id:'managed-owned',ref:{ domain:'automation' as const,resourceId:'managed',branch:'main' },actionPresets:[],
    };
    const userWorkflow = {
      id:'user-owned',ref:{ domain:'automation' as const,resourceId:'user',branch:'main' },actionPresets:[],
    };
    const managedIds = managedExperimentWorkflowInstanceIds({
      workflowInstances:[systemWorkflow,managedWorkflow,userWorkflow],
      dashboards:[{
        id:'gcs',name:'GCS',description:'',panels:[{
          schemaVersion:PANEL_SCHEMA_VERSION,
          id:'plain-panel',pluginId:'test',title:'Test',grid:{ x:0,y:0,w:4,h:4 },
          view:{ query:{},options:{},fieldConfig:{} },
          portBindings:[newPanelWorkflowBinding(managedWorkflow.id, true)],
        }],
      }],
    });

    expect([...managedIds].sort()).toEqual(['managed-owned','system-owned']);
  });
});
