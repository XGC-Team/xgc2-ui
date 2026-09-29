import { beforeEach,describe,expect,it,vi } from 'vitest';
import { readAutomationTargetFileFingerprint } from './automationTargetService';
const mocks = vi.hoisted(() => ({ request:vi.fn() }));
vi.mock('../../api/http',() => ({ request:mocks.request,withTerminalAuth:(options:object={}) => ({ ...options,auth:'terminal' }) }));

describe('readAutomationTargetFileFingerprint',() => {
  beforeEach(() => { mocks.request.mockReset(); });
  it('uses the owner raw-byte hash on local and remote Core without browser hashing',async () => {
    mocks.request.mockResolvedValue({ content:'decoded',sha256:'f'.repeat(64) });
    const signal = new AbortController().signal;
    expect(await readAutomationTargetFileFingerprint('local','/cal/saved.yaml',signal)).toBe('f'.repeat(64));
    expect(mocks.request).toHaveBeenLastCalledWith('/host/files/content?path=%2Fcal%2Fsaved.yaml',{ signal },{ auth:'terminal' });
    await readAutomationTargetFileFingerprint('core:other','/cal/saved.yaml');
    expect(mocks.request).toHaveBeenLastCalledWith('/host/files/content?path=%2Fcal%2Fsaved.yaml',{ signal:undefined },{ auth:'terminal',targetCoreId:'other' });
  });
  it('does not silently hash decoded text when an owner cannot provide a fingerprint',async () => {
    mocks.request.mockResolvedValue({ content:'decoded' });
    await expect(readAutomationTargetFileFingerprint('local','/cal/saved.yaml')).rejects.toThrow('verified');
    mocks.request.mockClear();
    await expect(readAutomationTargetFileFingerprint('agent-one','/cal/saved.yaml')).rejects.toThrow('unavailable');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
