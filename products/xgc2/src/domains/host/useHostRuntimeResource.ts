import { useCallback,useEffect,useRef,useState } from 'react';

type HostRuntimeSnapshot<Value> = {
  epoch: number;
  items: Value;
  busy: boolean;
  error: string;
  settled: boolean;
};

export function useHostRuntimeResource<Value>(
  identity: string,
  load: () => Promise<Value>,
  initialValue: Value,
  failureMessage: string,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const controller = useRef({ identity,epoch: 0,request: 0,mounted: true,initialValue });
  if (controller.current.identity !== identity) {
    controller.current.identity = identity;
    controller.current.initialValue = initialValue;
    controller.current.epoch += 1;
    controller.current.request += 1;
  }
  const epoch = controller.current.epoch;
  const epochInitialValue = controller.current.initialValue;
  const [stored,setStored] = useState<HostRuntimeSnapshot<Value>>(() => emptySnapshot(epoch,epochInitialValue));
  const visible = stored.epoch === epoch ? stored : emptySnapshot(epoch,epochInitialValue);

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
  const updateCurrent = useCallback((update: Partial<Omit<HostRuntimeSnapshot<Value>,'epoch'>>) => {
    if (!isCurrent()) return;
    setStored((current) => ({
      ...(current.epoch === epoch ? current : emptySnapshot(epoch,epochInitialValue)),
      ...update,
      epoch,
    }));
  },[epoch,epochInitialValue,isCurrent]);

  const refresh = useCallback(async () => {
    if (!enabled || !isCurrent()) return false;
    const request = ++controller.current.request;
    const requestIsCurrent = () => isCurrent() && controller.current.request === request;
    updateCurrent({ busy: true,error: '' });
    try {
      const nextItems = await load();
      if (requestIsCurrent()) updateCurrent({ items: nextItems,settled: true });
      return requestIsCurrent();
    } catch (cause) {
      if (requestIsCurrent()) {
        updateCurrent({
          error: cause instanceof Error ? cause.message : failureMessage,
          settled: true,
        });
      }
      return false;
    } finally {
      if (requestIsCurrent()) updateCurrent({ busy: false });
    }
  },[enabled,failureMessage,isCurrent,load,updateCurrent]);

  useEffect(() => {
    if (!enabled) {
      updateCurrent({ settled: true,busy: false });
      return;
    }
    void refresh();
  },[enabled,refresh,updateCurrent]);

  const beginIdentityIntent = useCallback(() => {
    const intentEpoch = epoch;
    return () => controller.current.mounted && controller.current.epoch === intentEpoch;
  },[epoch]);

  return {
    items: visible.items,
    busy: visible.busy,
    error: visible.error,
    settled: visible.settled,
    refresh,
    beginIdentityIntent,
  };
}

function emptySnapshot<Value>(epoch: number,items: Value): HostRuntimeSnapshot<Value> {
  return { epoch,items,busy: false,error: '',settled: false };
}
