import { describe,expect,it } from 'vitest';
import { newAutomationNode } from '../../automationSpecModel';
import { validateROSCommandStaticBlocklist } from './processROSCommandStaticValidation';
import { validateScriptCommandStaticBlocklist } from './processScriptStaticValidation';

describe('process shortcut static validation', () => {
  it('checks the complete copyable ROS command', () => {
    const node = newAutomationNode('ros1.run', {
      setupBash: '/opt/ros/noetic/setup.bash',
      command: 'roslaunch demo robot.launch; rm -rf /*',
    }, 'ROS1 Run / Launch', 2);
    expect(validateROSCommandStaticBlocklist(node)).toMatch(/shell chaining/);
  });

  it('accepts only one complete rosrun or roslaunch command', () => {
    for (const command of ['rosrun demo talker __name:=demo','roslaunch demo robot.launch use_sim_time:=true']) {
      const node = newAutomationNode('ros1.run', {
        setupBash: '/opt/ros/noetic/setup.bash',command,
      }, 'ROS1 Run / Launch', 2);
      expect(validateROSCommandStaticBlocklist(node)).toBeNull();
    }
    const node = newAutomationNode('ros1.run', {
      setupBash: '/opt/ros/noetic/setup.bash',command: 'python3 robot.py',
    }, 'ROS1 Run / Launch', 2);
    expect(validateROSCommandStaticBlocklist(node)).toMatch(/rosrun or roslaunch/);
  });

  it('does not inspect selected script contents', () => {
    const node = newAutomationNode('process.run-python-script', {
      interpreter: 'python3',scriptPath: '/workspace/delete_everything.py',arguments: '',
    }, 'Run Python script', 1);
    expect(validateScriptCommandStaticBlocklist(node)).toBeNull();
  });

  it('checks shell text supplied through script arguments', () => {
    const node = newAutomationNode('process.run-shell-script', {
      interpreter: '/bin/bash',scriptPath: '/workspace/task.sh',arguments: '; reboot',
    }, 'Run shell script', 1);
    expect(validateScriptCommandStaticBlocklist(node)).toMatch(/matches blocked command pattern/);
  });
});
