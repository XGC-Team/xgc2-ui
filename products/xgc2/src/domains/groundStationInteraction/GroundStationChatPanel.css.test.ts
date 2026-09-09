import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'GroundStationChatPanel.css'), 'utf8');
const localComposerSelector = '[data-xgc-role="ground-station-chat-footer"] > [data-xgc-role="ground-station-chat-composer"][data-xgc-id="local"]';

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing rule ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector}`);
  return css.slice(open + 1, close);
}

describe('ground station local composer separator contract', () => {
  it('removes only the domain composer top border through stable owner selectors', () => {
    const body = ruleBody(localComposerSelector);

    expect(body.replace(/\s+/g, '')).toBe('border-top:0;');
    expect(body).not.toMatch(/margin[^:]*:\s*-/);
    expect(body).not.toMatch(/background(?:-color)?\s*:/);
    expect(css).not.toMatch(/data-xgc-role=["']ground-station-chat-(?:footer|composer)["'][^{]*::(?:before|after)/);
  });
});
