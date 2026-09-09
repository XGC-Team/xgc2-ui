import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'automation-graph.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

describe('automation graph markable hosts', () => {
  it('lets operators hit edge labels that carry data-xgc-role', () => {
    expect(rule('.automation-edge-label')).toContain('pointer-events: auto;');
    expect(rule('.automation-edge-label')).not.toContain('pointer-events: none');
  });

  it('lets operators hit named port labels without covering the node drag surface', () => {
    expect(rule('.automation-node-output-ports')).toContain('pointer-events: none;');
    expect(rule('.automation-node-output-port')).toContain('pointer-events: none;');
    expect(rule('.automation-node-output-port > span')).toContain('pointer-events: auto;');
  });

  it('paints a transparent hit stroke under the edge owner group', () => {
    expect(rule('.automation-edge-hit')).toContain('stroke: transparent;');
    expect(rule('.automation-edge-hit')).toContain('stroke-width: 20;');
    expect(rule('.automation-edge-hit')).toContain('pointer-events: stroke;');
  });
});
