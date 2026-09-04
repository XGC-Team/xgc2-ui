import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfPane } from './PdfPane';

describe('PdfPane', () => {
  it('stamps page leaves and reports a text quote', () => {
    const onQuote = vi.fn();
    render(
      <PdfPane
        onQuote={onQuote}
        pages={[{ number: 1, text: 'Fixture manuscript' }]}
      />,
    );
    const pane = document.querySelector('[data-xgc-role="pdf-pane"]');
    const page = screen.getByText('Fixture manuscript');
    expect(pane).toHaveAttribute('data-xgc-id', 'pdf-pane');
    expect(page.closest('[data-xgc-role="pdf-page"]')).toHaveAttribute('data-xgc-id', 'pdf-pane:1');

    const selection = {
      toString: () => 'Fixture manuscript',
      anchorNode: page,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
    fireEvent.mouseUp(pane!);
    expect(onQuote).toHaveBeenCalledWith({ page: 1, text: 'Fixture manuscript' });
  });

  it('renders an empty host when pages is missing', () => {
    render(<PdfPane pages={null as unknown as []} />);
    expect(document.querySelector('[data-xgc-role="pdf-pane"]')).not.toBeNull();
    expect(screen.getByText('No PDF')).toBeInTheDocument();
  });

  it('reports a PDF click for inverse SyncTeX', () => {
    const onPdfClick = vi.fn();
    render(
      <PdfPane
        onPdfClick={onPdfClick}
        pages={[{ number: 1, text: 'Fixture manuscript' }]}
      />,
    );
    fireEvent.click(screen.getByText('Fixture manuscript').closest('[data-xgc-role="pdf-page"]')!);
    expect(onPdfClick).toHaveBeenCalledOnce();
    const location = onPdfClick.mock.calls[0]?.[0];
    expect(location?.page).toBe(1);
  });
});
