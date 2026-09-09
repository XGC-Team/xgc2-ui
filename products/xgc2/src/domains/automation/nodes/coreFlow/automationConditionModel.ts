import { automationInputFieldExpression } from '../../automationInputExpression';

export const automationConditionOperators = [
  { value: 'exists',label: 'Exists',requiresValue: false },
  { value: 'notExists',label: 'Does not exist',requiresValue: false },
  { value: 'isEmpty',label: 'Is empty',requiresValue: false },
  { value: 'notEmpty',label: 'Is not empty',requiresValue: false },
  { value: 'equals',label: 'Is equal to',requiresValue: true },
  { value: 'notEquals',label: 'Is not equal to',requiresValue: true },
  { value: 'gt',label: 'Is greater than',requiresValue: true },
  { value: 'gte',label: 'Is greater than or equal to',requiresValue: true },
  { value: 'lt',label: 'Is less than',requiresValue: true },
  { value: 'lte',label: 'Is less than or equal to',requiresValue: true },
  { value: 'contains',label: 'Contains',requiresValue: true },
  { value: 'startsWith',label: 'Starts with',requiresValue: true },
  { value: 'endsWith',label: 'Ends with',requiresValue: true },
] as const;

export type AutomationCondition = {
  path: string;
  operator: string;
  value?: unknown;
  leftMode?: 'fixed' | 'expression';
  leftValue?: unknown;
};

export type AutomationConditionSource = {
  source: 'input' | 'run';
  inputNode?: string;
};

export function automationConditionList(value: unknown): AutomationCondition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.path !== 'string' || typeof candidate.operator !== 'string') return [];
    return [{
      path: candidate.path,
      operator: candidate.operator,
      ...('value' in candidate ? { value: candidate.value } : {}),
      ...(candidate.leftMode === 'fixed' || candidate.leftMode === 'expression' ? { leftMode: candidate.leftMode } : {}),
      ...('leftValue' in candidate ? { leftValue: candidate.leftValue } : {}),
    }];
  });
}

export function automationConditionExpression(parameters: Record<string,unknown>, path: string) {
  const segments = jsonPointerSegments(path);
  const source = parameters.source === 'run'
    ? { sourceId: 'run.parameters',multipleSources: false,segments,scope: 'run-parameters' as const }
    : typeof parameters.inputNode === 'string' && parameters.inputNode
      ? { sourceId: parameters.inputNode,multipleSources: true,segments }
      : { sourceId: 'input',multipleSources: false,segments };
  return automationInputFieldExpression(source);
}

export function parseAutomationConditionExpression(expression: string): (AutomationConditionSource & { path: string }) | undefined {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) return undefined;
  const reference = trimmed.slice(2, -2).trim();
  let position = 0;
  let source: AutomationConditionSource;
  if (reference.startsWith('$run.parameters')) {
    position = '$run.parameters'.length;
    source = { source: 'run' };
  } else if (reference.startsWith('$inputs')) {
    position = '$inputs'.length;
    const inputNode = readBracketSegment(reference, position, true);
    if (!inputNode || typeof inputNode.segment !== 'string') return undefined;
    position = inputNode.end;
    source = { source: 'input',inputNode: inputNode.segment };
  } else if (reference.startsWith('$input') && !reference.startsWith('$inputs')) {
    position = '$input'.length;
    source = { source: 'input' };
  } else {
    return undefined;
  }
  const segments: Array<string | number> = [];
  while (position < reference.length) {
    if (reference[position] === '.') {
      const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(reference.slice(position + 1));
      if (!identifier) return undefined;
      segments.push(identifier[0]);
      position += identifier[0].length + 1;
      continue;
    }
    if (reference[position] === '[') {
      const segment = readBracketSegment(reference, position, false);
      if (!segment) return undefined;
      segments.push(segment.segment);
      position = segment.end;
      continue;
    }
    return undefined;
  }
  return { ...source,path: jsonPointer(segments) };
}

export function automationConditionOperatorRequiresValue(operator: string) {
  return automationConditionOperators.find((candidate) => candidate.value === operator)?.requiresValue ?? true;
}

export function automationConditionValueText(value: unknown) {
  if (typeof value === 'string') {
    return looksLikeNonStringJSON(value) ? JSON.stringify(value) : value;
  }
  return value === undefined ? '' : JSON.stringify(value);
}

export function parseAutomationConditionValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function jsonPointerSegments(pointer: string) {
  if (!pointer) return [];
  if (!pointer.startsWith('/')) return [];
  return pointer.slice(1).split('/').map((segment) => {
    const decoded = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    return /^(0|[1-9][0-9]*)$/.test(decoded) ? Number(decoded) : decoded;
  });
}

function jsonPointer(segments: Array<string | number>) {
  if (segments.length === 0) return '';
  return segments.map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

function readBracketSegment(value: string, start: number, stringOnly: boolean) {
  if (value[start] !== '[') return undefined;
  let position = start + 1;
  while (/\s/.test(value[position] ?? '')) position += 1;
  if (value[position] === '"') {
    const token = /^"(?:\\.|[^"\\])*"/.exec(value.slice(position));
    if (!token) return undefined;
    let segment: unknown;
    try {
      segment = JSON.parse(token[0]);
    } catch {
      return undefined;
    }
    if (typeof segment !== 'string' || !segment) return undefined;
    position += token[0].length;
    while (/\s/.test(value[position] ?? '')) position += 1;
    if (value[position] !== ']') return undefined;
    return { segment,end: position + 1 };
  }
  if (stringOnly) return undefined;
  const token = /^(0|[1-9][0-9]*)/.exec(value.slice(position));
  if (!token) return undefined;
  const segment = Number(token[0]);
  position += token[0].length;
  while (/\s/.test(value[position] ?? '')) position += 1;
  if (value[position] !== ']') return undefined;
  return { segment,end: position + 1 };
}

function looksLikeNonStringJSON(value: string) {
  try {
    return typeof JSON.parse(value) !== 'string';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
