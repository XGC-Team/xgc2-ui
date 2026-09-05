// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './DataDisplay';

describe('table control identities', () => {
  it('scopes pagination controls to their existing footer entity and preserves callbacks', () => {
    const onPage = vi.fn();
    const onPageSize = vi.fn();
    const { container } = render(<Pagination data-xgc-id="audit:operation" onPageChange={onPage} onPageSizeChange={onPageSize} page={2} pageSize={20} total={80} />);
    fireEvent.click(container.querySelector('[data-xgc-role="pagination-previous"][data-xgc-id="audit:operation"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="pagination-next"][data-xgc-id="audit:operation"]')!);
    fireEvent.change(container.querySelector('[data-xgc-role="pagination-page-size"][data-xgc-id="audit:operation"]')!, { target: { value: '50' } });
    expect(onPage.mock.calls).toEqual([[1], [3]]);
    expect(onPageSize).toHaveBeenCalledWith(50);
  });
});
