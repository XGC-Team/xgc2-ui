import { describe,expect,it } from 'vitest';
import type { DockerComposeProject,DockerContainerInfo,DockerNetworkInfo } from './containerModel';
import {
  composeProjectIsRunning,
  containerDisplayName,
  containerStatusToken,
  countContainerStates,
  createNetworkDraft,
  createVolumeDraft,
  filterComposeProjects,
  filterContainers,
  filterDockerNetworks,
  filterDockerVolumes,
  networkCreateRequestFromDraft,
  paginateItems,
  parseContainerListField,
  parseNetworkKVLines,
  volumeDraftToCreateBody,
} from './containerViewModel';

const containers: DockerContainerInfo[] = [
  {
    id: 'running-id',
    name: 'api',
    names: '/api',
    image: 'xgc/api:latest',
    command: '',
    created: '',
    status: 'Up 2 minutes',
    state: 'running',
    ports: '',
    labels: [],
  },
  {
    id: 'exited-container-id',
    name: '',
    names: '',
    image: 'redis:7',
    command: '',
    created: '',
    status: 'Exited (0)',
    state: 'exited',
    ports: '',
    labels: [],
  },
];

describe('containerViewModel', () => {
  it('filters by state and normalized searchable text', () => {
    expect(filterContainers(containers,'running',' API ')).toEqual([containers[0]]);
    expect(filterContainers(containers,'exited','redis')).toEqual([containers[1]]);
    expect(filterContainers(containers,'running','redis')).toEqual([]);
  });

  it('filters compose projects by name, status, and config path', () => {
    const projects: DockerComposeProject[] = [
      { name: 'easytier',status: 'running(1)',configFiles: '/opt/1panel/apps/easytier/docker-compose.yml' },
      { name: 'n8n',status: 'exited(1)',configFiles: '/opt/apps/n8n/docker-compose.yml' },
    ];
    expect(filterComposeProjects(projects, ' EASY ')).toEqual([projects[0]]);
    expect(filterComposeProjects(projects, 'n8n')).toEqual([projects[1]]);
    expect(filterComposeProjects(projects, 'exited')).toEqual([projects[1]]);
    expect(filterComposeProjects(projects, 'missing')).toEqual([]);
  });

  it('counts the full collection and each runtime state', () => {
    expect(countContainerStates(containers)).toEqual({ all: 2,running: 1,exited: 1 });
  });

  it('detects compose running status including count suffixes', () => {
    expect(composeProjectIsRunning('running(1)')).toBe(true);
    expect(composeProjectIsRunning('running')).toBe(true);
    expect(composeProjectIsRunning('exited(1)')).toBe(false);
    expect(composeProjectIsRunning('')).toBe(false);
    expect(containerStatusToken('running(1)')).toBe('running');
    expect(containerStatusToken('exited(2)')).toBe('exited');
  });

  it('normalizes comma and newline separated create fields', () => {
    expect(parseContainerListField('8080:80, 9000:90\n\nKEY=value ')).toEqual([
      '8080:80',
      '9000:90',
      'KEY=value',
    ]);
  });

  it('uses the stable short id when Docker does not return a name', () => {
    expect(containerDisplayName(containers[0])).toBe('/api');
    expect(containerDisplayName(containers[1])).toBe('exited-conta');
  });

  it('filters networks by name, subnet, gateway, and labels', () => {
    const networks: DockerNetworkInfo[] = [
      {
        id: 'a', name: 'mission-net', driver: 'bridge', scope: 'local', ipv4: true, ipv6: false,
        internal: false, attachable: true, subnet: '172.28.0.0/16', gateway: '172.28.0.1', ipRange: '',
        subnetV6: '', gatewayV6: '', ipRangeV6: '', parent: '',
        labels: ['env=lab'], createdAt: '', isSystem: false, containers: 0,
      },
      {
        id: 'b', name: 'bridge', driver: 'bridge', scope: 'local', ipv4: true, ipv6: false,
        internal: false, attachable: false, subnet: '172.17.0.0/16', gateway: '172.17.0.1', ipRange: '',
        subnetV6: '', gatewayV6: '', ipRangeV6: '', parent: '',
        labels: [], createdAt: '', isSystem: true, containers: 2,
      },
    ];
    expect(filterDockerNetworks(networks, 'mission')).toEqual([networks[0]]);
    expect(filterDockerNetworks(networks, '172.17')).toEqual([networks[1]]);
    expect(filterDockerNetworks(networks, 'env=lab')).toEqual([networks[0]]);
  });

  it('filters volumes and builds create payload including NFS options', () => {
    expect(filterDockerVolumes([
      { name: 'data',driver: 'local',mountpoint: '/var/lib/docker/volumes/data/_data',scope: 'local',inUse: true },
      { name: 'cache',driver: 'local',mountpoint: '/var/lib/docker/volumes/cache/_data',scope: 'local',inUse: false },
    ], 'unused')).toEqual([
      { name: 'cache',driver: 'local',mountpoint: '/var/lib/docker/volumes/cache/_data',scope: 'local',inUse: false },
    ]);
    const draft = {
      ...createVolumeDraft(),
      name: ' nfs-vol ',
      nfsEnabled: true,
      nfsAddress: '10.0.0.5',
      nfsVersion: 'v4' as const,
      nfsMount: '/export/data',
      labelsText: 'env=lab\n',
      optionsText: 'custom=1\n',
    };
    expect(volumeDraftToCreateBody(draft)).toEqual({
      name: 'nfs-vol',
      driver: 'local',
      labels: ['env=lab'],
      options: [
        'custom=1',
        'type=nfs4',
        'o=addr=10.0.0.5,rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14',
        'device=:/export/data',
      ],
    });
  });

  it('builds network create payloads and paginates rows', () => {
    const draft = {
      ...createNetworkDraft(),
      name: ' mission-net ',
      subnet: '172.28.0.0/16',
      gateway: '172.28.0.1',
      auxAddressText: 'router=172.28.5.2\n',
      ipv6: true,
      subnetV6: '2001:db8:1::/64',
      optionsText: 'com.docker.network.bridge.enable_icc=true\n',
      labelsText: 'env=lab\nteam=xgc',
      parent: '',
      internal: true,
      attachable: true,
    };
    expect(parseNetworkKVLines('router=172.28.5.2')).toEqual([{ key: 'router', value: '172.28.5.2' }]);
    expect(networkCreateRequestFromDraft(draft)).toMatchObject({
      name: 'mission-net',
      driver: 'bridge',
      subnet: '172.28.0.0/16',
      gateway: '172.28.0.1',
      auxAddress: [{ key: 'router', value: '172.28.5.2' }],
      ipv6: true,
      subnetV6: '2001:db8:1::/64',
      options: ['com.docker.network.bridge.enable_icc=true'],
      labels: ['env=lab', 'team=xgc'],
      internal: true,
      attachable: true,
    });
    expect(paginateItems([1, 2, 3, 4, 5], 2, 2)).toEqual({
      items: [3, 4],
      total: 5,
      page: 2,
      pageSize: 2,
      pages: 3,
    });
  });
});
