/* global URL */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildRepeatedModeMatrix,
  filterLanePlansByKeys,
  fixtureLanePlans,
  parseRequestedLaneKeys,
  resolveLaneRunModes,
  validateRepeatRounds,
} from './six-experiments-mode-matrix.mjs';

const fixtureRecipes=JSON.parse(readFileSync(
  new URL('../../local-fleet-lab/experiment-fixture-recipes.json',import.meta.url),'utf8',
)).recipes;

function resolvedLanes() {
  return fixtureLanePlans(fixtureRecipes).map((plan) => resolveLaneRunModes(plan,{
    head:{ resourceId:`generated-${plan.key}` },
    spec:{
      runModes:plan.modePolicy==='hybrid-required'
        ? ['simulation','physical','hybrid']
        : ['simulation','physical'],
    },
  }));
}

test('discovers every repeated matrix cell from authored Experiment runModes',() => {
  const lanes=resolvedLanes();
  const matrix=buildRepeatedModeMatrix(lanes,{ repeatRounds:3 });
  assert.equal(matrix.length,42);
  assert.equal(lanes[0].key,'camera-intrinsic');
  assert.ok(matrix.slice(0,6).every((cell) => cell.lane.key==='camera-intrinsic'));
  for (const lane of lanes) {
    const cells=matrix.filter((cell) => cell.lane.key===lane.key);
    assert.deepEqual([...new Set(cells.map((cell) => cell.mode))],lane.modes);
    for (const mode of lane.modes) {
      assert.deepEqual(cells.filter((cell) => cell.mode===mode).map((cell) => cell.round),[1,2,3]);
    }
  }
});

test('requires hybrid on each fleet and forbids it on calibration',() => {
  const plans=fixtureLanePlans(fixtureRecipes);
  for (const plan of plans.filter((candidate) => candidate.modePolicy==='hybrid-required')) {
    assert.throws(() => resolveLaneRunModes(plan,{ spec:{ runModes:['simulation','physical'] } }),/hybrid-required/);
  }
  for (const plan of plans.filter((candidate) => candidate.modePolicy==='calibration-only')) {
    assert.throws(() => resolveLaneRunModes(plan,{ spec:{ runModes:['simulation','physical','hybrid'] } }),/calibration-only/);
  }
});

test('keeps filtering generic and repeat rounds at least three',() => {
  const lanes=resolvedLanes();
  const hybrid=buildRepeatedModeMatrix(lanes,{ requestedModes:['hybrid'],repeatRounds:4 });
  assert.equal(hybrid.length,16);
  assert.ok(hybrid.every((cell) => cell.mode==='hybrid' && cell.lane.modePolicy==='hybrid-required'));
  assert.throws(() => buildRepeatedModeMatrix(lanes,{ requestedModes:['unknown'],repeatRounds:3 }),/no managed Experiment/);
  assert.equal(validateRepeatRounds('3'),3);
  assert.throws(() => validateRepeatRounds(2),/at least 3/);
});

test('filters by canonical opaque lane keys without weakening selected mode rounds',() => {
  const lanes=resolvedLanes();
  const requested=[lanes.at(-1).key,lanes[0].key];
  const selected=filterLanePlansByKeys(lanes,requested);
  assert.deepEqual(selected.map(({ key }) => key),lanes
    .filter(({ key }) => requested.includes(key))
    .map(({ key }) => key));
  const matrix=buildRepeatedModeMatrix(selected,{ repeatRounds:3 });
  assert.equal(matrix.length,selected.reduce((total,lane) => total+lane.modes.length*3,0));
  for (const lane of selected) {
    for (const mode of lane.modes) {
      assert.deepEqual(matrix
        .filter((cell) => cell.lane.key===lane.key && cell.mode===mode)
        .map(({ round }) => round),[1,2,3]);
    }
  }
});

test('empty lane filter keeps the full plan and malformed requests fail closed',() => {
  const lanes=resolvedLanes();
  assert.deepEqual(parseRequestedLaneKeys(''),[]);
  assert.deepEqual(parseRequestedLaneKeys('   '),[]);
  assert.strictEqual(filterLanePlansByKeys(lanes,[]),lanes);

  const first=lanes[0].key;
  const second=lanes[1].key;
  assert.deepEqual(parseRequestedLaneKeys(` ${first} , ${second} `),[first,second]);
  assert.throws(() => parseRequestedLaneKeys(`${first},${first}`),/must be unique/);
  assert.throws(() => parseRequestedLaneKeys(`${first},,${second}`),/must not be empty/);
  assert.throws(() => parseRequestedLaneKeys(`${first},`),/must not be empty/);
  assert.throws(() => parseRequestedLaneKeys(`${first},bad\u0000key`),/is invalid/);
  assert.throws(() => parseRequestedLaneKeys('bad lane'),/is invalid/);
  assert.throws(() => parseRequestedLaneKeys('1bad-lane'),/is invalid/);
  assert.throws(() => parseRequestedLaneKeys(`a${'x'.repeat(64)}`),/is invalid/);
  assert.throws(() => parseRequestedLaneKeys(null),/comma-separated string/);

  let absent='absent-lane';
  const authoredKeys=new Set(lanes.map(({ key }) => key));
  while (authoredKeys.has(absent)) absent=`${absent}-x`;
  assert.throws(() => filterLanePlansByKeys(lanes,[absent]),/was not found/);
  assert.throws(() => filterLanePlansByKeys(lanes,[first,first]),/must be unique/);
  assert.throws(() => filterLanePlansByKeys(lanes,['bad lane']),/is invalid/);
  assert.throws(() => fixtureLanePlans([{ key:'1bad-lane',name:'Invalid fixture' }]),/is invalid/);
});
