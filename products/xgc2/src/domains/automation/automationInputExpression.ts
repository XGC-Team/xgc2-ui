export const AUTOMATION_INPUT_FIELD_DRAG_TYPE = 'application/x-xgc-automation-input-field+json';

export type AutomationInputFieldReference = {
  sourceId: string;
  multipleSources: boolean;
  segments: Array<string | number>;
  scope?: 'run-parameters';
};

const expressionIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const maximumInputPathDepth = 64;

export function automationInputFieldExpression(reference: AutomationInputFieldReference) {
  const root = reference.scope === 'run-parameters'
    ? '$run.parameters'
    : reference.multipleSources
      ? `$inputs[${JSON.stringify(reference.sourceId)}]`
      : '$input';
  const path = reference.segments.map((segment) => {
    if (typeof segment === 'number') return `[${segment}]`;
    return expressionIdentifier.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`;
  }).join('');
  return `{{ ${root}${path} }}`;
}

export function writeAutomationInputFieldDrag(dataTransfer: DataTransfer, reference: AutomationInputFieldReference) {
  const normalized = normalizeAutomationInputFieldReference(reference);
  if (!normalized) return false;
  const expression = automationInputFieldExpression(normalized);
  dataTransfer.setData(AUTOMATION_INPUT_FIELD_DRAG_TYPE, JSON.stringify({ version: 1,...normalized }));
  dataTransfer.setData('text/plain', expression);
  dataTransfer.effectAllowed = 'copy';
  return true;
}

export function readAutomationInputFieldDrag(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData(AUTOMATION_INPUT_FIELD_DRAG_TYPE);
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return undefined;
    return normalizeAutomationInputFieldReference({
      sourceId: value.sourceId,
      multipleSources: value.multipleSources,
      segments: value.segments,
      scope: value.scope,
    });
  } catch {
    return undefined;
  }
}

export function hasAutomationInputFieldDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types ?? []).includes(AUTOMATION_INPUT_FIELD_DRAG_TYPE);
}

export function isAutomationLocalInputExpression(value: string) {
  let position = 0;
  let references = 0;
  while (position < value.length) {
    const relativeStart = value.slice(position).indexOf('{{');
    if (relativeStart < 0) return !value.slice(position).includes('}}') && references > 0;
    const start = position + relativeStart;
    if (value.slice(position, start).includes('}}')) return false;
    const relativeEnd = value.slice(start + 2).indexOf('}}');
    if (relativeEnd < 0) return false;
    const end = start + 2 + relativeEnd;
    const reference = value.slice(start + 2, end).trim();
    if (reference.includes('{{') || !isAutomationLocalInputReference(reference)) return false;
    references += 1;
    position = end + 2;
  }
  return references > 0;
}

function isAutomationLocalInputReference(reference: string) {
  let position = 0;
  if (reference.startsWith('$inputs')) {
    position = '$inputs'.length;
    const source = readBracketSegment(reference, position, true);
    if (!source || typeof source.segment !== 'string') return false;
    position = source.end;
  } else if (reference.startsWith('$input') && !reference.startsWith('$inputs')) {
    position = '$input'.length;
  } else {
    return false;
  }
  while (position < reference.length) {
    if (reference[position] === '.') {
      const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(reference.slice(position + 1));
      if (!identifier) return false;
      position += 1 + identifier[0].length;
      continue;
    }
    if (reference[position] === '[') {
      const segment = readBracketSegment(reference, position, false);
      if (!segment) return false;
      position = segment.end;
      continue;
    }
    return false;
  }
  return true;
}

function normalizeAutomationInputFieldReference(value: unknown): AutomationInputFieldReference | undefined {
  if (!isRecord(value) || typeof value.sourceId !== 'string' || value.sourceId.length === 0 || value.sourceId.length > 256 ||
      typeof value.multipleSources !== 'boolean' || !Array.isArray(value.segments) || value.segments.length > maximumInputPathDepth) {
    return undefined;
  }
  if (value.scope !== undefined && value.scope !== 'run-parameters') return undefined;
  const segments: Array<string | number> = [];
  for (const segment of value.segments) {
    if (typeof segment === 'string') {
      if (segment.length === 0 || segment.length > 1_024) return undefined;
      segments.push(segment);
      continue;
    }
    if (typeof segment !== 'number' || !Number.isSafeInteger(segment) || segment < 0) return undefined;
    segments.push(segment);
  }
  return {
    sourceId: value.sourceId,
    multipleSources: value.multipleSources,
    segments,
    ...(value.scope === 'run-parameters' ? { scope: value.scope } : {}),
  };
}

function readBracketSegment(value: string, start: number, stringOnly: boolean) {
  if (value[start] !== '[') return undefined;
  let position = start + 1;
  while (/\s/.test(value[position] ?? '')) position += 1;
  if (value[position] === '"') {
    const stringToken = /^"(?:\\.|[^"\\])*"/.exec(value.slice(position));
    if (!stringToken) return undefined;
    let segment: unknown;
    try {
      segment = JSON.parse(stringToken[0]);
    } catch {
      return undefined;
    }
    if (typeof segment !== 'string' || segment.length === 0) return undefined;
    position += stringToken[0].length;
    while (/\s/.test(value[position] ?? '')) position += 1;
    if (value[position] !== ']') return undefined;
    return { segment,end: position + 1 };
  }
  if (stringOnly) return undefined;
  const indexToken = /^(0|[1-9][0-9]*)/.exec(value.slice(position));
  if (!indexToken) return undefined;
  const segment = Number(indexToken[0]);
  if (!Number.isSafeInteger(segment)) return undefined;
  position += indexToken[0].length;
  while (/\s/.test(value[position] ?? '')) position += 1;
  if (value[position] !== ']') return undefined;
  return { segment,end: position + 1 };
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
