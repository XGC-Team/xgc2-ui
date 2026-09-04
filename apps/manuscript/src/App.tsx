import {
  ManuscriptSplit,
  PdfPane,
  QuoteChip,
  SourceEditor,
  type PdfQuote,
  type SourceCursor,
} from '@xgc2/ui-manuscript';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AppShell,
  Button,
  ConversationComposer,
  Inline,
  Notice,
  Panel,
  ProductBrand,
  SelectMenu,
  Topbar,
} from '@xgc2/ui-react';
import { useCallback, useEffect, useState } from 'react';
import {
  buildProject,
  formatQuote,
  forwardJump,
  inverseJump,
  listProjects,
  loadDocument,
  saveSource,
  type ManuscriptProject,
} from './api';

export function App() {
  const [projects, setProjects] = useState<ManuscriptProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sourcePath, setSourcePath] = useState('main.tex');
  const [source, setSource] = useState('');
  const [pages, setPages] = useState<{ number: number; text: string }[]>([]);
  const [pdfUrl, setPdfUrl] = useState('');
  const [cursor, setCursor] = useState<SourceCursor | undefined>();
  const [revealPage, setRevealPage] = useState<number | undefined>();
  const [quote, setQuote] = useState<PdfQuote | null>(null);
  const [composer, setComposer] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (id: string) => {
    const document = await loadDocument(id);
    setSourcePath(document.source.path);
    setSource(document.source.text);
    setPages(document.pages ?? []);
    setPdfUrl(document.pdfUrl ?? '');
    setQuote(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await listProjects();
        if (cancelled) return;
        setProjects(next);
        const initial = next.find((project) => project.id === 'paper-fixture')?.id ?? next[0]?.id ?? '';
        setProjectId(initial);
        if (initial) await refresh(initial);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function onProjectChange(id: string) {
    setProjectId(id);
    setError('');
    try {
      await refresh(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onBuild() {
    if (!projectId || busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await saveSource(projectId, sourcePath, source);
      const result = await buildProject(projectId);
      await refresh(projectId);
      setStatus(result.status);
      if (result.status === 'failed') setError(result.diagnostics.join('\n') || 'Build failed');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function onCursorChange(next: SourceCursor) {
    setCursor(next);
    if (!projectId) return;
    try {
      const hit = await forwardJump(projectId, { file: sourcePath, line: next.line });
      if (hit) setRevealPage(hit.page);
    } catch {
      /* jump is best-effort */
    }
  }

  async function onPdfClick(location: { page: number; x: number; y: number }) {
    if (!projectId) return;
    try {
      const hit = await inverseJump(projectId, location);
      if (hit) setCursor({ line: hit.line, column: hit.column ?? 1 });
    } catch {
      /* jump is best-effort */
    }
  }

  return (
    <div className="manuscript-app" data-xgc-id="manuscript-workspace" data-xgc-role="manuscript-workspace">
      <AppShell
        contentClassName="manuscript-shell-content"
        contentPadding="none"
        height="parent"
        topbar={(
          <Topbar
            brand={<ProductBrand product="Manuscript" />}
            actions={(
              <Inline gap="compact">
                <SelectMenu
                  ariaLabel="Manuscript project"
                  dataXgcId="manuscript-project"
                  dataXgcRole="manuscript-project"
                  onValueChange={onProjectChange}
                  options={projects.map((project) => ({ label: project.title, value: project.id }))}
                  uiSize="compact"
                  value={projectId}
                />
                <Button
                  aria-busy={busy || undefined}
                  data-xgc-id="manuscript-build"
                  data-xgc-role="manuscript-build"
                  disabled={busy || !projectId}
                  onClick={() => void onBuild()}
                  tone="primary"
                  uiSize="compact"
                >
                  Build
                </Button>
                {status ? (
                  <span data-xgc-id="manuscript-build-status" data-xgc-role="manuscript-build-status">
                    {status}
                  </span>
                ) : null}
              </Inline>
            )}
          />
        )}
      >
        <div className="manuscript-workspace">
          {error ? <Notice heading="Build" tone="danger">{error}</Notice> : null}
          <ManuscriptSplit
            pdf={(
              <Panel
                bodyLayout="column"
                fill
                headerProps={{ 'data-xgc-id': 'pdf-pane-header', 'data-xgc-role': 'pdf-pane-header' }}
                padding="none"
                title="PDF"
              >
                <PdfPane
                  key={pdfUrl || 'empty-pdf'}
                  onPdfClick={(location) => void onPdfClick(location)}
                  onQuote={setQuote}
                  pages={pages}
                  pdfUrl={pdfUrl}
                  revealPage={revealPage}
                  workerSrc={pdfWorker}
                />
              </Panel>
            )}
            source={(
              <Panel
                bodyLayout="column"
                fill
                headerProps={{ 'data-xgc-id': 'source-editor-header', 'data-xgc-role': 'source-editor-header' }}
                padding="none"
                title="Source"
              >
                <SourceEditor
                  cursor={cursor}
                  onCursorChange={(next) => void onCursorChange(next)}
                  onValueChange={setSource}
                  value={source}
                />
              </Panel>
            )}
          />
          <div className="manuscript-composer-slot">
            <ConversationComposer
              actions={quote ? (
                <QuoteChip
                  onSend={(next) => {
                    setComposer((current) => (current ? `${current}\n${formatQuote(next)}` : formatQuote(next)));
                    setQuote(null);
                  }}
                  quote={quote}
                />
              ) : null}
              data-xgc-id="manuscript-composer"
              data-xgc-role="manuscript-composer"
              label="Send quote"
              onSubmitMessage={() => undefined}
              onValueChange={setComposer}
              placeholder="PDF quotes land here"
              submitLabel="Keep"
              value={composer}
            />
          </div>
        </div>
      </AppShell>
    </div>
  );
}
