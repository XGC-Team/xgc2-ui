import { useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';
import { CodeBlock } from './DataDisplay';

type MarkdownSegment =
  | { type: 'code'; content: string; language: string }
  | { type: 'html'; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeLink(label: string, value: string): string {
  const decoded = value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try {
    const url = new URL(decoded);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  } catch {
    return `<span class="xgc-markdown-reference">${label} <code>${value}</code></span>`;
  }
}

function inlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label: string, url: string) => safeLink(label, url));
}

function markdownHtml(source: string): string {
  const escaped = escapeHtml(source.replace(/<!--[\s\S]*?-->/g, ''));
  const output: string[] = [];
  const listStack: Array<{ indent: number; type: 'ol' | 'ul' }> = [];
  let tableRows: string[] = [];

  const closeLists = (indent = -1) => {
    while (listStack.length && listStack[listStack.length - 1]!.indent > indent) {
      output.push(`</${listStack.pop()!.type}>`);
    }
  };
  const splitTableRow = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  const isDividerCell = (cell: string) => /^:?-{3,}:?$/.test(cell);
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.map((source) => ({ source, cells: splitTableRow(source) }));
    const columnCount = rows[0]?.cells.length ?? 0;
    const divider = rows[1];
    const hasHeading = Boolean(divider && divider.cells.length === columnCount && divider.cells.every(isDividerCell));
    const malformedDivider = Boolean(divider?.cells.some(isDividerCell) && !hasHeading);
    const dataRows = hasHeading ? rows.filter((_row, index) => index !== 1) : rows;
    const validStructure = rows.length >= 2
      && columnCount >= 2
      && !malformedDivider
      && dataRows.every((row) => row.cells.length === columnCount);

    if (!validStructure) {
      output.push(...tableRows.map((row) => `<p>${inlineMarkdown(row)}</p>`));
      tableRows = [];
      return;
    }

    output.push('<table>');
    if (hasHeading) {
      output.push(`<thead><tr>${rows[0]!.cells.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>`);
    }
    const body = hasHeading ? rows.slice(2) : rows;
    output.push(`<tbody>${body.map((row) => `<tr>${row.cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    tableRows = [];
  };

  for (const line of escaped.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeLists();
      tableRows.push(line);
      continue;
    }
    flushTable();
    const list = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (list) {
      const indent = list[1]!.replace(/\t/g, '  ').length;
      const type = /^\d/.test(list[2]!) ? 'ol' : 'ul';
      const current = listStack.at(-1);
      if (!current || current.indent < indent) {
        output.push(`<${type}>`);
        listStack.push({ indent, type });
      } else {
        closeLists(indent);
        const sameDepth = listStack.at(-1);
        if (sameDepth && sameDepth.type !== type) {
          output.push(`</${sameDepth.type}>`);
          listStack.pop();
          output.push(`<${type}>`);
          listStack.push({ indent, type });
        }
      }
      const task = list[3]!.match(/^\s*\[( |x|X)\]\s+(.*)$/);
      output.push(task
        ? `<li class="xgc-markdown-task"><input type="checkbox" disabled${task[1]!.toLowerCase() === 'x' ? ' checked' : ''}> ${inlineMarkdown(task[2]!)}</li>`
        : `<li>${inlineMarkdown(list[3]!)}</li>`);
      continue;
    }
    closeLists();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      output.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
    } else if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      output.push('<hr>');
    } else if (line.startsWith('&gt; ')) {
      output.push(`<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`);
    } else if (line.trim()) {
      output.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeLists();
  flushTable();
  return output.join('');
}

function markdownSegments(source: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const fence = /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;
  let cursor = 0;
  for (const match of source.matchAll(fence)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      const html = markdownHtml(source.slice(cursor, index));
      if (html) segments.push({ type: 'html', html });
    }
    segments.push({
      type: 'code',
      language: match[1]?.trim().toLowerCase() || 'text',
      content: (match[2] ?? '').replace(/\n$/, ''),
    });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) {
    const html = markdownHtml(source.slice(cursor));
    if (html) segments.push({ type: 'html', html });
  }
  return segments;
}

type SharedCodeLanguage = 'bash' | 'json' | 'shell' | 'text';

function sharedLanguage(language: string): SharedCodeLanguage {
  if (language === 'bash' || language === 'json') return language;
  if (['console', 'fish', 'sh', 'shell', 'zsh'].includes(language)) return 'shell';
  return 'text';
}

export type MarkdownContentProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  codeCopyLabel?: string;
  codeCopySuccessLabel?: string;
  density?: 'compact' | 'document';
  emptyContent?: ReactNode;
  source?: string;
};

/** Sanitized Markdown document renderer using the shared, theme-aware CodeBlock. */
export function MarkdownContent({
  className,
  codeCopyLabel = 'Copy',
  codeCopySuccessLabel = 'Copied',
  density = 'document',
  emptyContent = 'No content',
  source,
  ...props
}: MarkdownContentProps) {
  const segments = useMemo(() => markdownSegments(source ?? ''), [source]);
  return (
    <div {...props} className={classNames('xgc-markdown', className)} data-density={density}>
      {segments.length ? segments.map((segment, index) => segment.type === 'html' ? (
        <div
          className="xgc-markdown-fragment"
          // The parser escapes all source HTML and validates link protocols before this point.
          dangerouslySetInnerHTML={{ __html: segment.html }}
          key={`html-${index}`}
        />
      ) : (
        <CodeBlock
          className="xgc-markdown-code-block"
          content={segment.content}
          copyLabel={codeCopyLabel}
          copySuccessLabel={codeCopySuccessLabel}
          key={`code-${index}`}
          label={segment.language === 'text' ? undefined : segment.language}
          language={sharedLanguage(segment.language)}
        />
      )) : <p className="xgc-markdown-empty">{emptyContent}</p>}
    </div>
  );
}
