import type { HomeCardContribution, HomeCardProps } from '../../shared/productWebComposition';
import { RecordingLibrary, type RecordingLibraryActionContribution } from './RecordingLibrary';
import { useRecordingLibrary } from './useRecordingLibrary';

export function createRecordingLibraryCardContribution(
  actions: readonly RecordingLibraryActionContribution[] = [],
): HomeCardContribution {
  function RecordingLibraryCard({ runtime }: HomeCardProps) {
    const library = useRecordingLibrary();
    return (
      <RecordingLibrary
        library={library}
        runtime={runtime}
        actions={actions}
      />
    );
  }

  return {
    owner: 'Home.RecordingLibrary',
    id: 'recording-library',
    component: RecordingLibraryCard,
  };
}
