import { describe, expect, it,vi } from 'vitest';
import {
  peekTerminalRobotLogin,
  requestTerminalRobotLogin,
  subscribeTerminalRobotLogin,
  takeTerminalRobotLogin,
} from './terminalRobotLoginIntent';

describe('terminalRobotLoginIntent', () => {
  it('publishes an exact target and consumes the matching snapshot once', () => {
    const listener=vi.fn();const unsubscribe=subscribeTerminalRobotLogin(listener);
    requestTerminalRobotLogin(' asset-1 ',{ targetCoreId:'edge-a' });
    const intent=peekTerminalRobotLogin()!;
    expect(intent).toEqual({ robotAssetId:'asset-1',scope:'edge-a__local' });
    expect(listener).toHaveBeenCalledOnce();
    expect(takeTerminalRobotLogin(intent)).toBe(intent);
    expect(peekTerminalRobotLogin()).toBeUndefined();
    expect(takeTerminalRobotLogin(intent)).toBeUndefined();
    unsubscribe();
  });
  it('does not consume a newer operator request from a stale callback',()=>{
    requestTerminalRobotLogin('asset-1',{});const old=peekTerminalRobotLogin()!;
    requestTerminalRobotLogin('asset-2',{ targetCoreId:'edge-b' });
    expect(takeTerminalRobotLogin(old)).toBeUndefined();
    expect(peekTerminalRobotLogin()?.robotAssetId).toBe('asset-2');
    takeTerminalRobotLogin(peekTerminalRobotLogin()!);
  });
});
