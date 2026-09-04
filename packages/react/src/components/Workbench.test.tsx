import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceExplorer } from './ResourceExplorer';
import { ResourceWorkbench } from './ResourceWorkbench';
import { WorkbenchShell } from './WorkbenchShell';

describe('Workbench primitives', () => {
  it('composes activity, explorer, editor, inspector and bottom regions', () => {
    render(
      <WorkbenchShell
        activityBar={<span>Activities</span>}
        bottomPanel={<span>Terminal</span>}
        editor={<span>Editor</span>}
        explorer={<span>Explorer</span>}
        inspector={<span>Inspector</span>}
        statusBar={<span>Status</span>}
      />,
    );

    for (const label of ['Activities', 'Terminal', 'Editor', 'Explorer', 'Inspector', 'Status']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('expands a resource tree and navigates visible nodes with the keyboard', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <ResourceExplorer
        ariaLabel="Project resources"
        nodes={[
          {
            id: 'docs',
            label: 'Documents',
            children: [
              { id: 'paper', label: 'paper.tex' },
              { id: 'refs', label: 'refs.bib' },
            ],
          },
        ]}
        onSelectedIdChange={onSelectedIdChange}
        selectedId="docs"
      />,
    );

    const docs = screen.getByRole('treeitem', { name: 'Documents' });
    expect(screen.queryByRole('treeitem', { name: 'paper.tex' })).not.toBeInTheDocument();
    fireEvent.keyDown(docs, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'paper.tex' })).toBeInTheDocument();

    fireEvent.keyDown(docs, { key: 'ArrowDown' });
    expect(onSelectedIdChange).toHaveBeenLastCalledWith('paper');
  });

  it('uses WorkspaceTabs as a transport-agnostic multi-resource host', () => {
    const onActiveResourceChange = vi.fn();
    const onCloseResource = vi.fn();
    render(
      <ResourceWorkbench
        activeResourceId="source"
        ariaLabel="Open resources"
        onActiveResourceChange={onActiveResourceChange}
        onCloseResource={onCloseResource}
        renderResource={(resource) => <div>{`View ${resource.label}`}</div>}
        resources={[
          { id: 'source', label: 'paper.tex', dirty: true },
          { id: 'pdf', label: 'paper.pdf' },
        ]}
      />,
    );

    expect(screen.getByText('View paper.tex')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /paper\.pdf/i }));
    expect(onActiveResourceChange).toHaveBeenCalledWith('pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Close paper.pdf' }));
    expect(onCloseResource).toHaveBeenCalledWith('pdf');
  });
});
