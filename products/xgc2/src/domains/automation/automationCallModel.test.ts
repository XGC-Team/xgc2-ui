import { describe,expect,it } from 'vitest';
import {
  automationCallInputProperty,
  clearAutomationCallTargetPins,
  initialAutomationCallInputs,
  usesAutomationCallInputs,
} from './automationCallModel';

describe('automationCallModel', () => {
  it('recognizes only the single scalar Call automation contract', () => {
    expect(usesAutomationCallInputs({ kind: 'automation.call',typeVersion: 4 })).toBe(true);
    expect(usesAutomationCallInputs({ kind: 'automation.call',typeVersion: 3 })).toBe(false);
    expect(usesAutomationCallInputs({ kind: 'automation.call-each',typeVersion: 1 })).toBe(false);
  });

  it('materializes child-declared fixed defaults for per-field mapping', () => {
    const fields = [
      { name: 'enabled',label: 'Enabled',kind: 'boolean' as const,boolean: { default: true } },
      { name: 'port',label: 'Port',kind: 'integer' as const,integer: { default: 9090,minimum: 1,maximum: 65535 } },
      { name: 'url',label: 'URL',kind: 'string' as const,required: true,string: { default: 'wss://ros.example.test/socket' } },
      {
        name: 'gazeboWorld',label: 'Gazebo world',kind: 'string' as const,required: true,
        string: { default: '/opt/worlds/empty.world',pathKind: 'file' as const,fileExtensions: ['.world'] },
      },
    ];
    expect(initialAutomationCallInputs(fields)).toEqual({
      enabled: true,port: 9090,url: 'wss://ros.example.test/socket',gazeboWorld: '/opt/worlds/empty.world',
    });
    expect(automationCallInputProperty(fields[2]!)).toEqual({
      type: 'string',title: 'URL',default: 'wss://ros.example.test/socket',
    });
    expect(automationCallInputProperty(fields[3]!)).toEqual({
      type: 'string',
      title: 'Gazebo world',
      default: '/opt/worlds/empty.world',
      'x-xgc-path-kind': 'file',
      'x-xgc-file-extensions': ['.world'],
    });
  });

  it('preserves authored array defaults on Call properties and fallbacks', () => {
    const field = {
      name: 'robotIds',
      label: 'Robot IDs',
      kind: 'array' as const,
      required: true,
      array: {
        minItems: 0,
        maxItems: 8,
        items: { kind: 'string' as const },
        default: ['scout-01', 'mecanum-02'],
      },
    };
    expect(initialAutomationCallInputs([field])).toEqual({
      robotIds: ['scout-01', 'mecanum-02'],
    });
    expect(automationCallInputProperty(field)).toEqual({
      type: 'array',
      title: 'Robot IDs',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 8,
      default: ['scout-01', 'mecanum-02'],
    });
    const fallback = initialAutomationCallInputs([field]).robotIds as string[];
    fallback.push('mutated');
    expect(field.array.default).toEqual(['scout-01', 'mecanum-02']);
  });

  it('removes every server-owned target pin when the selected Automation changes', () => {
    expect(clearAutomationCallTargetPins({
      automationId: 'child',
      branch: 'main',
      targetCommitId: 'commit',
      targetRegistryDigest: 'digest',
      targetVersion: 2,
    })).toEqual({ automationId: 'child',branch: 'main' });
  });
});
