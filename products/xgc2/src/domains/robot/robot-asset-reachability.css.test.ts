import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'robot-asset-reachability.css'),
  'utf8',
);

describe('robot asset reachability chrome', () => {
  it('styles the shared Wifi button by class, not by catalog or overlay role', () => {
    expect(css).toContain('.robot-asset-reachability[data-xgc-state="success"]');
    expect(css).toContain('.robot-asset-reachability[data-xgc-state="danger"]');
    expect(css).not.toContain('robot-asset-connectivity');
    expect(css).not.toContain('robot-instrument-detail-ping');
  });
});
