import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { AudioCaptureControl, type AudioCaptureControlProps } from './AudioCapture';
import { FormField, FormGroup, SegmentedControl } from './FormControls';
import { Input } from './Input';
import { Panel } from './Panel';

export type SpeechOutputScript = 'simplified' | 'original';

export type SpeechConnectionValues = {
  apiKey: string;
  endpoint: string;
  outputScript: SpeechOutputScript;
  trimLeadingSilence: boolean;
};

export type SpeechConnectionFormLabels = {
  apiKey: ReactNode;
  endpoint: ReactNode;
  keepLeadingSilence: ReactNode;
  originalScript: ReactNode;
  outputScript: ReactNode;
  simplifiedScript: ReactNode;
  trimLeadingSilence: ReactNode;
  trimLeadingSilenceOption: ReactNode;
};

const defaultConnectionLabels: SpeechConnectionFormLabels = {
  apiKey: 'API key',
  endpoint: 'API origin',
  keepLeadingSilence: 'Keep',
  originalScript: 'Original',
  outputScript: 'Chinese output',
  simplifiedScript: 'Simplified',
  trimLeadingSilence: 'Leading silence',
  trimLeadingSilenceOption: 'Trim',
};

export type SpeechConnectionFormProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  disabled?: boolean;
  labels?: Partial<SpeechConnectionFormLabels>;
  onChange: (value: SpeechConnectionValues) => void;
  value: SpeechConnectionValues;
};

/**
 * Connection fields for a user-supplied speech API. Products own persistence,
 * probing, and transport; this form only presents the shared field contract.
 */
export function SpeechConnectionForm({
  className,
  disabled = false,
  labels,
  onChange,
  value,
  ...props
}: SpeechConnectionFormProps) {
  const copy = { ...defaultConnectionLabels, ...labels };
  return (
    <div {...props} className={classNames('xgc-speech-connection', className)}>
      <FormField label={copy.endpoint} required>
        <Input
          autoComplete="url"
          disabled={disabled}
          onValueChange={(endpoint) => onChange({ ...value, endpoint })}
          required
          type="url"
          value={value.endpoint}
        />
      </FormField>
      <FormField label={copy.apiKey}>
        <Input
          autoComplete="off"
          disabled={disabled}
          onValueChange={(apiKey) => onChange({ ...value, apiKey })}
          type="password"
          value={value.apiKey}
        />
      </FormField>
      <FormGroup label={copy.outputScript}>
        <SegmentedControl
          ariaLabel={typeof copy.outputScript === 'string' ? copy.outputScript : 'Chinese output'}
          onValueChange={(outputScript) => onChange({
            ...value,
            outputScript: outputScript === 'original' ? 'original' : 'simplified',
          })}
          options={[
            { label: copy.simplifiedScript, value: 'simplified' },
            { label: copy.originalScript, value: 'original' },
          ]}
          value={value.outputScript}
        />
      </FormGroup>
      <FormGroup label={copy.trimLeadingSilence}>
        <SegmentedControl
          ariaLabel={typeof copy.trimLeadingSilence === 'string' ? copy.trimLeadingSilence : 'Leading silence'}
          onValueChange={(next) => onChange({ ...value, trimLeadingSilence: next === 'trim' })}
          options={[
            { label: copy.trimLeadingSilenceOption, value: 'trim' },
            { label: copy.keepLeadingSilence, value: 'keep' },
          ]}
          value={value.trimLeadingSilence ? 'trim' : 'keep'}
        />
      </FormGroup>
    </div>
  );
}

export type SpeechTranscriptProps = HTMLAttributes<HTMLDivElement> & {
  finalText: string;
  label?: string;
  stablePartialText?: string;
  unstablePartialText?: string;
};

/**
 * Replacement-friendly live transcript. Final text is persistent; stable then
 * unstable partials are visually quieter and may be replaced by the next event.
 */
export function SpeechTranscript({
  className,
  finalText,
  label = 'Transcript',
  stablePartialText = '',
  unstablePartialText = '',
  ...props
}: SpeechTranscriptProps) {
  const stablePrefix = finalText && stablePartialText ? '\n' : '';
  const unstablePrefix = (finalText || stablePartialText) && unstablePartialText && !stablePartialText
    ? '\n'
    : '';
  return (
    <div
      {...props}
      aria-label={label}
      aria-live="polite"
      className={classNames('xgc-speech-transcript', className)}
    >
      <span className="xgc-speech-transcript-final">{finalText}</span>
      {stablePartialText ? (
        <span className="xgc-speech-transcript-stable">{stablePrefix}{stablePartialText}</span>
      ) : null}
      {unstablePartialText ? (
        <span className="xgc-speech-transcript-unstable">{unstablePrefix}{unstablePartialText}</span>
      ) : null}
    </div>
  );
}

export type SpeechClientWorkspaceProps = HTMLAttributes<HTMLDivElement> & {
  capture: AudioCaptureControlProps;
  captureStatus?: ReactNode;
  captureTitle?: ReactNode;
  extra?: ReactNode;
  transcript: Pick<SpeechTranscriptProps, 'finalText' | 'label' | 'stablePartialText' | 'unstablePartialText'>;
  transcriptActions?: ReactNode;
  transcriptTitle?: ReactNode;
};

/**
 * Embeddable speech-client page chrome: capture, live transcript, and optional
 * product extra surfaces. Microphone access, WebSocket streaming, and API
 * origins remain product-owned.
 */
export function SpeechClientWorkspace({
  capture,
  captureStatus,
  captureTitle = 'Live transcription',
  children,
  className,
  extra,
  transcript,
  transcriptActions,
  transcriptTitle = 'Transcript',
  ...props
}: SpeechClientWorkspaceProps) {
  const extras = extra ?? children;
  return (
    <div {...props} className={classNames('xgc-speech-client', className)}>
      <Panel
        actions={captureStatus}
        className="xgc-speech-client-capture"
        padding="none"
        title={captureTitle}
      >
        <AudioCaptureControl {...capture} />
      </Panel>
      <Panel
        actions={transcriptActions}
        className="xgc-speech-client-result"
        padding="none"
        title={transcriptTitle}
      >
        <SpeechTranscript {...transcript} />
      </Panel>
      {extras ? <div className="xgc-speech-client-extra">{extras}</div> : null}
    </div>
  );
}
