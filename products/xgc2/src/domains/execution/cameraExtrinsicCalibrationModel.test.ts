import { describe,expect,it } from 'vitest';
import type { CameraExtrinsicPoint,CameraExtrinsicState } from './cameraExtrinsicCalibrationService';
import { cameraExtrinsicSolvePreflight } from './cameraExtrinsicCalibrationModel';

const state={ mode:'live',markers:[{ name:'wand',position:[999,999,999] }],samples:[] } as unknown as CameraExtrinsicState;
const points=(positions:readonly (readonly [number,number,number])[]):CameraExtrinsicPoint[] => positions.map((world,index) => ({
  sampleId:String(index),marker:'wand',pixel:[index*100,index*100],world,
}));
describe('independent sample geometry',() => {
  it('accepts one rigid body captured at different non-collinear positions in live mode',() => {
    expect(cameraExtrinsicSolvePreflight(state,points([[0,0,0],[1,0,0],[1,1,0],[0,1,0]]))).toBe('');
  });
  it('rejects repeated positions and collinear poses without reading the latest marker map',() => {
    expect(cameraExtrinsicSolvePreflight(state,points([[0,0,0],[0,0,0],[0,0,0],[0,0,0]]))).toMatch(/collinear/);
    expect(cameraExtrinsicSolvePreflight(state,points([[0,0,0],[1,0,0],[2,0,0],[3,0,0]]))).toMatch(/collinear/);
  });
  it('accepts non-planar mixed marker samples without imposing a vehicle family',() => {
    const mixed=points([[0,0,0],[1,0,0],[1,1,0],[0,1,1]]).map((point,index) => ({ ...point,marker:index%2 ? 'fixture':'wand' }));
    expect(cameraExtrinsicSolvePreflight(state,mixed)).toBe('');
  });
  it('rejects insufficient or missing/nonfinite captured evidence',() => {
    expect(cameraExtrinsicSolvePreflight(undefined)).toMatch(/Waiting/);
    expect(cameraExtrinsicSolvePreflight(state,points([[0,0,0]]))).toMatch(/at least four/);
    const invalid=points([[0,0,0],[1,0,0],[1,1,0],[0,1,0]]);
    invalid[0]={ ...invalid[0]!,world:undefined };
    expect(cameraExtrinsicSolvePreflight(state,invalid)).toMatch(/unavailable/);
    invalid[0]={ ...invalid[0]!,world:[NaN,0,0] };
    expect(cameraExtrinsicSolvePreflight(state,invalid)).toMatch(/unavailable/);
  });
});
