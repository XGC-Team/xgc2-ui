import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AppShell,
  Button,
  ProductBrand,
  SpeechClientWorkspace,
  SpeechConnectionForm,
  StatusText,
  Topbar,
  type AudioCaptureState,
  type SpeechConnectionValues,
} from '@xgc2/ui-react';

const meta = {
  title: 'Application/Speech Client',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SpeechClientExample() {
  const [captureState, setCaptureState] = useState<AudioCaptureState>('idle');
  const [connection, setConnection] = useState<SpeechConnectionValues>({
    apiKey: '',
    endpoint: '',
    outputScript: 'simplified',
    trimLeadingSilence: true,
  });
  return (
    <AppShell
      contentPadding="none"
      topbar={(
        <Topbar
          actions={<Button appearance="ghost" uiSize="compact">Settings</Button>}
          brand={<ProductBrand product="STT" />}
        />
      )}
    >
      <SpeechClientWorkspace
        capture={{
          actionLabel: captureState === 'recording' ? 'Stop and transcribe' : 'Start recording',
          cancelLabel: 'Cancel',
          onAction: () => setCaptureState(captureState === 'recording' ? 'idle' : 'recording'),
          onCancel: () => setCaptureState('idle'),
          state: captureState,
          waveformLabel: 'Microphone input activity',
          waveformLevels: captureState === 'recording'
            ? [0.04, 0.12, 0.28, 0.46, 0.33, 0.18, 0.09]
            : [],
        }}
        captureStatus={captureState === 'recording' ? <StatusText status="recording">Recording</StatusText> : null}
        extra={<SpeechConnectionForm onChange={setConnection} value={connection} />}
        transcript={{
          finalText: 'Shared speech client chrome.',
          unstablePartialText: captureState === 'recording' ? ' Listening' : '',
        }}
        transcriptActions={<Button appearance="ghost" uiSize="compact">Copy</Button>}
      />
    </AppShell>
  );
}

export const Default: Story = {
  render: () => <SpeechClientExample />,
};
