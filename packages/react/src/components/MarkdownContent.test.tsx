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
});
