import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'GroundStationChatDecision.css'), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing rule ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector}`);
  return css.slice(open + 1, close);
}

describe('ground station authorization request surface', () => {
  it('inherits authorization materials from the shared DecisionCard', () => {
    expect(ruleBody('.xgc-ground-station-decision-message')).toContain('color: var(--xgc-decision-fg)');
    expect(css).not.toMatch(/--xgc-decision-(?:bg|fg)\s*:/);
    expect(css).not.toMatch(/background\s*:/);
    expect(css).not.toMatch(/xgc-ground-station-decision-provenance/);
  });

  it('does not invert operator receipts or other timeline copy', () => {
    expect(ruleBody('.xgc-ground-station-response-values')).not.toMatch(/--color-bg-primary|--color-text-inverse/);
    expect(ruleBody('.xgc-ground-station-response-field')).not.toMatch(/--color-bg-primary|--color-text-inverse/);
    expect(css).not.toMatch(/ground-station-chat-operator-response[^{]*\{[^}]*--color-bg-primary/);
    expect(css).not.toMatch(/xgc-conversation-message[^{]*\{[^}]*--color-bg-primary/);
  });
});
