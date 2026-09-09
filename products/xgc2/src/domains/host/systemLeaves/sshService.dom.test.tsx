// @vitest-environment jsdom

import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { HostSSHInfo } from '../hostModel';
import { HostSSHServiceSystemLeaf } from './sshService';

const hostApi = vi.hoisted(() => ({
  getHostSSH: vi.fn(),
  getHostSSHConfigFile: vi.fn(),
  operateHostSSH: vi.fn(),
  saveHostSSHConfigFile: vi.fn(),
  updateHostSSHSetting: vi.fn(),
}));

vi.mock('../hostSSHActions',() => hostApi);

const ssh: HostSSHInfo = {
  exists: true,
  active: true,
  autoStart: true,
  serviceName: 'sshd',
  configPath: '/etc/ssh/sshd_config',
  port: '22',
  listenAddress: '0.0.0.0',
  permitRootLogin: 'prohibit-password',
  passwordAuthentication: 'yes',
  pubkeyAuthentication: 'yes',
  useDNS: 'no',
  raw: {},
};

describe('HostSSHServiceSystemLeaf', () => {
  beforeEach(() => {
    hostApi.getHostSSH.mockResolvedValue(ssh);
    hostApi.updateHostSSHSetting.mockImplementation(async (key: string,value: string) => ({
      ...ssh,
      ...(key === 'PasswordAuthentication' ? { passwordAuthentication: value } : {}),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('preserves the SSH settings selectors and typed actions', async () => {
    const { container } = render(
      <HostSSHServiceSystemLeaf
        executionTargetId="local"
        isRemote={false}
        requestsAllowed
        actionsEnabled
      />,
    );

    expect(await screen.findByRole('region',{ name: 'Base configuration' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-ssh-section"]')).toHaveAttribute('data-chrome', 'flat');
    const password = screen.getByRole('switch',{ name: 'Password authentication' });
    fireEvent.click(password);
    await waitFor(() => expect(hostApi.updateHostSSHSetting).toHaveBeenCalledWith(
      'PasswordAuthentication',
      'no',
      {},
    ));
  });
});
