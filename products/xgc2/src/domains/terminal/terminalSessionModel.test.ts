import { describe, expect, it } from 'vitest';
import { terminalSessionAttention } from './terminalSessionModel';

describe('terminalSessionAttention', () => {
  it('does not paint online', () => {
    expect(terminalSessionAttention({ status: 'online' })).toBeNull();
  });

  it('keeps connecting and closed', () => {
    expect(terminalSessionAttention({ status: 'connecting' })).toEqual({ status: 'connecting' });
    expect(terminalSessionAttention({ status: 'closed' })).toEqual({ status: 'closed' });
  });
});
