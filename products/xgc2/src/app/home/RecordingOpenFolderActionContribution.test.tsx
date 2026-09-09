// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { recordingOpenFolderActionContribution } from './RecordingOpenFolderActionContribution';

const mocks = vi.hoisted(() => ({
  getRecordingLocation: vi.fn(),
  requestHostFilePath: vi.fn(),
  setManagedHostId: vi.fn(),
  setTargetCoreId: vi.fn(),
  setPageSection: vi.fn(),
  navigatePage: vi.fn(),
}));

vi.mock('../navigationContext', () => ({
  useNavigation: () => ({
    language: 'en-US',
    setManagedHostId: mocks.setManagedHostId,
    setTargetCoreId: mocks.setTargetCoreId,
    setPageSection: mocks.setPageSection,
    navigatePage: mocks.navigatePage,
  }),
}));
vi.mock('../../domains/host/hostPublic', () => ({ requestHostFilePath: mocks.requestHostFilePath }));
vi.mock('../../domains/recording/recordingPublic', () => ({ getRecordingLocation: mocks.getRecordingLocation }));

const Action = recordingOpenFolderActionContribution.component;
const runtime = { language: 'en-US' as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecordingLocation.mockResolvedValue({
    path: '/home/operator/Documents/XGC/ScreenRecording',
  });
});

describe('RecordingOpenFolderActionContribution', () => {
  it('exports a stable contribution id', () => {
    expect(recordingOpenFolderActionContribution.id).toBe('recording-open-folder');
  });

  it('renders stable open-folder selectors and navigates to local System files', async () => {
    const { container } = render(<Action runtime={runtime} />);

    const button = container.querySelector(
      '[data-xgc-role="recording-open-folder"][data-xgc-id="recording-open-folder"]',
    );
    expect(button).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder' })).toBe(button);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    await vi.waitFor(() => {
      expect(mocks.getRecordingLocation).toHaveBeenCalledOnce();
    });
    expect(mocks.requestHostFilePath).toHaveBeenCalledWith(
      '/home/operator/Documents/XGC/ScreenRecording',
    );
    expect(mocks.setManagedHostId).toHaveBeenCalledWith('local');
    expect(mocks.setTargetCoreId).toHaveBeenCalledWith('');
    expect(mocks.setPageSection).toHaveBeenCalledWith('system','files');
    expect(mocks.navigatePage).toHaveBeenCalledWith('system');
  });

  it('surfaces an open-folder error when location lookup fails', async () => {
    mocks.getRecordingLocation.mockRejectedValue(new Error('missing'));
    render(<Action runtime={runtime} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    await vi.waitFor(() => {
      expect(screen.getByText('Could not open the recording folder.')).toBeInTheDocument();
    });
    expect(mocks.requestHostFilePath).not.toHaveBeenCalled();
    expect(mocks.navigatePage).not.toHaveBeenCalled();
  });
});
