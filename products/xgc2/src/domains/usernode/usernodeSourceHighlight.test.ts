import { isValidElement,type ReactElement } from 'react';
import { describe,expect,it } from 'vitest';
import {
  detectUsernodeSourceLanguage,
  findUsernodeSourceMatches,
  highlightUsernodeSource,
} from './usernodeSourceHighlight';

function classNames(nodes: ReturnType<typeof highlightUsernodeSource>): string[] {
  return nodes.flatMap((node) => {
    if (!isValidElement(node)) return [];
    const className = (node as ReactElement<{ className?: string }>).props.className ?? '';
    return className.split(/\s+/).filter(Boolean);
  });
}

function textsOfClass(nodes: ReturnType<typeof highlightUsernodeSource>, tokenClass: string): string[] {
  return nodes.flatMap((node) => {
    if (!isValidElement(node)) return [];
    const props = (node as ReactElement<{ className?: string; children?: string }>).props;
    return props.className?.split(/\s+/).includes(tokenClass) ? [String(props.children)] : [];
  });
}

describe('usernodeSourceHighlight', () => {
  it('picks python or bash from shebang, then the stored interpreter', () => {
    expect(detectUsernodeSourceLanguage('#!/usr/bin/env python3\nprint(1)\n', 'bash')).toBe('python');
    expect(detectUsernodeSourceLanguage('#!/usr/bin/env bash\necho hi\n', 'python3')).toBe('bash');
    expect(detectUsernodeSourceLanguage('print(1)\n', 'python3')).toBe('python');
    expect(detectUsernodeSourceLanguage('echo hi\n', 'bash')).toBe('bash');
  });

  it('reuses CodeBlock token classes for bash comments, keywords, and strings', () => {
    const nodes = highlightUsernodeSource('#!/usr/bin/env bash\necho "ready"\n', 'bash');
    expect(textsOfClass(nodes, 'xgc-syntax-comment')).toEqual(['#!/usr/bin/env bash']);
    expect(textsOfClass(nodes, 'xgc-syntax-keyword')).toContain('echo');
    expect(textsOfClass(nodes, 'xgc-syntax-string')).toEqual(['"ready"']);
  });

  it('colors python keywords and comments with the same syntax classes', () => {
    const nodes = highlightUsernodeSource('def hello():\n    return "ok"  # greet\n', 'python');
    expect(textsOfClass(nodes, 'xgc-syntax-keyword')).toEqual(expect.arrayContaining(['def', 'return']));
    expect(textsOfClass(nodes, 'xgc-syntax-comment')).toEqual(['# greet']);
    expect(textsOfClass(nodes, 'xgc-syntax-string')).toEqual(['"ok"']);
  });

  it('marks in-script search hits without dropping syntax classes', () => {
    const nodes = highlightUsernodeSource('echo ready\necho again\n', 'bash', { query: 'echo', activeIndex: 1 });
    expect(classNames(nodes)).toEqual(expect.arrayContaining(['xgc-syntax-keyword', 'usernode-source-match', 'usernode-source-match-active']));
    expect(findUsernodeSourceMatches('echo ready\necho again\n', 'echo')).toEqual([0, 11]);
  });
});
