import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePixelSamples } from './lichtblick-browser-evidence-support.mjs';

test('dynamic canvas proof requires repeated distinct pixel transitions',() => {
  const proof = summarizePixelSamples([
    { hash:'a' },{ hash:'b' },{ hash:'c' },
  ]);
  assert.equal(proof.dynamic,true);
  assert.equal(proof.transitions,2);
  assert.equal(proof.uniqueHashes,3);
  assert.equal(proof.beforeHash,'a');
  assert.equal(proof.afterHash,'c');
});

test('one late render transition is not accepted as dynamic canvas proof',() => {
  const proof = summarizePixelSamples([
    { hash:'grid' },{ hash:'grid' },{ hash:'robot' },{ hash:'robot' },
  ]);
  assert.equal(proof.dynamic,false);
  assert.equal(proof.transitions,1);
  assert.equal(proof.uniqueHashes,2);
});

test('alternating two unrelated states is not accepted as advancing 3D proof',() => {
  const proof = summarizePixelSamples([
    { hash:'a' },{ hash:'b' },{ hash:'a' },
  ]);
  assert.equal(proof.dynamic,false);
  assert.equal(proof.transitions,2);
  assert.equal(proof.uniqueHashes,2);
});
