import { describe,expect,it } from 'vitest';
import { controlActionGridStyle } from './controlActionGrid';

describe('controlActionGridStyle', () => {
  it('publishes density and place columns for the shared CSS grid', () => {
    const style = controlActionGridStyle({ itemCount: 6,maxColumns: 4 });
    expect(style).toMatchObject({
      '--control-density-cols': 4,
      '--control-cols': 4,
      '--control-rows': 2,
      '--control-narrow-cols': 2,
      '--control-stacked-rows': 6,
    });
  });

  it('keeps density at 4 when only one action is bound so tile size matches neighbours', () => {
    const style = controlActionGridStyle({ itemCount: 1,maxColumns: 4 });
    expect(style['--control-density-cols']).toBe(4);
    expect(style['--control-cols']).toBe(1);
    expect(style['--control-rows']).toBe(1);
  });
});
