import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent } from 'react';
import { classNames } from './classNames';
import { ensureLatexLanguage } from './latexLanguage';
import { ensureMonacoThemes, monacoThemeName } from './monacoTheme';

export type SourceCursor = {
  column: number;
  line: number;
};

export type SourceEditorImplementation = 'plain' | 'monaco';

export type SourceEditorProps = Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'value'> & {
  cursor?: SourceCursor;
  dataXgcId?: string;
  dataXgcRole?: string;
  implementation?: SourceEditorImplementation;
  language?: string;
  onCursorChange?: (cursor: SourceCursor) => void;
  onValueChange: (value: string) => void;
  value: string;
};

function lineOffsets(value: string) {
  const offsets = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

function cursorFromOffset(value: string, offset: number): SourceCursor {
  const offsets = lineOffsets(value);
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? value.length + 1;
    if (offset < end) {
      return { line: index + 1, column: offset - start + 1 };
    }
  }
  return { line: 1, column: 1 };
}

function offsetFromCursor(value: string, cursor: SourceCursor) {
  const offsets = lineOffsets(value);
  const start = offsets[Math.max(0, cursor.line - 1)] ?? 0;
  const next = offsets[cursor.line] ?? value.length;
  return Math.min(start + Math.max(cursor.column - 1, 0), next);
}

function resolveImplementation(requested?: SourceEditorImplementation): SourceEditorImplementation {
  if (requested) return requested;
  if (typeof window !== 'undefined' && window.MonacoEnvironment) return 'monaco';
  return 'plain';
}

function PlainSourceEditor({
  className,
  cursor,
  dataXgcId = 'source-editor',
  dataXgcRole = 'source-editor',
  language = 'latex',
  onCursorChange,
  onValueChange,
  value,
  ...props
}: SourceEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!cursor || !ref.current) return;
    const next = offsetFromCursor(value, cursor);
    if (ref.current.selectionStart !== next) {
      ref.current.focus();
      ref.current.setSelectionRange(next, next);
    }
  }, [cursor, value]);

  function reportCursor() {
    const node = ref.current;
    if (!node || !onCursorChange) return;
    onCursorChange(cursorFromOffset(value, node.selectionStart));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      queueMicrotask(reportCursor);
    }
  }

  return (
    <textarea
      {...(props as HTMLAttributes<HTMLTextAreaElement>)}
      ref={ref}
      aria-label={props['aria-label'] ?? 'Source'}
      className={classNames('xgc-manuscript-source-editor', className)}
      data-language={language}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      onClick={reportCursor}
      onKeyDown={handleKeyDown}
      onKeyUp={reportCursor}
      onChange={(event) => {
        onValueChange(event.target.value);
        onCursorChange?.(cursorFromOffset(event.target.value, event.target.selectionStart));
      }}
      spellCheck={false}
      value={value}
    />
  );
}

function MonacoSourceEditor({
  className,
  cursor,
  dataXgcId = 'source-editor',
  dataXgcRole = 'source-editor',
  language = 'latex',
  onCursorChange,
  onValueChange,
  value,
  ...props
}: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{
    dispose: () => void;
    getValue: () => string;
    revealLineInCenter: (line: number) => void;
    setPosition: (position: { column: number; lineNumber: number }) => void;
    setValue: (next: string) => void;
  } | null>(null);
  const valueRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);
  const onCursorChangeRef = useRef(onCursorChange);
  valueRef.current = value;
  onValueChangeRef.current = onValueChange;
  onCursorChangeRef.current = onCursorChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void import('monaco-editor').then((monaco) => {
      if (cancelled || !hostRef.current) return;
      ensureLatexLanguage(monaco as never);
      ensureMonacoThemes(monaco as never);
      const fontSize = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-base'), 10) || 12;
      const editor = monaco.editor.create(hostRef.current, {
        ariaLabel: 'Source',
        automaticLayout: true,
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
          || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize,
        hideCursorInOverviewRuler: true,
        language,
        lineNumbers: 'on',
        minimap: { enabled: false },
        overviewRulerLanes: 0,
        padding: { bottom: 8, top: 8 },
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        scrollbar: { horizontalScrollbarSize: 8, verticalScrollbarSize: 8 },
        theme: monacoThemeName(),
        value: valueRef.current,
        wordWrap: 'on',
      });
      if (cancelled) {
        editor.dispose();
        return;
      }
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        const next = editor.getValue();
        if (next !== valueRef.current) onValueChangeRef.current(next);
      });
      editor.onDidChangeCursorPosition((event) => {
        onCursorChangeRef.current?.({ line: event.position.lineNumber, column: event.position.column });
      });
    });
    return () => {
      cancelled = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) return;
    editor.setValue(value);
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !cursor) return;
    editor.revealLineInCenter(cursor.line);
    editor.setPosition({ column: cursor.column, lineNumber: cursor.line });
  }, [cursor]);

  return (
    <div
      {...props}
      ref={hostRef}
      aria-label={props['aria-label'] ?? 'Source'}
      className={classNames('xgc-manuscript-source-host', className)}
      data-language={language}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    />
  );
}

export function SourceEditor(props: SourceEditorProps) {
  const implementation = resolveImplementation(props.implementation);
  if (implementation === 'plain') return <PlainSourceEditor {...props} />;
  return <MonacoSourceEditor {...props} />;
}
