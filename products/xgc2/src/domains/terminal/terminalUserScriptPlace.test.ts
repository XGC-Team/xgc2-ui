import { describe, expect, it } from 'vitest';
import { userScriptPlaceRequest } from './terminalUserScriptPlace';

describe('userScriptPlaceRequest', () => {
  const session = { id: 'ssh-fs150-1', hostId: 'robot-asset:fs150-1' };

  it('returns null when there is no session or no public file path', () => {
    expect(userScriptPlaceRequest('echo ready', session)).toBeNull();
    expect(userScriptPlaceRequest(
      'python3 "$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py"',
      undefined,
    )).toBeNull();
  });

  it('keeps Core and Agent dispatch fields on one request', () => {
    const command = 'python3 "$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py" --endpoint 127.0.0.1:14561';
    expect(userScriptPlaceRequest(command, session)).toEqual({
      sessionId: 'ssh-fs150-1',
      hostId: 'robot-asset:fs150-1',
      path: '$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py',
      managedHostId: '',
    });
    expect(userScriptPlaceRequest(command, {
      id: 'shell-1',
      hostId: 'default-direct-shell',
    }, 'agent-lab')).toEqual({
      sessionId: 'shell-1',
      hostId: 'default-direct-shell',
      path: '$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py',
      managedHostId: 'agent-lab',
    });
    expect(userScriptPlaceRequest(command, session, 'local')?.managedHostId).toBe('');
  });
});
