// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { GazeboScenePanel } from './GazeboScenePanel';

describe('GazeboScenePanel Action ports',() => {
  it('invokes only the explicit spawn Action with authored obstacle inputs',async () => {
    const spawn = action('spawn');
    render(<GazeboScenePanel panel={panel()} context={context({ spawn })} />);
    fireEvent.click(screen.getByRole('button',{ name:/Place/ }));
    await waitFor(() => expect(spawn.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ name:'obstacle_01',model:'xgc2_geom_cube' }),expect.stringContaining('spawn'),
    ));
  });
  it('disables a gesture whose Action port is not connected',() => {
    render(<GazeboScenePanel panel={panel()} context={context({})} />);
    expect(screen.getByRole('button',{ name:/Place/ })).toBeDisabled();
    expect(screen.getByRole('button',{ name:/Move/ })).toBeDisabled();
  });
});

function panel():PanelInstance {
  return { id:'scene',pluginId:'gazebo-scene-composer',title:'Scene',gridPos:{ x:0,y:0,w:8,h:6 },query:{},options:{},fieldConfig:{},portBindings:[] };
}
function action(id:string):PanelActionPortRuntime {
  return { id,label:id,connected:true,disabledReason:'',action:{ id,label:id,kind:'command',controls:['cancel'] },inputSchema:{ fields:[] },defaults:{},
    invoke:vi.fn(async () => ({ id:`run-${id}`,status:'running' as const,revision:1 })),control:vi.fn(),trace:{} };
}
function context(actions:Record<string,PanelActionPortRuntime>):PanelPluginContext {
  return { ports:{ actions,data:{},authoring:{},interactions:{} } };
}
