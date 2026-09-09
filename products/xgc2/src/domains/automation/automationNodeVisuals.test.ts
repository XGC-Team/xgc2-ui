import {
  Archive,ArrowLeftRight,BookOpen,Bot,Box,Cable,Crosshair,FileCode2,FileOutput,Gamepad2,
  LayoutDashboard,Monitor,Network,Plane,Radar,Save,Send,ShieldCheck,TerminalSquare,Wrench,
} from 'lucide-react';
import { describe,expect,it } from 'vitest';
import { automationNodeIcon } from './automationNodeVisuals';

describe('automationNodeVisuals', () => {
  it.each([
    ['ros1.wait-roscore-ready',Network],
    ['ros1.wait-gazebo-ready',Box],
    ['ros1.publish-topic',Send],
    ['ros1.call-service',ArrowLeftRight],
    ['ros1.record-bag',Archive],
    ['ros1.run',TerminalSquare],
    ['process-preset:roscore',Network],
    ['process-preset:foxglove-bridge',Cable],
    ['process-preset:gazebo-server',Box],
    ['process-preset:scout-gazebo-robot',Bot],
    ['process-preset:mavros-px4-sitl',Plane],
    ['process-preset:gazebo-vrpn-server',Radar],
    ['process-preset:vrpn-client-ros1',Crosshair],
    ['process-preset:rviz',Monitor],
  ] as const)('gives %s a distinct semantic icon', (kind,Icon) => {
    expect(automationNodeIcon(kind, 'ros1')).toBe(Icon);
  });

  it.each([
    ['robot.operation','other',Gamepad2],
    ['asset.experiment-robots','asset',Bot],
    ['experiment.session.run-clock-guard','other',ShieldCheck],
    ['calibration.commit','other',Save],
    ['calibration.render-file','other',FileOutput],
    ['user.script','other',FileCode2],
    ['mcp.tool.call','other',Wrench],
    ['mcp.resource.read','other',BookOpen],
    ['visualization.lichtblick-layout','visualization',LayoutDashboard],
  ] as const)('gives %s a specific icon', (kind,category,Icon) => {
    expect(automationNodeIcon(kind, category)).toBe(Icon);
  });
});
