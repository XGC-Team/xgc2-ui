import type { RecordingLibraryActionContribution } from '../../domains/home/homePublic';
import { RecordingOpenFolderAction } from './RecordingOpenFolderAction';

export const recordingOpenFolderActionContribution = {
  id: 'recording-open-folder',
  component: RecordingOpenFolderAction,
} as const satisfies RecordingLibraryActionContribution;
