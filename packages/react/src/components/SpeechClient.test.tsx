import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SpeechClientWorkspace,
  SpeechConnectionForm,
  SpeechTranscript,
  type SpeechConnectionValues,
} from './SpeechClient';

const connection: SpeechConnectionValues = {
  apiKey: '',
  endpoint: 'https://stt.example.test',
  outputScript: 'simplified',
  trimLeadingSilence: true,
};

describe('speech client presentation', () => {
  it('keeps connection fields presentational and reports value changes', () => {
    const onChange = vi.fn();
    render(<SpeechConnectionForm onChange={onChange} value={connection} />);
    fireEvent.change(screen.getByDisplayValue('https://stt.example.test'), {
      target: { value: 'https://stt.lan' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...connection, endpoint: 'https://stt.lan' });
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(onChange).toHaveBeenCalledWith({ ...connection, outputScript: 'original' });
  });

  it('renders replacement-friendly transcript without inventing separators', () => {
    const { rerender } = render(
      <SpeechTranscript finalText="已确认" unstablePartialText="草稿" />,
    );
    expect(screen.getByLabelText('Transcript').textContent).toBe('已确认\n草稿');
    rerender(
      <SpeechTranscript
        finalText="已确认"
        stablePartialText="稳定"
        unstablePartialText="草稿"
      />,
    );
    expect(screen.getByLabelText('Transcript').textContent).toBe('已确认\n稳定草稿');
  });

  it('composes capture and transcript chrome for product embedding', () => {
    const onAction = vi.fn();
    render(
      <SpeechClientWorkspace
        capture={{
          actionLabel: 'Start recording',
          onAction,
          state: 'idle',
        }}
        captureTitle="Live transcription"
        extra={<p>Operator extras</p>}
        transcript={{ finalText: 'hello' }}
        transcriptActions={<button type="button">Copy</button>}
        transcriptTitle="Transcript"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Live transcription' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Transcript' })).toHaveTextContent('hello');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText('Operator extras')).toBeInTheDocument();
  });
});
