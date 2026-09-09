const HYBRID_EXPERIMENT_KEYS = new Set([
  'four-scout',
  'six-px4',
  'five-px4-two-mecanum',
  'six-px4-four-scout',
]);

const CALIBRATION_EXPERIMENT_KEYS = new Set([
  'camera-intrinsic',
]);

const HYBRID_RUN_MODES = new Set(['simulation','physical','hybrid']);
const CALIBRATION_RUN_MODES = new Set(['simulation','physical']);
const CANONICAL_LANE_KEY_PATTERN=/^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

export function fixtureLanePlans(recipes) {
  if (!Array.isArray(recipes) || recipes.length===0) {
    throw new Error('local-fleet fixture recipes are required');
  }
  const keys=new Set();
  const plans=recipes.map((recipe) => {
    const key=canonicalLaneKey(recipe?.key,'fixture key');
    const name=requiredString(recipe?.name,`${key} fixture name`);
    if (keys.has(key)) throw new Error(`duplicate local-fleet fixture key: ${key}`);
    keys.add(key);
    let modePolicy;
    if (HYBRID_EXPERIMENT_KEYS.has(key)) modePolicy='hybrid-required';
    else if (CALIBRATION_EXPERIMENT_KEYS.has(key)) modePolicy='calibration-only';
    else throw new Error(`local-fleet fixture has no declared run-mode policy: ${key}`);
    return Object.freeze({ key,name,modePolicy });
  });
  return [
    ...plans.filter((plan) => plan.modePolicy==='calibration-only'),
    ...plans.filter((plan) => plan.modePolicy!=='calibration-only'),
  ];
}

export function resolveLaneRunModes(plan,experiment) {
  const runModes=validateAuthoredRunModes(experiment?.spec?.runModes,plan.key);
  const expected=plan.modePolicy==='hybrid-required' ? HYBRID_RUN_MODES : CALIBRATION_RUN_MODES;
  if (runModes.length!==expected.size || runModes.some((mode) => !expected.has(mode))) {
    throw new Error(`${plan.key} authored run modes violate ${plan.modePolicy}: ${JSON.stringify(runModes)}`);
  }
  if (plan.modePolicy==='hybrid-required' && !runModes.includes('hybrid')) {
    throw new Error(`${plan.key} must individually declare hybrid`);
  }
  if (plan.modePolicy==='calibration-only' && runModes.includes('hybrid')) {
    throw new Error(`${plan.key} calibration must not declare hybrid`);
  }
  return { ...plan,modes:runModes,experiment };
}

export function parseRequestedLaneKeys(value) {
  if (typeof value!=='string') {
    throw new Error('requested local-fleet lanes must be a comma-separated string');
  }
  if (value.trim()==='') return [];
  const requested=value.split(',').map((rawKey) => {
    const key=rawKey.trim();
    if (key==='') throw new Error('requested local-fleet lane key must not be empty');
    return canonicalLaneKey(key,'requested local-fleet lane key');
  });
  if (new Set(requested).size!==requested.length) {
    throw new Error('requested local-fleet lane keys must be unique');
  }
  return requested;
}

export function filterLanePlansByKeys(lanes,requestedLaneKeys=[]) {
  if (!Array.isArray(lanes) || lanes.length===0) {
    throw new Error('local-fleet lane plans are required');
  }
  if (!Array.isArray(requestedLaneKeys)) {
    throw new Error('requested local-fleet lane keys must be an array');
  }
  const lanesByKey=new Map();
  for (const lane of lanes) {
    const key=canonicalLaneKey(lane?.key,'local-fleet lane key');
    if (lanesByKey.has(key)) throw new Error(`duplicate local-fleet lane key: ${key}`);
    lanesByKey.set(key,lane);
  }
  const requested=requestedLaneKeys.map((key) => (
    canonicalLaneKey(key,'requested local-fleet lane key')
  ));
  if (new Set(requested).size!==requested.length) {
    throw new Error('requested local-fleet lane keys must be unique');
  }
  for (const key of requested) {
    if (!lanesByKey.has(key)) {
      throw new Error(`requested local-fleet lane key was not found: ${key}`);
    }
  }
  if (requested.length===0) return lanes;
  const requestedSet=new Set(requested);
  return lanes.filter((lane) => requestedSet.has(lane.key));
}

export function buildRepeatedModeMatrix(lanes,{ requestedModes=[],repeatRounds=3 }={}) {
  const rounds=validateRepeatRounds(repeatRounds);
  const requested=validateRequestedModes(requestedModes,lanes);
  const requestedSet=new Set(requested);
  const matrix=[];
  for (const lane of lanes) {
    for (const mode of lane.modes) {
      if (requestedSet.size>0 && !requestedSet.has(mode)) continue;
      for (let round=1;round<=rounds;round+=1) {
        matrix.push({ lane,mode,round });
      }
    }
  }
  if (matrix.length===0) throw new Error('local-fleet run-mode matrix is empty');
  return matrix;
}

export function validateRepeatRounds(value) {
  const rounds=typeof value==='number' ? value : Number.parseInt(String(value),10);
  if (!Number.isSafeInteger(rounds) || rounds<3) {
    throw new Error('local-fleet repeat rounds must be at least 3');
  }
  return rounds;
}

function validateRequestedModes(requestedModes,lanes) {
  if (!Array.isArray(requestedModes)) throw new Error('requested run modes must be an array');
  const unique=[...new Set(requestedModes.map((mode) => requiredString(mode,'requested run mode')))];
  if (unique.length!==requestedModes.length) throw new Error('requested run modes must be unique');
  const authored=new Set(lanes.flatMap((lane) => lane.modes));
  for (const mode of unique) {
    if (!authored.has(mode)) throw new Error(`no managed Experiment declares authored run mode ${mode}`);
  }
  return unique;
}

function validateAuthoredRunModes(runModes,key) {
  if (!Array.isArray(runModes) || runModes.length===0) {
    throw new Error(`${key} has no authored spec.runModes`);
  }
  const normalized=runModes.map((mode) => requiredString(mode,`${key} authored run mode`));
  if (new Set(normalized).size!==normalized.length) {
    throw new Error(`${key} authored spec.runModes are not unique`);
  }
  return normalized;
}

function requiredString(value,label) {
  if (typeof value!=='string' || value.trim()==='') throw new Error(`${label} is required`);
  return value.trim();
}

function canonicalLaneKey(value,label) {
  const key=requiredString(value,label);
  if (!CANONICAL_LANE_KEY_PATTERN.test(key)) {
    throw new Error(`${label} is invalid: ${JSON.stringify(key)}`);
  }
  return key;
}
