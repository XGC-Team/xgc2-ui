import { describe, expect, it } from 'vitest';
import { formatOperatorExpiry, operatorAccessCopy, unknownOperatorCapabilities } from './operatorAccessMessages';

describe('unknownOperatorCapabilities', () => {
  it('passes every real capability and composition marker this interface accounts for', () => {
    expect(unknownOperatorCapabilities([
      'core.view', 'core.proxy', 'access.manage', 'terminal.manage',
      'host.read', 'host.write', 'host.process.kill', 'host.ssh.manage', 'host.firewall.manage',
      'operations.process.read', 'operations.process.control',
      'operations.robot.read', 'operations.robot.control',
      'operations.job.read', 'operations.job.control',
      'operations.events.read', 'operations.mcp.control',
      'ground-station.interactions.read', 'ground-station.interactions.publish', 'ground-station.interactions.respond',
      'automations.read', 'automations.edit', 'automations.run',
      'toolbox.maintenance', 'robot.read', 'robot.manage',
      'calibration.read', 'calibration.edit',
      'recordings.read', 'recordings.write',
      'experiment.read', 'experiment.manage',
      'usernode.read', 'usernode.edit', 'usernode.run',
      'audit.task.read',
      'terminal.local', 'terminal.remote',
      'system.overview', 'system.files', 'system.processes', 'system.network', 'system.maintenance',
    ])).toEqual([]);
  });
  it('flags capabilities outside the accounted set', () => {
    expect(unknownOperatorCapabilities(['core.view', 'mystery.cap'])).toEqual(['mystery.cap']);
  });
  it('never treats ordinary object prototype keys as known', () => {
    expect(unknownOperatorCapabilities(['toString', 'constructor', '__proto__'])).toEqual(['toString', 'constructor', '__proto__']);
  });
});

describe('formatOperatorExpiry', () => {
  it('reads a missing expiry as no expiry set', () => {
    expect(formatOperatorExpiry(undefined, 'en-US')).toBe(operatorAccessCopy('en-US').noExpiry);
    expect(formatOperatorExpiry('', 'zh-CN')).toBe(operatorAccessCopy('zh-CN').noExpiry);
  });
  it('keeps an unparseable value verbatim and formats a real date', () => {
    expect(formatOperatorExpiry('not-a-date', 'en-US')).toBe('not-a-date');
    const value = formatOperatorExpiry('2026-09-20T12:00:00Z', 'en-US');
    expect(value).toContain('2026');
  });
});
