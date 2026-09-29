// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { HostFilesWorkspace,type HostFilesWorkspaceProps } from './HostFilesWorkspace';
import type { HostFileContent,HostFileList } from './hostModel';

const fileActions = vi.hoisted(() => ({
  getHostFiles: vi.fn(),
  getHostFileContent: vi.fn(),
  saveHostFileContent: vi.fn(),
}));

vi.mock('./hostFileActions', () => ({
  chmodHostFile: vi.fn(),
  chownHostFile: vi.fn(),
  compressHostFile: vi.fn(),
  copyHostFile: vi.fn(),
  createHostFile: vi.fn(),
  deleteHostFile: vi.fn(),
  downloadHostFile: vi.fn(),
  getHostFileContent: fileActions.getHostFileContent,
  getHostFiles: fileActions.getHostFiles,
  getHostRecycle: vi.fn(),
  moveHostFile: vi.fn(),
  restoreHostRecycle: vi.fn(),
  saveHostFileContent: fileActions.saveHostFileContent,
  uploadHostFile: vi.fn(),
}));

vi.mock('./hostFolderZipActions', () => ({
  zipHostDirectory: vi.fn(),
  zipHostFile: vi.fn(),
}));

vi.mock('../groundStationInteraction/groundStationInteractionPublic', () => ({
  publishLocalGroundStationNotification: vi.fn(),
}));

