import type { PdfPageContent, PdfQuote, SyncTexMap, SyncTexPdfLocation, SyncTexSourceLocation } from '@xgc2/ui-manuscript';

export type ManuscriptProject = {
  entryPoint: string;
  id: string;
  title: string;
};

export type ManuscriptFile = {
  path: string;
  text: string;
};

export type ManuscriptBuild = {
  diagnostics: string[];
  status: 'succeeded' | 'failed';
  usedFixturePdf?: boolean;
};

export type ManuscriptDocument = {
  pages: PdfPageContent[];
  pdfUrl: string;
  source: ManuscriptFile;
  synctex: SyncTexMap;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body.trim() || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listProjects(): Promise<ManuscriptProject[]> {
  return readJson(await fetch('/api/projects'));
}

export async function loadDocument(projectId: string): Promise<ManuscriptDocument> {
  return readJson(await fetch(`/api/projects/${encodeURIComponent(projectId)}`));
}

export async function saveSource(projectId: string, path: string, text: string): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
    { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: text },
  );
  if (!response.ok) throw new Error((await response.text()).trim() || `HTTP ${response.status}`);
}

export async function buildProject(projectId: string): Promise<ManuscriptBuild> {
  return readJson(await fetch(`/api/projects/${encodeURIComponent(projectId)}/build`, { method: 'POST' }));
}

export async function forwardJump(projectId: string, source: SyncTexSourceLocation): Promise<SyncTexPdfLocation | null> {
  const params = new URLSearchParams({ file: source.file, line: String(source.line) });
  return readJson(await fetch(`/api/projects/${encodeURIComponent(projectId)}/synctex/forward?${params}`));
}

export async function inverseJump(projectId: string, pdf: Pick<SyncTexPdfLocation, 'page' | 'x' | 'y'>): Promise<SyncTexSourceLocation | null> {
  const params = new URLSearchParams({ page: String(pdf.page), x: String(pdf.x), y: String(pdf.y) });
  return readJson(await fetch(`/api/projects/${encodeURIComponent(projectId)}/synctex/inverse?${params}`));
}

export function formatQuote(quote: PdfQuote): string {
  return `PDF p.${quote.page}: ${quote.text}`;
}
