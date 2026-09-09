import { describe, expect, it } from 'vitest';
import {
  INSTRUMENT_DETAIL_POINTER_GAP,
  placeInstrumentDetailNearPointer,
} from './robotInstrumentDetailPlacement';

describe('placeInstrumentDetailNearPointer', () => {
  it('opens below and to the right of the pointer', () => {
    expect(placeInstrumentDetailNearPointer({
      x: 80, y: 60, width: 160, height: 24, viewportWidth: 1024, viewportHeight: 768,
    })).toEqual({
      left: 80 + INSTRUMENT_DETAIL_POINTER_GAP,
      top: 60 + INSTRUMENT_DETAIL_POINTER_GAP,
    });
  });

  it('flips above and to the left when the pointer is in the far corner', () => {
    expect(placeInstrumentDetailNearPointer({
      x: 1000, y: 750, width: 160, height: 80, viewportWidth: 1024, viewportHeight: 768,
    })).toEqual({
      left: 1000 - INSTRUMENT_DETAIL_POINTER_GAP - 160,
      top: 750 - INSTRUMENT_DETAIL_POINTER_GAP - 80,
    });
  });
});
