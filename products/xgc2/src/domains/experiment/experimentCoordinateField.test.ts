import { describe, expect, it } from 'vitest';
import { coordinateFieldNumber, coordinateFieldText } from './experimentCoordinateField';

describe('coordinate field precision', () => {
  it('shows at most two decimal places and drops non-finite values', () => {
    expect(coordinateFieldText(12.345678)).toBe('12.35');
    expect(coordinateFieldText(1.23456789)).toBe('1.23');
    expect(coordinateFieldText(0.181)).toBe('0.18');
    expect(coordinateFieldText(-4)).toBe('-4');
    expect(coordinateFieldText(Number.NaN)).toBe('');
    expect(coordinateFieldText(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('stores an edit at the same two-decimal precision', () => {
    expect(coordinateFieldNumber('1.239')).toBe(1.24);
    expect(coordinateFieldNumber('2.5')).toBe(2.5);
    expect(coordinateFieldNumber('')).toBeNaN();
    expect(coordinateFieldNumber('nope')).toBeNaN();
  });
});
