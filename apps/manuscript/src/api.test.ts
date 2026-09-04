import { describe, expect, it } from 'vitest';
import { formatQuote } from './api';

describe('formatQuote', () => {
  it('prefixes the page so the composer keeps the citation', () => {
    expect(formatQuote({ page: 1, text: 'Fixture manuscript' })).toBe('PDF p.1: Fixture manuscript');
  });
});
