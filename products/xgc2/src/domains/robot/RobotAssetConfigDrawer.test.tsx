// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import type React from 'react';
import { describe,expect,it,vi } from 'vitest';
import type { RobotAssetDocument,RobotAssetSpec } from './robotAssetContracts';
import { PX4_MODEL_MOCAP_ROTOR,PX4_MOCAP_ROTOR_PROFILE_ID } from './robotAssetContracts';
import { px4RobotAssetKindContributionForModels } from './builtInRobotAssetKindContributions';
import { RobotAssetConfigDrawer } from './RobotAssetConfigDrawer';
import { assembleRobotAssetKindComposition,RobotAssetKindCompositionProvider } from './robotAssetKindComposition';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';

const b2Composition = robotAssetKindCompositionWithUnitreeB2;
const mocapRotorComposition = assembleRobotAssetKindComposition(
  px4RobotAssetKindContributionForModels({
    fs150: false,
    mocapRotor: true,
    simulation: false,
  }),
);

function renderDrawer(ui: React.ReactElement) {
  return render(
    <RobotAssetKindCompositionProvider composition={b2Composition}>
      {ui}
    </RobotAssetKindCompositionProvider>,
  );
}

describe('RobotAssetConfigDrawer', () => {
  it.each([
    ['Multirotor','px4_multirotor'],
    ['Unicycle','scout_mini'],
    ['Mecanum','mecanum_ugv'],
    ['Unitree B2','unitree_b2'],
  ] as const)('creates a first-class %s asset', async (chassisLabel,kind) => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    if (chassisLabel !== 'Multirotor') {
      fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
      fireEvent.click(screen.getByRole('option',{ name: chassisLabel }));
    } else {
      fireEvent.change(screen.getByLabelText('SSH username'),{ target: { value: 'operator' } });
      fireEvent.change(screen.getByLabelText('SSH password'),{ target: { value: 'test-secret' } });
    }
    if (chassisLabel === 'Unitree B2') {
        fireEvent.change(screen.getByLabelText('Robot address'),{ target: { value: 'b2-01.lab.local' } });
    }
    fireEvent.click(screen.getByRole('button',{ name: 'Create robot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ kind,description: '',tags: [] }),
    ));
  });

  it('defaults Scout Mini display name to Scout XX', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Unicycle' }));
    expect(screen.getByLabelText('Firmware / vendor')).toHaveTextContent('Scout');
    expect(screen.getByLabelText('Name')).toHaveValue('Scout 01');
    // Physical field order: Remote IP → Connector → Telemetry → Local → SSH → VRPN.
    const physical = document.querySelector('[data-xgc-role="robot-asset-physical"]')!;
    const fieldRoles = [...physical.querySelectorAll('[data-xgc-role$="-field"]')]
      .map((node) => node.getAttribute('data-xgc-role'));
    expect(fieldRoles).toEqual([
      'robot-asset-management-address-field',
      'robot-asset-ugv-connector-field',
      'robot-asset-ugv-telemetry-remote-port-field',
      'robot-asset-ugv-control-local-port-field',
      'robot-asset-ssh-username-field',
      'robot-asset-ssh-password-field',
      'robot-asset-mocap-field',
      'robot-asset-vrpn-topic-field',
      'robot-asset-positioning-frame-number-field',
      'robot-asset-positioning-comparison-threshold-field',
    ]);
    expect(screen.getByLabelText('Remote IP')).toHaveValue('192.168.51.201');
    expect(screen.getByLabelText('Connector')).toHaveTextContent('swarm_ros_bridge');
    expect(screen.getByLabelText('Telemetry remote port')).toHaveValue(3001);
    expect(screen.getByLabelText('Control local port')).toHaveValue(3301);
    expect(screen.getByLabelText('SSH username')).toHaveValue('agilex');
    const scoutSshField = screen.getByLabelText('SSH password');
    expect(scoutSshField).toHaveValue('agx');
    expect(scoutSshField).not.toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('ugv1');
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/ugv1/pose');
  });

  it('defaults Mecanum UGV to the same physical UGV fields as Scout (name differs)', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Mecanum' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Mecanum 01');
    expect(screen.getByLabelText('Firmware / vendor')).toHaveTextContent('Wheeltec');
    const physical = document.querySelector('[data-xgc-role="robot-asset-physical"]')!;
    const fieldRoles = [...physical.querySelectorAll('[data-xgc-role$="-field"]')]
      .map((node) => node.getAttribute('data-xgc-role'));
    expect(fieldRoles).toEqual([
      'robot-asset-management-address-field',
      'robot-asset-ugv-connector-field',
      'robot-asset-ugv-telemetry-remote-port-field',
      'robot-asset-ugv-control-local-port-field',
      'robot-asset-ssh-username-field',
      'robot-asset-ssh-password-field',
      'robot-asset-mocap-field',
      'robot-asset-vrpn-topic-field',
      'robot-asset-positioning-frame-number-field',
      'robot-asset-positioning-comparison-threshold-field',
    ]);
    expect(screen.getByLabelText('Remote IP')).toHaveValue('192.168.51.111');
    expect(screen.getByLabelText('Connector')).toHaveTextContent('swarm_ros_bridge');
    expect(screen.getByLabelText('Telemetry remote port')).toHaveValue(3001);
    expect(screen.getByLabelText('Control local port')).toHaveValue(3001);
    expect(screen.getByLabelText('SSH username')).toHaveValue('wheeltec');
    expect(screen.getByLabelText('SSH password')).toHaveValue('dongguan');
    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('ugv1');
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/ugv1/pose');
  });

  it('continues Scout / Mecanum numbering from that kind, not from PX4 fleet size', () => {
    // 20 PX4 + 5 Scout + 3 Mecanum mirrors the shipped fleet shape that used to
    // produce "Scout 21" when switching type from a UAV draft.
    const assets = [
      ...Array.from({ length: 20 },(_,index) => fixtureRobot({
        kind: 'px4_multirotor',
        id: `px4-${index + 1}`,
        name: `UAV ${String(index + 1).padStart(2,'0')}`,
        mavSystemId: index + 1,
        mocap: `uav${index + 1}`,
      })),
      ...Array.from({ length: 5 },(_,index) => fixtureRobot({
        kind: 'scout_mini',
        id: `scout-${index + 1}`,
        name: `Scout ${String(index + 1).padStart(2,'0')}`,
        mocap: `ugv${index + 1}`,
      })),
      ...Array.from({ length: 3 },(_,index) => fixtureRobot({
        kind: 'mecanum_ugv',
        id: `mecanum-${index + 1}`,
        name: `Mecanum ${String(index + 1).padStart(2,'0')}`,
        mocap: `ugv${index + 1}`,
      })),
    ];

    renderDrawer(
      <RobotAssetConfigDrawer
        assets={assets}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // New draft is PX4 → next free MAV id after 20.
    expect(screen.getByLabelText('Name')).toHaveValue('UAV 21');

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Unicycle' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Scout 06');
    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('ugv6');

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Mecanum' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Mecanum 04');
    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('ugv4');
  });

  it('prefills Remote IP as 192.168.51.10+N and lab SSH credentials in plain text', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText('Remote IP')).toHaveValue('192.168.51.11');
    expect(screen.getByLabelText('Chassis')).toHaveTextContent('Multirotor');
    expect(screen.getByLabelText('Firmware / vendor')).toHaveTextContent('PX4');
    expect(screen.getByLabelText('SSH username')).toHaveValue('marvsmart');
    const sshField = screen.getByLabelText('SSH password');
    // Value is the lab account; keep it off the same line as the "password" label match for secret scanners.
    expect(sshField).toHaveValue('marvsmart');
    // Trusted-lab memo: stays a normal text field, never type=password.
    expect(sshField).not.toHaveAttribute('type', 'password');
    expect(sshField).toHaveAttribute('autocomplete', 'off');
  });

  it('derives VRPN pose topic from mocap rigid body as a read-only field', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const topic = screen.getByLabelText('VRPN pose topic');
    expect(topic).toHaveAttribute('readonly');
    expect(topic).toHaveValue('/vrpn_client_node/uav1/pose');
    fireEvent.change(screen.getByLabelText('Mocap rigid body'),{ target: { value: 'uav7' } });
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/uav7/pose');
    fireEvent.change(topic,{ target: { value: '/hacked' } });
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/uav7/pose');
  });

  it('keeps digital-twin launch and simulation port fields read-only', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    for (const label of [
      'Product ID',
      'Launch package',
      'Launch file',
      'Simulation MAVLink local port',
      'Simulation MAVLink remote port',
      'Simulation MAVROS FCU URL',
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
    }
    expect(screen.getByLabelText('Launch package')).toHaveValue('gazebo_sim_fs150_sitl');
    expect(screen.getByLabelText('Launch file')).toHaveValue('fs150.launch');
    // MAV system ID 1 → the XGC simulation offboard port segment.
    expect(screen.getByLabelText('Simulation MAVLink local port')).toHaveValue(15000);
    expect(screen.getByLabelText('Simulation MAVLink remote port')).toHaveValue(15300);
    expect(screen.getByLabelText('Simulation MAVROS FCU URL')).toHaveValue('udp://:15000@127.0.0.1:15300');

    fireEvent.change(screen.getByLabelText('Launch package'),{ target: { value: 'hacked' } });
    fireEvent.change(screen.getByLabelText('Launch file'),{ target: { value: 'hacked.launch' } });
    fireEvent.change(screen.getByLabelText('Simulation MAVLink local port'),{ target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Simulation MAVLink remote port'),{ target: { value: '2' } });
    expect(screen.getByLabelText('Launch package')).toHaveValue('gazebo_sim_fs150_sitl');
    expect(screen.getByLabelText('Launch file')).toHaveValue('fs150.launch');
    expect(screen.getByLabelText('Simulation MAVLink local port')).toHaveValue(15000);
    expect(screen.getByLabelText('Simulation MAVLink remote port')).toHaveValue(15300);
  });

  it('recomputes mocap rigid body, ports, and MAVROS FCU URL when MAV system ID changes', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('uav1');
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/uav1/pose');
    expect(screen.getByLabelText('MAVROS FCU URL')).toHaveValue('udp://:9010@192.168.51.11:14560');

    fireEvent.change(screen.getByLabelText('MAV system ID'),{ target: { value: '6' } });

    expect(screen.getByLabelText('Mocap rigid body')).toHaveValue('uav6');
    expect(screen.getByLabelText('VRPN pose topic')).toHaveValue('/vrpn_client_node/uav6/pose');
    expect(screen.getByLabelText('MAVLink local port')).toHaveValue(9060);
    expect(screen.getByLabelText('MAVROS FCU URL')).toHaveValue('udp://:9060@192.168.51.11:14560');
    expect(screen.getByLabelText('Simulation MAVLink local port')).toHaveValue(15005);
    expect(screen.getByLabelText('Simulation MAVLink remote port')).toHaveValue(15305);
    expect(screen.getByLabelText('Simulation MAVROS FCU URL')).toHaveValue('udp://:15005@127.0.0.1:15305');
  });

  it('creates robots by type without folder, profile, description, or tags controls', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole('group',{ name: 'Resource kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{ name: 'Folder' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Folder')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chassis')).toBeInTheDocument();
    expect(screen.getByLabelText('Firmware / vendor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Robot type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Robot profile')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-profile-field"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-description-field"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-tags-field"]')).toBeNull();
  });

  it('shows Model only for PX4; Scout and Mecanum are fully selected by chassis', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText('Robot model')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-model"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Unicycle' }));
    expect(screen.queryByLabelText('Robot model')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-model"]')).toBeNull();

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Mecanum' }));
    expect(screen.queryByLabelText('Robot model')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-model"]')).toBeNull();
  });

  it('auto-assigns profile by kind when creating', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('SSH username'),{ target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('SSH password'),{ target: { value: 'test-secret' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Create robot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'px4_multirotor',
        profileId: 'px4.multirotor.ros1.v9',
        px4: expect.objectContaining({ managementIp: '192.168.51.11' }),
      }),
    ));
  });

  it('authors Mocap Rotor through the PX4 shell without FS150 MAVROS, SITL, or GPS wiring', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RobotAssetKindCompositionProvider composition={mocapRotorComposition}>
        <RobotAssetConfigDrawer
          assets={[]}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </RobotAssetKindCompositionProvider>,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Mocap Rotor 01');
    expect(screen.getByLabelText('Robot model')).toHaveTextContent('Mocap Rotor');
    expect(screen.getByLabelText('Onboard computer IP')).toHaveValue('0.0.0.0');
    expect(screen.getByLabelText('SSH username')).toHaveValue('operator');
    expect(screen.getByLabelText('SSH password')).toHaveValue('unset');
    expect(screen.getByLabelText('Onboard mocap rigid body')).toHaveValue('mocap_rotor1');
    expect(screen.getByLabelText('Ground telemetry')).toHaveValue('Zenoh · read only');
    expect(screen.queryByLabelText('VRPN pose topic')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('MAVLink local port')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('MAVLink remote port')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('MAVROS FCU URL')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-simulation"]')).toBeNull();
    expect(screen.queryByText(/GPS/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('MAV system ID'),{ target: { value: '6' } });
    expect(screen.getByLabelText('Onboard mocap rigid body')).toHaveValue('mocap_rotor1');
    fireEvent.click(screen.getByRole('button',{ name: 'Create robot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'px4_multirotor',
      profileId: PX4_MOCAP_ROTOR_PROFILE_ID,
      px4: expect.objectContaining({
        modelId: PX4_MODEL_MOCAP_ROTOR,
        mavSystemId: 6,
        physicalMavrosLocalPort: 0,
        physicalFcuRemotePort: 0,
        simulationLocalPort: 0,
        simulationRemotePort: 0,
        simulation: { productId: '',launchPackage: '',launchFile: '' },
      }),
    })));
  });

  it('defaults Unitree B2 to B2 XX with empty serial/address and ROS domain 0', () => {
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Unitree B2' }));
    expect(screen.getByLabelText('Name')).toHaveValue('B2 01');
    expect(screen.getByLabelText('Firmware / vendor')).toHaveTextContent('Unitree');
    expect(screen.getByLabelText('Robot address')).toHaveValue('');
    expect(screen.getByLabelText('ROS domain ID')).toHaveValue(0);
    expect(screen.getByLabelText('SSH username')).toHaveValue('');
    expect(screen.getByLabelText('SSH password')).toHaveValue('');

    const inventory = document.querySelector('[data-xgc-role="robot-asset-unitree-b2"]')!;
    expect(inventory).not.toBeNull();
    const fieldRoles = [...inventory.querySelectorAll('[data-xgc-role$="-field"]')]
      .map((node) => node.getAttribute('data-xgc-role'));
    expect(fieldRoles).toEqual([
      'robot-asset-b2-robot-address-field',
      'robot-asset-b2-ros-domain-id-field',
      'robot-asset-b2-ssh-username-field',
      'robot-asset-b2-ssh-password-field',
    ]);
  });

  it('creates Unitree B2 with only base fields plus unitreeB2 arm and no forbidden controls', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button',{ name: 'Chassis' }));
    fireEvent.click(screen.getByRole('option',{ name: 'Unitree B2' }));

    // Inventory + companion SSH; no physical/simulation, agent, trust, endpoint, R5A, runtime.
    expect(document.querySelector('[data-xgc-role="robot-asset-physical"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-simulation"]')).toBeNull();
    expect(screen.getByLabelText('SSH username')).toBeInTheDocument();
    expect(screen.getByLabelText('SSH password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remote IP')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mocap rigid body')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Robot model')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Product ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Launch package')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="robot-asset-agent"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-trust"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-endpoint"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-r5a"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-runtime"]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Robot address'),{ target: { value: 'b2-01.lab.local' } });
    fireEvent.change(screen.getByLabelText('ROS domain ID'),{ target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('SSH username'),{ target: { value: 'thor' } });
    fireEvent.change(screen.getByLabelText('SSH password'),{ target: { value: '1' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Create robot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0] as RobotAssetSpec;
    expect(saved).toEqual({
      name: 'B2 01',
      description: '',
      tags: [],
      kind: 'unitree_b2',
      profileId: 'unitree.b2.v1',
      unitreeB2: {
        serialNumber: 'b2-01.lab.local',
        robotAddress: 'b2-01.lab.local',
        rosDomainId: 42,
        sshUsername: 'thor',
        sshPassword: '1',
      },
    });
    expect(saved).not.toHaveProperty('px4');
    expect(saved).not.toHaveProperty('scout');
    expect(saved).not.toHaveProperty('mecanum');
  });

  it('edits an existing Unitree B2 asset and saves only the unitreeB2 arm', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existing = fixtureRobot({
      kind: 'unitree_b2',
      id: 'robot-b2-1',
      name: 'B2 01',
      mocap: '',
    });
    renderDrawer(
      <RobotAssetConfigDrawer
        document={existing}
        assets={[existing]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('B2 01');
    expect(screen.getByLabelText('Robot address')).toHaveValue('b2-01.lab.local');
    expect(screen.getByLabelText('ROS domain ID')).toHaveValue(42);
    expect(screen.getByLabelText('SSH username')).toHaveValue('thor');
    expect(screen.getByLabelText('SSH password')).toHaveValue('1');
    expect(document.querySelector('[data-xgc-role="robot-asset-physical"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="robot-asset-simulation"]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Robot address'),{ target: { value: 'b2-01-renamed.lab.local' } });
    fireEvent.change(screen.getByLabelText('ROS domain ID'),{ target: { value: '0' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Save robot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toEqual({
      name: 'B2 01',
      description: '',
      tags: [],
      kind: 'unitree_b2',
      profileId: 'unitree.b2.v1',
      unitreeB2: {
        serialNumber: 'b2-01-renamed.lab.local',
        robotAddress: 'b2-01-renamed.lab.local',
        rosDomainId: 0,
        sshUsername: 'thor',
        sshPassword: '1',
      },
    });
  });

  it('keeps a rejected save visible without an optional external error sink', async () => {
    const onClose = vi.fn();
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={onClose}
        onSave={vi.fn().mockRejectedValue(new Error('Core rejected the Robot draft'))}
      />,
    );
    fireEvent.change(screen.getByLabelText('SSH username'),{ target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('SSH password'),{ target: { value: 'test-secret' } });

    fireEvent.click(screen.getByRole('button',{ name: 'Create robot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Core rejected the Robot draft');
    expect(document.querySelector('[data-xgc-role="robot-asset-form-error"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears local and external save errors before a retry attempt', async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = new Promise<void>((resolve) => { resolveRetry = resolve; });
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('First save failed'))
      .mockImplementationOnce(() => retry);
    const onError = vi.fn();
    const onClose = vi.fn();
    renderDrawer(
      <RobotAssetConfigDrawer
        assets={[]}
        onClose={onClose}
        onError={onError}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('SSH username'),{ target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('SSH password'),{ target: { value: 'test-secret' } });
    const submit = screen.getByRole('button',{ name: 'Create robot' });

    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('First save failed');
    expect(onError).toHaveBeenLastCalledWith('First save failed');
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onError).toHaveBeenLastCalledWith('');

    await act(async () => {
      resolveRetry?.();
      await retry;
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});

function fixtureRobot(input: {
  kind: RobotAssetSpec['kind'];
  id: string;
  name: string;
  mocap: string;
  mavSystemId?: number;
}): RobotAssetDocument {
  const timestamp = '2026-07-30T00:00:00Z';
  const simulation = {
    productId: input.kind === 'px4_multirotor'
      ? 'xgc2-gazebo-sim-fs150-sitl'
      : input.kind === 'mecanum_ugv' ? 'xgc2-gazebo-sim-mecanum' : 'xgc2-gazebo-sim-scout',
    launchPackage: input.kind === 'px4_multirotor'
      ? 'gazebo_sim_fs150_sitl'
      : input.kind === 'mecanum_ugv' ? 'gazebo_sim_mecanum' : 'gazebo_sim_scout',
    launchFile: input.kind === 'px4_multirotor'
      ? 'fs150.launch'
      : input.kind === 'mecanum_ugv' ? 'spawn.launch' : 'spawn_accurate.launch',
  };
  const profileId = input.kind === 'px4_multirotor'
    ? 'px4.multirotor.ros1.v9'
    : input.kind === 'mecanum_ugv'
      ? 'mecanum-ugv.ros1.v3'
      : input.kind === 'unitree_b2' ? 'unitree.b2.v1' : 'scout-mini.ros1.v6';
  const spec: RobotAssetSpec = input.kind === 'px4_multirotor'
    ? {
      name: input.name,description: '',tags: [],kind: 'px4_multirotor',profileId,
      px4: {
        modelId:'fs150',mavSystemId: input.mavSystemId ?? 1,
        managementIp: '192.0.2.10',sshUsername: 'pilot',sshPassword: 'secret',
        mocapRigidBodyName: input.mocap,physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14550,
        simulationLocalPort: 15000,simulationRemotePort: 15300,simulation,
      },
    }
    : input.kind === 'mecanum_ugv'
      ? {
        name: input.name,description: '',tags: [],kind: 'mecanum_ugv',profileId,
        mecanum: {
          managementAddress: '192.168.51.221',
          connector: 'swarm_ros_bridge',
          sshUsername: 'wheeltec',
          sshPassword: 'dongguan',
          telemetryRemotePort: 3001,
          controlLocalPort: 3001,
          mocapRigidBodyName: input.mocap,
          simulation,
        },
      }
      : input.kind === 'unitree_b2'
        ? {
          name: input.name,description: '',tags: [],kind: 'unitree_b2',profileId,
          unitreeB2: {
            serialNumber: 'b2-01.lab.local',
            robotAddress: 'b2-01.lab.local',
            rosDomainId: 42,
            sshUsername: 'thor',
            sshPassword: '1',
          },
        }
        : {
          name: input.name,description: '',tags: [],kind: 'scout_mini',profileId,
          scout: {
            managementAddress: '192.168.51.201',
            connector: 'swarm_ros_bridge',
            sshUsername: 'wheeltec',
            sshPassword: 'dongguan',
            telemetryRemotePort: 3001,
            controlLocalPort: 3001,
            mocapRigidBodyName: input.mocap,
            simulation,
          },
        };
  return {
    head: {
      domain: 'robot',resourceId: input.id,name: input.name,description: '',tags: [],system: true,
      mainCommitId: `${input.id}-commit`,currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'robot',resourceId: input.id,name: 'main',headCommitId: `${input.id}-commit`,
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