vi.mock('./hostSystemTabSurface', () => ({
  useDeferSystemTabReady: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((next,fail) => { resolve = next;reject = fail; });
  return { promise,resolve,reject };
}

function listing(path: string,name: string): HostFileList {
  return {
    path,
    parent:path,
    entries:[{
      name,
      path:`${path}/${name}`,
      isDir:false,
      size:5,
      mode:'-rw-r--r--',
      user:'robot',
      group:'robot',
      uid:'1000',
      gid:'1000',
      modTime:'2026-09-27T00:00:00Z',
      isSymlink:false,
      canEdit:true,
      canDownload:true,
    }],
  };
}

function props(managedHostId: string,initialDirectory: string): HostFilesWorkspaceProps {
  return {
    managedHostId,
    executionTargetId:managedHostId,
    isRemoteManagedHost:true,
    initialDirectory,
  };
}

describe('HostFilesWorkspace target isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never paints a late Agent A listing into Agent B', async () => {
    const a = deferred<HostFileList>();
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => {
      if (target.managedHostId === 'agent-a') return a.promise;
      return Promise.resolve(listing(path,'来自B.txt'));
    });

    const { rerender } = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    await waitFor(() => expect(fileActions.getHostFiles).toHaveBeenCalledWith(
      '/实验/A',false,'',expect.objectContaining({ managedHostId:'agent-a' }),
    ));

    rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    expect(await screen.findByRole('button',{ name:'来自B.txt' })).toBeVisible();

    a.resolve(listing('/实验/A','来自A.txt'));
    await a.promise;
    await Promise.resolve();

    expect(screen.queryByRole('button',{ name:'来自A.txt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'来自B.txt' })).toBeVisible();
    expect(screen.getByRole('textbox',{ name:'Host file path' })).toHaveValue('/实验/B');
  });

  it('binds an in-flight editor save to the host that opened it', async () => {
    fileActions.getHostFiles.mockImplementation((path: string) => Promise.resolve(listing(
      path,
      path.endsWith('/A') ? '算法配置.txt' : 'B.txt',
    )));
    const content: HostFileContent = { path:'/实验/A/算法配置.txt',content:'old',size:3 };
    fileActions.getHostFileContent.mockResolvedValue(content);
    const save = deferred<{ path:string }>();
    fileActions.saveHostFileContent.mockImplementation((_path: string,_content: string,target: { managedHostId?: string }) => {
      if (target.managedHostId !== 'agent-a') throw new Error('save crossed target');
      return save.promise;
    });

    const { rerender } = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    fireEvent.click(await screen.findByRole('button',{ name:'算法配置.txt' }));
    const editor = await screen.findByRole('textbox',{ name:'Contents of /实验/A/算法配置.txt' });
    fireEvent.change(editor,{ target:{ value:'new-bytes' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));

    await waitFor(() => expect(fileActions.saveHostFileContent).toHaveBeenCalledWith(
      '/实验/A/算法配置.txt','new-bytes',expect.objectContaining({ managedHostId:'agent-a' }),
    ));

    rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    expect(await screen.findByRole('button',{ name:'B.txt' })).toBeVisible();
    save.resolve({ path:'/实验/A/算法配置.txt' });
    await save.promise;
    await Promise.resolve();

    expect(fileActions.saveHostFileContent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox',{ name:'Contents of /实验/A/算法配置.txt' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox',{ name:'Host file path' })).toHaveValue('/实验/B');
  });

  it('retains the unsaved editor and visited directory across A to B to A', async () => {
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => (
      Promise.resolve(listing(path,target.managedHostId === 'agent-a' ? '算法配置.txt' : 'B.txt'))
    ));
    fileActions.getHostFileContent.mockResolvedValue({ path:'/实验/A/子目录/算法配置.txt',content:'original',size:8 });
    const view = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    await screen.findByRole('button',{ name:'算法配置.txt' });
    fireEvent.change(screen.getByRole('textbox',{ name:'Host file path' }),{ target:{ value:'/实验/A/子目录' } });
    fireEvent.click(screen.getByRole('button',{ name:'Open' }));
    await waitFor(() => expect(screen.getByRole('button',{ name:'算法配置.txt' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name:'算法配置.txt' }));
    const editor = await screen.findByRole('textbox',{ name:'Contents of /实验/A/子目录/算法配置.txt' });
    fireEvent.change(editor,{ target:{ value:'unsaved-important-draft' } });
    view.rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    await screen.findByRole('button',{ name:'B.txt' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fileActions.saveHostFileContent).not.toHaveBeenCalled();
    const reads = fileActions.getHostFiles.mock.calls.length;
    view.rerender(<HostFilesWorkspace {...props('agent-a','/ignored-on-return')} />);
    expect(screen.getByRole('textbox',{ name:'Host file path' })).toHaveValue('/实验/A/子目录');
    expect(screen.getByRole('textbox',{ name:'Contents of /实验/A/子目录/算法配置.txt' })).toHaveValue('unsaved-important-draft');
    expect(screen.getByRole('button',{ name:'Save' })).toBeEnabled();
    expect(fileActions.getHostFiles).toHaveBeenCalledTimes(reads);
  });

  it.each([false,true])('preserves edits made during save and refresh (parked: %s)', async (parked) => {
    const refreshed = deferred<HostFileList>();
    let aReads = 0;
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => {
      if (target.managedHostId !== 'agent-a') return Promise.resolve(listing(path,'B.txt'));
      aReads += 1;
      return aReads === 2 ? refreshed.promise : Promise.resolve(listing(path,'A.txt'));
    });
    fileActions.getHostFileContent.mockResolvedValue({ path:'/实验/A/A.txt',content:'original',size:8 });
    const saved = deferred<{ path:string }>();
    fileActions.saveHostFileContent.mockReturnValueOnce(saved.promise).mockResolvedValue({ path:'/实验/A/A.txt' });
    const view = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    fireEvent.click(await screen.findByRole('button',{ name:'A.txt' }));
    const editor = await screen.findByRole('textbox',{ name:'Contents of /实验/A/A.txt' });
    fireEvent.change(editor,{ target:{ value:'submitted' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(fileActions.saveHostFileContent).toHaveBeenCalledExactlyOnceWith(
      '/实验/A/A.txt','submitted',expect.objectContaining({ managedHostId:'agent-a' }),
    ));
    expect(editor).toBeEnabled();
    fireEvent.change(editor,{ target:{ value:'edited-during-save' } });
    if (parked) {
      view.rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
      await screen.findByRole('button',{ name:'B.txt' });
    }
    await act(async () => { saved.resolve({ path:'/实验/A/A.txt' }); });
    if (parked) {
      expect(aReads).toBe(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      view.rerender(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    }
    await waitFor(() => expect(aReads).toBe(2));
    const currentEditor = screen.getByRole('textbox',{ name:'Contents of /实验/A/A.txt' });
    expect(currentEditor).toHaveValue('edited-during-save');
    fireEvent.change(currentEditor,{ target:{ value:'edited-during-refresh' } });
    await act(async () => { refreshed.resolve(listing('/实验/A','A.txt')); });
    expect(screen.getByRole('textbox',{ name:'Contents of /实验/A/A.txt' })).toHaveValue('edited-during-refresh');
    expect(screen.getByRole('button',{ name:'Save' })).toBeEnabled();
    expect(fileActions.saveHostFileContent).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fileActions.saveHostFileContent).toHaveBeenLastCalledWith(
      '/实验/A/A.txt','edited-during-refresh',expect.objectContaining({ managedHostId:'agent-a' }),
    );
    expect(fileActions.saveHostFileContent).toHaveBeenCalledTimes(2);
  });

  it('keeps an A draft after a failed save while B is selected and retries only A', async () => {
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => (
      Promise.resolve(listing(path,target.managedHostId === 'agent-a' ? 'A.txt' : 'B.txt'))
    ));
    fileActions.getHostFileContent.mockResolvedValue({ path:'/实验/A/A.txt',content:'old',size:3 });
    const failed = deferred<{ path:string }>();
    fileActions.saveHostFileContent.mockReturnValueOnce(failed.promise).mockResolvedValueOnce({ path:'/实验/A/A.txt' });
    const view = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    fireEvent.click(await screen.findByRole('button',{ name:'A.txt' }));
    fireEvent.change(await screen.findByRole('textbox',{ name:'Contents of /实验/A/A.txt' }),{ target:{ value:'retained-after-failure' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(fileActions.saveHostFileContent).toHaveBeenCalledOnce());
    view.rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    await screen.findByRole('button',{ name:'B.txt' });
    const reads = fileActions.getHostFiles.mock.calls.length;
    await act(async () => { failed.reject(new Error('A save failed')); });
    expect(screen.getByRole('textbox',{ name:'Host file path' })).toHaveValue('/实验/B');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fileActions.getHostFiles).toHaveBeenCalledTimes(reads);
    view.rerender(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    expect(screen.getByRole('textbox',{ name:'Contents of /实验/A/A.txt' })).toHaveValue('retained-after-failure');
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(fileActions.saveHostFileContent).toHaveBeenCalledTimes(2));
    for (const call of fileActions.saveHostFileContent.mock.calls) {
      expect(call).toEqual(['/实验/A/A.txt','retained-after-failure',expect.objectContaining({ managedHostId:'agent-a' })]);
    }
  });

  it('defers the hidden A directory refresh after a late successful save until A is visible', async () => {
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => (
      Promise.resolve(listing(path,target.managedHostId === 'agent-a' ? 'A.txt' : 'B.txt'))
    ));
    fileActions.getHostFileContent.mockResolvedValue({ path:'/实验/A/A.txt',content:'old',size:3 });
    const saved = deferred<{ path:string }>();
    fileActions.saveHostFileContent.mockReturnValueOnce(saved.promise);
    const view = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    fireEvent.click(await screen.findByRole('button',{ name:'A.txt' }));
    fireEvent.change(await screen.findByRole('textbox',{ name:'Contents of /实验/A/A.txt' }),{ target:{ value:'saved-only-to-A' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(fileActions.saveHostFileContent).toHaveBeenCalledOnce());
    view.rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    await screen.findByRole('button',{ name:'B.txt' });
    const reads = fileActions.getHostFiles.mock.calls.length;
    await act(async () => { saved.resolve({ path:'/实验/A/A.txt' }); });
    expect(fileActions.getHostFiles).toHaveBeenCalledTimes(reads);
    expect(screen.getByRole('textbox',{ name:'Host file path' })).toHaveValue('/实验/B');
    view.rerender(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    await waitFor(() => expect(fileActions.getHostFiles).toHaveBeenCalledTimes(reads + 1));
    expect(fileActions.getHostFiles).toHaveBeenLastCalledWith('/实验/A',false,'',expect.objectContaining({ managedHostId:'agent-a' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the parked host menu out of the visible host surface', async () => {
    const user = userEvent.setup();
    fileActions.getHostFiles.mockImplementation((path: string,_hidden: boolean,_search: string,target: { managedHostId?: string }) => (
      Promise.resolve(listing(path,target.managedHostId === 'agent-a' ? 'A.txt' : 'B.txt'))
    ));
    const view = render(<HostFilesWorkspace {...props('agent-a','/实验/A')} />);
    await screen.findByRole('button',{ name:'A.txt' });
    await user.click(screen.getByRole('button',{ name:'More actions for A.txt' }));
    expect(await screen.findByRole('menu')).toBeVisible();
    view.rerender(<HostFilesWorkspace {...props('agent-b','/实验/B')} />);
    await screen.findByRole('button',{ name:'B.txt' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.queryByRole('button',{ name:'A.txt' })).not.toBeInTheDocument();
  });

  it('keeps a failed listing distinct from an empty directory', async () => {
    fileActions.getHostFiles.mockRejectedValueOnce(new Error('Agent disconnected'));
    render(<HostFilesWorkspace {...props('agent-a','/实验/空目录')} />);
    expect(await screen.findByText('Unable to load files')).toBeVisible();
    expect(screen.getByText('Agent disconnected')).toBeVisible();
    expect(screen.queryByText('No files')).not.toBeInTheDocument();
  });
});
