import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getRunRobots,type RunRobot,type RunRobotProjection } from '../robot/robotPublic';
import { getExperimentAtCommit } from './experimentService';
import {
  computeExperimentSimulationInitialPoses,
  computeExperimentWorldOrigin,
  loadExperimentCoordinateSamples,
} from './experimentCoordinateAuthoring';
import {
  newExperimentSpec,
  type ExperimentDocument,
  type ExperimentRobotBinding,
} from './experimentModel';

vi.mock('../robot/robotPublic',() => ({ getRunRobots:vi.fn() }));
vi.mock('./experimentService',() => ({ getExperimentAtCommit:vi.fn() }));

const NOW = Date.parse('2026-09-06T00:00:00Z');
const initialBindings = [binding('one'),binding('two',true)];

describe('Experiment coordinate authoring',() => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    vi.mocked(getRunRobots).mockResolvedValue(projection());
    vi.mocked(getExperimentAtCommit).mockResolvedValue(frozenExperiment());
  });
  afterEach(() => vi.useRealTimers());

  it('reconstructs raw tracking coordinates from the immutable nonzero Session offset',async () => {
    const controller = new AbortController();
    const result = await load({ signal:controller.signal,expectedCommitId:'frozen-commit' });
    expect(getRunRobots).toHaveBeenCalledWith('local','robot-run',controller.signal);
    expect(getExperimentAtCommit).toHaveBeenCalledWith('experiment','frozen-commit',controller.signal,undefined);
    expect(result.frozenOffset).toEqual({ x:100,y:-20,z:5 });
    expect(result.capturedAt).toBe(NOW);
    expect(result.samples.map((sample) => sample.rawPosition)).toEqual([
      { x:2,y:4,z:1 },{ x:6,y:8,z:3 },
    ]);
    const origin = computeExperimentWorldOrigin(result.samples,['one','two']);
    expect(origin).toEqual({
      rawOrigin:{ x:4,y:6,z:2 },offset:{ x:-4,y:-6,z:-2 },sampleIds:['one','two'],
    });
    // Reopening after draft edits still reads the Run's old commit. The newly
    // authored origin must never become the offset used to undo this sample.
    const editedBindings = initialBindings.map((item) => ({
      ...item,initialPose:{ ...item.initialPose,x:999,y:-999 },
    }));
    const repeated = await load({ bindings:editedBindings });
    expect(computeExperimentWorldOrigin(repeated.samples,['one','two'])).toEqual(origin);
    expect(computeExperimentWorldOrigin(repeated.samples,['two','two']).rawOrigin).toEqual({ x:6,y:8,z:3 });
  });

  it('uses the frozen Session mode and runtime hybrid source instead of draft hybrid fields',async () => {
    const draft = initialBindings.map((item) => ({ ...item,hybridSource:'simulation' as const }));
    expect((await load({ bindings:draft,runMode:'physical' })).samples.every((sample) => sample.physical)).toBe(true);
    const mixed = projection();
    mixed.robots[1]!.hybridSource = 'simulation';
    vi.mocked(getRunRobots).mockResolvedValue(mixed);
    const hybrid = await load({ bindings:draft,runMode:'hybrid' });
    expect(hybrid.samples.map((sample) => sample.physical)).toEqual([true,false]);
    expect(() => computeExperimentWorldOrigin(hybrid.samples,['two'])).toThrow(/physical Robots/);
    for (const runMode of ['simulation','custom-mode']) {
      const result = await load({ runMode });
      expect(result.samples).toHaveLength(2);
      expect(result.samples.every((sample) => !sample.physical && !sample.rawPosition)).toBe(true);
      expect(() => computeExperimentWorldOrigin(result.samples,['one'])).toThrow(/physical Robots/);
    }
  });

  it('rejects projections for another Experiment or frozen commit',async () => {
    vi.mocked(getRunRobots).mockResolvedValueOnce({ ...projection(),experimentResourceId:'another' });
    await expect(load()).rejects.toThrow(/selected Experiment Session/);
    await expect(load({ expectedCommitId:'different-commit' })).rejects.toThrow(/selected Experiment Session/);
    vi.mocked(getRunRobots).mockResolvedValueOnce({ ...projection(),pending:true });
    await expect(load()).rejects.toThrow(/selected Experiment Session/);
    expect(getExperimentAtCommit).not.toHaveBeenCalled();
  });

  it('excludes offline, expired, stale, invalid, duplicate and mismatched samples',async () => {
    const cases:((robot:RunRobot) => void)[] = [
      (robot) => { robot.online = false; },
      (robot) => { robot.connectionState = 'closed'; },
      (robot) => { robot.onlineUntil = new Date(NOW).toISOString(); },
      (robot) => { robot.onlineUntil = undefined; },
      (robot) => { robot.channels['vrpn.position']!.stale = true; },
      (robot) => { robot.channels['vrpn.position']!.staleAt = new Date(NOW - 1).toISOString(); },
      (robot) => { robot.channels['vrpn.position']!.value.position = { x:NaN,y:1,z:2 }; },
      (robot) => { robot.channels['vrpn.position']!.value.orientation = { x:0,y:0,z:0,w:0 }; },
      (robot) => { robot.robotAssetId = 'another'; },
      (robot) => { robot.namespace = '/another'; },
      (robot) => { robot.channels = { 'state.pose':robot.channels['vrpn.position']! }; },
    ];
    for (const change of cases) {
      const current = projection();
      change(current.robots[0]!);
      vi.mocked(getRunRobots).mockResolvedValue(current);
      expect((await load()).samples.map((sample) => sample.bindingId)).toEqual(['two']);
    }
    const duplicate = projection();
    duplicate.robots.push(duplicate.robots[0]!);
    vi.mocked(getRunRobots).mockResolvedValue(duplicate);
    expect((await load()).samples.map((sample) => sample.bindingId)).toEqual(['two']);
  });

  it('accepts online tracking even if unrelated operational capabilities are limited',async () => {
    const current = projection();
    current.robots[0]!.operationalReady = false;
    current.robots[0]!.status = 'limited';
    vi.mocked(getRunRobots).mockResolvedValue(current);
    expect((await load()).samples).toHaveLength(2);
  });

  it('keeps canonical simulation samples available when frozen origin lookup fails or mismatches',async () => {
    vi.mocked(getExperimentAtCommit).mockRejectedValueOnce(new Error('Snapshot unavailable'));
    const result = await load();
    expect(result.originUnavailableReason).toBe('Snapshot unavailable');
    expect(result.samples).toHaveLength(2);
    expect(result.samples.every((sample) => !sample.rawPosition)).toBe(true);
    const copied = computeExperimentSimulationInitialPoses(initialBindings,result.samples,['one']);
    expect(copied[0]!.initialPose).toEqual({ x:102,y:-16,z:1.25,yaw:0.5 });
    expect(copied[1]).toBe(initialBindings[1]);
    expect(() => computeExperimentWorldOrigin(result.samples,['one'])).toThrow(/physical Robots/);
    vi.mocked(getExperimentAtCommit).mockResolvedValueOnce({
      ...frozenExperiment(),branch:{ ...frozenExperiment().branch,headCommitId:'latest-edited-commit' },
    });
    const mismatched = await load();
    expect(mismatched.originUnavailableReason).toMatch(/does not match/);
    expect(mismatched.samples.every((sample) => !sample.rawPosition)).toBe(true);
  });

  it('rechecks sample deadlines and assignment identity before calculating authored changes',async () => {
    const result = await load();
    expect(result.samples[0]!.expiresAt).toBe(NOW + 500);
    expect(() => computeExperimentWorldOrigin(result.samples,[])).toThrow(/at least one/);
    expect(() => computeExperimentWorldOrigin(result.samples,['missing'])).toThrow(/unavailable or expired/);
    expect(() => computeExperimentWorldOrigin(result.samples,['one'],NOW + 500)).toThrow(/unavailable or expired/);
    const changed = initialBindings.map((item) => ({ ...item,namespace:'/changed' }));
    expect(() => computeExperimentSimulationInitialPoses(changed,result.samples,['one'])).toThrow(/assignment changed/);
    expect(() => computeExperimentSimulationInitialPoses(initialBindings,result.samples,['two'],NOW + 500))
      .toThrow(/unavailable or expired/);
  });

  it('keeps captured previews reproducible while rejecting them for a later save',async () => {
    const result = await load();
    vi.setSystemTime(NOW + 2000);
    expect(computeExperimentWorldOrigin(result.samples,['one'],result.capturedAt).rawOrigin)
      .toEqual({ x:2,y:4,z:1 });
    expect(() => computeExperimentWorldOrigin(result.samples,['one'])).toThrow(/unavailable or expired/);
  });

  it('samples again after a slow immutable document lookup and records that final capture time',async () => {
    const fresh = projection();
    fresh.robots.forEach((robot) => {
      robot.onlineUntil = new Date(NOW + 2000).toISOString();
      Object.values(robot.channels).forEach((channel) => {
        channel.staleAt = new Date(NOW + 1500).toISOString();
        channel.value.position = { x:120,y:-10,z:7 };
      });
    });
    vi.mocked(getRunRobots).mockResolvedValueOnce(projection()).mockResolvedValueOnce(fresh);
    vi.mocked(getExperimentAtCommit).mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 1000);
      return frozenExperiment();
    });
    const result = await load();
    expect(result.capturedAt).toBe(NOW + 1000);
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]).toMatchObject({
      rawPosition:{ x:20,y:10,z:2 },expiresAt:NOW + 1500,
    });
    expect(computeExperimentWorldOrigin(result.samples,['one']).offset).toEqual({ x:-20,y:-10,z:-2 });
    expect(getRunRobots).toHaveBeenCalledTimes(2);
    const reads = vi.mocked(getRunRobots).mock.invocationCallOrder;
    expect(reads[0]).toBeLessThan(vi.mocked(getExperimentAtCommit).mock.invocationCallOrder[0]!);
    expect(reads[1]).toBeGreaterThan(vi.mocked(getExperimentAtCommit).mock.invocationCallOrder[0]!);
  });

  it('rejects a different Experiment, commit or pending projection on the final sample read',async () => {
    for (const changed of [
      { ...projection(),experimentCommitId:'successor-commit' },
      { ...projection(),experimentResourceId:'another-experiment' },
      { ...projection(),pending:true },
    ]) {
      vi.mocked(getRunRobots).mockResolvedValueOnce(projection()).mockResolvedValueOnce(changed);
      await expect(load()).rejects.toThrow(/selected Experiment Session/);
    }
  });

  it('does not substitute the first projection if the final positions remain stale',async () => {
    const stale = projection();
    stale.robots.forEach((robot) => { robot.online = false; });
    vi.mocked(getRunRobots).mockResolvedValueOnce(projection()).mockResolvedValueOnce(stale);
    expect((await load()).samples).toEqual([]);
  });

  it('does not turn cancellation into a recoverable origin lookup failure',async () => {
    const controller = new AbortController();
    vi.mocked(getExperimentAtCommit).mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('Cancelled snapshot read');
    });
    await expect(load({ signal:controller.signal })).rejects.toMatchObject({ name:'AbortError' });
  });
});

