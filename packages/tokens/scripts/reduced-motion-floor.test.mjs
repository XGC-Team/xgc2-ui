import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const baseCss = await readFile(new URL('../src/base.css', import.meta.url), 'utf8');
const floor = baseCss.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);

test('reduced-motion floor honors the animation-duration opt-out with the same default', () => {
  assert.ok(floor, 'base.css must keep the global reduced-motion floor');
  assert.match(floor[1], /\*,\s*\n\s*\*::before,\s*\n\s*\*::after/);
  assert.ok(
    floor[1].includes(
      'animation-duration: var(--xgc-reduced-motion-animation-duration, 0.01ms) !important;',
    ),
    'animation-duration must read the opt-out variable and keep the 0.01ms default',
  );
});

test('reduced-motion floor leaves the sibling declarations untouched', () => {
  assert.ok(floor, 'base.css must keep the global reduced-motion floor');
  assert.ok(floor[1].includes('scroll-behavior: auto !important;'));
  assert.ok(floor[1].includes('transition-duration: 0.01ms !important;'));
  assert.ok(floor[1].includes('animation-iteration-count: 1 !important;'));
  assert.doesNotMatch(floor[1], /transition-duration: var\(/);
  assert.doesNotMatch(floor[1], /animation-iteration-count: var\(/);
});
