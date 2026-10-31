import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildGeometry, GEOMETRY_TOKENS } from './geometry.mjs';

const v016 = await readFile(new URL('../src/v016.css', import.meta.url), 'utf8');

test('geometry companions export the effective v016 control, space and stroke values', () => {
  const { module, types } = buildGeometry(v016);
  assert.deepEqual(
    [...GEOMETRY_TOKENS.values()],
    ['SIZE_HEADER_PANEL_PX', 'SIZE_CONTROL_DEFAULT_PX', 'SIZE_CONTROL_COMPACT_PX', 'SPACE_SM_PX', 'SPACE_LG_PX', 'STROKE_THIN_PX'],
  );
  for (const [name, value] of [
    ['SIZE_HEADER_PANEL_PX', '38'],
    ['SIZE_CONTROL_DEFAULT_PX', '32'],
    ['SIZE_CONTROL_COMPACT_PX', '28'],
    ['SPACE_SM_PX', '6'],
    ['SPACE_LG_PX', '12'],
    ['STROKE_THIN_PX', '1'],
  ]) {
    assert.match(module, new RegExp(`export const ${name} = ${value};`));
    assert.match(types, new RegExp(`export declare const ${name} = ${value};`));
  }
  assert.doesNotMatch(module, /ROBOT|FLOOR|PANEL_MIN/);
});

test('geometry generation refuses a missing or non-px source token', () => {
  assert.throws(
    () => buildGeometry(v016.replace('--space-sm: 6px;', '--space-sm: 0.5rem;')),
    /--space-sm must declare a px value/,
  );
  assert.throws(
    () => buildGeometry(v016.replace('--size-control-default: 32px;', '')),
    /--size-control-default must declare a px value/,
  );
});
