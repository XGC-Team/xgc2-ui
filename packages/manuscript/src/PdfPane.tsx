import { EmptyState } from '@xgc2/ui-react';
import { useEffect, useRef, useState, type HTMLAttributes, type MouseEvent } from 'react';
import { classNames } from './classNames';
import type { SyncTexPdfLocation } from './synctex';

export type PdfPageContent = {
  number: number;
  text: string;
};

export type PdfQuote = {
  page: number;
  text: string;
};

export type PdfPaneProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  dataXgcId?: string;
  dataXgcRole?: string;
  onPdfClick?: (location: SyncTexPdfLocation) => void;
  onQuote?: (quote: PdfQuote) => void;
  pages?: PdfPageContent[] | null;
  pdfUrl?: string;
  revealPage?: number;
  workerSrc?: string;
};

type PdfDocument = {
  destroy: () => Promise<void> | void;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  numPages: number;
};

type PdfPage = {
  getTextContent: () => Promise<unknown>;
  getViewport: (options: { scale: number }) => {
    convertToPdfPoint?: (x: number, y: number) => [number, number] | { 0: number; 1: number };
    height: number;
    width: number;
  };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  streamTextContent?: () => unknown;
};

function PdfJsPage({
  document: pdf,
  onPdfClick,
  pageNumber,
  paneId,
  width,
}: {
  document: PdfDocument;
  onPdfClick?: (location: SyncTexPdfLocation) => void;
  pageNumber: number;
  paneId: string;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    if (width <= 0) return;
    let cancelled = false;
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      const dpr = typeof window === 'undefined' ? 1 : Math.max(window.devicePixelRatio || 1, 1);
      const scale = (width / unscaled.width) * dpr;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textLayer = textRef.current;
      if (!canvas || !textLayer) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;
      setViewportSize({ height: viewport.height / dpr, width: viewport.width / dpr });
      textLayer.replaceChildren();
      const pdfjs = await import('pdfjs-dist') as Record<string, unknown> & {
        TextLayer?: new (options: { container: HTMLElement; textContentSource: unknown; viewport: unknown }) => { render: () => Promise<unknown> };
      };
      textLayer.style.setProperty('--scale-factor', String(scale));
      if (typeof pdfjs.TextLayer === 'function') {
        const layer = new pdfjs.TextLayer({
          container: textLayer,
          textContentSource: page.streamTextContent ? page.streamTextContent() : await page.getTextContent(),
          viewport: viewport as never,
        });
        await layer.render();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdf, width]);

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!onPdfClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onPdfClick({
      height: rect.height,
      page: pageNumber,
      width: rect.width,
      x,
      y: rect.height - y,
    });
  }

  return (
    <article
      className="xgc-manuscript-pdf-page"
      data-page={pageNumber}
      data-xgc-id={`${paneId}:${pageNumber}`}
      data-xgc-role="pdf-page"
      onClick={handleClick}
      style={{ height: viewportSize.height || undefined, width: viewportSize.width || width }}
    >
      <canvas ref={canvasRef} className="xgc-manuscript-pdf-canvas" />
      <div ref={textRef} className="xgc-manuscript-pdf-text-layer" />
    </article>
  );
}

export function PdfPane({
  className,
  dataXgcId = 'pdf-pane',
  dataXgcRole = 'pdf-pane',
  onPdfClick,
  onQuote,
  pages,
  pdfUrl,
  revealPage,
  workerSrc,
  ...props
}: PdfPaneProps) {
  const pageList = pages ?? [];
  const rootRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setPaneWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfUrl) {
      setPdf(null);
      return;
    }
    setPdf(null);
    let cancelled = false;
    let loaded: PdfDocument | undefined;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const task = pdfjs.getDocument({ url: pdfUrl, verbosity: 0 });
        loaded = await task.promise as unknown as PdfDocument;
        if (cancelled) {
          await loaded.destroy();
          return;
        }
        setPdf(loaded);
      } catch {
        if (!cancelled) setPdf(null);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [pdfUrl, workerSrc]);

  useEffect(() => {
    if (!revealPage) return;
    const page = rootRef.current?.querySelector(`[data-xgc-role="pdf-page"][data-page="${revealPage}"]`);
    page?.scrollIntoView({ block: 'nearest' });
  }, [revealPage, pdf]);

  function handleMouseUp() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || !onQuote) return;
    const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const pageNode = anchor?.closest?.('[data-xgc-role="pdf-page"]');
    const page = Number(pageNode?.getAttribute('data-page') ?? '1');
    onQuote({ page: Number.isFinite(page) ? page : 1, text });
  }

  const pageWidth = Math.max(paneWidth - 24, 320);
  const pageNumbers = pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : [];

  return (
    <div
      {...props}
      ref={rootRef}
      aria-label="PDF"
      className={classNames('xgc-manuscript-pdf-pane', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      onMouseUp={handleMouseUp}
    >
      {pdf ? (
        <div className="xgc-manuscript-pdf-scroller">
          {pageNumbers.map((pageNumber) => (
            <PdfJsPage
              key={pageNumber}
              document={pdf}
              onPdfClick={onPdfClick}
              pageNumber={pageNumber}
              paneId={dataXgcId}
              width={pageWidth}
            />
          ))}
        </div>
      ) : pageList.length > 0 ? (
        <div className="xgc-manuscript-pdf-scroller">
          {pageList.map((page) => (
            <article
              key={page.number}
              className="xgc-manuscript-pdf-page xgc-manuscript-pdf-page-plain"
              data-page={page.number}
              data-xgc-id={`${dataXgcId}:${page.number}`}
              data-xgc-role="pdf-page"
              onClick={(event) => {
                if (!onPdfClick) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onPdfClick({
                  height: rect.height,
                  page: page.number,
                  width: rect.width,
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                });
              }}
            >
              <p data-xgc-id={`${dataXgcId}:${page.number}:text`} data-xgc-role="pdf-page-text">
                {page.text}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          appearance="plain"
          data-xgc-id={`${dataXgcId}:empty`}
          data-xgc-role="pdf-empty"
          description="Build the manuscript to render pages here."
          fill
          title="No PDF"
        />
      )}
    </div>
  );
}
