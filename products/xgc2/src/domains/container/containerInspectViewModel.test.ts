import { describe,expect,it } from 'vitest';
import { summarizeContainerInspect } from './containerInspectViewModel';

describe('summarizeContainerInspect', () => {
  it('extracts operator-facing facts from docker inspect JSON', () => {
    const summary = summarizeContainerInspect(JSON.stringify({
      Id: 'abcdef0123456789',
      Name: '/demo-app',
      Created: '2026-07-17T07:45:54.000Z',
      State: {
        Status: 'exited',
        Running: false,
        ExitCode: 0,
        StartedAt: '2026-07-17T07:40:00.000Z',
        FinishedAt: '2026-07-17T07:45:00.000Z',
        OOMKilled: false,
        Error: '',
      },
      Config: {
        Image: 'ubuntu:20.04',
        Cmd: ['sleep','infinity'],
        Env: ['PATH=/usr/bin','TOKEN=super-secret','MODE=prod'],
        WorkingDir: '/app',
        User: '',
      },
      HostConfig: {
        NetworkMode: 'bridge',
        Privileged: false,
        RestartPolicy: { Name: 'unless-stopped',MaximumRetryCount: 0 },
        PortBindings: {
          '80/tcp': [{ HostIp: '0.0.0.0',HostPort: '8080' }],
        },
        Binds: ['/tmp/data:/data:rw'],
      },
      NetworkSettings: {
        Networks: {
          bridge: { IPAddress: '172.17.0.2' },
        },
      },
      Mounts: [
        { Source: '/tmp/data',Destination: '/data',Mode: 'rw',RW: true },
      ],
    }));

    expect(summary.structured).toBe(true);
    const byLabel = Object.fromEntries(summary.facts.map((fact) => [fact.label,fact.value]));
    expect(byLabel.Name).toBe('demo-app');
    expect(byLabel.ID).toBe('abcdef012345');
    expect(byLabel.Status).toBe('exited');
    expect(byLabel['Exit code']).toBe('0');
    expect(byLabel.Image).toBe('ubuntu:20.04');
    expect(byLabel.Command).toBe('sleep infinity');
    expect(byLabel.Ports).toContain('8080 → 80/tcp');
    expect(byLabel.Mounts).toContain('/tmp/data → /data');
    expect(byLabel.Networks).toContain('bridge 172.17.0.2');
    expect(byLabel.Env).toContain('TOKEN=••••');
    expect(byLabel.Env).toContain('MODE=prod');
    expect(byLabel['Restart policy']).toBe('unless-stopped');
  });

  it('falls back when content is not JSON', () => {
    expect(summarizeContainerInspect('not json').structured).toBe(false);
    expect(summarizeContainerInspect('Loading inspect...').facts).toEqual([]);
  });
});
