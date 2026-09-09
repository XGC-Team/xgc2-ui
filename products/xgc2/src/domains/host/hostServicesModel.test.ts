import { describe,expect,it } from 'vitest';
import { validateSSHPorts } from './hostServicesModel';

describe('hostServicesModel', () => {
  it('accepts unique valid SSH ports', () => {
    expect(validateSSHPorts('22')).toBe(true);
    expect(validateSSHPorts('22, 2222')).toBe(true);
  });

  it('rejects invalid or duplicate SSH ports', () => {
    expect(validateSSHPorts('')).toBe(false);
    expect(validateSSHPorts('0')).toBe(false);
    expect(validateSSHPorts('65536')).toBe(false);
    expect(validateSSHPorts('22,22')).toBe(false);
  });
});
