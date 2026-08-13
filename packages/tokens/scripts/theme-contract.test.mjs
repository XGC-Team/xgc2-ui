import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACHROMATIC_MAX_CHANNEL_DELTA,
  assertAchromatic,
  assertAchromaticChannels,
  assertRestrictedNeutralMaterialSyntax,
  literalRgbColors,
} from './theme-contract.mjs';

test('accepts neutral-white foundations with only imperceptible channel drift', () => {
  assert.doesNotThrow(() => assertAchromatic('#f4f4f4', 'light app'));
  assert.doesNotThrow(() => assertAchromatic('#f5f5f4', 'light app'));
  assert.equal(ACHROMATIC_MAX_CHANNEL_DELTA, 2);
});

test('rejects both the withdrawn blue-grey and warm beige foundations', () => {
  assert.throws(
    () => assertAchromatic('#f4f6fa', 'light app'),
    /chromatically biased/,
  );
  assert.throws(
    () => assertAchromatic('#f2eee7', 'light app'),
    /chromatically biased/,
  );
});

test('inspects hex and alpha literals inside gradients and shadows', () => {
  const colors = literalRgbColors(
    'linear-gradient(#ffffff, #f7f7f7), 0 8px 24px rgba(20, 20, 20, 0.1)',
  );
  assert.deepEqual(colors.map(({ channels }) => channels), [
    [255, 255, 255],
    [247, 247, 247],
    [20, 20, 20],
  ]);
  for (const { channels, literal } of colors) {
    assert.doesNotThrow(() => assertAchromaticChannels(channels, literal));
  }
  assert.throws(
    () => assertAchromaticChannels([39, 31, 24], 'legacy brown shadow'),
    /chromatically biased/,
  );
});

test('normalizes every supported CSS hex and RGB literal form', () => {
  assert.deepEqual(
    literalRgbColors('#fff #ffff #ffffff #ffffffff rgb(244 244 244 / .9) rgba(20, 20, 20, .1)')
      .map(({ channels }) => channels),
    [
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [244, 244, 244],
      [20, 20, 20],
    ],
  );
});

test('rejects color syntax that could evade the achromatic material gate', () => {
  for (const value of [
    'linear-gradient(#ffe, #fff)',
    'linear-gradient(#fffaf0dd, #fff)',
    'rgb(255 250 240 / .9)',
  ]) {
    const colors = literalRgbColors(value);
    assert.throws(
      () => colors.forEach(({ channels, literal }) => assertAchromaticChannels(channels, literal)),
      /chromatically biased/,
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
