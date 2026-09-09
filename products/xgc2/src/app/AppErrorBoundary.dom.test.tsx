// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('isolates a render failure and can retry the view', () => {
    vi.spyOn(console,'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    function UnstableView() {
      if (shouldThrow) throw new Error('render failed');
      return <div>Recovered view</div>;
    }

    render(<AppErrorBoundary><UnstableView /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to render this view');

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Recovered view')).toBeInTheDocument();
  });
});
