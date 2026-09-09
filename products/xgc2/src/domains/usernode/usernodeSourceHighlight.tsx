import type { ReactNode } from 'react';
import type { UsernodeInterpreter } from './usernodeContractsPublic';

export type UsernodeSourceLanguage = 'bash' | 'python';

type SyntaxKind = 'comment' | 'keyword' | 'number' | 'string' | 'variable';

/** Same shell tokenizer the shared CodeBlock uses for bash/shell. */
const shellPattern = /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|--?[A-Za-z0-9][\w-]*|\b(?:apt-get|apt|bun|cd|curl|docker|echo|export|git|install|npm|pnpm|purge|remove|rm|sudo|systemctl|update|upgrade)\b|\b\d+(?:\.\d+)?\b)/g;
const pythonPattern = /(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/g;

type HighlightSpan = {
  start: number;
  end: number;
  kind?: SyntaxKind;
  match?: 'active' | 'hit';
};

export function detectUsernodeSourceLanguage(
  source: string,
  interpreter: UsernodeInterpreter,
): UsernodeSourceLanguage {
  const shebang = source.match(/^#![^\n]*/)?.[0] ?? '';
  if (/python(?:3(?:\.\d+)?)?\b/i.test(shebang)) return 'python';
  if (/\b(?:bash|sh|zsh|dash)\b/i.test(shebang)) return 'bash';
  return interpreter === 'python3' ? 'python' : 'bash';
}

export function findUsernodeSourceMatches(source: string, query: string): number[] {
  const needle = query.trim();
  if (!needle) return [];
  const haystack = source.toLowerCase();
  const lookFor = needle.toLowerCase();
  const starts: number[] = [];
  let from = 0;
  while (from <= haystack.length - lookFor.length) {
    const index = haystack.indexOf(lookFor, from);
    if (index < 0) break;
    starts.push(index);
    from = index + lookFor.length;
  }
  return starts;
}

function syntaxKind(token: string, language: UsernodeSourceLanguage): SyntaxKind {
  if (token.startsWith('#')) return 'comment';
  if (language === 'python' && (token.startsWith('"""') || token.startsWith("'''"))) return 'string';
  if (token.startsWith('"') || token.startsWith("'")) return 'string';
  if (token.startsWith('$')) return 'variable';
  if (/^-?\d/.test(token)) return 'number';
  return 'keyword';
}

function syntaxSpans(content: string, language: UsernodeSourceLanguage): HighlightSpan[] {
  const pattern = language === 'python' ? pythonPattern : shellPattern;
  pattern.lastIndex = 0;
  const spans: HighlightSpan[] = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? cursor;
    if (index > cursor) spans.push({ start: cursor, end: index });
    spans.push({ start: index, end: index + match[0].length, kind: syntaxKind(match[0], language) });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) spans.push({ start: cursor, end: content.length });
  return spans;
}

function applySearchMarks(
  spans: HighlightSpan[],
  matches: number[],
  queryLength: number,
  activeIndex: number,
): HighlightSpan[] {
  if (!matches.length || queryLength <= 0) return spans;
  const marked: HighlightSpan[] = [];
  for (const span of spans) {
    let cursor = span.start;
    const overlapping = matches
      .map((start, index) => ({
        start,
        end:start + queryLength,
        match:(index === activeIndex ? 'active' : 'hit') as HighlightSpan['match'],
      }))
      .filter((range) => range.start < span.end && range.end > span.start)
      .sort((left, right) => left.start - right.start);
    for (const range of overlapping) {
      const from = Math.max(cursor, range.start);
      const to = Math.min(span.end, range.end);
      if (from > cursor) marked.push({ start: cursor, end: from, kind: span.kind });
      if (to > from) marked.push({ start: from, end: to, kind: span.kind, match: range.match });
      cursor = Math.max(cursor, to);
    }
    if (cursor < span.end) marked.push({ start: cursor, end: span.end, kind: span.kind });
  }
  return marked;
}

export function highlightUsernodeSource(
  content: string,
  language: UsernodeSourceLanguage,
  search?: { query: string; activeIndex: number },
): ReactNode[] {
  const matches = search ? findUsernodeSourceMatches(content, search.query) : [];
  const queryLength = search?.query.trim().length ?? 0;
  const spans = applySearchMarks(
    syntaxSpans(content, language),
    matches,
    queryLength,
    search?.activeIndex ?? 0,
  );
  return spans.map((span) => {
    const text = content.slice(span.start, span.end);
    const className = [
      span.kind ? `xgc-syntax-${span.kind}` : '',
      span.match === 'active' ? 'usernode-source-match usernode-source-match-active' : '',
      span.match === 'hit' ? 'usernode-source-match' : '',
    ].filter(Boolean).join(' ');
    return className
      ? <span className={className} key={`${span.start}-${span.end}-${span.match ?? 'plain'}`}>{text}</span>
      : text;
  });
}
