import {
  forwardRef,
  useId,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';
import { Button, type ButtonProps } from './Button';
import { Textarea, type TextareaProps } from './FormControls';
import { StatusText, type StatusTone } from './StatusText';

export type ConversationDensity = 'default' | 'compact';
export type ConversationMessageDensity = ConversationDensity | 'summary';
export type ConversationSpeaker = 'agent' | 'operator' | 'system';

type DataAttributes = {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export type ConversationRegionProps = HTMLAttributes<HTMLDivElement> & {
  busy?: boolean;
  density?: ConversationDensity;
  label: string;
};

/**
 * The shared, independently scrolling timeline for human/agent conversation.
 * Products retain follow-tail policy, but not the log semantics or scroll skin.
 */
export const ConversationRegion = forwardRef<HTMLDivElement, ConversationRegionProps>(function ConversationRegion({
  busy = false,
  children,
  className,
  density = 'default',
  label,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      {...props}
      aria-busy={busy || undefined}
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions text"
      className={classNames('xgc-conversation-region', className)}
      data-density={density}
      role="log"
    >
      {children}
    </div>
  );
});

export type ConversationMessageProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  appearance?: 'plain' | 'surface';
  author?: ReactNode;
  avatar?: ReactNode;
  children: ReactNode;
  dateTime?: string;
  density?: ConversationMessageDensity;
  speaker: ConversationSpeaker;
  speakerLabel?: ReactNode;
  timestamp?: ReactNode;
};

const defaultSpeakerLabels: Record<ConversationSpeaker, string> = {
  agent: 'Agent',
  operator: 'Operator',
  system: 'System',
};

/**
 * A message owns author/time placement and speaker alignment. Avatars are
 * deliberately unframed: a colored disc is not used as an identity or state
 * shortcut.
 */
export function ConversationMessage({
  appearance,
  author,
  avatar,
  children,
  className,
  dateTime,
  density = 'default',
  speaker,
  speakerLabel,
  timestamp,
  ...props
}: ConversationMessageProps) {
  const resolvedAppearance = appearance ?? (speaker === 'operator' ? 'surface' : 'plain');
  return (
    <article
      {...props}
      className={classNames('xgc-conversation-message', className)}
      data-appearance={resolvedAppearance}
      data-avatar={avatar ? true : undefined}
      data-density={density}
      data-speaker={speaker}
    >
      <span className="xgc-visually-hidden">{speakerLabel ?? defaultSpeakerLabels[speaker]}</span>
      {avatar ? <span className="xgc-conversation-message-avatar" aria-hidden="true">{avatar}</span> : null}
      <div className="xgc-conversation-message-body">
        {density === 'default' && (author || timestamp) ? (
          <header className="xgc-conversation-message-meta">
            {author ? <strong>{author}</strong> : <span />}
            {timestamp ? <time dateTime={dateTime}>{timestamp}</time> : null}
          </header>
        ) : null}
        <div className="xgc-conversation-message-content">{children}</div>
      </div>
    </article>
  );
}

export type AgentActivityProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onToggle' | 'title'> & {
  actions?: ReactNode;
  children?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: ReactNode;
  leading?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  status?: string;
  statusLabel?: ReactNode;
  statusTone?: StatusTone;
  title: ReactNode;
};

/**
 * Neutral activity/request surface for tool calls and agent work. State is
 * always plain text; the enclosing surface never changes material by state.
 */
