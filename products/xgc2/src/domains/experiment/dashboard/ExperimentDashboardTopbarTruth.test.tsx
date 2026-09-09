// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { useExperimentDashboardActions } from './useExperimentDashboardActions';
import type { ExperimentRunModeControl } from './useExperimentRunMode';
import {
  ExperimentDashboardTopbar,
  type DashboardTopbarEditSession,
  type DashboardTopbarNavigation,
  type DashboardTopbarPanelActions,
} from './ExperimentDashboardTopbar';

describe('ExperimentDashboardTopbar aggregate lifecycle truth',() => {
  it('shows Stop when an Experiment-owned workflow is active without a singleton activeRun',() => {
    const dashboard = { id:'gcs',name:'GCS',description:'',panels:[] };
    const session:DashboardTopbarEditSession = {
      visibleExperiment: {
        head: { domain:'experiment',resourceId:'experiment-a',name:'Experiment A',tags:[],mainCommitId:'c1',currentVersion:1,digest:'d',revision:1,createdAt:'',updatedAt:'' },
        branch: { domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'c1',headVersion:1,revision:1,createdAt:'',updatedAt:'' },
        spec: { schemaVersion:15,name:'Experiment A',description:'',tags:[],runModes:['simulation'],localizationOffset:{ x:0,y:0,z:0 },robots:[],workflowInstances:[],dashboards:[dashboard] },
      },
      editing:false,readOnly:false,saving:false,start:vi.fn(),requestExit:vi.fn(),
    };
    const dashboards:DashboardTopbarNavigation = {
      items:[dashboard],selected:dashboard,select:vi.fn(),rename:vi.fn(),requestDelete:vi.fn(),create:vi.fn(),reorder:vi.fn(),
    };
    const panels:DashboardTopbarPanelActions = { openLibrary:vi.fn() };
    const runMode:ExperimentRunModeControl = {
      value:'simulation',options:['simulation'],select:vi.fn(),locked:true,
    };

    function Harness() {
      const actions = useExperimentDashboardActions({
        visibleExperiment:session.visibleExperiment,
        runtimeProjection:{
          loading:false,error:'',stateResolved:true,sessionActive:true,
          observedRunIds:new Set(),refresh:vi.fn(async () => undefined),
          convergeStoppedSession:vi.fn(async () => undefined),
        },
        startWorkflow:vi.fn(async () => { throw new Error('not used'); }),
        stopWorkflow:vi.fn(async () => undefined),
        runMode:'simulation',
      });
      return <ExperimentDashboardTopbar
        session={session}
        dashboards={dashboards}
        panels={panels}
        actions={actions}
        runMode={runMode}
        gcsMode={false}
        onGcsModeChange={vi.fn()}
      />;
    }

    render(<Harness />);

    const stop = screen.getByRole('button',{ name:'Stop experiment' });
    expect(stop).toHaveAttribute('data-xgc-role','experiment-stop');
    expect(stop).toBeEnabled();
    expect(screen.queryByRole('button',{ name:'Run experiment' })).toBeNull();
  });
});
