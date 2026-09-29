import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { createVideoJob,decodeVideoCapabilities,decodeVideoSourceCatalog,getVideoCapabilities,getVideoSourceCatalog,type VideoRequest } from './videoProductionService';
vi.mock('../../api/http',() => ({ request:vi.fn(),requestBlob:vi.fn(),requestStationResponse:vi.fn(),apiUrl:(path:string) => path,HTTPError:class extends Error {} }));
const digest = 'a'.repeat(64);
function capabilities() {
  return { available:true,reason:'',jobKind:'video.render-archive',actionPort:'render-video',maxFrames:100000,
    width:3840,height:2160,messageTypes:['sensor_msgs/CompressedImage'],modelReason:'',editing:{ trackEnabled:true },
    modelIds:['controlled-model'],models:[{ modelId:'controlled-model',label:'Controlled model',bundleSha256:digest,
      description:{ package:'controlled',file:'model.urdf' },rootFrame:'base_link',jointPose:'urdf-rest' }] };
}
function catalog() {
  return { id:'bag',name:'record.bag',experimentId:'workspace',sessionId:'',size:1024,durationNs:'1000000000',
    topics:[{ name:'/robot/path',type:'nav_msgs/Path',messageCount:3 }],
    recordedContext:{ status:'available',sha256:digest,experimentId:'recorded-experiment',experimentName:'Recorded name',runMode:'simulation' },
    recordFacts:{ status:'absent',reason:'missing-descriptor' },
    objects:[{ id:'robot',kind:'robot',label:'Recorded robot',labelSource:'recorded-name',robot:{
      slotId:'ugv1',kind:'ugv',namespace:'/robot',visualizationDigest:digest,
      frame:{ id:'robot/base_link',evidence:'recorded-visualization',availability:'unverified' },
      description:{ package:'controlled',file:'model.urdf' },modelEvidence:'metadata-only',suggestedModelIds:['controlled-model'] } },
    { id:'path',kind:'path',label:'/robot/path',labelSource:'topic',topic:'/robot/path',parentId:'robot',selector:{ kind:'topic',topic:'/robot/path' } }] };
}
describe('video source/model transport authority',() => {
  beforeEach(() => vi.resetAllMocks());
  it('retains recorded identity independently of the current workspace and passes cancellation',async () => {
    const value = catalog(),signal = new AbortController().signal;
    vi.mocked(request).mockResolvedValue(value);
    expect(await getVideoSourceCatalog('workspace','bag',undefined,signal)).toBe(value);
    expect(request).toHaveBeenCalledWith('/recordings/video-production/workspace/catalog/bag',{ signal },{ timeoutMs:60000 });
    await expect(getVideoSourceCatalog('other','bag')).rejects.toThrow('scope mismatch');
  });
  it('uses only exact capabilities models, retaining unavailable catalog as empty',async () => {
    const value = capabilities();vi.mocked(request).mockResolvedValue(value);
    expect(await getVideoCapabilities('workspace')).toBe(value);
    expect(decodeVideoCapabilities({ ...value,available:false,models:[],modelIds:[],modelReason:'Runtime not installed' }).models).toEqual([]);
    expect(() => decodeVideoCapabilities({ ...value,models:[{ ...value.models[0],bundleSha256:'head' }] })).toThrow();
    expect(() => decodeVideoCapabilities({ ...value,models:[value.models[0],value.models[0]] })).toThrow();
    expect(() => decodeVideoCapabilities({ ...value,modelIds:['invented'] })).toThrow();
  });
  it('accepts explicit missing historical evidence without generating robots or a digest',() => {
    const value = { ...catalog(),recordedContext:{ status:'unavailable',reason:'missing-sidecar' },objects:[] };
    expect(decodeVideoSourceCatalog(value)).toBe(value);
    expect(value.recordedContext).not.toHaveProperty('sha256');
    expect(() => decodeVideoSourceCatalog({ ...catalog(),recordedContext:value.recordedContext })).toThrow();
  });
  it('rejects malformed evidence, invented parent ownership and mismatched source selectors',() => {
    const value = catalog();
    expect(() => decodeVideoSourceCatalog({ ...value,recordedContext:{ ...value.recordedContext,sha256:'invalid' } })).toThrow();
    expect(() => decodeVideoSourceCatalog({ ...value,objects:[{ ...value.objects[1],parentId:'unknown' }] })).toThrow();
    expect(() => decodeVideoSourceCatalog({ ...value,objects:[{ ...value.objects[1],parentId:undefined,selector:{ kind:'topic',topic:'/other' } }] })).toThrow();
    expect(() => decodeVideoSourceCatalog({ ...value,objects:[{ ...value.objects[1],parentId:undefined,kind:'markers' }] })).toThrow();
    expect(() => decodeVideoSourceCatalog({ ...value,objects:[value.objects[0],value.objects[0]] })).toThrow();
  });
  it('projects applied world/ground/fence facts without requiring bag topics',() => {
    const value = catalog();
    const world = { id:'world',kind:'world',label:'World world',labelSource:'recorded-fact',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    const ground = { id:'ground',kind:'ground',label:'Ground',labelSource:'recorded-fact',parentId:'world',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    const fence = { id:'fence',kind:'fence',label:'Control fence',labelSource:'recorded-fact',parentId:'world',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    expect(decodeVideoSourceCatalog({ ...value,recordFacts:{ status:'available',sha256:digest,relativePath:'record-facts.jsonl',eventCount:1 },objects:[...value.objects,world,ground,fence] })).toMatchObject({ recordFacts:{ status:'available' } });
    expect(decodeVideoSourceCatalog({ ...value,recordFacts:{ status:'available',sha256:digest,eventCount:1 },objects:[...value.objects,world,ground,fence] })).toMatchObject({ recordFacts:{ status:'available' } });
    expect(() => decodeVideoSourceCatalog({ ...value,objects:[ground] })).toThrow();
  });
  it('decodes the recorded H264 camera schema without inferring worker support or codec',() => {
    const value = { ...catalog(),topics:[{ name:'/video',type:'foxglove_msgs/CompressedVideo',messageCount:30 }],
      objects:[{ id:'camera',kind:'camera',label:'/video',labelSource:'topic',topic:'/video' }] };
    expect(decodeVideoSourceCatalog(value)).toBe(value);
    expect(() => decodeVideoSourceCatalog({ ...value,topics:[{ ...value.topics[0],type:'custom/EncodedImage' }] })).toThrow();
  });
  it('does not enrich legacy request identity on submission',async () => {
    const legacy = { videoRecipe:{ source:{ bagId:'bag' } },settings:{ tracks:[{ kind:'robot-model',source:{ modelId:'mocap-rotor',frameId:'base_link' } }] },rendition:{ kind:'video' } } as unknown as VideoRequest;
    await createVideoJob('workspace',legacy,'ticket');
    const options = vi.mocked(request).mock.calls[0][1]!;
    expect(JSON.parse(String(options.body))).toEqual(legacy);
    expect(options.headers).toEqual({ 'Content-Type':'application/json','Idempotency-Key':'ticket' });
  });
});
