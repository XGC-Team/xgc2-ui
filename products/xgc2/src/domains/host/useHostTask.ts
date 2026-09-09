import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { StatusTone } from '@xgc2/ui-react';

type HostTaskOptions = {
  clearMessage?: boolean;
  successMessage?: string;
  quiet?: boolean;
};

type HostTaskSnapshot = {
  epoch: number;
  pendingTasks: ReadonlyMap<string,number>;
  feedback: { message: string; tone: StatusTone };
};

const emptyFeedback: HostTaskSnapshot['feedback'] = { message: '',tone: 'info' };

export function useHostTask(identity = 'default') {
  const controller = useRef({
    identity,epoch: 0,mounted: true,
    leases: new Map<string,{ epoch: number; token: symbol }>(),
  });
  if (controller.current.identity !== identity) {
    controller.current.identity = identity;
    controller.current.epoch += 1;
    controller.current.leases.clear();
  }
  const epoch = controller.current.epoch;
  const [stored,setStored] = useState<HostTaskSnapshot>(() => emptySnapshot(epoch));
  const visible = stored.epoch === epoch ? stored : emptySnapshot(epoch);
  useEffect(() => {
    const lifecycle = controller.current;
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      lifecycle.epoch += 1;
    };
  },[]);
  const isCurrent = useCallback(
    () => controller.current.mounted && controller.current.epoch === epoch,
    [epoch],
  );
  const updateCurrent = useCallback((update: (current: HostTaskSnapshot) => HostTaskSnapshot) => {
    if (!isCurrent()) return;
    setStored((current) => update(current.epoch === epoch ? current : emptySnapshot(epoch)));
  },[epoch,isCurrent]);
  const setMessage = useCallback((message: string,tone: StatusTone = 'info') => {
    updateCurrent((current) => ({ ...current,feedback: { message,tone } }));
  },[updateCurrent]);
  const clearMessage = useCallback(() => {
    updateCurrent((current) => ({ ...current,feedback: emptyFeedback }));
  },[updateCurrent]);

  const run = useCallback(async <Result,>(
    task: string,
    action: () => Promise<Result>,
    options: HostTaskOptions = {},
  ): Promise<Result | undefined> => {
    if (!isCurrent() || controller.current.leases.has(task)) return undefined;
    const token = Symbol(`host-task:${task}`);
    controller.current.leases.set(task,{ epoch,token });
    const ownsLease = () => isCurrent()
      && controller.current.leases.get(task)?.epoch === epoch
      && controller.current.leases.get(task)?.token === token;
    if (options.clearMessage !== false) clearMessage();
    updateCurrent((current) => {
      const pendingTasks = new Map(current.pendingTasks);
      pendingTasks.set(task,(pendingTasks.get(task) ?? 0) + 1);
      return { ...current,pendingTasks };
    });
    try {
      const result = await action();
      if (!ownsLease()) return undefined;
      if (options.successMessage) setMessage(options.successMessage,'success');
      return result;
    } catch (error) {
      if (ownsLease() && !options.quiet) {
        setMessage(error instanceof Error ? error.message : String(error),'danger');
      }
      if (ownsLease() && options.quiet) throw error;
      return undefined;
    } finally {
      if (ownsLease()) {
        controller.current.leases.delete(task);
        updateCurrent((current) => {
          const pendingTasks = new Map(current.pendingTasks);
          const remaining = (pendingTasks.get(task) ?? 1) - 1;
          if (remaining > 0) pendingTasks.set(task,remaining);
          else pendingTasks.delete(task);
          return { ...current,pendingTasks };
        });
      }
    }
  }, [clearMessage,epoch,isCurrent,setMessage,updateCurrent]);

  return useMemo(() => ({
    run,
    message: visible.feedback.message,
    messageTone: visible.feedback.tone,
    setMessage,
    clearMessage,
    isBusy: (task?: string) => task ? (visible.pendingTasks.get(task) ?? 0) > 0 : visible.pendingTasks.size > 0,
  }), [clearMessage,run,setMessage,visible]);
}

function emptySnapshot(epoch: number): HostTaskSnapshot {
  return { epoch,pendingTasks: new Map(),feedback: emptyFeedback };
}
