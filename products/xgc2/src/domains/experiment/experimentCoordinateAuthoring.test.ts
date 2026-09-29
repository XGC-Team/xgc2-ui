import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getRunRobots,type RunRobot,type RunRobotProjection } from '../robot/robotPublic';
import { type ProcessROS1PoseSamples } from '../execution/executionPublic';
import { getExperimentAtCommit,getExperimentSessionROS1Poses } from './experimentService';
import { newExperimentSpec,type ExperimentDocument,type ExperimentRobotBinding } from './experimentModel';
import { loadExperimentCoordinateSamples,computeExperimentWorldOrigin,computeExperimentSimulationInitialPoses } from './experimentCoordinateAuthoring';
vi.mock('../robot/robotPublic',() => ({ getRunRobots:vi.fn() }));
vi.mock('./experimentService',() => ({ getExperimentAtCommit:vi.fn(),getExperimentSessionROS1Poses:vi.fn() }));
const NOW = Date.parse('2026-09-06T00:00:00Z');
const initialBindings = [binding('one'),binding('two',true)];
function snapshot(root = '/vrpn_client_node'):ProcessROS1PoseSamples {
  return { instanceId:'vrpn',roots:[root],samples:['one','two','origin-board'].map((name,index) => ({
    topic:`${root}/${name}/pose`,frameId:'world',sourceStamp:new Date(NOW).toISOString(),observedAt:new Date(NOW).toISOString(),
    position:{ x:2+index*4,y:4+index*4,z:1+index*2 },orientation:{ x:0,y:0,z:Math.sin(0.25),w:Math.cos(0.25) },
  })) };
}
describe('Experiment direct VRPN coordinate authoring',() => {
  beforeEach(() => {
    vi.useFakeTimers();vi.setSystemTime(NOW);vi.clearAllMocks();
    vi.mocked(getRunRobots).mockResolvedValue(projection());
    vi.mocked(getExperimentAtCommit).mockResolvedValue(frozenExperiment());
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue(response(snapshot()));
  });
  afterEach(() => vi.useRealTimers());
  it('reads unassigned bodies even when the Robot observer projection is pending',async () => {
    vi.mocked(getRunRobots).mockResolvedValue({ ...projection(),pending:true,robots:[] });
    const result = await load();
    expect(result.samples).toHaveLength(3);
    const marker = result.samples.find((sample) => sample.name === 'origin-board')!;
    expect(computeExperimentWorldOrigin(result.samples,[marker.bindingId],7).offset).toEqual({ x:-10,y:-12,z:-7 });
    expect(getExperimentSessionROS1Poses).toHaveBeenCalledWith('local','session',undefined);
  });
  it('does not gate tracking on physical connection, battery, adapter health, or channel cache',async () => {
    const disconnected = projection();
    disconnected.robots.forEach((robot) => { robot.online=false;robot.connectionState='inactive';robot.channels={}; });
    vi.mocked(getRunRobots).mockResolvedValue(disconnected);
    const result=await load();
    expect(computeExperimentWorldOrigin(result.samples,['one','two'],7)).toMatchObject({ rawOrigin:{ x:4,y:6,z:7 },offset:{ x:-4,y:-6,z:-7 } });
  });
  it('uses raw XY plus the next authored offset exactly once and preserves slot height and heading',async () => {
    const result=await load();
    expect(result.samples[0]!.pose).toMatchObject({ x:102,y:-16,z:6 });
    const next=computeExperimentSimulationInitialPoses(initialBindings,result.samples,['one'],{ x:-2,y:-4,z:900 });
    expect(next[0]!.initialPose).toEqual({ x:0,y:0,z:1.25,yaw:0.5 });
    expect(next[1]).toBe(initialBindings[1]);
    expect(result.frozenOffset).toEqual({ x:100,y:-20,z:5 });
  });
  it('accepts stationary and zero XY tracking and never picks the tracker height',async () => {
    const current=snapshot();current.samples[0]!.position={ x:0,y:0,z:12 };
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue(response(current));
    for (let i=0;i<2;i++) expect(computeExperimentWorldOrigin((await load()).samples,['one'],0).offset).toEqual({ x:0,y:0,z:0 });
  });
  it('uses canonical simulation XY without applying the physical offset',async () => {
    const result=await load({ runMode:'simulation' });
    expect(result.samples[0]!.physical).toBe(false);
    expect(computeExperimentSimulationInitialPoses(initialBindings,result.samples,['one'],{ x:100,y:100,z:100 })[0]!.initialPose).toEqual({ x:2,y:4,z:1.25,yaw:0.5 });
    expect(() => computeExperimentWorldOrigin(result.samples,['one'],0)).toThrow(/physical/);
  });
  it('matches simulation namespace pose and ground-truth topics',async () => {
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue(response({
      instanceId:'scout',roots:['/one'],samples:[{
        topic:'/one/simulation/ground_truth/pose',frameId:'world',sourceStamp:new Date(NOW).toISOString(),observedAt:new Date(NOW).toISOString(),
        position:{ x:3,y:5,z:0.2 },orientation:{ x:0,y:0,z:0,w:1 },
      }],
    }));
    const result=await load({ runMode:'simulation',bindings:[binding('one')] });
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]!.bindingId).toBe('one');
    expect(result.samples[0]!.physical).toBe(false);
    expect(computeExperimentSimulationInitialPoses([binding('one')],result.samples,['one'],{ x:9,y:9,z:9 })[0]!.initialPose)
      .toMatchObject({ x:3,y:5,z:1.25,yaw:0 });
  });
  it('isolates hybrid physical and simulation roots using frozen assignment metadata',async () => {
    const mixed=projection();mixed.robots[1]!.hybridSource='simulation';
    vi.mocked(getRunRobots).mockResolvedValue(mixed);
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue(response(snapshot('/vrpn_client_node_physical')));
    const result=await load({ runMode:'hybrid',bindings:initialBindings.map((item) => ({ ...item,hybridSource:'simulation' })) });
    expect(result.samples.find((item) => item.bindingId==='one')?.physical).toBe(true);
    expect(result.samples.some((item) => item.bindingId==='two')).toBe(false);
  });
  it('rejects foreign Session metadata and frozen commit mismatch',async () => {
    vi.mocked(getRunRobots).mockResolvedValue({ ...projection(),experimentCommitId:'foreign' });
    await expect(load()).rejects.toThrow(/selected Experiment Session/);
    expect(getExperimentSessionROS1Poses).not.toHaveBeenCalled();
    vi.mocked(getExperimentAtCommit).mockResolvedValue({ ...frozenExperiment(),head:{ ...frozenExperiment().head,digest:'foreign' } });
    await expect(load()).rejects.toThrow(/frozen Experiment/);
  });
  it('rejects missing provenance rather than silently treating it as no tracking',async () => {
    await expect(load({ expectedCommitId:'' })).rejects.toThrow(/frozen tracking configuration/);
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue({ ...response(snapshot()),sessionId:'foreign' });
    await expect(load()).rejects.toThrow(/selected Experiment Session/);
  });
  it('ignores malformed or foreign-root poses',async () => {
    const invalid=snapshot();invalid.samples[0]!.position.x=NaN;invalid.samples[1]!.topic='/foreign/two/pose';
    vi.mocked(getExperimentSessionROS1Poses).mockResolvedValue(response(invalid));
    expect((await load()).samples.map((item) => item.name)).toEqual(['origin-board']);
  });
  it('does not apply an unassigned body or reassigned Robot as a simulation slot',async () => {
    const result=await load();
    expect(() => computeExperimentSimulationInitialPoses(initialBindings,result.samples,[result.samples[2]!.bindingId],{ x:0,y:0,z:0 })).toThrow(/assignment changed/);
    expect(() => computeExperimentWorldOrigin(result.samples,[],0)).toThrow(/at least one/);
    expect(() => computeExperimentWorldOrigin(result.samples,['gone'],0)).toThrow(/unavailable/);
    expect(() => computeExperimentWorldOrigin(result.samples,['one'],NaN)).toThrow(/finite/);
  });
  it('propagates cancellation without reading or saving tracking data',async () => {
    const controller=new AbortController();controller.abort();
    await expect(load({ signal:controller.signal })).rejects.toMatchObject({ name:'AbortError' });
    expect(getExperimentSessionROS1Poses).not.toHaveBeenCalled();
  });
});

function load(overrides:Partial<Parameters<typeof loadExperimentCoordinateSamples>[0]> = {}) {
  return loadExperimentCoordinateSamples({
    targetId:'local',runId:'robot-run',experimentResourceId:'experiment',
    bindings:initialBindings,runMode:'physical',expectedCommitId:'frozen-commit',expectedDigest:'a'.repeat(64),sessionId:'session',...overrides,
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
    ...(binding.px4 ? { px4:{ modelId:'fs150',mavSystemId:1,managementIp:'',mocapRigidBodyName:binding.id } } : { scout:{ managementAddress:'',mocapRigidBodyName:binding.id } }),
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
      domain:'experiment',resourceId:'experiment',name:'main',headCommitId:'newer-authored-commit',headVersion:1,
      revision:1,createdAt:'',updatedAt:'',
    },
    spec:newExperimentSpec({ name:'Experiment',robots:initialBindings,localizationOffset:{ x:100,y:-20,z:5 } }),
  };
}

function response(...sources:ProcessROS1PoseSamples[]) { return {sessionId:'session',experimentCommitId:'frozen-commit',sources}; }
