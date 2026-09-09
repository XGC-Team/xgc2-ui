// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelActionPortDefinition } from '../types';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { GazeboWorldCameraActionDefaultsEditor } from './GazeboWorldCameraActionDefaultsEditor';

const listFiles = vi.hoisted(() => vi.fn());

vi.mock('../../domains/automation/automationPublic',() => ({
  listAutomationTargetFiles: listFiles,
  AutomationPathPicker:({ onSelect,onClose }:{ onSelect:(path:string)=>void;onClose:()=>void }) => (
    <div>
      <button type="button" onClick={() => onSelect('/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml')}>pick</button>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

describe('GazeboWorldCameraActionDefaultsEditor',() => {
  it('lists timestamped simulation and physical YAMLs and writes the flat Action keys',async () => {
    listFiles.mockImplementation(async (_target:string, path:string) => ({
      path,
      parent: '/cal',
      entries: path.includes('/sim/')
        ? [
          { name:'intrinsics.yaml',path:`${path}/intrinsics.yaml`,isDir:false },
          { name:'intrinsics-20260904T014722.128496Z.yaml',path:`${path}/intrinsics-20260904T014722.128496Z.yaml`,isDir:false },
          { name:'intrinsics-20260904T021713.263963Z.yaml',path:`${path}/intrinsics-20260904T021713.263963Z.yaml`,isDir:false },
        ]
        : [
          { name:'intrinsics-20260904T010000.000000Z.yaml',path:`${path}/intrinsics-20260904T010000.000000Z.yaml`,isDir:false },
        ],
    }));
    const onChange = vi.fn();
    render(<GazeboWorldCameraActionDefaultsEditor
      panel={panel()}
      port={cameraServicePort()}
      values={{
        simulationIntrinsicFile:'',
        physicalIntrinsicFile:'',
        calibrationRoot:'/cal',
        cameraName:'usb_cam',
      }}
      options={{}}
      executionTargetId="local"
      onChange={onChange}
      onOptionsChange={vi.fn()}
    />);

    await waitFor(() => expect(listFiles).toHaveBeenCalledTimes(2));
    expect(listFiles).toHaveBeenNthCalledWith(
      1,'local','/cal/sim/usb_cam',{ missing:'empty' },
    );
    expect(listFiles).toHaveBeenNthCalledWith(
      2,'local','/cal/phy/usb_cam',{ missing:'empty' },
    );
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera intrinsics' }));
    fireEvent.click(screen.getByRole('option',{ name:'Latest · 2026-09-04 02:17:13' }));
    expect(onChange).toHaveBeenCalledWith({
      simulationIntrinsicFile:'/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml',
      physicalIntrinsicFile:'',
      calibrationRoot:'/cal',
      cameraName:'usb_cam',
    });
  });

  it('lets an explicit selection return to automatic startup selection',async () => {
    listFiles.mockResolvedValue({ path:'/cal',parent:'/',entries:[] });
    const onChange=vi.fn();
    render(<GazeboWorldCameraActionDefaultsEditor panel={panel()} port={cameraServicePort()}
      values={{ calibrationRoot:'/cal',cameraName:'usb_cam',physicalIntrinsicFile:'',
        simulationIntrinsicFile:'/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml' }}
      options={{}} onChange={onChange} onOptionsChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera intrinsics' }));
    fireEvent.click(screen.getByRole('option',{ name:'Automatic' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ simulationIntrinsicFile:'' }));
  });

  it('rejects a simulation file chosen through the physical browser',async () => {
    listFiles.mockResolvedValue({ path:'/cal',parent:'/',entries:[] });
    const onChange=vi.fn();
    const { container }=render(<GazeboWorldCameraActionDefaultsEditor panel={panel()} port={cameraServicePort()}
      values={{ calibrationRoot:'/cal',cameraName:'usb_cam',simulationIntrinsicFile:'',physicalIntrinsicFile:'' }}
      options={{}} onChange={onChange} onOptionsChange={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-xgc-role="gazebo-world-camera-physical-intrinsic-browse"]')!);
    fireEvent.click(screen.getByRole('button',{ name:'pick' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Select a calibration from the matching mode and camera directory.')).toBeInTheDocument();
  });

  it('does not render for pose or solve Action ports',() => {
    const { container } = render(<GazeboWorldCameraActionDefaultsEditor
      panel={panel()}
      port={{ id:'set-pose',label:'Set camera pose',actionKinds:['command'] }}
      values={{}}
      options={{}}
      onChange={vi.fn()}
      onOptionsChange={vi.fn()}
    />);
    expect(container).toBeEmptyDOMElement();
  });
});

function panel():PanelInstance {
  return {
    id:'gazebo-world-camera',pluginId:'gazebo-world-camera',title:'Gazebo world camera',
    gridPos:{ x:0,y:0,w:23,h:16 },query:{},options:{},fieldConfig:{},portBindings:[],
  };
}

function cameraServicePort():PanelActionPortDefinition {
  return { id:'camera-service',label:'World camera service',actionKinds:['service'] };
}
