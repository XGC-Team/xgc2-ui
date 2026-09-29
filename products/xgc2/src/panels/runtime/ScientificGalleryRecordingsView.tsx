import { RecordingLibrary,useRecordingLibrary } from '../../domains/home/homePublic';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { useScientificGalleryFrame } from './scientificGalleryPanelFrameState';

export function ScientificGalleryRecordingsView({ panelId }: { panelId: string }) {
  const language = useAppLanguage();
  const library = useRecordingLibrary();
  const { setRecordingActions,setRecordingSearch } = useScientificGalleryFrame(panelId);
  return (
    <RecordingLibrary
      embedded
      library={library}
      runtime={{ language }}
      onProvidePlayback={setRecordingActions}
      onProvideSearch={setRecordingSearch}
    />
  );
}
