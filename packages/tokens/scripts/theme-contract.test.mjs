import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WARM_MAX_RED_BIAS,
  assertNotWarm,
  assertNotWarmChannels,
  assertRestrictedNeutralMaterialSyntax,
  literalRgbColors,
} from './theme-contract.mjs';

test('accepts cool blue-grey and neutral-white light foundations', () => {
  assert.doesNotThrow(() => assertNotWarm('#f4f6fa', 'light app'));
  assert.doesNotThrow(() => assertNotWarm('#f8fafc', 'light sidebar'));
  assert.doesNotThrow(() => assertNotWarm('#ffffff', 'light surface'));
  assert.doesNotThrow(() => assertNotWarm('#f4f4f4', 'light app'));
  assert.equal(WARM_MAX_RED_BIAS, 2);
});

test('rejects warm beige light foundations', () => {
  assert.throws(
    () => assertNotWarm('#f2eee7', 'light app'),
    /warm-biased/,
  );
  assert.throws(
    () => assertNotWarm('#fffdf9', 'light chrome'),
    /warm-biased/,
  );
});

test('inspects hex and alpha literals inside gradients and shadows', () => {
  const colors = literalRgbColors(
    'linear-gradient(#ffffff, #f4f6fa), 0 8px 24px rgba(15, 23, 42, 0.1)',
  );
  assert.deepEqual(colors.map(({ channels }) => channels), [
    [255, 255, 255],
    [244, 246, 250],
    [15, 23, 42],
  ]);
  for (const { channels, literal } of colors) {
    assert.doesNotThrow(() => assertNotWarmChannels(channels, literal));
  }
  assert.throws(
    () => assertNotWarmChannels([39, 31, 24], 'legacy brown shadow'),
    /warm-biased/,
  );
});

test('normalizes every supported CSS hex and RGB literal form', () => {
  assert.deepEqual(
    literalRgbColors('#fff #ffff #ffffff #ffffffff rgb(244 246 250 / .9) rgba(15, 23, 42, .1)')
      .map(({ channels }) => channels),
    [
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [244, 246, 250],
      [15, 23, 42],
    ],
  );
});

test('rejects color syntax that could evade the cool-or-neutral material gate', () => {
  for (const value of [
    'linear-gradient(#ffe, #fff)',
    'linear-gradient(#fffaf0dd, #fff)',
    'rgb(255 250 240 / .9)',
  ]) {
    const colors = literalRgbColors(value);
    assert.throws(
      () => colors.forEach(({ channels, literal }) => assertNotWarmChannels(channels, literal)),
      /warm-biased/,
    );
  }
  for (const value of ['oklch(96% 0.04 80)', 'hsl(40 60% 96%)', 'beige']) {
    assert.throws(
      () => assertRestrictedNeutralMaterialSyntax(value, 'light surface'),
      /unsupported color or material syntax/,
    );
  }
  for (const value of [
    'linear-gradient(var(--color-accent), var(--color-accent))',
    'linear-gradient(var(--color-bg-danger), var(--color-bg-success))',
  ]) {
    assert.throws(
      () => assertRestrictedNeutralMaterialSyntax(value, 'light surface'),
      /unapproved material variable/,
    );
  }
  assert.doesNotThrow(() => assertRestrictedNeutralMaterialSyntax(
    '0 12px 28px var(--color-shadow-overlay)',
    'light floating shadow',
    new Set(['--color-shadow-overlay']),
  ));
  assert.doesNotThrow(() => assertRestrictedNeutralMaterialSyntax(
    '0 0 0 var(--stroke-thin) color-mix(in srgb, var(--color-border-focus) 28%, transparent)',
    'light focus shadow',
    new Set(['--stroke-thin', '--color-border-focus']),
  ));
  assert.throws(
    () => assertRestrictedNeutralMaterialSyntax(
      'linear-gradient(var(--color-border-focus), #ffffff)',
      'light application material',
    ),
    /unapproved material variable: --color-border-focus/,
  );
});
