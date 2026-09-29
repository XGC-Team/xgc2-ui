import { describe,expect,it } from 'vitest';
import { extrinsicResultRef,manualExtrinsicChoice,manualExtrinsicPose,parseWorldCameraExtrinsicChoice } from './worldCameraExtrinsicSelectionModel';

describe('world camera extrinsic choices',() => {
  it('keeps absent legacy values separate from Auto and rejects malformed or mixed choices',() => {
    expect(parseWorldCameraExtrinsicChoice(undefined)).toBeNull();
    expect(parseWorldCameraExtrinsicChoice('')).toBeNull();
    expect(parseWorldCameraExtrinsicChoice('{"mode":"auto"}')).toEqual({ mode:'auto' });
    for (const value of ['bad','{"mode":"auto","result":{}}','{"mode":"version","result":null}']) {
      expect(() => parseWorldCameraExtrinsicChoice(value)).toThrow('invalid');
    }
  });

  it('freezes optical pose provenance and presents a later experiment offset exactly once',() => {
    const pose = { x:2,y:3,z:4,rollDegrees:23,pitchDegrees:-31,yawDegrees:74 };
    const choice = manualExtrinsicChoice(pose,{ x:10,y:20,z:30 });
    expect(parseWorldCameraExtrinsicChoice(JSON.stringify(choice))).toEqual(choice);
    const rebased = manualExtrinsicPose(choice,{ x:16,y:18,z:30 });
    expect(rebased.x).toBe(8);
    expect(rebased.y).toBe(1);
    expect(rebased.z).toBe(4);
    expect(rebased.rollDegrees).toBeCloseTo(23);
    expect(rebased.pitchDegrees).toBeCloseTo(-31);
    expect(rebased.yawDegrees).toBeCloseTo(74);
    const edited = manualExtrinsicChoice({ ...rebased,x:9 },{ x:16,y:18,z:30 });
    expect(manualExtrinsicPose(edited,{ x:16,y:18,z:30 }).x).toBe(9);
    expect(() => manualExtrinsicChoice(pose,{ x:Number.NaN,y:0,z:0 })).toThrow('coordinate');
  });

  it('pins source mode, immutable basename and raw-byte digest without exposing a path',() => {
    const file = 'extrinsics-20260920T123456.123Z-02.yaml';
    const ref = extrinsicResultRef(`/cal/phy/usb_cam/${file}`,'/cal','usb_cam','a'.repeat(64));
    expect(ref).toEqual({ sourceMode:'phy',fileName:file,sha256:'a'.repeat(64) });
    expect(parseWorldCameraExtrinsicChoice(JSON.stringify({ mode:'version',result:ref }))).toEqual({ mode:'version',result:ref });
    expect(() => extrinsicResultRef(`/cal/phy/other/${file}`,'/cal','usb_cam','a'.repeat(64))).toThrow('verified');
    expect(() => extrinsicResultRef(`/cal/phy/usb_cam/${file}`,'/cal','usb_cam','')).toThrow('verified');
  });

  it('rejects non-unit rotations and incomplete world provenance',() => {
    const choice = manualExtrinsicChoice({ x:0,y:0,z:0,rollDegrees:0,pitchDegrees:0,yawDegrees:0 },{ x:0,y:0,z:0 });
    if (choice.mode !== 'pose') throw new Error('Expected manual');
    expect(() => parseWorldCameraExtrinsicChoice(JSON.stringify({ ...choice,pose:{ ...choice.pose,quaternionXyzw:[0,0,0,2] } }))).toThrow();
    expect(() => parseWorldCameraExtrinsicChoice(JSON.stringify({ ...choice,pose:{ ...choice.pose,coordinates:undefined } }))).toThrow();
  });
});
