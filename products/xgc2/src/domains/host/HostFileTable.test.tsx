// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { LanguageProvider } from '../../shared/localization/LanguageProvider';
import { HostFileTable,type HostFileEntryActions } from './HostFileTable';
import type { HostFileInfo } from './hostModel';

vi.mock('../automation/automationPublic', () => ({
  AutomationPathPicker: ({
    targetId,
    kind,
    value,
    onSelect,
    onClose,
  }: {
    targetId: string;
    kind: string;
    value: string;
    onSelect: (path: string) => void;
    onClose: () => void;
  }) => (
    <div data-xgc-role="automation-path-picker" data-xgc-id={`${targetId}:${kind}`} data-xgc-path={value}>
      <button type="button" onClick={() => onSelect('/home/operator/Documents')}>Select folder</button>
      <button type="button" onClick={onClose}>Close path picker</button>
    </div>
  ),
}));

const file: HostFileInfo = {
  name: 'hello.txt',
  path: '/var/lib/xgc2/hello.txt',
  isDir: false,
  size: 5,
  mode: '-rw-r--r--',
  user: 'root',
  group: 'root',
  uid: '0',
  gid: '0',
  modTime: new Date(0).toISOString(),
  isSymlink: false,
  canEdit: true,
  canDownload: true,
};

