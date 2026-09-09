import { useCallback,useRef,useState } from 'react';
import type { StatusTone } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import { appOperationAcceptedMessage,appStoreJobIntent } from './appStoreActionModel';
import type { AppStoreInstallOperation } from './appStoreModel';
import { installAppStoreApp,operateAppStoreInstall } from './appStoreService';

type OperationFeedback = { tone: StatusTone;text: string };

export function useAppStoreInstallOperations({ targetId,apiTarget }: {
  targetId: string;
  apiTarget: ApiTargetOptions;
}) {
  const feedbackRequestRef = useRef(0);
  const [pending,setPending] = useState<Record<string,number>>({});
  const [feedback,setFeedback] = useState<OperationFeedback | null>(null);

  const submit = useCallback(async (key: string, action: string, request: () => Promise<unknown>) => {
    const feedbackRequest = feedbackRequestRef.current + 1;
    feedbackRequestRef.current = feedbackRequest;
    setPending((current) => ({ ...current,[key]: (current[key] ?? 0) + 1 }));
    setFeedback(null);
    try {
      await request();
      if (feedbackRequestRef.current === feedbackRequest) {
        setFeedback({ tone: 'success',text: appOperationAcceptedMessage(action) });
      }
      return true;
    } catch (cause) {
      if (feedbackRequestRef.current === feedbackRequest) {
        setFeedback({ tone: 'danger',text: messageOf(cause) });
      }
      return false;
    } finally {
      setPending((current) => {
        const count = (current[key] ?? 1) - 1;
        if (count > 0) return { ...current,[key]: count };
        const { [key]: _completed,...rest } = current;
        return rest;
      });
    }
  }, []);

  const install = useCallback((appId: string, version: string) => submit(`install:${appId}`, 'install', () => {
    const intent = appStoreJobIntent('app.install', appId, targetId);
    return installAppStoreApp(appId, { action: 'install',version,...intent }, apiTarget);
  }), [apiTarget,submit,targetId]);

  const operate = useCallback((id: string, operation: AppStoreInstallOperation, version?: string) => (
    submit(`${operation}:${id}`, operation, () => {
      const intent = appStoreJobIntent(`app.${operation}`, id, targetId);
      return operateAppStoreInstall(id, { action: operation,...(version ? { version } : {}),...intent }, apiTarget);
    })
  ), [apiTarget,submit,targetId]);

  const isBusy = useCallback((action: AppStoreInstallOperation | 'install', id: string) => (
    Boolean(pending[`${action}:${id}`])
  ), [pending]);
  const isInstallBusy = useCallback((id: string) => (
    Object.keys(pending).some((key) => key.endsWith(`:${id}`))
  ), [pending]);

  return { feedback,install,isBusy,isInstallBusy,operate };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
