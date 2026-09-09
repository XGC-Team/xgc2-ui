import { useCallback,useEffect,useRef,useState } from 'react';
import type { StatusTone } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import { DEFAULT_APP_STORE_SETTING,type AppStoreSetting } from './appStoreModel';
import { saveAppStoreSetting } from './appStoreService';

type SettingsFeedback = { tone: StatusTone;text: string };

/**
 * Auto-saves image-registry settings on every edit.
 * Concurrent edits collapse into a trailing save of the latest draft (no setTimeout).
 */
export function useAppStoreSettingsSession({ targetId,apiTarget,setting }: {
  targetId: string;
  apiTarget: ApiTargetOptions;
  setting?: AppStoreSetting;
}) {
  const [draft,setDraft] = useState(setting ?? DEFAULT_APP_STORE_SETTING);
  const dirtyRef = useRef(false);
  const draftRef = useRef(draft);
  const inflightRef = useRef(false);
  const pendingRef = useRef(false);
  const [saving,setSaving] = useState(false);
  const [feedback,setFeedback] = useState<SettingsFeedback | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!dirtyRef.current) {
      const next = setting ?? DEFAULT_APP_STORE_SETTING;
      draftRef.current = next;
      setDraft(next);
    }
  }, [setting]);

  const flush = useCallback(async () => {
    if (inflightRef.current) {
      pendingRef.current = true;
      return;
    }
    inflightRef.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      do {
        pendingRef.current = false;
        const next = draftRef.current;
        try {
          const saved = await saveAppStoreSetting(targetId, next, apiTarget);
          if (pendingRef.current) continue;
          dirtyRef.current = false;
          draftRef.current = saved;
          setDraft(saved);
        } catch (cause) {
          if (!pendingRef.current) {
            setFeedback({ tone: 'danger',text: messageOf(cause) });
          }
        }
      } while (pendingRef.current);
    } finally {
      inflightRef.current = false;
      setSaving(false);
    }
  }, [apiTarget,targetId]);

  const updateDraft = useCallback((next: AppStoreSetting) => {
    dirtyRef.current = true;
    draftRef.current = next;
    setDraft(next);
    void flush();
  }, [flush]);

  return { draft,feedback,saving,setDraft: updateDraft };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
