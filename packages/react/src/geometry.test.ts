import { describe, expect, it } from 'vitest';
import {
  SIZE_CONTROL_COMPACT_PX,
  SIZE_CONTROL_DEFAULT_PX,
  SPACE_LG_PX,
  SPACE_SM_PX,
  STROKE_THIN_PX,
} from './index';

describe('shared layout geometry', () => {
  it('publishes the v016 control, space and stroke values', () => {
    expect(SIZE_CONTROL_DEFAULT_PX).toBe(32);
    expect(SIZE_CONTROL_COMPACT_PX).toBe(28);
    expect(SPACE_SM_PX).toBe(6);
    expect(SPACE_LG_PX).toBe(12);
    expect(STROKE_THIN_PX).toBe(1);
  });
});
