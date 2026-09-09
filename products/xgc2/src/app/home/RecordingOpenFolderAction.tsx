import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { Notice } from '@xgc2/ui-react';
import { recordingLibraryCopy } from '../../domains/home/homePublic';
import { requestHostFilePath } from '../../domains/host/hostPublic';
import { getRecordingLocation } from '../../domains/recording/recordingPublic';
import type { HomeCardProps } from '../../shared/productWebComposition';
import { useNavigation } from '../navigationContext';

export function RecordingOpenFolderAction({ runtime }: HomeCardProps) {
  const nav = useNavigation();
  const copy = recordingLibraryCopy[runtime.language];
  const [openingFolder, setOpeningFolder] = useState(false);
  const [folderError, setFolderError] = useState('');

  const openFolder = async () => {
    setOpeningFolder(true);
    setFolderError('');
    try {
      const location = await getRecordingLocation();
      requestHostFilePath(location.path);
      nav.setManagedHostId('local');
      nav.setTargetCoreId('');
      nav.setPageSection('system', 'files');
      nav.navigatePage('system');
    } catch {
      setFolderError(copy.openFolderError);
    } finally {
      setOpeningFolder(false);
    }
  };

  return (
    <>
      <ControlButton
        size="compact"
        disabled={openingFolder}
        onClick={() => { void openFolder(); }}
        data-xgc-role="recording-open-folder"
        data-xgc-id="recording-open-folder"
      >
        <FolderOpen size={14} aria-hidden="true" />
        {openingFolder ? copy.openingFolder : copy.openFolder}
      </ControlButton>
      {folderError ? <Notice tone="danger" density="compact">{folderError}</Notice> : null}
    </>
  );
}
