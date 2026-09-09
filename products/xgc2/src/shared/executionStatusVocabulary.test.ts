import { describe,expect,it } from 'vitest';
import {
  INGRESS_STATUSES,
  JOB_STATUSES,
  RUN_STATUSES,
  STOP_RUN_SET_PRIOR_STATUSES,
  isIngressStatusActive,
  isRunStatus,
  isRunStatusActive,
  isRunStatusTerminal,
  isStopRunSetPriorStatus,
} from './executionStatusVocabulary';

declare const require: (module: string) => unknown;
const { readFileSync } = require('fs') as {
  readFileSync: (path: URL, encoding: 'utf8') => string;
};

const openAPI = readFileSync(
  new URL('../../../contracts/openapi/core.v1.yaml', import.meta.url),
  'utf8',
);

describe('executionStatusVocabulary', () => {
  it('matches every complete status vocabulary to its named OpenAPI enum', () => {
    expect(RUN_STATUSES).toEqual(namedStringEnum(openAPI, 'OrchestrationRunStatus'));
    expect(JOB_STATUSES).toEqual(namedStringEnum(openAPI, 'JobStatus'));
    expect(INGRESS_STATUSES).toEqual(namedStringEnum(openAPI, 'AutomationTriggerEventStatus'));
    expect(STOP_RUN_SET_PRIOR_STATUSES).toEqual(namedStringEnum(openAPI, 'StopSetPriorStatus'));
  });

  it('derives the runtime classifications consumed by current projections', () => {
    expect(RUN_STATUSES.filter(isRunStatusActive)).toEqual([
      'accepted','queued','running','waiting','stopping',
    ]);
    expect(RUN_STATUSES.filter(isRunStatusTerminal)).toEqual([
      'succeeded','failed','canceled','stopped','rejected',
    ]);
    expect(INGRESS_STATUSES.filter(isIngressStatusActive)).toEqual(['pending','claimed']);
  });

  it('rejects unknown strings and excludes dispatched ingress from stop-set prior statuses', () => {
    expect(isRunStatus('running')).toBe(true);
    expect(isRunStatus('unknown')).toBe(false);
    expect(STOP_RUN_SET_PRIOR_STATUSES).toEqual([
      ...RUN_STATUSES,'pending','claimed','dead_letter','abandoned',
    ]);
    expect(isStopRunSetPriorStatus('dispatched')).toBe(false);
  });
});

function namedStringEnum(document: string, schemaName: string) {
  const schemaHeader = `    ${schemaName}:`;
  const start = document.indexOf(`${schemaHeader}\n`);
  if (start < 0) throw new Error(`OpenAPI schema ${schemaName} is missing.`);

  const afterHeader = start + schemaHeader.length + 1;
  const remaining = document.slice(afterHeader);
  const nextSchemaOffset = remaining.search(/^ {4}[A-Za-z][A-Za-z0-9]*:\s*$/m);
  const schema = nextSchemaOffset < 0 ? remaining : remaining.slice(0, nextSchemaOffset);
  const match = /^ {6}enum: \[([^\]\r\n]+)\]\s*$/m.exec(schema);
  if (!match) throw new Error(`OpenAPI schema ${schemaName} must declare one inline string enum.`);

  const values = match[1].split(',').map((value) => value.trim());
  if (values.length === 0 || values.some((value) => !/^[a-z][a-z0-9_-]*$/.test(value))) {
    throw new Error(`OpenAPI schema ${schemaName} contains a non-canonical status value.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`OpenAPI schema ${schemaName} contains duplicate status values.`);
  }
  return values;
}
