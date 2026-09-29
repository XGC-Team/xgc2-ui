import { describe,expect,it } from 'vitest';
import { createVideoRecipe,newVideoDraft,savedVideoRecipeLabel,videoCameraTopics,type VideoCatalog } from './videoProductionModel';
const image = 'sensor_msgs/CompressedImage';
const video = 'foxglove_msgs/CompressedVideo';
const topics = [
  { name:'/jpeg',type:image,messageCount:30 },
  { name:'/h264',type:video,messageCount:30 },
  { name:'/unknown',type:'custom/EncodedImage',messageCount:30 },
  { name:'/empty',type:video,messageCount:0 },
];
const catalog:VideoCatalog = { id:'bag',durationSec:1,durationNs:'1000000000',topics };
const bag = { id:'bag',name:'camera.bag',size:1024,experimentId:'exp' };
const draft = { ...newVideoDraft(),cameraTopic:'/h264',endSeconds:'1' };
describe('native camera schema and installed worker support',() => {
  it('requires both the known schema and explicit installed support',() => {
    expect(videoCameraTopics({ ...catalog,supportedCameraMessageTypes:[image,video,'custom/EncodedImage'] })).toEqual(topics.slice(0,2));
    expect(videoCameraTopics({ ...catalog,supportedCameraMessageTypes:[image] })).toEqual([topics[0]]);
    expect(videoCameraTopics({ ...catalog,supportedCameraMessageTypes:[] })).toEqual([]);
    expect(videoCameraTopics(catalog)).toEqual([topics[0]]);
  });
  it('retains the actual selected messageType in the unchanged recipe v1 source',() => {
    const result = createVideoRecipe({ experimentId:'exp',bag,catalog:{ ...catalog,supportedCameraMessageTypes:[video] },draft });
    expect(result.ok).toBe(true);if (!result.ok) return;
    expect(result.recipe.source).toEqual({ kind:'rosbag',bagId:'bag',recordedSize:1024,cameraTopic:'/h264',messageType:video });
    expect(result.recipe.version).toBe(1);expect(result.recipe.output.fps).toBe(30);
  });
  it.each([{ supported:[] },{ supported:[image] },{ supported:['custom/EncodedImage'] }])('rejects a selected video topic when support is $supported',({ supported }) => {
    const result = createVideoRecipe({ experimentId:'exp',bag,catalog:{ ...catalog,supportedCameraMessageTypes:supported },draft });
    expect(result.ok).toBe(false);if (!result.ok) expect(result.issues).toContain('camera-required');
  });
  it('does not accept an unknown source schema even if claimed by a future capability',() => {
    const result = createVideoRecipe({ experimentId:'exp',bag,catalog:{ ...catalog,supportedCameraMessageTypes:['custom/EncodedImage'] },draft:{ ...draft,cameraTopic:'/unknown' } });
    expect(result.ok).toBe(false);if (!result.ok) expect(result.issues).toContain('camera-required');
  });
});

describe('saved recipe labels',() => {
  it('uses the recorded bag and clip instead of a recipe id',() => {
    expect(savedVideoRecipeLabel({
      source:{ bagId:'bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0',cameraTopic:'/camera/compressed' },
      interval:{ startNs:'0',endNs:'10000000000' },
    })).toBe('bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0 · /camera/compressed · 0–10s');
  });
});
