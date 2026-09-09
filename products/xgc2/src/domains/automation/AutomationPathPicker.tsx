import { FileText,Folder,RefreshCw } from 'lucide-react';
import { Modal } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import '../../styles/automation-path.css';
import { useAutomationCanvasText } from './automationCanvasMessages';
import {
  automationPathFileExtensionPickerHint,
  automationPickerHostLabel,
  type AutomationPathKind,
  type AutomationPathPickerVariant,
} from './automationPathPickerModel';
import { useAutomationPathBrowser } from './useAutomationPathBrowser';

/**
 * Host path browser dialog.
 *
 * - `variant="path"` (default): generic file/directory selection. Callers pass
 *   `fileExtensions` to filter suffixes (e.g. ['.rviz'], ['.yaml']). No scene preview.
 * - `variant="world"`: Gazebo world picker only — catalog open path + companion scene preview.
 *   Do not use this for RViz configs or other non-world paths.
 */
export function AutomationPathPicker({
  targetId,
  kind,
  fileExtensions,
  value,
  variant = 'path',
  onSelect,
  onClose,
}: {
  targetId: string;
  kind: AutomationPathKind;
  fileExtensions?: readonly string[];
  value: string;
  variant?: AutomationPathPickerVariant;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const t = useAutomationCanvasText();
  const {
    error,files,load,loading,path,preview,previewLoading,selectedFile,selectFile,setPath,visibleEntries,worldPicker,
  } = useAutomationPathBrowser({ targetId,kind,fileExtensions,value,variant });
  const hostLabel = automationPickerHostLabel(targetId);
  // Filter copy belongs in the dialog header so operators know why other suffixes are hidden.
  const extensionHint = kind === 'file' ? automationPathFileExtensionPickerHint(fileExtensions) : undefined;
  const title = t('Select {kind} on {host}', { kind: t(kind),host: hostLabel });
  return (
    <Modal
      className="automation-path-picker"
      closeLabel={t('Close path picker')}
      dialogProps={{
        'data-xgc-role': 'automation-path-picker',
        'data-xgc-id': `${targetId}:${kind}`,
        'data-xgc-variant': variant,
      }}
      onClose={onClose}
      portal={false}
      size="large"
      title={(
        <span className="automation-path-picker-title">
          <span>{title}</span>
          {extensionHint && (
            <small data-xgc-role="automation-path-picker-extension-hint" data-xgc-id="automation-path-picker-extension-hint">{extensionHint}</small>
          )}
        </span>
      )}
      actions={(
        <>
          <ControlButton size="compact" type="button" onClick={onClose} dataXgcRole="automation-path-picker-cancel" dataXgcId="automation-path-picker-cancel">{t('Cancel')}</ControlButton>
          {kind === 'file' && <ControlButton size="compact" tone="success" type="button" disabled={!selectedFile || loading} onClick={() => selectedFile && onSelect(selectedFile.path)} dataXgcRole="automation-path-picker-select-file" dataXgcId="automation-path-picker-select-file">{t('Select file')}</ControlButton>}
          {kind === 'directory' && <ControlButton size="compact" tone="success" type="button" disabled={!files || loading} onClick={() => files && onSelect(files.path)} dataXgcRole="automation-path-picker-select-folder" dataXgcId="automation-path-picker-select-folder">{t('Select folder')}</ControlButton>}
        </>
      )}
    >
      <div className="automation-path-picker-content" data-xgc-variant={variant}>
        <div className="automation-path-picker-toolbar">
          <ControlButton iconOnly type="button" aria-label={t('Open parent folder')} disabled={loading || !files?.parent || files.parent === files.path} onClick={() => files?.parent && void load(files.parent)} dataXgcRole="automation-path-picker-parent" dataXgcId="automation-path-picker-parent">..</ControlButton>
          <InputControl className="automation-path-picker-location" aria-label={t('Execution host folder')} value={path} onChange={setPath} onKeyDown={(event) => event.key === 'Enter' && void load(path)} />
          <ControlButton iconOnly type="button" aria-label={t('Open folder')} disabled={loading} onClick={() => void load(path)} dataXgcRole="automation-path-picker-open" dataXgcId="automation-path-picker-open"><RefreshCw size={14} /></ControlButton>
        </div>
        <div className="automation-path-picker-body">
          <div className="automation-path-picker-list" data-xgc-role="automation-path-picker-list" data-xgc-id={files?.path ?? path}>
            {visibleEntries.map((entry) => (
              <ControlButton
                key={entry.path}
                type="button"
                appearance="ghost"
                className="automation-path-picker-entry"
                data-xgc-kind={entry.isDir ? 'directory' : 'file'}
                dataXgcId={entry.path}
                dataXgcRole="automation-path-picker-entry"
                disabled={!entry.isDir && kind === 'directory'}
                aria-pressed={!entry.isDir ? selectedFile?.path === entry.path : undefined}
                onClick={() => entry.isDir ? void load(entry.path) : void selectFile(entry)}
                onDoubleClick={() => !entry.isDir && kind === 'file' && onSelect(entry.path)}
              >
                {entry.isDir ? <Folder size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
                <span>{entry.name}</span>
              </ControlButton>
            ))}
            {loading && <div className="automation-path-picker-status">{t('Loading…')}</div>}
            {!loading && error && <div className="automation-path-picker-status" data-xgc-tone="danger" role="alert">{error}</div>}
            {!loading && !error && visibleEntries.length === 0 && <div className="automation-path-picker-status">{t('Folder is empty')}</div>}
          </div>
          {worldPicker && (
            <aside className="automation-path-picker-preview" aria-live="polite" data-xgc-role="automation-path-picker-world-preview" data-xgc-id="automation-path-picker-world-preview">
              <strong>{t('Scene preview')}</strong>
              {previewLoading && <div className="automation-path-picker-preview-empty">{t('Loading preview…')}</div>}
              {!previewLoading && preview?.imageDataUrl && <img src={preview.imageDataUrl} alt={t('{name} scene preview', { name: selectedFile?.name ?? 'World' })} />}
              {!previewLoading && preview?.description && <p>{preview.description}</p>}
              {!previewLoading && selectedFile?.name.toLowerCase().endsWith('.world') && !preview?.imageDataUrl && !preview?.description && (
                <div className="automation-path-picker-preview-empty">{t('No companion preview is installed for this world.')}</div>
              )}
              {!previewLoading && !selectedFile?.name.toLowerCase().endsWith('.world') && (
                <div className="automation-path-picker-preview-empty">{t('Select a .world file to preview its scene.')}</div>
              )}
            </aside>
          )}
        </div>
      </div>
    </Modal>
  );
}
