import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('uses the shared code block and renders document structures', () => {
    const { container } = render(
      <MarkdownContent source={'# Notes\n\n| Key | Value |\n| --- | --- |\n| mode | safe |\n\n```bash\necho "ok"\n```'} />,
    );
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('safe');
    expect(container.querySelector('.xgc-code-block')).toHaveTextContent('echo "ok"');
  });

  it('escapes source HTML and rejects executable link protocols', () => {
    const { container } = render(
      <MarkdownContent source={'<script>alert(1)</script> [unsafe](javascript:alert(1))'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('keeps the first row of a structurally valid divider-free table', () => {
    render(<MarkdownContent source={'| robot | state |\n| px4-1 | ready |\n| scout-1 | stopped |'} />);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('robotstate');
    expect(rows[1]).toHaveTextContent('px4-1ready');
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  it('requires an exact, column-aligned divider before creating table headings', () => {
    const { rerender } = render(<MarkdownContent source={'| robot | state |\n| --- | --- |\n| px4-1 | ready |'} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('row')).toHaveLength(2);

    rerender(<MarkdownContent source={'| robot | state |\n| --- | not-a-divider |\n| px4-1 | ready |'} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('| --- | not-a-divider |')).toBeInTheDocument();

    rerender(<MarkdownContent source={'| robot | state |\n| px4-1 | ready | extra |'} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps malicious table cells inert and never emits executable elements or attributes', () => {
    const { container } = render(
      <MarkdownContent source={'| value | target |\n| --- | --- |\n| <img src=x onerror=alert(1)> | [run](data:text/html,<script>alert(1)</script>) |'} />,
    );

    expect(screen.getByRole('table')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
  });

  it('nests child lists inside their owning list items across mixed levels', () => {
    const { container } = render(
      <MarkdownContent source={'- parent\n  1. first child\n  2. second child\n    - grandchild\n- sibling'} />,
    );

    const root = container.querySelector('.xgc-markdown-fragment > ul');
    const nestedOrdered = root?.querySelector(':scope > li:first-child > ol');
    const nestedUnordered = nestedOrdered?.querySelector(':scope > li:nth-child(2) > ul');
    expect(root?.children).toHaveLength(2);
    expect(nestedOrdered?.children).toHaveLength(2);
    expect(nestedUnordered?.parentElement?.tagName).toBe('LI');
    expect(nestedUnordered).toHaveTextContent('grandchild');
  });

  it('keeps nested task lists valid when returning to a parent level', () => {
    const { container } = render(
      <MarkdownContent source={'- [ ] parent task\n  - [x] child task\n- [x] sibling task'} />,
    );

    const root = container.querySelector('.xgc-markdown-fragment > ul');
    const child = root?.querySelector(':scope > li:first-child > ul');
    expect(root?.children).toHaveLength(2);
    expect(child?.parentElement?.tagName).toBe('LI');
    expect(child?.querySelector('input')).toBeChecked();
    expect(root?.querySelectorAll(':scope > li.xgc-markdown-task')).toHaveLength(2);
  });
});
