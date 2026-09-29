/** Browser representation of internal/worldboundary/schema.json, not runtime authority. */
export const EXPERIMENT_BOUNDARY_KEYS = ['xMin','xMax','yMin','yMax','zMin','zMax'] as const;
export type ExperimentBoundaryKey = typeof EXPERIMENT_BOUNDARY_KEYS[number];
export type ExperimentBoundaryBounds = Record<ExperimentBoundaryKey,number>;
export type ExperimentWorldBoundary = {
  schemaVersion:1;
  frameId:'world';
  unit:'m';
  controlBounds:ExperimentBoundaryBounds | null;
  groundZ:number | null;
};
export type ExperimentBoundaryDraft = Record<ExperimentBoundaryKey,string>;
export type BoundaryWorldOffset = { x:number;y:number;z:number };

function objectWithKeys(value:unknown,keys:readonly string[]):value is Record<string,unknown> {
  return typeof value==='object' && value!==null && !Array.isArray(value)
    && Object.keys(value).length===keys.length && keys.every((key) => Object.hasOwn(value,key));
}

export function validateExperimentWorldBoundary(value:unknown):string {
  if (value===null) return '';
  if (!objectWithKeys(value,['schemaVersion','frameId','unit','controlBounds','groundZ'])
    || value.schemaVersion!==1 || value.frameId!=='world' || value.unit!=='m') {
    return 'World boundary requires the current world-frame contract in meters.';
  }
  if (value.groundZ!==null && (typeof value.groundZ!=='number' || !Number.isFinite(value.groundZ))) {
    return 'Ground height must be a finite number in meters or remain unknown.';
  }
  if (value.controlBounds===null) return '';
  if (!objectWithKeys(value.controlBounds,EXPERIMENT_BOUNDARY_KEYS)) {
    return 'Set all six fence endpoints, or explicitly leave the fence unconfigured.';
  }
  const bounds=value.controlBounds;
  for (const axis of ['x','y','z'] as const) {
    const min=bounds[`${axis}Min`], max=bounds[`${axis}Max`];
    if (typeof min!=='number' || typeof max!=='number' || !Number.isFinite(min) || !Number.isFinite(max)) {
      return `Fence ${axis.toUpperCase()} endpoints must be finite numbers in meters.`;
    }
    if (min>=max) return `Fence ${axis.toUpperCase()} minimum must be below its maximum.`;
  }
  return '';
}

export function decodeExperimentWorldBoundary(value:unknown):ExperimentWorldBoundary | null {
  const error=validateExperimentWorldBoundary(value);
  if (error) throw new Error(error);
  if (value===null) return null;
  const source=value as ExperimentWorldBoundary;
  // Canonical property order matches Go; no missing values or old versions are repaired.
  const b=source.controlBounds;
  return {
    schemaVersion:1,frameId:'world',unit:'m',
    controlBounds:b===null ? null : { xMin:b.xMin,xMax:b.xMax,yMin:b.yMin,yMax:b.yMax,zMin:b.zMin,zMax:b.zMax },
    groundZ:source.groundZ,
  };
}

export function cloneExperimentWorldBoundary(value:ExperimentWorldBoundary | null):ExperimentWorldBoundary | null {
  return decodeExperimentWorldBoundary(value);
}

/** Re-express the same physical field in one atomic Experiment document edit. */
export function reexpressExperimentWorldBoundary(
  value:ExperimentWorldBoundary | null,previous:BoundaryWorldOffset,next:BoundaryWorldOffset,
):ExperimentWorldBoundary | null {
  if (![previous.x,previous.y,previous.z,next.x,next.y,next.z].every(Number.isFinite)) {
    throw new Error('World origin must contain finite coordinates.');
  }
  const result=cloneExperimentWorldBoundary(value);
  if (result===null) return null;
  const delta={x:next.x-previous.x,y:next.y-previous.y,z:next.z-previous.z};
  if (![delta.x,delta.y,delta.z].every(Number.isFinite)) throw new Error('World origin translation overflowed.');
  if (result.controlBounds) for (const axis of ['x','y','z'] as const) {
    result.controlBounds[`${axis}Min`] += delta[axis];
    result.controlBounds[`${axis}Max`] += delta[axis];
  }
  if (result.groundZ!==null) result.groundZ += delta.z;
  return decodeExperimentWorldBoundary(result);
}

/**
 * Fence already declared by each robot experiment's scenario, in meters.
 * SCE has no separate fence and uses the shared 15×10×4 m venue.
 * Ground is world Z of that venue, which is where the Lichtblick fence is drawn.
 */
const DECLARED_EXPERIMENT_FENCE: Record<string, ExperimentBoundaryBounds> = {
  'TASE-4UGVs': { xMin:-12,xMax:12,yMin:-7,yMax:7,zMin:-1,zMax:1 },
  '4 Mecanum vehicles experiment': { xMin:-12,xMax:12,yMin:-7,yMax:7,zMin:-1,zMax:1 },
  'TASE-5UAVs': { xMin:-6.9,xMax:6.9,yMin:-4.4,yMax:4.4,zMin:0.2,zMax:2.8 },
  'RAL-5UAVs4UGVs': { xMin:-7.5,xMax:7.5,yMin:-5,yMax:5,zMin:0,zMax:4 },
  SCE: { xMin:-7.5,xMax:7.5,yMin:-5,yMax:5,zMin:0,zMax:4 },
};

export function declaredExperimentWorldBoundary(experimentName: string): ExperimentWorldBoundary | null {
  const controlBounds = DECLARED_EXPERIMENT_FENCE[experimentName];
  if (!controlBounds) return null;
  return { schemaVersion:1,frameId:'world',unit:'m',controlBounds:{ ...controlBounds },groundZ:0 };
}

/** Blank stored fence shows the experiment's own box. An authored box is kept. */
export function presentedExperimentWorldBoundary(
  stored: ExperimentWorldBoundary | null,
  experimentName: string,
): ExperimentWorldBoundary | null {
  const declared = declaredExperimentWorldBoundary(experimentName);
  if (stored?.controlBounds) {
    return stored.groundZ == null && declared ? { ...stored,groundZ:0 } : stored;
  }
  return declared;
}

export function experimentBoundaryDraft(value:ExperimentWorldBoundary | null):ExperimentBoundaryDraft {
  return Object.fromEntries(EXPERIMENT_BOUNDARY_KEYS.map((key) => [key,value?.controlBounds ? String(value.controlBounds[key]) : ''])) as ExperimentBoundaryDraft;
}

/** Blank is not Number('') == 0. Partial ranges fail rather than inventing a site. */
export function parseExperimentBoundaryDraft(draft:ExperimentBoundaryDraft,ground:string):ExperimentWorldBoundary {
  const fields=EXPERIMENT_BOUNDARY_KEYS.map((key) => draft[key].trim());
  const empty=fields.every((field) => field==='');
  if (!empty && fields.some((field) => field==='')) throw new Error('Set all six fence endpoints.');
  const bounds=empty ? null : Object.fromEntries(EXPERIMENT_BOUNDARY_KEYS.map((key) => [key,Number(draft[key])])) as ExperimentBoundaryBounds;
  return decodeExperimentWorldBoundary({schemaVersion:1,frameId:'world',unit:'m',controlBounds:bounds,groundZ:ground.trim()==='' ? null : Number(ground)})!;
}
