/** SyncTeX locations. Shape matches the LaTeX Workshop view/edit protocol, not the VS Code extension. */

export type SyncTexSourceLocation = {
  column?: number;
  file: string;
  line: number;
};

export type SyncTexPdfLocation = {
  height?: number;
  page: number;
  width?: number;
  x: number;
  y: number;
};

export type SyncTexForwardHit = SyncTexPdfLocation & {
  file: string;
  line: number;
};

export type SyncTexInverseHit = SyncTexSourceLocation & {
  page: number;
  x: number;
  y: number;
};

export type SyncTexMap = {
  forward: SyncTexForwardHit[];
  inverse: SyncTexInverseHit[];
};

export function forwardSearch(map: SyncTexMap, source: SyncTexSourceLocation): SyncTexPdfLocation | null {
  const hits = map.forward.filter((hit) => hit.file === source.file && hit.line === source.line);
  const hit = hits[0];
  if (!hit) return null;
  return { page: hit.page, x: hit.x, y: hit.y, width: hit.width, height: hit.height };
}

export function inverseSearch(map: SyncTexMap, pdf: Pick<SyncTexPdfLocation, 'page' | 'x' | 'y'>): SyncTexSourceLocation | null {
  const samePage = map.inverse.filter((hit) => hit.page === pdf.page);
  let best = samePage[0];
  if (!best) return null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hit of samePage) {
    const distance = (hit.x - pdf.x) ** 2 + (hit.y - pdf.y) ** 2;
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return { file: best.file, line: best.line, column: best.column };
}

/** Parse `synctex view` / `synctex edit` stdout used by LaTeX Workshop. */
export function parseSyncTexCli(output: string): { page?: number; x?: number; y?: number; input?: string; line?: number } {
  const values: { page?: number; x?: number; y?: number; input?: string; line?: number } = {};
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    const split = line.indexOf(':');
    if (split <= 0) continue;
    const key = line.slice(0, split).toLowerCase();
    const value = line.slice(split + 1).trim();
    if (key === 'page') values.page = Number(value);
    else if (key === 'x') values.x = Number(value);
    else if (key === 'y') values.y = Number(value);
    else if (key === 'input' || key === 'file') values.input = value;
    else if (key === 'line') values.line = Number(value);
  }
  return values;
}