export function AgentActivity({
  actions,
  children,
  className,
  collapsible = false,
  defaultOpen,
  description,
  leading,
  onOpenChange,
  open,
  status,
  statusLabel,
  statusTone,
  title,
  ...props
}: AgentActivityProps) {
  const [internalOpen, setInternalOpen] = useState(Boolean(defaultOpen));
  const resolvedOpen = open ?? internalOpen;
  const heading = (
    <>
      {leading ? <span className="xgc-agent-activity-leading" aria-hidden="true">{leading}</span> : null}
      <span className="xgc-agent-activity-title">{title}</span>
      {status ? <StatusText className="xgc-agent-activity-status" status={status} tone={statusTone}>{statusLabel}</StatusText> : null}
    </>
  );
  const content = description || children || actions ? (
    <div className="xgc-agent-activity-content">
      {description ? <div className="xgc-agent-activity-description">{description}</div> : null}
      {children}
      {actions ? <div className="xgc-agent-activity-actions">{actions}</div> : null}
    </div>
  ) : null;

  if (collapsible) {
    return (
      <details
        {...props}
        className={classNames('xgc-agent-activity', className)}
        open={resolvedOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          if (open === undefined) setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
      >
        <summary className="xgc-agent-activity-summary">
          {heading}
          <span className="xgc-agent-activity-chevron" aria-hidden="true">›</span>
        </summary>
        {content}
      </details>
    );
  }

  return (
    <article {...props} className={classNames('xgc-agent-activity', className)}>
      <header className="xgc-agent-activity-heading">{heading}</header>
      {content}
    </article>
  );
}

export type ConversationComposerProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'children' | 'onSubmit'> & {
  actions?: ReactNode;
  busy?: boolean;
  density?: ConversationDensity;
  disabled?: boolean;
  error?: ReactNode;
  label: string;
  onSubmitMessage: (message: string) => void | Promise<void>;
  onValueChange: (value: string) => void;
  placeholder?: string;
  submitButtonProps?: Omit<ButtonProps, 'children' | 'disabled' | 'type'> & DataAttributes;
  submitDisabled?: boolean;
  submitIcon?: ReactNode;
  submitLabel: string;
  supportingText?: ReactNode;
  textareaProps?: Omit<TextareaProps, 'disabled' | 'onValueChange' | 'placeholder' | 'value'>;
  value: string;
};

/**
 * Shared prompt composer. Enter submits, Shift+Enter inserts a newline, and
 * active IME composition is never mistaken for submission.
 */
export const ConversationComposer = forwardRef<HTMLFormElement, ConversationComposerProps>(function ConversationComposer({
  actions,
  busy = false,
  className,
  density = 'default',
  disabled = false,
  error,
  label,
  onSubmitMessage,
  onValueChange,
  placeholder,
  submitButtonProps,
  submitDisabled = false,
  submitIcon,
  submitLabel,
  supportingText,
  textareaProps,
  value,
  ...props
}, ref) {
  const supportingId = useId();
  const errorId = useId();
  const message = value.trim();
  const inactive = disabled || busy;
  const cannotSubmit = inactive || submitDisabled || !message;
  const describedBy = [textareaProps?.['aria-describedby'], supportingText ? supportingId : undefined]
    .filter(Boolean)
    .join(' ') || undefined;
  const inputLabel = textareaProps?.['aria-label'] === undefined
    && textareaProps?.['aria-labelledby'] === undefined
    ? label
    : textareaProps?.['aria-label'];

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (cannotSubmit) return;
    void onSubmitMessage(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    textareaProps?.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!cannotSubmit) void onSubmitMessage(message);
  }

  return (
    <form
      ref={ref}
      {...props}
      aria-busy={busy || undefined}
      aria-label={label}
      className={classNames('xgc-conversation-composer', className)}
      data-density={density}
      onSubmit={submit}
    >
      <Textarea
        {...textareaProps}
        aria-describedby={describedBy}
        aria-errormessage={error ? errorId : textareaProps?.['aria-errormessage']}
        aria-invalid={error ? true : textareaProps?.['aria-invalid']}
        aria-label={inputLabel}
        className={classNames('xgc-conversation-composer-input', textareaProps?.className)}
        disabled={inactive}
        onKeyDown={handleKeyDown}
        onValueChange={onValueChange}
        placeholder={placeholder}
        rows={textareaProps?.rows ?? (density === 'compact' ? 1 : 2)}
        value={value}
      />
      <div className="xgc-conversation-composer-toolbar">
        {actions ? <div className="xgc-conversation-composer-actions">{actions}</div> : <span />}
        <Button
          {...submitButtonProps}
          aria-label={submitIcon ? submitLabel : submitButtonProps?.['aria-label']}
          className={classNames('xgc-conversation-composer-submit', submitButtonProps?.className)}
          disabled={cannotSubmit}
          iconOnly={Boolean(submitIcon)}
          tone="primary"
          type="submit"
          uiSize="compact"
        >
          {submitIcon ?? submitLabel}
        </Button>
      </div>
      {supportingText ? <div className="xgc-conversation-composer-supporting" id={supportingId}>{supportingText}</div> : null}
      {error ? <div className="xgc-conversation-composer-error" id={errorId} role="alert">{error}</div> : null}
    </form>
  );
});
