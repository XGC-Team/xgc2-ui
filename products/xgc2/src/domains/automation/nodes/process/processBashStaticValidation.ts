import type { AutomationNode } from '../../automationDefinitionContracts';

export const DEFAULT_BASH_COMMAND_BLOCKLIST = [
  String.raw`(^|[;&|]\s*)(sudo\s+)?(shutdown|reboot|poweroff|halt)(\s|$)`,
  String.raw`(^|[;&|]\s*)(sudo\s+)?(mkfs(\.[A-Za-z0-9_+-]+)?|wipefs)(\s|$)`,
  String.raw`(^|[;&|]\s*)rm\s+[^#\n]*(-[A-Za-z]*[rR][A-Za-z]*|--recursive)[^#\n]*(--no-preserve-root|(^|\s)/(\s|$)|/\*)`,
  String.raw`(^|[;&|]\s*)rm\s+[^#\n]*(-[A-Za-z]*[rR][A-Za-z]*|--recursive)[^#\n]*\$`,
  String.raw`(^|[;&|]\s*)dd\s+[^#\n]*\bof=/dev/`,
].join('\n');

export function validateBashCommandStaticBlocklist(node: AutomationNode): string | null {
  const command = typeof node.parameters.command === 'string' ? node.parameters.command : '';
  const source = typeof node.parameters.commandBlocklist === 'string'
    ? node.parameters.commandBlocklist
    : DEFAULT_BASH_COMMAND_BLOCKLIST;
  return validateCommandAgainstBlocklist(command, source);
}

export function validateCommandAgainstBlocklist(command: string, source: string): string | null {
  const patterns = source.split('\n');
  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index]!.trim();
    if (!pattern) continue;
    let expression: RegExp;
    try {
      expression = new RegExp(pattern, 'm');
    } catch {
      return `Blocked command pattern ${index + 1} is not a valid regular expression.`;
    }
    if (expression.test(command)) {
      return `Bash command matches blocked command pattern ${index + 1}.`;
    }
  }
  return null;
}
