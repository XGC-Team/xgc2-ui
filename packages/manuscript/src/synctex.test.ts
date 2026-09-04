import { describe, expect, it } from 'vitest';
import { forwardSearch, inverseSearch, parseSyncTexCli, type SyncTexMap } from './synctex';

const map: SyncTexMap = {
  forward: [{ file: 'main.tex', line: 8, page: 1, x: 72, y: 72, width: 200, height: 24 }],
  inverse: [{ file: 'main.tex', line: 8, page: 1, x: 72, y: 72 }],
};

describe('synctex', () => {
  it('forwards a source line to a PDF box', () => {
    expect(forwardSearch(map, { file: 'main.tex', line: 8 })).toEqual({
      page: 1, x: 72, y: 72, width: 200, height: 24,
    });
    expect(forwardSearch(map, { file: 'main.tex', line: 99 })).toBeNull();
  });

  it('inversely maps a PDF click to the nearest source line', () => {
    expect(inverseSearch(map, { page: 1, x: 80, y: 70 })).toEqual({ file: 'main.tex', line: 8, column: undefined });
    expect(inverseSearch(map, { page: 2, x: 80, y: 70 })).toBeNull();
  });

  it('parses synctex view/edit CLI output', () => {
    const parsed = parseSyncTexCli(`
This is SyncTeX command line utility
SyncTeX result begin
Output:main.pdf
Page:1
x:72.0
y:720.0
Input:./main.tex
Line:8
SyncTeX result end
`);
    expect(parsed).toEqual({ page: 1, x: 72, y: 720, input: './main.tex', line: 8 });
  });
});
