import type { AutomationNode } from '../../automationDefinitionContracts';
import {
  DEFAULT_BASH_COMMAND_BLOCKLIST,
  validateCommandAgainstBlocklist,
} from './processBashStaticValidation';

export function validateScriptCommandStaticBlocklist(node: AutomationNode): string | null {
  const value = (name: string) => typeof node.parameters[name] === 'string' ? node.parameters[name] : '';
  const source = typeof node.parameters.commandBlocklist === 'string'
    ? node.parameters.commandBlocklist
    : DEFAULT_BASH_COMMAND_BLOCKLIST;
  let command = `${quote(value('interpreter'))} ${quote(value('scriptPath'))}`;
  if (value('arguments').trim()) command += ` ${value('arguments').trim()}`;
  return validateCommandAgainstBlocklist(command, source);
}

function quote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
