// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { openReplayJSONStream,request } from '../../api/http';
import {
  getRunRobots,
  openRobotEventStream,
  robotEventStreamPath,
} from './robotPublic';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;

vi.mock('../../api/http', async (importOriginal) => ({
  ...await importOriginal(),
  request: vi.fn(() => Promise.resolve({})),
  openReplayJSONStream: vi.fn(() => ({ close: vi.fn() })),
}));

const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };
const { resolve } = require('path') as { resolve: (...paths: string[]) => string };

type RobotProjectionContractFixture = {
  robots: Array<{
    channels: Record<string,{ sourceTime?: { nanoseconds: unknown;clockDomain: unknown } }>;
  }>;
};

describe('Robot transport contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(request).mockResolvedValue(snapshot());
  });

  it('uses target-scoped run projection and event paths', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ ...snapshot(),targetId: 'agent/a',runId: 'run/one' });
    await getRunRobots('agent/a', 'run/one');

    expect(request).toHaveBeenCalledWith('/execution-targets/agent%2Fa/orchestration-runs/run%2Fone/robots');
    expect(robotEventStreamPath('agent/a', 'run/one')).toBe('/execution-targets/agent%2Fa/orchestration-runs/run%2Fone/robots/events');
  });

  it('passes caller cancellation to the run projection request',async () => {
    const controller=new AbortController();

    await getRunRobots('local','run-1',controller.signal);

    expect(request).toHaveBeenCalledWith(
      '/execution-targets/local/orchestration-runs/run-1/robots',
      { signal:controller.signal },
    );
  });

  it('accepts only an explicit empty pending projection envelope', async () => {
    const pending = {
      targetId: 'local',runId: 'run-1',streamId: 'stream-pending',projectionRevision: 0,
      pending: true,experimentResourceId: '',experimentCommitId: '',robotSelectionDigest: '',
      robots: [],operations: [],updatedAt: '2026-07-14T00:00:00Z',
    };
    vi.mocked(request).mockResolvedValueOnce(pending);
    await expect(getRunRobots('local', 'run-1')).resolves.toEqual(pending);

    vi.mocked(request).mockResolvedValueOnce({ ...pending,robots: snapshot().robots });
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    vi.mocked(request).mockResolvedValueOnce({ ...snapshot(),pending: true });
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    const missingDiscriminator = snapshot() as Record<string,unknown>;
    delete missingDiscriminator.pending;
    vi.mocked(request).mockResolvedValueOnce(missingDiscriminator);
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
  });

  it('opens a replayable run stream and advances only contiguous revisions', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    const onState = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,onState,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];

    expect(options?.path()).toBe('/execution-targets/local/orchestration-runs/run-1/robots/events');
    expect(options?.lastEventId()).toBe('4');
    expect(options?.dynamicHeaders?.()).toEqual({ 'X-XGC-Robot-Stream-ID': 'stream-1' });
    const response = new Response(null, { headers: {
      'X-XGC-Robot-Stream-ID': 'stream-1',
      'X-XGC-Robot-Latest-Revision': '6',
    } });
    expect(options?.onOpen?.(response)).toBe(true);
    expect(onState).toHaveBeenLastCalledWith('replaying');
    const event = {
      revision: 5,targetId: 'local',runId: 'run-1',changes: [],resets: [],emittedAt: '2026-07-14T00:00:00Z',
    };
    options?.onValue(event, { id: '5',event: 'robot.patch',data: JSON.stringify(event) });

    expect(onEvent).toHaveBeenCalledWith(event);
    expect(onState).toHaveBeenLastCalledWith('replaying');
    expect(options?.lastEventId()).toBe('5');
    const replayed = { ...event,revision: 6 };
    options?.onValue(replayed, { id: '6',event: 'robot.patch',data: JSON.stringify(replayed) });
    expect(onEvent).toHaveBeenLastCalledWith(replayed);
    expect(onState).toHaveBeenLastCalledWith('connected');
    const gap = { ...event,revision: 7 };
    options?.onValue({ ...gap,revision: 8 }, { id: '8',event: 'robot.patch',data: JSON.stringify({ ...gap,revision: 8 }) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('accepts only an empty parent refresh event', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const refresh = {
      revision: 5,targetId: 'local',runId: 'run-1',refresh: true,
      changes: [],resets: [],emittedAt: '2026-07-14T00:00:00Z',
    };
    options?.onValue(refresh, { id: '5',event: 'robot.patch',data: JSON.stringify(refresh) });
    expect(onEvent).toHaveBeenCalledWith(refresh);

    const synthetic = {
      ...refresh,revision: 6,
      resets: [{ robotId: 'px4-01',connectionEpoch: 4,state: 'opening',revision: 1 }],
    };
    options?.onValue(synthetic as never, { id: '6',event: 'robot.patch',data: JSON.stringify(synthetic) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('does not commit a replay cursor before the patch consumer succeeds', () => {
    const rejected = new Error('store rejected patch');
    const onEvent = vi.fn(() => { throw rejected; });
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid: vi.fn(),
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const event = {
      revision: 5,targetId: 'local',runId: 'run-1',changes: [],resets: [],emittedAt: '2026-07-14T00:00:00Z',
    };

    expect(() => options?.onValue(event, {
      id: '5',event: 'robot.patch',data: JSON.stringify(event),
    })).toThrow(rejected);
    expect(options?.lastEventId()).toBe('4');
  });

  it('invalidates malformed or mismatched wire events instead of staying connected on stale state', () => {
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent: vi.fn(),onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const malformed = {
      revision: 5,targetId: 'local',runId: 'run-1',changes: null,emittedAt: '2026-07-14T00:00:00Z',
    };
    options?.onValue(malformed as never, {
      id: '5',event: 'robot.patch',data: JSON.stringify(malformed),
    });

    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(options?.lastEventId()).toBe('4');
  });

  it('accepts the authoritative connection snapshot and rejects legacy or incomplete fields', async () => {
    await expect(getRunRobots('local', 'run-1')).resolves.toMatchObject({
      robots: [{
        profileId: 'fixture.aerial.v1',
        connectionEpoch: 3,connectionState: 'live',connectionRevision: 2,
        onlineUntil: '2026-07-14T00:00:10Z',operationalReadyUntil: '2026-07-14T00:00:10Z',
      }],
    });
    vi.mocked(request).mockResolvedValueOnce({ ...snapshot(),operations: [{ id: 'malformed' }] });
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');

    const legacyBindingRevision = snapshot();
    const robot = legacyBindingRevision.robots[0]! as Record<string,unknown>;
    robot.bindingRevision = robot.connectionRevision;
    delete robot.connectionRevision;
    vi.mocked(request).mockResolvedValueOnce(legacyBindingRevision);
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
  });

  it('delivers the channels that decoded instead of withholding the whole fleet', async () => {
    const partial = snapshot();
    partial.robots.push({
      ...structuredClone(partial.robots[0]!),
      id: 'px4-02',name: 'PX4 2',namespace: '/uav2',
    });
    delete (partial.robots[0]!.channels['state.flight'] as { staleAt?: string }).staleAt;
    vi.mocked(request).mockResolvedValueOnce(partial);

    const projection = await getRunRobots('local', 'run-1');
    expect(projection.robots.map((robot) => robot.id)).toEqual(['px4-01','px4-02']);
    expect(projection.robots[0]!.channels).toEqual({});
    // The sibling robot keeps its own reference: only the pruned robot is rebuilt.
    expect(projection.robots[1]).toBe(partial.robots[1]);
    expect(Object.keys(projection.robots[1]!.channels)).toEqual(['state.flight']);

    const misfiled = snapshot();
    Object.assign(misfiled.robots[0]!.channels, { 'state.pose': misfiled.robots[0]!.channels['state.flight'] });
    vi.mocked(request).mockResolvedValueOnce(misfiled);
    await expect(getRunRobots('local', 'run-1')).resolves.toMatchObject({
      robots: [{ channels: { 'state.flight': { messageId: 3001 } } }],
    });
  });

  it('requires an explicit canonical ASCII Robot Profile ID up to 128 characters', async () => {
    const maximum = snapshot();
    maximum.robots[0]!.profileId = `${'a'.repeat(125)}.v1`;
    vi.mocked(request).mockResolvedValueOnce(maximum);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(maximum);

    const invalidProfileIDs: Array<string | undefined> = [
      undefined,
      '',
      'px4_multirotor',
      'Fixture.aerial.v1',
      '机器人.aerial.v1',
      `${'a'.repeat(126)}.v1`,
    ];
    for (const profileId of invalidProfileIDs) {
      const malformed = snapshot();
      if (profileId === undefined) delete (malformed.robots[0] as Partial<{ profileId: string }>).profileId;
      else malformed.robots[0]!.profileId = profileId;
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1'), String(profileId)).rejects.toThrow('invalid run robot projection');
    }
  });

  it('requires unique canonical Profile operation contracts with strict object parameter schemas', async () => {
    const custom = snapshot();
    (custom.robots[0]!.operationContracts as Array<{ id: string;parameterSchema: Record<string,unknown> }>).push({
      id: 'calibrate.gyro-v2',
      parameterSchema: {
        type: 'object',additionalProperties: false,required: ['samples'],
        properties: { samples: { type: 'integer',minimum: 1 } },
      },
    });
    (custom.operations as unknown[]).push(operationProjection('calibrate.gyro-v2', { samples: 50 }));
    vi.mocked(request).mockResolvedValueOnce(custom);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(custom);

    const maximum = snapshot();
    maximum.robots[0]!.operationContracts[0]!.id = 'a'.repeat(128);
    vi.mocked(request).mockResolvedValueOnce(maximum);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(maximum);

    const tooLong = snapshot();
    tooLong.robots[0]!.operationContracts[0]!.id = 'a'.repeat(129);
    vi.mocked(request).mockResolvedValueOnce(tooLong);
    await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');

    const mutations: Array<(robot: Record<string,unknown>) => void> = [
      (robot) => { delete robot.operationContracts; },
      (robot) => {
        const contracts = robot.operationContracts as Array<Record<string,unknown>>;
        contracts.push(structuredClone(contracts[0]!));
      },
      (robot) => {
        const contracts = robot.operationContracts as Array<Record<string,unknown>>;
        contracts[0]!.id = 'Arm';
      },
      (robot) => {
        const contracts = robot.operationContracts as Array<Record<string,unknown>>;
        contracts[0]!.unexpected = 'legacy-field';
      },
      (robot) => {
        const contracts = robot.operationContracts as Array<{ parameterSchema: Record<string,unknown> }>;
        contracts[0]!.parameterSchema.additionalProperties = true;
      },
      (robot) => {
        const contracts = robot.operationContracts as Array<{ parameterSchema: Record<string,unknown> }>;
        contracts[0]!.parameterSchema.required = ['missing'];
      },
    ];
    for (const mutate of mutations) {
      const malformed = snapshot();
      mutate(malformed.robots[0]! as unknown as Record<string,unknown>);
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }
  });

  it('accepts the same Robot projection fixture emitted by Go and validated by OpenAPI', async () => {
    const fixtureText = readFileSync(resolve(
      process.cwd(),
      '../contracts/fixtures/robot-runtime/run-robot-projection.json',
    ), 'utf8');
    const fixture: unknown = JSON.parse(fixtureText);
    vi.mocked(request).mockResolvedValueOnce(fixture);

    await expect(getRunRobots('local', 'run-contract')).resolves.toMatchObject({
      targetId: 'local',runId: 'run-contract',projectionRevision: 8,pending: false,
      robots: [{
        id: 'px4-01',profileId: 'px4.multirotor.ros1.v9',connectionEpoch: 3,
        operationContracts: [{ id: 'arm' },{ id: 'reboot-autopilot' },{ id: 'set-flight-mode' }],
        channels: { 'state.flight': { sourceTime: { nanoseconds: '9223372036854775807',clockDomain: 1 } } },
      },{ id: 'scout-01',profileId: 'scout-mini.ros1.v10',operationContracts: [],connectionState: 'inactive' },
      { id: 'mecanum-01',profileId: 'mecanum-ugv.ros1.v7',operationContracts: [],connectionState: 'inactive' }],
      operations: [{
        id: 'operation-uncertain',phase: 'uncertain',attempt: 2,maxAttempts: 3,failureClass: 'uncertain',
      }],
    });

    const mutations: Array<[string,(robot: Record<string,unknown>) => void]> = [
      ['missing required field', (robot) => { delete robot.connectionEpoch; }],
      ['wrong integer type', (robot) => { robot.connectionRevision = '2'; }],
      ['unknown enum', (robot) => { robot.connectionState = 'connected'; }],
      ['renamed field', (robot) => {
        robot.bindingRevision = robot.connectionRevision;
        delete robot.connectionRevision;
      }],
    ];
    for (const [name, mutate] of mutations) {
      const candidate = JSON.parse(fixtureText) as { robots: Record<string,unknown>[] };
      mutate(candidate.robots[0]!);
      vi.mocked(request).mockResolvedValueOnce(candidate);
      await expect(getRunRobots('local', 'run-contract'), name).rejects.toThrow('invalid run robot projection');
    }

    const minimum = JSON.parse(fixtureText) as RobotProjectionContractFixture;
    minimum.robots[0]!.channels['state.flight']!.sourceTime!.nanoseconds = '-9223372036854775808';
    vi.mocked(request).mockResolvedValueOnce(minimum);
    await expect(getRunRobots('local', 'run-contract')).resolves.toBe(minimum);

    // A non-canonical source clock is a channel-scoped defect: the channel is
    // dropped, the robot and its siblings still project.
    for (const nanoseconds of [
      Number('9223372036854775807'),
      '9223372036854775808',
      '-9223372036854775809',
      '01',
      '-0',
      '+1',
      '1.0',
    ]) {
      const candidate = JSON.parse(fixtureText) as RobotProjectionContractFixture;
      candidate.robots[0]!.channels['state.flight']!.sourceTime!.nanoseconds = nanoseconds;
      vi.mocked(request).mockResolvedValueOnce(candidate);
      const projection = await getRunRobots('local', 'run-contract');
      expect(projection.robots[0]!.channels, String(nanoseconds)).toEqual({});
      expect(projection.robots.map((robot) => robot.id), String(nanoseconds)).toEqual([
        'px4-01','scout-01','mecanum-01',
      ]);
    }
  });

  it('validates bounded Robot operation attempts and retry classifications', async () => {
    const retrying = snapshot();
    (retrying.operations as unknown[]).push({
      ...operationProjection('arm', { armed: true }),
      phase: 'retry_pending',attempt: 2,maxAttempts: 3,failureClass: 'resource-exhausted',
    });
    vi.mocked(request).mockResolvedValueOnce(retrying);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(retrying);

    const mutations: Array<(operation: Record<string,unknown>) => void> = [
      (operation) => { delete operation.attempt; },
      (operation) => { operation.attempt = 0; },
      (operation) => { operation.maxAttempts = 33; },
      (operation) => { operation.attempt = 3;operation.maxAttempts = 2; },
      (operation) => { delete operation.failureClass; },
      (operation) => { operation.failureClass = 'permanent'; },
      (operation) => { operation.failureClass = 'resource_exhausted'; },
    ];
    for (const mutate of mutations) {
      const malformed = snapshot();
      const operation = {
        ...operationProjection('arm', { armed: true }),
        phase: 'retry_pending',attempt: 2,maxAttempts: 3,failureClass: 'transient',
      } as Record<string,unknown>;
      mutate(operation);
      (malformed.operations as unknown[]).push(operation);
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }
  });

  it('requires failure classes exactly on failed Robot operation phases', async () => {
    for (const phase of ['accepted','started','succeeded']) {
      const malformed = snapshot();
      (malformed.operations as unknown[]).push({
        ...operationProjection('arm', { armed: true }),phase,failureClass: 'permanent',
      });
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1'), phase).rejects.toThrow('invalid run robot projection');
    }

    for (const phase of ['rejected','failed','expired','uncertain']) {
      const malformed = snapshot();
      (malformed.operations as unknown[]).push({
        ...operationProjection('arm', { armed: true }),phase,
      });
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1'), phase).rejects.toThrow('invalid run robot projection');
    }

    for (const [phase,failureClass] of [
      ['rejected','permanent'],
      ['failed','deadline'],
      ['expired','transient'],
      ['uncertain','rejected'],
    ]) {
      const malformed = snapshot();
      (malformed.operations as unknown[]).push({
        ...operationProjection('arm', { armed: true }),phase,failureClass,
      });
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1'), `${phase}/${failureClass}`).rejects.toThrow('invalid run robot projection');
    }

    const terminal = snapshot();
    (terminal.operations as unknown[]).push({
      ...operationProjection('arm', { armed: true }),phase: 'failed',failureClass: 'permanent',
    });
    vi.mocked(request).mockResolvedValueOnce(terminal);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(terminal);
  });

  it('invalidates legacy numeric source time before committing an SSE cursor', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const exact = { ...patchEvent(),changes: [{
      ...patchEvent().changes[0],sourceTime: { nanoseconds: '9223372036854775807',clockDomain: 1 },
    }] };
    options?.onValue(exact, { id: '5',event: 'robot.patch',data: JSON.stringify(exact) });
    expect(onEvent).toHaveBeenCalledWith(exact);

    const legacy = { ...patchEvent(6),changes: [{
      ...patchEvent(6).changes[0],sourceTime: { nanoseconds: Number('9223372036854775807'),clockDomain: 1 },
    }] };
    options?.onValue(legacy as never, { id: '6',event: 'robot.patch',data: JSON.stringify(legacy) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(options?.lastEventId()).toBe('5');
  });

  it('accepts an empty Robot selection for an ordinary non-robot Experiment run', async () => {
    vi.mocked(request).mockResolvedValueOnce({ ...snapshot(),robots: [] });
    await expect(getRunRobots('local', 'run-1')).resolves.toMatchObject({ robots: [] });
  });

  it('rejects malformed or ambiguous robot-kind projections and drops null channels', async () => {
    const invalidPX4 = snapshot();
    Object.assign(invalidPX4.robots[0]!, {
      px4: { mavSystemId: 0,managementIp: '192.0.2.1',mocapRigidBodyName: 'px4_01' },
    });
    const ambiguous = snapshot();
    Object.assign(ambiguous.robots[0]!, {
      px4: { mavSystemId: 1,managementIp: '192.0.2.1',mocapRigidBodyName: 'px4_01' },
      scout: { managementAddress: '192.0.2.2' },
    });
    for (const malformed of [invalidPX4,ambiguous]) {
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }

    const nullChannel = snapshot();
    Object.assign(nullChannel.robots[0]!.channels, { 'state.flight': null });
    vi.mocked(request).mockResolvedValueOnce(nullChannel);
    await expect(getRunRobots('local', 'run-1')).resolves.toMatchObject({ robots: [{ channels: {} }] });
  });

  it('accepts only the exact Mecanum runtime arm', async () => {
    const valid = snapshot();
    const validMecanum = {
      managementAddress: '192.0.2.30',connector: 'swarm_ros_bridge',
      telemetryRemotePort: 3001,controlLocalPort: 3301,mocapRigidBodyName: 'ugv1',
      positioningFrameNumber: 5,positioningComparisonThresholdM: 1e-10,
    };
    Object.assign(valid.robots[0]!, {
      id: 'mecanum-01',name: 'Mecanum UGV 01',kind: 'mecanum_ugv',profileId: 'mecanum-ugv.ros1.v7',namespace: '/ugv1',
      adapterDefinitionId: 'mecanum-ugv-ros1-adapter',mecanum: validMecanum,
    });
    vi.mocked(request).mockResolvedValueOnce(valid);
    await expect(getRunRobots('local', 'run-1')).resolves.toBe(valid);

    const invalidArms = [
      { ...validMecanum,connector: 'legacy_bridge' },
      { ...validMecanum,controlLocalPort: 0 },
      { ...validMecanum,mocapRigidBodyName: '/ugv1' },
      { ...validMecanum,unexpected: 'legacy-field' },
    ];
    for (const mecanum of invalidArms) {
      const malformed = structuredClone(valid);
      Object.assign(malformed.robots[0]!, { mecanum });
      vi.mocked(request).mockResolvedValueOnce(malformed);
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }
  });

  it('rejects contradictory snapshot authority states instead of guessing which field wins', async () => {
    const contradictions = [
      () => {
        const value = snapshot();
        Object.assign(value.robots[0]!, {
          online: false,operationalReady: false,status: 'limited',onlineUntil: undefined,operationalReadyUntil: undefined,
        });
        return value;
      },
      () => {
        const value = snapshot();
        Object.assign(value.robots[0]!, { operationalReady: false,status: 'online',operationalReadyUntil: undefined });
        return value;
      },
      () => {
        const value = snapshot();
        value.robots[0]!.operationalReadyUntil = '2026-07-14T00:00:11Z';
        return value;
      },
    ];
    for (const contradiction of contradictions) {
      vi.mocked(request).mockResolvedValueOnce(contradiction());
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }
  });

  it('rejects non-live connections that expose online authority, deadlines, or channels', async () => {
    const contradictions = [
      () => {
        const value = snapshot();
        Object.assign(value.robots[0]!, { connectionState: 'opening',connectionRevision: 3 });
        return value;
      },
      () => {
        const value = snapshot();
        Object.assign(value.robots[0]!, {
          connectionState: 'closed',connectionRevision: 3,online: false,operationalReady: false,status: 'offline',
          onlineUntil: undefined,operationalReadyUntil: undefined,
        });
        return value;
      },
    ];
    for (const contradiction of contradictions) {
      vi.mocked(request).mockResolvedValueOnce(contradiction());
      await expect(getRunRobots('local', 'run-1')).rejects.toThrow('invalid run robot projection');
    }
  });

  it('validates authoritative channel status and deadlines before delivering an SSE patch', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const event = patchEvent();
    options?.onValue(event, { id: '5',event: 'robot.patch',data: JSON.stringify(event) });
    expect(onEvent).toHaveBeenCalledWith(event);

    const malformed = { ...patchEvent(6),changes: [{ ...patchEvent(6).changes[0],onlineUntil: 42 }] };
    options?.onValue(malformed as never, { id: '6',event: 'robot.patch',data: JSON.stringify(malformed) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('invalidates a malformed operation patch before it can pollute the runtime store', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const event = {
      revision: 5,targetId: 'local',runId: 'run-1',changes: [],resets: [],
      operations: [{ id: 'malformed',revision: 'newest' }],emittedAt: '2026-07-14T00:00:00Z',
    };

    options?.onValue(event as never, { id: '5',event: 'robot.patch',data: JSON.stringify(event) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
    expect(options?.lastEventId()).toBe('4');
  });

  it('validates connection resets before delivering an SSE patch', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const event = {
      revision: 5,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 4,state: 'opening',revision: 1 }],
      emittedAt: '2026-07-14T00:00:00Z',
    };
    options?.onValue(event as never, { id: '5',event: 'robot.patch',data: JSON.stringify(event) });
    expect(onEvent).toHaveBeenCalledWith(event);

    const malformed = { ...event,revision: 6,resets: [{ ...event.resets[0],connectionEpoch: 0 }] };
    options?.onValue(malformed as never, { id: '6',event: 'robot.patch',data: JSON.stringify(malformed) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('invalidates a contradictory event authority state', () => {
    const onEvent = vi.fn();
    const onCursorInvalid = vi.fn();
    openRobotEventStream({
      targetId: 'local',runId: 'run-1',streamId: 'stream-1',afterRevision: 4,
      onEvent,onCursorInvalid,
    });
    const options = vi.mocked(openReplayJSONStream).mock.calls[0]?.[0];
    const event = patchEvent();
    event.changes[0]!.status = 'limited';

    options?.onValue(event, { id: '5',event: 'robot.patch',data: JSON.stringify(event) });
    expect(onCursorInvalid).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
    expect(options?.lastEventId()).toBe('4');
  });
});

function snapshot() {
  return {
    targetId: 'local',runId: 'run-1',streamId: 'stream-1',projectionRevision: 4,pending: false,
    experimentResourceId: 'experiment-1',experimentCommitId: 'experiment-commit-1',
    robotSelectionDigest: 'c'.repeat(64),operations: [],updatedAt: '2026-07-14T00:00:00Z',
    robots: [{
      id: 'px4-01',name: 'PX4 1',kind: 'px4_multirotor',namespace: '/uav1',
      robotAssetId: 'px4-asset-1',robotAssetCommitId: 'px4-commit-1',robotAssetDigest: 'b'.repeat(64),
      hybridSource: 'physical' as const,
      profileId: 'fixture.aerial.v1',
      operationContracts: profileOperationContracts(),
      adapterDefinitionId: 'px4-multirotor-ros1-adapter',
      connectionEpoch: 3,connectionState: 'live' as const,connectionRevision: 2,
      online: true,operationalReady: true,status: 'online',
      onlineUntil: '2026-07-14T00:00:10Z',operationalReadyUntil: '2026-07-14T00:00:10Z',
      channels: { 'state.flight': {
        channelId: 'state.flight',sequence: 1,messageId: 3001,observedAt: '2026-07-14T00:00:00Z',
        sourceAgeMs: 0,staleAt: '2026-07-14T00:00:02Z',stale: false,value: { connected: true },
      } },
    }],
  };
}

function profileOperationContracts() {
  return [{
    id: 'arm',parameterSchema: {
      type: 'object',additionalProperties: false,required: ['armed'],properties: { armed: { type: 'boolean' } },
    },
  },{
    id: 'set-flight-mode',parameterSchema: {
      type: 'object',additionalProperties: false,required: ['mode'],
      properties: { mode: { type: 'string',enum: ['OFFBOARD','POSCTL','ALTCTL','STABILIZED'] } },
    },
  },{
    id: 'reboot-autopilot',parameterSchema: {
      type: 'object',additionalProperties: false,properties: {},
    },
  }];
}

function operationProjection(operation: string, parameters: Record<string,unknown>) {
  return {
    id: 'operation-custom',targetId: 'local',runId: 'run-1',experimentId: 'experiment-1',robotId: 'px4-01',
    operation,parameters,phase: 'accepted',attempt: 1,maxAttempts: 1,connectionEpoch: 3,revision: 1,
    createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
  };
}

function patchEvent(revision = 5) {
  return {
    revision,targetId: 'local',runId: 'run-1',emittedAt: '2026-07-14T00:00:00Z',resets: [],
    changes: [{
      robotId: 'px4-01',connectionEpoch: 3,channelId: 'state.flight',sequence: 2,messageId: 3001,
      observedAt: '2026-07-14T00:00:00Z',sourceAgeMs: 0,staleAt: '2026-07-14T00:00:02Z',
      stale: false,value: { connected: true },online: true,operationalReady: true,status: 'online',
      onlineUntil: '2026-07-14T00:00:10Z',operationalReadyUntil: '2026-07-14T00:00:10Z',
    }],
  };
}
