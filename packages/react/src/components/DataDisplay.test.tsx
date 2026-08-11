import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock, DataTable, StatCard, Toolbar } from './DataDisplay';

describe('data display primitives', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves native table semantics inside the shared container', () => {
    render(
      <DataTable>
        <table><tbody><tr><td>package-a</td></tr></tbody></table>
      </DataTable>,
    );
    expect(screen.getByRole('table')).toHaveTextContent('package-a');
  });

  it('shows a deliberate empty state without an empty table', () => {
    render(<DataTable empty emptyMessage="No packages"><table /></DataTable>);
    expect(screen.getByText('No packages')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('copies code content through the browser clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CodeBlock label="Install" content="sudo apt-get update" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('sudo apt-get update');
  });

  it('renders statistic and toolbar content', () => {
    render(<><StatCard label="Packages" value="42" detail="focal" /><Toolbar>Filters</Toolbar></>);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});
