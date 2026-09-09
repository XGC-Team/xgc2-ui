import { useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore } from 'react';
import { publishLocalGroundStationNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import type { HostFileContent,HostFileInfo,HostFileList,HostRecycleItem } from './hostModel';
import {
  chmodHostFile,
  chownHostFile,
  compressHostFile,
  copyHostFile,
  createHostFile,
  deleteHostFile,
  downloadHostFile,
  getHostFileContent,
  getHostFiles,
  getHostRecycle,
  moveHostFile,
  restoreHostRecycle,
  saveHostFileContent,
  uploadHostFile,
} from './hostFileActions';
import { zipHostDirectory,zipHostFile } from './hostFolderZipActions';
import { consumeRequestedHostFilePath,requestedHostFilePath,subscribeRequestedHostFilePath } from './hostFileNavigation';
import { defaultHostFilePath,folderDownloadArchiveName,joinPath } from './hostFilesModel';
import { usePersistentState } from '../../hooks/usePersistentState';
import { HostFilesBrowser } from './HostFilesBrowser';
import { HostFileEditorDrawer,HostRecycleDrawer } from './HostFileDrawers';
import { useHostTask } from './useHostTask';
import { useDeferSystemTabReady } from './hostSystemTabSurface';
import { useProductRouteVisible } from '../../shared/routeReady';
import './HostFilesWorkspace.css';

export function HostFilesWorkspace({ targetCoreId,managedHostId,executionTargetId,isRemoteManagedHost }: {
  targetCoreId?: string;
  managedHostId: string;
  executionTargetId: string;
  isRemoteManagedHost: boolean;
}) {
  const requestedPath = useSyncExternalStore(subscribeRequestedHostFilePath,requestedHostFilePath,requestedHostFilePath);
  const localTarget = !isRemoteManagedHost && !targetCoreId?.trim();
  const surfaceVisible = useProductRouteVisible();
  // Core and Agent both open at the process user home (`~` → OS UserHomeDir).
  // No product data path or ManagedRoot is hardcoded as the Files root.
  const [initialPath] = useState(() => (localTarget && requestedPath) || defaultHostFilePath);
  const initialLoad = useRef(true);
  const [files,setFiles] = useState<HostFileList | null>(null);
  const [listing,setListing] = useState<{ settled: boolean; error: string | null; search: string }>({
    settled: false,error: null,search: '',
  });
  const [path,setPath] = useState(initialPath);
  const [content,setContent] = useState<HostFileContent | null>(null);
  const [search,setSearch] = useState('');
  const [showHidden,setShowHidden] = usePersistentState('xgc.system.files.showHidden',false,isBoolean);
  const [initialShowHidden] = useState(showHidden);
  const [recycleItems,setRecycleItems] = useState<HostRecycleItem[]>([]);
  const [recycleOpen,setRecycleOpen] = useState(false);
  const task = useHostTask();
  const { run } = task;
  const busy = task.isBusy();
  const writableDirectory = !busy && listing.error === null && files?.path === path ? files.path : null;
  const writableDirectoryRef = useRef(writableDirectory);
  writableDirectoryRef.current = writableDirectory;
  const waitingForFiles = !listing.settled;
  useDeferSystemTabReady(waitingForFiles);
  const toastTargetId = executionTargetId || 'local';
  const apiTarget = useMemo(() => ({
    ...(targetCoreId ? { targetCoreId } : {}),
    ...(isRemoteManagedHost ? { managedHostId } : {}),
  }), [isRemoteManagedHost,managedHostId,targetCoreId]);

  const toast = useCallback((title: string, message: string, severity: 'info' | 'success' | 'error' = 'info') => {
    publishLocalGroundStationNotification({
      targetId: toastTargetId,
      title,
      message,
      severity,
      source: 'System Files',
      durationMs: severity === 'error' ? 8000 : 4000,
    });
  }, [toastTargetId]);

  const applyFiles = useCallback((next: HostFileList) => {
    setFiles(next);
    setPath(next.path);
    setContent(null);
  }, []);

  const fetchFiles = useCallback(async (nextPath: string,hidden: boolean,query: string) => {
    setPath(nextPath);
    setListing((current) => ({ ...current,error: null }));
    try {
      const next = await getHostFiles(nextPath,hidden,query,apiTarget);
      applyFiles(next);
      setListing({ settled: true,error: null,search: query });
      return next;
    } catch (error) {
      // Listing truth outlives the transient notification. A failed request
      // must never be presented as a successfully read empty directory.
      setListing({ settled: true,error: error instanceof Error ? error.message : String(error),search: query });
      throw error;
    }
  }, [apiTarget,applyFiles]);

  useEffect(() => {
    if (busy) return;
    // Open folder requests originate on the station. A parked Agent/remote
    // Core must not consume a local directory before navigation selects local.
    const navigationPath = localTarget && surfaceVisible ? requestedPath : '';
    if (!initialLoad.current && !navigationPath) return;
    if (navigationPath && !consumeRequestedHostFilePath(navigationPath)) return;
    initialLoad.current = false;
    if (navigationPath) setSearch('');
    void run('files',() => fetchFiles(navigationPath || initialPath,navigationPath ? showHidden : initialShowHidden,''));
  }, [busy,fetchFiles,initialPath,initialShowHidden,localTarget,requestedPath,run,showHidden,surfaceVisible]);

  const loadFiles = useCallback(async (nextPath: string) => {
    await run('files',() => fetchFiles(nextPath,showHidden,search));
  }, [fetchFiles,run,search,showHidden]);

  const refreshFiles = useCallback(async () => {
    await fetchFiles(files?.path ?? path,showHidden,search);
  }, [fetchFiles,files?.path,path,search,showHidden]);

  async function openFile(item: HostFileInfo) {
    if (item.isDir) return loadFiles(item.path);
    setRecycleOpen(false);
    await run(`open:${item.path}`,async () => setContent(await getHostFileContent(item.path,apiTarget)));
  }

  async function saveFile() {
    if (!content) return;
    await run('save-file',async () => {
      await saveHostFileContent(content.path,content.content,apiTarget);
      await refreshFiles();
    }, { successMessage: `Saved ${content.path}.` });
  }

  async function createEntry(directory: boolean,name: string) {
    const destination = files?.path;
    if (!destination || writableDirectoryRef.current !== destination) return;
    await run('create-file',async () => {
      await createHostFile(joinPath(destination,name),directory,'',apiTarget);
      await refreshFiles();
    });
  }

  async function upload(file: File) {
    const destination = files?.path;
    if (!destination || writableDirectoryRef.current !== destination) return;
    await run('upload-file',async () => {
      await uploadHostFile(destination,file,apiTarget);
      await refreshFiles();
    });
  }

  async function download(item: HostFileInfo) {
    await run(`download:${item.path}`,async () => {
      if (item.isDir) {
        // Automatic ZIP + browser download (works for local Core and remote Agent
        // via list/read). No in-page success banner — browser download is enough.
        const archiveName = folderDownloadArchiveName(item.name);
        const blob = await zipHostDirectory(item.path, item.name, apiTarget);
        saveBlob(blob, archiveName);
        return;
      }
      saveBlob(await downloadHostFile(item.path,apiTarget),item.name);
    });
  }

  async function loadRecycle() {
    if (isRemoteManagedHost) return;
    await run('recycle',async () => {
      setContent(null);
      setRecycleItems(await getHostRecycle(apiTarget));
      setRecycleOpen(true);
    });
  }

  async function restore(item: HostRecycleItem) {
    if (isRemoteManagedHost) return;
    await run(`restore:${item.id}`,async () => {
      await restoreHostRecycle(item.id,apiTarget);
      const [nextRecycle] = await Promise.all([getHostRecycle(apiTarget),refreshFiles()]);
      setRecycleItems(nextRecycle);
    });
  }

  // Surface task errors via top-right bubble only — never inline Notices that reflow the Files layout.
  useEffect(() => {
    if (!task.message) return;
    toast(
      task.messageTone === 'danger' ? 'Files error' : 'Files',
      task.message,
      task.messageTone === 'danger' ? 'error' : task.messageTone === 'success' ? 'success' : 'info',
    );
    task.clearMessage();
  }, [task,task.message,task.messageTone,toast]);

  const entryActions = {
    open: (item: HostFileInfo) => void openFile(item),
    download: (item: HostFileInfo) => void download(item),
    copy: (item: HostFileInfo,destination: string) => void run('copy-file',async () => {
      await copyHostFile([item.path],destination,apiTarget,executionTargetId);
      if (isRemoteManagedHost) {
        await refreshFiles();
        toast('Files', `Copied ${item.name}.`, 'success');
      } else {
        toast('Files', `Copying ${item.name} in the background.`, 'info');
      }
    }),
    move: (item: HostFileInfo,destination: string) => void run('move-file',async () => {
      await moveHostFile([item.path],destination,apiTarget);
      await refreshFiles();
    }),
    compress: (item: HostFileInfo,name: string) => void run('compress-file',async () => {
      // Agent has no host.compress job plane yet — download a ZIP as the operator archive.
      if (isRemoteManagedHost) {
        const archiveName = name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`;
        if (item.isDir) {
          const blob = await zipHostDirectory(item.path, item.name, apiTarget);
          saveBlob(blob, archiveName);
        } else {
          saveBlob(await zipHostFile(item.path, item.name, apiTarget), archiveName);
        }
        toast('Files', `Downloaded ${archiveName}.`, 'success');
        return;
      }
      await compressHostFile([item.path],files?.path ?? path,name,apiTarget,executionTargetId);
      toast('Files', `Creating ${name} in the background.`, 'info');
    }),
    chmod: (item: HostFileInfo,mode: string) => void run('chmod-file',async () => {
      await chmodHostFile(item.path,mode,apiTarget);
      await refreshFiles();
    }),
    chown: (item: HostFileInfo,user: string,group: string) => void run('chown-file',async () => {
      await chownHostFile(item.path,user,group,apiTarget);
      await refreshFiles();
    }),
    delete: (item: HostFileInfo) => void run('delete-file',async () => {
      await deleteHostFile(item.path,apiTarget);
      await refreshFiles();
      if (recycleOpen && !isRemoteManagedHost) setRecycleItems(await getHostRecycle(apiTarget));
    }),
  };

  return (
    <div className="xgc-host-files-workspace">
      <HostFilesBrowser
        files={files}
        listingError={listing.error}
        listingPending={!listing.settled || task.isBusy('files')}
        appliedSearch={listing.search}
        directoryActionsDisabled={writableDirectory === null}
        path={path}
        search={search}
        showHidden={showHidden}
        executionTargetId={executionTargetId}
        remoteManagedHost={isRemoteManagedHost}
        disabled={task.isBusy()}
        entryActions={entryActions}
        onPathChange={setPath}
        onLoad={(nextPath) => void loadFiles(nextPath)}
        onSearchChange={setSearch}
        onToggleHidden={(next) => {
          setShowHidden(next);
          void run('files',() => fetchFiles(files?.path ?? path,next,search));
        }}
        onCreate={(directory,name) => void createEntry(directory,name)}
        onUpload={(file) => void upload(file)}
        onOpenRecycle={() => void loadRecycle()}
      />
      {content && <HostFileEditorDrawer content={content} busy={task.isBusy('save-file')} onChange={setContent} onClose={() => setContent(null)} onSave={() => void saveFile()} />}
      {recycleOpen && <HostRecycleDrawer items={recycleItems} busy={task.isBusy()} onClose={() => setRecycleOpen(false)} onRestore={(item) => void restore(item)} />}
    </div>
  );
}

function saveBlob(blob: Blob,filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
