import type { AutomationNode } from '../../automationDefinitionContracts';
import {
  DEFAULT_BASH_COMMAND_BLOCKLIST,
  validateCommandAgainstBlocklist,
} from './processBashStaticValidation';

export function validateROSCommandStaticBlocklist(node: AutomationNode): string | null {
  if (node.kind === 'ros1.run') {
    const command = typeof node.parameters.command === 'string' ? node.parameters.command.trim() : '';
    const fields = command.split(/\s+/).filter(Boolean);
    if (fields.length < 3 || !['rosrun','roslaunch'].includes(fields[0] ?? '')) {
      return 'Command must be one complete rosrun or roslaunch command.';
    }
    if (/[\r\n;&|`]/.test(command) || command.includes('$(')) {
      return 'ROS1 command must not contain shell chaining or command substitution.';
    }
  }
  const source = typeof node.parameters.commandBlocklist === 'string'
    ? node.parameters.commandBlocklist
    : DEFAULT_BASH_COMMAND_BLOCKLIST;
  return validateCommandAgainstBlocklist(rosShortcutCommand(node), source);
}

export function rosShortcutCommand(node: AutomationNode): string {
  const value = (name: string) => typeof node.parameters[name] === 'string' ? node.parameters[name] : '';
  const ros2 = node.kind.startsWith('ros2.');
  const setup = value('setupBash') || (ros2 ? '/opt/ros/jazzy/setup.bash' : '/opt/ros/noetic/setup.bash');
  const lines = [`source ${shellQuote(setup)}`];
  if (ros2) {
    const domain = Number.isInteger(node.parameters.rosDomainId) ? Number(node.parameters.rosDomainId) : 0;
    lines.push(`export ROS_DOMAIN_ID=${domain}`);
    if (value('rmwImplementation').trim()) lines.push(`export RMW_IMPLEMENTATION=${shellQuote(value('rmwImplementation'))}`);
  }
  return [...lines,value('command').trim()].join('\n');
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
