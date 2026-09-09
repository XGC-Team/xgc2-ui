import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,withTerminalAuth } from '../../api/http';
import { deleteTerminalHost, placeUserScript } from './terminalService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({})),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('terminalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes host ids and uses terminal auth', async () => {
    await deleteTerminalHost('host/a b', { targetCoreId: 'core-1' });

    expect(withTerminalAuth).toHaveBeenCalledWith({ targetCoreId: 'core-1' });
    expect(request).toHaveBeenCalledWith(
      '/terminal/hosts/host%2Fa%20b',
      { method: 'DELETE' },
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
  });

  it('places a public file through the session API without sending the body', async () => {
    await placeUserScript({
      sessionId: 'ssh-1',
      hostId: 'robot-asset:fs150-1',
      path: '$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py',
      managedHostId: '',
    }, { targetCoreId: 'core-1' });

    expect(request).toHaveBeenCalledWith(
      '/terminal/user-scripts',
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'ssh-1',
          hostId: 'robot-asset:fs150-1',
          path: '$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py',
          managedHostId: '',
        }),
      },
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
  });
});