function actions(overrides: Partial<HostFileEntryActions> = {}): HostFileEntryActions {
  return {
    open: vi.fn(),
    download: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
    compress: vi.fn(),
    chmod: vi.fn(),
    chown: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('HostFileTable', () => {
  it('sorts semantic file values and keeps header controls when the directory becomes empty', () => {
    const entries = [
      { ...file,name: 'file10.txt',path: '/var/lib/xgc2/file10.txt',size: 1024,modTime: '2026-09-01T00:00:00Z' },
      { ...file,name: 'file2.txt',path: '/var/lib/xgc2/file2.txt',size: 30,modTime: '2026-08-01T00:00:00Z' },
    ];
    const entryActions = actions();
    const props = { actions: entryActions,directory: '/var/lib/xgc2',disabled: false,executionTargetId: 'local' };
    const { container,rerender } = render(<HostFileTable {...props} entries={entries} />);
    const names = () => Array.from(container.querySelectorAll('[data-xgc-role="host-file-open"]'),(node) => node.textContent);
    expect(names()).toEqual(['file2.txt','file10.txt']);
    for (const [column,label] of [['name','Name'],['mode','Permissions'],['user','User'],['group','Group'],['size','Size'],['modified','Modified']]) {
      const button = screen.getByRole('button',{ name: `Sort by ${label}` });
      expect(button).toHaveAttribute('data-xgc-role','host-file-sort');
      expect(button).toHaveAttribute('data-xgc-id',`local:${column}`);
      expect(button.closest('th')).toHaveAttribute('data-xgc-role','host-file-column');
    }
    fireEvent.click(screen.getByRole('button',{ name: 'Sort by Size' }));
    expect(names()).toEqual(['file2.txt','file10.txt']);
    fireEvent.click(screen.getByRole('button',{ name: 'Sort by Size' }));
    expect(names()).toEqual(['file10.txt','file2.txt']);
    fireEvent.click(screen.getByRole('button',{ name: 'Sort by Modified' }));
    expect(names()).toEqual(['file2.txt','file10.txt']);
    fireEvent.click(screen.getByRole('button',{ name: 'Sort by Modified' }));
    expect(names()).toEqual(['file10.txt','file2.txt']);
    expect(entryActions.open).not.toHaveBeenCalled();
    const header = screen.getByRole('button',{ name: 'Sort by Name' });
    rerender(<HostFileTable {...props} entries={[]} />);
    expect(screen.getByRole('button',{ name: 'Sort by Name' })).toBe(header);
    expect(screen.getByText('No files')).toBeVisible();
    expect(screen.queryByText(/This directory has no matching entries/)).not.toBeInTheDocument();
  });

  it('shows a factual Chinese empty-directory title', () => {
    render(
      <LanguageProvider language="zh-CN">
        <HostFileTable
          actions={actions()}
          directory="/var/lib/xgc2"
          disabled={false}
          entries={[]}
          executionTargetId="local"
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('没有文件')).toBeVisible();
    expect(screen.queryByText('No files found')).not.toBeInTheDocument();
  });

  it('scrolls the directory list without a pagination footer', () => {
    const { container } = render(
      <HostFileTable
        actions={actions()}
        directory="/var/lib/xgc2"
        disabled={false}
        entries={[file]}
        executionTargetId="local"
      />,
    );
    expect(container.querySelector('.xgc-host-file-list')).not.toBeNull();
    expect(container.querySelector('.xgc-pagination')).toBeNull();
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    expect(viewport).toHaveAttribute('data-xgc-id', 'host-files');
    expect(viewport).toHaveAttribute('aria-label', 'Table rows');
    expect(screen.getByRole('button', { name: 'hello.txt' })).toHaveAttribute('data-xgc-role', 'host-file-open');
    expect(screen.getByRole('button', { name: 'hello.txt' })).toHaveAttribute('data-xgc-id', '/var/lib/xgc2/hello.txt');
    expect(screen.getByRole('button', { name: 'Download hello.txt' })).toHaveAttribute('data-xgc-role', 'host-file-download');
    expect(screen.getByRole('button', { name: 'Download hello.txt' })).toHaveAttribute('data-xgc-id', '/var/lib/xgc2/hello.txt');
  });

  it('moves through the host directory picker and a second confirm', async () => {
    const entryActions = actions();
    const { container } = render(
      <HostFileTable
        actions={entryActions}
        directory="/var/lib/xgc2"
        disabled={false}
        entries={[file]}
        executionTargetId="local"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions for hello.txt' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));

    expect(screen.queryByLabelText('Move to directory')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Move to directory' })).not.toBeInTheDocument();
    const picker = container.querySelector('[data-xgc-role="host-file-destination-picker"]');
    expect(picker).toHaveAttribute('data-xgc-id', 'move');
    expect(container.querySelector('[data-xgc-role="automation-path-picker"]')).toHaveAttribute('data-xgc-id', 'local:directory');
    expect(container.querySelector('[data-xgc-role="automation-path-picker"]')).toHaveAttribute('data-xgc-path', '/var/lib/xgc2');

    fireEvent.click(screen.getByRole('button', { name: 'Select folder' }));
    expect(entryActions.move).not.toHaveBeenCalled();
    expect(await screen.findByText('Move hello.txt to /home/operator/Documents?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Move$/ }));
    await waitFor(() => expect(entryActions.move).toHaveBeenCalledWith(file, '/home/operator/Documents'));
    expect(container.querySelector('[data-xgc-role="host-file-destination-picker"]')).toBeNull();
  });

  it('copies through the same directory picker and confirm', async () => {
    const entryActions = actions();
    const { container } = render(
      <HostFileTable
        actions={entryActions}
        directory="/var/lib/xgc2"
        disabled={false}
        entries={[file]}
        executionTargetId="agent-a"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions for hello.txt' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

    expect(container.querySelector('[data-xgc-role="host-file-destination-picker"]')).toHaveAttribute('data-xgc-id', 'copy');
    expect(container.querySelector('[data-xgc-role="automation-path-picker"]')).toHaveAttribute('data-xgc-id', 'agent-a:directory');
    fireEvent.click(screen.getByRole('button', { name: 'Select folder' }));
    expect(entryActions.copy).not.toHaveBeenCalled();
    expect(await screen.findByText('Copy hello.txt to /home/operator/Documents?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
    await waitFor(() => expect(entryActions.copy).toHaveBeenCalledWith(file, '/home/operator/Documents'));
  });

  it('asks for download size before starting the transfer', async () => {
    const entryActions = actions();
    render(
      <HostFileTable
        actions={entryActions}
        directory="/var/lib/xgc2"
        disabled={false}
        entries={[file]}
        executionTargetId="local"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download hello.txt' }));
    expect(entryActions.download).not.toHaveBeenCalled();
    expect(await screen.findByText('Download hello.txt (5 B)?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Download$/ }));
    await waitFor(() => expect(entryActions.download).toHaveBeenCalledWith(file));
  });

  it('cancelling download confirmation does not start the transfer', async () => {
    const entryActions = actions();
    render(
      <HostFileTable
        actions={entryActions}
        directory="/var/lib/xgc2"
        disabled={false}
        entries={[file]}
        executionTargetId="local"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download hello.txt' }));
    expect(await screen.findByText('Download hello.txt (5 B)?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(entryActions.download).not.toHaveBeenCalled();
  });
});
