import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ManuscriptSplit } from './ManuscriptSplit';

describe('ManuscriptSplit', () => {
  it('hosts source and PDF panes in a markable split', () => {
    render(<ManuscriptSplit pdf={<p>PDF</p>} source={<p>Source</p>} />);
    const split = document.querySelector('[data-xgc-role="manuscript-split"]');
    expect(split).toHaveAttribute('data-xgc-id', 'manuscript-split');
    expect(split).toHaveClass('xgc-responsive-split');
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });
});
