// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { RobotControlPanelOptionsEditor } from './RobotControlPanelOptionsEditor';

describe('RobotControlPanelOptionsEditor',() => {
  it('defaults spring return off and writes it as a panel option',() => {
    const onChange = vi.fn();
    render(<RobotControlPanelOptionsEditor
      panel={panel()}
      executionTargetId="local"
      dashboardPanels={[]}
      options={{ dashboard:'gcs' }}
      onChange={onChange}
    />);
    const toggle = screen.getByRole('switch',{ name:'Spring return' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ dashboard:'gcs',springReturn:true });
  });
});

function panel():PanelInstance {
  return {
    id:'robot-control',pluginId:'px4-rotor-control-panel',title:'Robot control',
    gridPos:{ x:0,y:0,w:8,h:5 },query:{},options:{ dashboard:'gcs' },fieldConfig:{},portBindings:[],
  };
}
