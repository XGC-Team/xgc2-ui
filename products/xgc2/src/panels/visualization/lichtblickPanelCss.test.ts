import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/lichtblick-panel.css'),'utf8');

describe('Lichtblick panel CSS contract',() => {
  it('isolates the embedded workspace from intrinsic-size feedback during sidebar resize',() => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(css).toContain('contain: layout paint;');
    expect(css).toContain('min-inline-size: 0;');
    expect(css).toContain('max-inline-size: 100%;');
    expect(css).not.toMatch(/ResizeObserver|setInterval|setTimeout|requestAnimationFrame/);
  });

  it('keeps parked workflow and viewer surfaces mutually exclusive without JS resize writeback',() => {
    expect(css).toContain('.lichtblick-workspace > .lichtblick-frame[hidden],');
    expect(css).toContain('.lichtblick-workspace > .lichtblick-workflow-slot[hidden]');
    expect(css).toContain('display: none;');
  });

  it('skips parked workspace paint without blanking the iframe src',() => {
    expect(css).toContain('.lichtblick-workspace[data-xgc-parked="true"]');
    expect(css).toContain('content-visibility: hidden;');
    expect(css).not.toMatch(/about:blank/);
  });
});
