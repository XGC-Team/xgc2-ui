export type MarkPromptBrowserError = {
  kind: 'error' | 'unhandledrejection';
  message: string;
  occurredAt: string;
};

const MAX_RETAINED_ERRORS = 20;
const errors: MarkPromptBrowserError[] = [];

export function installMarkPromptBrowserDiagnostics(): () => void {
  const onError = (event: ErrorEvent) => {
    append('error', event.message || 'Browser error');
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    append(
      'unhandledrejection',
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string' ? reason : 'Unhandled promise rejection',
    );
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

export function recentMarkPromptBrowserErrors(options: { limit?: number;sinceMs?: number } = {}): MarkPromptBrowserError[] {
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 10), MAX_RETAINED_ERRORS));
  const since = Date.now() - Math.max(0, options.sinceMs ?? 2 * 60_000);
  return errors
    .filter((item) => Date.parse(item.occurredAt) >= since)
    .slice(-limit)
    .map((item) => ({ ...item }));
}

export function clearMarkPromptBrowserErrorsForTest(): void {
  errors.splice(0, errors.length);
}

export function redactBrowserDiagnosticMessage(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(
      /["']?\b(authorization|cookie|set-cookie|(?:access|refresh|id)[-_]?token|token|password|secret|api[-_]?key)\b["']?\s*[:=]\s*["']?[^\s,;"'}]+["']?/gi,
      '$1=[redacted]',
    )
    .replace(/https?:\/\/[^\s)\]}]+/gi, (candidate) => {
      try {
        const url = new URL(candidate);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[redacted-url]';
      }
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || 'Browser error';
}

function append(kind: MarkPromptBrowserError['kind'], message: string): void {
  errors.push({ kind,message: redactBrowserDiagnosticMessage(message),occurredAt: new Date().toISOString() });
  if (errors.length > MAX_RETAINED_ERRORS) errors.splice(0, errors.length - MAX_RETAINED_ERRORS);
}
