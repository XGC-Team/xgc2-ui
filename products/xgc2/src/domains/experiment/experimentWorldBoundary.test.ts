import { describe,it,expect } from 'vitest';
import {
  EXPERIMENT_BOUNDARY_KEYS,decodeExperimentWorldBoundary,declaredExperimentWorldBoundary,
  experimentBoundaryDraft,parseExperimentBoundaryDraft,presentedExperimentWorldBoundary,
  reexpressExperimentWorldBoundary,validateExperimentWorldBoundary,
  type ExperimentWorldBoundary,
} from './experimentWorldBoundary';

const configured = ():ExperimentWorldBoundary => ({schemaVersion:1,frameId:'world',unit:'m',
  controlBounds:{xMin:-2,xMax:4,yMin:-3,yMax:5,zMin:0.2,zMax:3},groundZ:-0.25});

describe('current Experiment world boundary',() => {
  it('fills a blank robot-experiment fence from that experiment and keeps an authored box',() => {
    expect(declaredExperimentWorldBoundary('Experiment')).toBeNull();
    expect(presentedExperimentWorldBoundary(null,'TASE-4UGVs')).toEqual({
      schemaVersion:1,frameId:'world',unit:'m',groundZ:0,
      controlBounds:{ xMin:-12,xMax:12,yMin:-7,yMax:7,zMin:-1,zMax:1 },
    });
    expect(presentedExperimentWorldBoundary(null,'TASE-5UAVs')?.controlBounds).toEqual({
      xMin:-6.9,xMax:6.9,yMin:-4.4,yMax:4.4,zMin:0.2,zMax:2.8,
    });
    expect(presentedExperimentWorldBoundary(null,'RAL-5UAVs4UGVs')?.controlBounds?.zMax).toBe(4);
    expect(presentedExperimentWorldBoundary(null,'SCE')?.groundZ).toBe(0);
    expect(presentedExperimentWorldBoundary(null,'4 Mecanum vehicles experiment')?.controlBounds?.yMin).toBe(-7);
    const authored = configured();
    expect(presentedExperimentWorldBoundary(authored,'TASE-4UGVs')).toEqual(authored);
    expect(presentedExperimentWorldBoundary({ ...authored,groundZ:null },'TASE-4UGVs')?.groundZ).toBe(0);
    expect(presentedExperimentWorldBoundary({ ...authored,groundZ:null },'Experiment')?.groundZ).toBeNull();
  });
  it('retains explicit absence without adding site defaults',() => {
    expect(decodeExperimentWorldBoundary(null)).toBeNull();
    const result=parseExperimentBoundaryDraft(experimentBoundaryDraft(null),'');
    expect(result.controlBounds).toBeNull();expect(result.groundZ).toBeNull();
    expect(() => decodeExperimentWorldBoundary(undefined)).toThrow();
  });
  it('round-trips a complete authored field and independent ground',() => {
    const source=configured();
    expect(parseExperimentBoundaryDraft(experimentBoundaryDraft(source),String(source.groundZ))).toEqual(source);
    expect(source.groundZ).not.toEqual(source.controlBounds!.zMin);
  });
  it.each(EXPERIMENT_BOUNDARY_KEYS)('does not turn blank %s into zero',(key) => {
    const draft=experimentBoundaryDraft(configured());draft[key]=' ';
    expect(() => parseExperimentBoundaryDraft(draft,'')).toThrow('six');
  });
  it.each([NaN,Infinity,-Infinity])('rejects nonfinite ground %s',(groundZ) => {
    expect(validateExperimentWorldBoundary({...configured(),groundZ})).not.toBe('');
  });
  it.each(EXPERIMENT_BOUNDARY_KEYS)('rejects nonfinite %s',(key) => {
    const source=configured();source.controlBounds![key]=NaN;
    expect(() => decodeExperimentWorldBoundary(source)).toThrow('finite');
  });
  it('rejects empty/reversed intervals on every axis',() => {
    for (const axis of ['x','y','z'] as const) for (const delta of [0,-1]) {
      const source=configured();source.controlBounds![`${axis}Max`]=source.controlBounds![`${axis}Min`]+delta;
      expect(() => decodeExperimentWorldBoundary(source)).toThrow('minimum');
    }
  });
  it('rejects old, missing, string and extra schema fields rather than migrating',() => {
    for (const source of [
      {...configured(),schemaVersion:0},{...configured(),frameId:'map'},
      {...configured(),unit:'cm'},{...configured(),legacyFence:{}},
      {...configured(),controlBounds:{...configured().controlBounds,xMin:'-2'}},
      {...configured(),controlBounds:{xMax:4,yMin:-3,yMax:5,zMin:0.2,zMax:3}},
    ]) expect(() => decodeExperimentWorldBoundary(source)).toThrow();
  });
  it('re-expresses the same field once and leaves frozen input unchanged',() => {
    const source=configured();const before=JSON.stringify(source);
    const result=reexpressExperimentWorldBoundary(source,{x:1,y:2,z:3},{x:6,y:-5,z:5})!;
    expect(JSON.stringify(source)).toBe(before);
    expect(result.controlBounds).toEqual({xMin:3,xMax:9,yMin:-10,yMax:-2,zMin:2.2,zMax:5});
    expect(result.groundZ).toBe(1.75);
    result.controlBounds!.xMax=100;expect(source.controlBounds!.xMax).toBe(4);
  });
  it('never substitutes flight floor for an unknown ground',() => {
    const result=reexpressExperimentWorldBoundary({...configured(),groundZ:null},{x:0,y:0,z:0},{x:0,y:0,z:1})!;
    expect(result.controlBounds!.zMin).toBe(1.2);expect(result.groundZ).toBeNull();
  });
  it('rejects nonfinite origins and translation overflow',() => {
    expect(() => reexpressExperimentWorldBoundary(configured(),{x:0,y:0,z:0},{x:Infinity,y:0,z:0})).toThrow();
    expect(() => reexpressExperimentWorldBoundary(configured(),{x:-Number.MAX_VALUE,y:0,z:0},{x:Number.MAX_VALUE,y:0,z:0})).toThrow();
  });
});
