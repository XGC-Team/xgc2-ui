import { describe,expect,it } from 'vitest';
import { defineHostSystemComposition,type HostSystemLeafComponent } from './hostSystemComposition';

const Processes: HostSystemLeafComponent<'Processes'> = () => null;

// The directive is a compile gate: removing the slot brand must fail typecheck.
// @ts-expect-error A Processes leaf cannot be wired into the Network slot.
const invalidComposition = defineHostSystemComposition({ Network: Processes });
void invalidComposition;

describe('hostSystemComposition', () => {
  it('freezes a named static leaf graph without runtime feature metadata', () => {
    const composition = defineHostSystemComposition({ Processes });

    expect(Object.isFrozen(composition)).toBe(true);
    expect(composition).toEqual({ Processes });
    expect(Object.keys(Processes)).toEqual([]);
  });
});
