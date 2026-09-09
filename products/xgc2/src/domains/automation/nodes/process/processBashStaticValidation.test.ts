import { describe,expect,it } from 'vitest';
import { newAutomationNode } from '../../automationSpecModel';
import {
  DEFAULT_BASH_COMMAND_BLOCKLIST,
  validateBashCommandStaticBlocklist,
} from './processBashStaticValidation';

function bashNode(command: string, commandBlocklist?: string) {
  return newAutomationNode('process.run-bash', {
    command,
    ...(commandBlocklist === undefined ? {} : { commandBlocklist }),
  }, 'Run Bash command', 1);
}

describe('process Bash static command blocklist', () => {
  it.each([
    'rm -rf /*',
    'rm --recursive "$OUTPUT_DIR"/*',
    'sudo reboot',
    'mkfs.ext4 /dev/sda',
    'dd if=/dev/zero of=/dev/sda',
  ])('blocks the default high-risk input %s', (command) => {
    expect(validateBashCommandStaticBlocklist(bashNode(command))).toMatch(/matches blocked command pattern/);
  });

  it('allows ordinary ROS and shell input', () => {
    expect(validateBashCommandStaticBlocklist(bashNode(
      'export ROS_MASTER_URI=http://core:11311\nroslaunch package robot.launch',
    ))).toBeNull();
  });

  it('allows the author to replace or disable the static patterns', () => {
    expect(validateBashCommandStaticBlocklist(bashNode('rm -rf /*', ''))).toBeNull();
    expect(validateBashCommandStaticBlocklist(bashNode('roslaunch package robot.launch', 'roslaunch')))
      .toBe('Bash command matches blocked command pattern 1.');
  });

  it('rejects an invalid customized regular expression while it is being authored', () => {
    expect(validateBashCommandStaticBlocklist(bashNode('echo ok', '[unterminated')))
      .toBe('Blocked command pattern 1 is not a valid regular expression.');
  });

  it('keeps the visible default as one regular expression per line', () => {
    expect(DEFAULT_BASH_COMMAND_BLOCKLIST.split('\n')).toHaveLength(5);
  });
});
