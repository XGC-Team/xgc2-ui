import { describe,expect,it } from 'vitest';
import { newUsernodeAssetSpec,normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import type { UsernodeAssetSpec } from './usernodeContractsPublic';
import { validateUsernodeAssetSpec } from './usernodeValidation';

function spec(overrides: Partial<UsernodeAssetSpec> = {}): UsernodeAssetSpec {
  return { ...newUsernodeAssetSpec('Warm up'),...overrides };
}

describe('normalizeUsernodeAssetSpec', () => {
  it('clears the fields that do not belong to the selected interpreter', () => {
    const normalized = normalizeUsernodeAssetSpec(spec({
      interpreter: 'roslaunch',
      source: 'echo leftover',
      package: 'my_pkg',
      executable: 'leftover',
      launchFile: 'bringup.launch',
    }));
    expect(normalized.source).toBe('');
    expect(normalized.executable).toBe('');
    expect(normalized.launchFile).toBe('bringup.launch');
    expect(normalized.package).toBe('my_pkg');
  });

  it('drops ROS fields when the interpreter uses an inline body', () => {
    const normalized = normalizeUsernodeAssetSpec(spec({
      interpreter: 'bash',source: 'echo hi',package: 'my_pkg',executable: 'talker',launchFile: 'a.launch',
    }));
    expect(normalized.package).toBe('');
    expect(normalized.executable).toBe('');
    expect(normalized.launchFile).toBe('');
  });

  it('canonicalizes the body line endings, tags, and input order', () => {
    const normalized = normalizeUsernodeAssetSpec(spec({
      name: '  Warm up  ',
      source: 'echo hi\r\n\n',
      tags: ['b','a','b',' '],
      inputs: [
        { name: 'zulu',kind: 'string',required: false,default: '',description: '' },
        { name: 'alpha',kind: 'number',required: true,default: '3',description: '' },
      ],
    }));
    expect(normalized.name).toBe('Warm up');
    expect(normalized.source).toBe('echo hi');
    expect(normalized.tags).toEqual(['a','b']);
    expect(normalized.inputs.map((input) => input.name)).toEqual(['alpha','zulu']);
  });

  it('keeps positional arguments in order, including duplicates', () => {
    const normalized = normalizeUsernodeAssetSpec(spec({
      interpreter: 'roslaunch',source: '',package: 'my_pkg',launchFile: 'a.launch',
      defaultArgs: ['b:=2','a:=1','b:=2'],
    }));
    expect(normalized.defaultArgs).toEqual(['b:=2','a:=1','b:=2']);
  });
});

describe('validateUsernodeAssetSpec', () => {
  it('accepts a default bash script', () => {
    expect(validateUsernodeAssetSpec(normalizeUsernodeAssetSpec(spec()))).toBe('');
  });

  it('requires the payload that matches the interpreter', () => {
    expect(validateUsernodeAssetSpec(spec({ source: '' }))).toContain('script body');
    expect(validateUsernodeAssetSpec(spec({ interpreter: 'rosrun',source: '',package: '' }))).toContain('ROS package');
    expect(validateUsernodeAssetSpec(spec({ interpreter: 'rosrun',source: '',package: 'my_pkg',executable: '' })))
      .toContain('ROS executable');
    expect(validateUsernodeAssetSpec(spec({ interpreter: 'roslaunch',source: '',package: 'my_pkg',launchFile: '' })))
      .toContain('ROS launch file');
  });

  it('rejects a roslaunch argument that is not key:=value', () => {
    expect(validateUsernodeAssetSpec(spec({
      interpreter: 'roslaunch',source: '',package: 'my_pkg',launchFile: 'a.launch',defaultArgs: ['--screen'],
    }))).toContain('key:=value');
  });

  it('rejects relative setup scripts and reserved environment names', () => {
    expect(validateUsernodeAssetSpec(spec({ setupScripts: ['setup.bash'] }))).toContain('absolute path');
    expect(validateUsernodeAssetSpec(spec({ env: { XGC_IN_SPEED: '3' } }))).toContain('reserved');
  });

  it('rejects input names that collide in the process environment', () => {
    expect(validateUsernodeAssetSpec(spec({
      inputs: [
        { name: 'Speed',kind: 'number',required: false,default: '',description: '' },
        { name: 'SPEED',kind: 'number',required: false,default: '',description: '' },
      ],
    }))).toContain('unique');
  });

  it('rejects a default value that does not match its declared kind', () => {
    expect(validateUsernodeAssetSpec(spec({
      inputs: [{ name: 'speed',kind: 'number',required: false,default: 'fast',description: '' }],
    }))).toContain('number');
  });

  it('enforces the timeout range', () => {
    expect(validateUsernodeAssetSpec(spec({ timeoutSeconds: 0 }))).toContain('Timeout');
    expect(validateUsernodeAssetSpec(spec({ timeoutSeconds: 86401 }))).toContain('Timeout');
  });
});