function load(overrides:Partial<Parameters<typeof loadExperimentCoordinateSamples>[0]> = {}) {
  return loadExperimentCoordinateSamples({
    targetId:'local',runId:'robot-run',experimentResourceId:'experiment',
    bindings:initialBindings,runMode:'physical',...overrides,
  });
}

function binding(id:string,px4 = false):ExperimentRobotBinding {
  return {
    id,ref:{ domain:'robot',resourceId:`asset-${id}`,branch:'main' },namespace:`/${id}`,
    hybridSource:'physical',runtimeParameters:{},initialPose:{ x:0,y:0,z:1.25,yaw:0 },
    ...(px4 ? { px4:{} } : { scout:{ lidarSimulationEnabled:true,imageSimulationEnabled:false } }),
  };
}

function projection():RunRobotProjection {
  return {
    targetId:'local',runId:'robot-run',streamId:'stream',projectionRevision:1,pending:false,
    experimentResourceId:'experiment',experimentCommitId:'frozen-commit',
    robotSelectionDigest:'a'.repeat(64),robots:initialBindings.map((item,index) => robot(item,index)),
    operations:[],updatedAt:new Date(NOW).toISOString(),
  };
}

function robot(binding:ExperimentRobotBinding,index:number):RunRobot {
  const channelId = binding.px4 ? 'state.mocap.pose' : 'vrpn.position';
  return {
    id:binding.id,robotAssetId:binding.ref.resourceId,robotAssetCommitId:'asset-commit',robotAssetDigest:'digest',
    name:binding.id,kind:binding.px4 ? 'px4_multirotor' : 'scout_mini',hybridSource:'physical',
    profileId:'profile',namespace:binding.namespace,operationContracts:[],adapterDefinitionId:'adapter',
    connectionEpoch:1,connectionState:'live',connectionRevision:1,online:true,operationalReady:true,status:'online',
    onlineUntil:new Date(NOW + 1000).toISOString(),
    operationalReadyUntil:new Date(NOW + 1000).toISOString(),
    channels:{ [channelId]:{
      channelId,sequence:1,messageId:1,observedAt:new Date(NOW).toISOString(),sourceAgeMs:0,
      staleAt:new Date(NOW + 500).toISOString(),stale:false,
      value:{ position:{ x:102 + index * 4,y:-16 + index * 4,z:6 + index * 2 },
        orientation:{ x:0,y:0,z:Math.sin(0.25),w:Math.cos(0.25) } },
    } },
  };
}

function frozenExperiment():ExperimentDocument {
  return {
    head:{
      domain:'experiment',resourceId:'experiment',name:'Experiment',tags:[],mainCommitId:'latest-commit',
      currentVersion:2,digest:'a'.repeat(64),revision:2,createdAt:'',updatedAt:'',
    },
    branch:{
      domain:'experiment',resourceId:'experiment',name:'main',headCommitId:'frozen-commit',headVersion:1,
      revision:1,createdAt:'',updatedAt:'',
    },
    spec:newExperimentSpec({ name:'Experiment',robots:initialBindings,localizationOffset:{ x:100,y:-20,z:5 } }),
  };
}
