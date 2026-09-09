import type { AutomationNode } from './automationDefinitionContracts';
import { isAutomationLocalInputExpression } from './automationInputExpression';

export function validateParameterBindings(node: AutomationNode) {
  const bindings = node.parameterBindings ?? [];
  if (bindings.length > 128) return `Node ${node.id} has too many parameter bindings.`;
  const targets = new Set<string>();
  for (const binding of bindings) {
    const target = binding.target.trim();
    const expression = binding.expression;
    if (!validJSONPointer(target) || target.length > 1_024) {
      return `Node ${node.id} parameter binding target "${binding.target}" is not a valid RFC 6901 JSON Pointer.`;
    }
    if (targets.has(target)) return `Node ${node.id} parameter binding target "${target}" must be unique.`;
    targets.add(target);
    if (binding.language !== 'xgc-expression-v2') {
      return `Node ${node.id} parameter binding "${target}" must use xgc-expression-v2.`;
    }
    if (expression.length > 4_096 || !isAutomationLocalInputExpression(expression)) {
      return `Node ${node.id} parameter binding "${target}" requires local INPUT expressions such as {{ $input.path }} or {{ $inputs["source-id"].path }}.`;
    }
  }
  const sorted = [...targets].sort();
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted.some((target, candidate) => candidate !== index && target.startsWith(`${sorted[index]}/`))) {
      return `Node ${node.id} parameter binding targets must not overlap.`;
    }
  }
  return '';
}
function validJSONPointer(value: string) {
  return value.startsWith('/') && !/~(?:[^01]|$)/.test(value);
}
