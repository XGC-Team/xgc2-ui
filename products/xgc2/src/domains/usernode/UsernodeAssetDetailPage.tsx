import { useEffect } from 'react';
import { useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import '../../styles/asset-detail.css';
import type { UsernodeAssetDocument,UsernodeAssetSpec } from './usernodeContractsPublic';
import { UsernodeScriptEditor } from './UsernodeScriptEditor';
import { useUsernodeAssetEditor } from './useUsernodeAssetEditor';

export function UsernodeAssetDetailPage({ document,readOnly = false,onBack,onCommit }: {
  document: UsernodeAssetDocument;
  readOnly?: boolean;
  onBack: () => void;
  onCommit: (base: UsernodeAssetDocument, spec: UsernodeAssetSpec, reason: string) => Promise<UsernodeAssetDocument>;
}) {
  const {
    draft,saving,error,saveDisabled,saveTitle,
    setSpec,setBody,setPublicFile,setInputCommand,save,
  } = useUsernodeAssetEditor({ document,readOnly,onCommit });

  useGroundStationErrorNotification('local', error, {
    title: 'User scripts',source: 'usernode-asset-detail',dedupeKey: 'usernode-asset-detail:error',
  });

  useEffect(() => {
    const leaveDetail = () => onBack();
    window.addEventListener('xgc:usernode-list', leaveDetail);
    return () => window.removeEventListener('xgc:usernode-list', leaveDetail);
  }, [onBack]);

  return (
    <div
      className="xgc-asset-detail xgc-workspace-full-span"
      data-xgc-role="usernode-asset-detail"
      data-xgc-id={document.head.resourceId}
      data-xgc-readonly={readOnly || undefined}
    >
      <section className="xgc-asset-detail-section" data-xgc-role="usernode-script-section" data-xgc-id={document.head.resourceId}>
        <UsernodeScriptEditor
          spec={draft.spec}
          publicFile={draft.publicFile}
          inputCommand={draft.inputCommand}
          body={draft.body}
          readOnly={readOnly}
          saving={saving}
          saveDisabled={saveDisabled}
          saveTitle={saveTitle}
          onChange={setSpec}
          onPublicFileChange={setPublicFile}
          onInputCommandChange={setInputCommand}
          onBodyChange={setBody}
          onSave={() => void save()}
        />
      </section>
    </div>
  );
}
