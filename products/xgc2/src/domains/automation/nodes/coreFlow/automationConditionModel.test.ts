import { describe,expect,it } from 'vitest';
import {
  automationConditionExpression,
  automationConditionList,
  automationConditionValueText,
  parseAutomationConditionExpression,
  parseAutomationConditionValue,
} from './automationConditionModel';

describe('CoreFlow automation condition model', () => {
  it('projects hidden flow source and JSON Pointer fields as n8n-style expressions', () => {
    expect(automationConditionExpression({ source: 'run' }, '/autoStartAdapters'))
      .toBe('{{ $run.parameters.autoStartAdapters }}');
    expect(automationConditionExpression({ source: 'input' }, '/robot/enabled'))
      .toBe('{{ $input.robot.enabled }}');
    expect(automationConditionExpression({ source: 'input',inputNode: 'prepare' }, '/robots/0/id'))
      .toBe('{{ $inputs["prepare"].robots[0].id }}');
  });

  it('parses supported expressions back into the existing execution contract', () => {
    expect(parseAutomationConditionExpression('{{ $run.parameters.autoStartAdapters }}')).toEqual({
      source: 'run',path: '/autoStartAdapters',
    });
    expect(parseAutomationConditionExpression('{{ $inputs["prepare"].robots[0]["system/id"] }}')).toEqual({
      source: 'input',inputNode: 'prepare',path: '/robots/0/system~1id',
    });
    expect(parseAutomationConditionExpression('{{ $assets.external }}')).toBeUndefined();
  });

  it('preserves JSON scalar types without making ordinary strings noisy', () => {
    expect(automationConditionValueText(true)).toBe('true');
    expect(parseAutomationConditionValue('true')).toBe(true);
    expect(parseAutomationConditionValue('42')).toBe(42);
    expect(parseAutomationConditionValue('robot-1')).toBe('robot-1');
    expect(automationConditionValueText('true')).toBe('"true"');
  });

  it('keeps each condition left operand mode independent', () => {
    expect(automationConditionList([
      { path: '/first',operator: 'equals',value: 1,leftMode: 'fixed',leftValue: 1 },
      { path: '/second',operator: 'equals',value: 2,leftMode: 'expression' },
    ])).toEqual([
      { path: '/first',operator: 'equals',value: 1,leftMode: 'fixed',leftValue: 1 },
      { path: '/second',operator: 'equals',value: 2,leftMode: 'expression' },
    ]);
  });
});
