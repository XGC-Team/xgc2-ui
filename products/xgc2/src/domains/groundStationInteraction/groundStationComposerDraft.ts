import { createDeadlineTimer, type DeadlineTimer } from '../../shared/eventCoalescer';

export const COMPOSER_DRAFT_DEBOUNCE_MS = 300;

export type GroundStationComposerDraft = {
  version: 1;
  text: string;
  /** Reserved for references, not attachment bytes. Text is the only current editor. */
  attachments: readonly unknown[];
  context: readonly unknown[];
  updatedAt: number;
};

export function groundStationComposerDraftKey(experimentId: string, draftId: string): string {
  return `xgc.ground-station.composer-drafts.v1.${experimentId}.${draftId}`;
}

export function emptyGroundStationComposerDraft(): GroundStationComposerDraft {
  return { version: 1, text: '', attachments: [], context: [], updatedAt: 0 };
}

export function readGroundStationComposerDraft(storage: Pick<Storage, 'getItem'> | undefined, key: string): GroundStationComposerDraft {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return emptyGroundStationComposerDraft();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyGroundStationComposerDraft();
    const draft = value as Partial<GroundStationComposerDraft>;
    if (draft.version !== 1 || typeof draft.text !== 'string') return emptyGroundStationComposerDraft();
    return {
      version: 1, text: draft.text,
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
      context: Array.isArray(draft.context) ? draft.context : [],
      updatedAt: typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt) ? draft.updatedAt : 0,
    };
  } catch {
    // An old/corrupt or unavailable browser store must not break the composer.
    return emptyGroundStationComposerDraft();
  }
}

/** A write buffer only. Rendered draft state belongs to GroundStationChatStore. */
export class GroundStationDraftPersistence {
  private pending?: GroundStationComposerDraft;
  private readonly timer: DeadlineTimer;
  constructor(
    private readonly storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
    readonly key: string,
    private readonly onError?: (message: string) => void,
  ) { this.timer = createDeadlineTimer(this.flush); }

  schedule(draft: GroundStationComposerDraft): void {
    this.pending = draft;
    this.timer.schedule(COMPOSER_DRAFT_DEBOUNCE_MS);
  }

  flush = (): boolean => {
    this.timer.cancel();
    const draft = this.pending;
    if (!draft) return true;
    if (!this.storage) { this.onError?.('Browser draft storage is unavailable.'); return false; }
    try {
      if (!draft.text && !draft.attachments.length && !draft.context.length) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify(draft));
      this.pending = undefined;
      this.onError?.('');
      return true;
    } catch (cause) {
      // Keep the pending buffer so beforeunload/unmount can retry the same text.
      this.onError?.(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  };

  clear(): void {
    this.pending = emptyGroundStationComposerDraft();
    this.flush();
  }

}
