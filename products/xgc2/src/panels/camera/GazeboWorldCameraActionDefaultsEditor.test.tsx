// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelActionPortDefinition } from '../types';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type * as ExperimentPublicModule from '../../domains/experiment/experimentPublic';
import { GazeboWorldCameraActionDefaultsEditor } from './GazeboWorldCameraActionDefaultsEditor';
import { cameraZhMessages } from './cameraMessages';

const listFiles = vi.hoisted(() => vi.fn());
const listScenes = vi.hoisted(() => vi.fn());

vi.mock('../../domains/automation/automationPublic',() => ({
  listAutomationTargetFiles: listFiles,
  readAutomationTargetFileFingerprint:vi.fn(async () => 'a'.repeat(64)),
  AutomationPathPicker:({ onSelect,onClose }:{ onSelect:(path:string)=>void;onClose:()=>void }) => (
    <div>
      <button type="button" onClick={() => onSelect('/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml')}>pick</button>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock('../../domains/experiment/experimentPublic',async (importOriginal) => {
  const actual = await importOriginal<typeof ExperimentPublicModule>();
  return { ...actual,listScenes };
});

describe('GazeboWorldCameraActionDefaultsEditor',() => {
  beforeEach(() => {
    listScenes.mockReset().mockResolvedValue([]);
  });

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
          { name:'extrinsics-20260904T021713.263963Z.yaml',path:`${path}/extrinsics-20260904T021713.263963Z.yaml`,isDir:false },
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
      simulationPoseSource:'authored',
      simulationExtrinsicFile:'',
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

  it('preserves an existing file-based simulation spawn choice until the operator changes modes',async () => {
    listFiles.mockImplementation(async (_target:string, path:string) => ({
      path,
      parent: '/cal',
      entries: path.includes('/phy/')
        ? [{ name:'extrinsics-20260904T021713.263963Z.yaml',path:`${path}/extrinsics-20260904T021713.263963Z.yaml`,isDir:false }]
        : [],
    }));
    const onChange = vi.fn();
    const tree = (values: Record<string,string>) => (
      <GazeboWorldCameraActionDefaultsEditor
        panel={panel()}
        port={cameraServicePort()}
        values={values}
        options={{}}
        executionTargetId="local"
        onChange={onChange}
        onOptionsChange={vi.fn()}
      />
    );
    render(tree({
      calibrationRoot:'/cal',cameraName:'usb_cam',simulationIntrinsicFile:'',physicalIntrinsicFile:'',
      simulationPoseSource:'file',simulationExtrinsicFile:'',
    }));
    await waitFor(() => expect(listFiles).toHaveBeenCalled());
    expect(screen.getByText('Choose an extrinsics YAML when pose source is a calibration file.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera extrinsics' }));
    fireEvent.click(screen.getByRole('option',{ name:'Physical · Latest · 2026-09-04 02:17:13' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      simulationPoseSource:'file',
      simulationExtrinsicFile:'/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml',
    }));
  });

  it('shows authored World pose fields and writes Action radians plus panel options',() => {
    listFiles.mockResolvedValue({ path:'/cal',parent:'/',entries:[] });
    const onChange = vi.fn();
    const onOptionsChange = vi.fn();
    const { container } = render(<GazeboWorldCameraActionDefaultsEditor
      panel={panel()}
      port={cameraServicePort()}
      values={{ calibrationRoot:'/cal',cameraName:'usb_cam',x:-4,y:0,z:1.5,roll:0,pitch:0,yaw:0 }}
      options={{}}
      onChange={onChange}
      onOptionsChange={onOptionsChange}
    />);
    expect(screen.queryByRole('button',{ name:'Simulation camera extrinsics' })).toBeNull();
    expect(container.querySelector('[data-xgc-role="gazebo-world-camera-authored-pose"]')).toBeInTheDocument();
    const pose = container.querySelector('[data-xgc-role="gazebo-world-camera-authored-pose"]');
    expect(pose).toHaveClass('gazebo-world-camera-authored-pose');
    expect(container.querySelector('[data-xgc-role="gazebo-world-camera-authored-position-label"]')).toHaveTextContent('Position');
    expect(container.querySelector('[data-xgc-role="gazebo-world-camera-authored-attitude-label"]')).toHaveTextContent('Attitude');
    expect(pose).toContainElement(
      container.querySelector('[data-xgc-role="gazebo-world-camera-authored-position-xyz"]') as HTMLElement,
    );
    expect(pose).toContainElement(
      container.querySelector('[data-xgc-role="gazebo-world-camera-authored-attitude-rpy"]') as HTMLElement,
    );
    const xField = container.querySelector('[data-xgc-role="gazebo-world-camera-authored-pose-field"][data-xgc-id="gazebo-world-camera:x"]');
    const x = xField instanceof HTMLInputElement ? xField : xField?.querySelector('input');
    expect(x).toBeInstanceOf(HTMLInputElement);
    fireEvent.change(x!,{ target:{ value:'-2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      simulationPoseSource:'authored',
      x:-2,y:0,z:1.5,roll:0,pitch:0,yaw:0,
    }));
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining({
      x:-2,y:0,z:1.5,rollDegrees:0,pitchDegrees:0,yawDegrees:0,
    }));
  });

  it('renders the camera source enum as a dropdown and commits the flat Action keys',async () => {
    listFiles.mockResolvedValue({ path:'/cal',parent:'/',entries:[] });
    const onChange=vi.fn();
    render(<GazeboWorldCameraActionDefaultsEditor panel={panel()} port={cameraServicePort()}
      values={{ calibrationRoot:'/cal',cameraName:'usb_cam',cameraSource:'auto' }}
      options={{}} onChange={onChange} onOptionsChange={vi.fn()} />);
    await waitFor(() => expect(listFiles).toHaveBeenCalled());
    expect(listScenes).not.toHaveBeenCalled();
    expect(screen.queryByText('Simulation scene')).toBeNull();
    expect(screen.queryByText('Venue')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Camera source' }));
    for (const label of ['Auto','Simulation','Physical','Replay']) {
      expect(screen.getByRole('option',{ name:label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('option',{ name:'Replay' }));
    expect(onChange).toHaveBeenLastCalledWith({
      cameraSource:'replay',calibrationRoot:'/cal',cameraName:'usb_cam',
    });
    expect(cameraZhMessages[
      'Auto follows the Session runMode. Simulation or physical forces that live source. Replay uses the image and calibration from the scene selected in Config.'
    ]).toContain('Config');
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
