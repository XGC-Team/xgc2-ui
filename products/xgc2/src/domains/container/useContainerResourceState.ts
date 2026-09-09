import { useCallback,useEffect,useRef,useState } from 'react';
import type { ContainerCommandResult } from './containerService';

type ContainerResourceSnapshot<T> = {
  epoch: number;
  value: T;
  busy: boolean;
  error: string;
  output: string;
};

export function useContainerResourceState<T>({
  initialValue,
  load,
  loadFailure,
  afterMutation,
}: {
  initialValue: T;
  load: () => Promise<T>;
  loadFailure: string;
  afterMutation?: () => Promise<unknown> | unknown;
}) {
  const controller = useRef({
    load,epoch: 0,request: 0,mounted: true,initialValue,
    mutation: undefined as { epoch: number; token: symbol } | undefined,
  });
  if (controller.current.load !== load) {
    controller.current.load = load;
    controller.current.initialValue = initialValue;
    controller.current.epoch += 1;
    controller.current.request += 1;
    controller.current.mutation = undefined;
  }
  const epoch = controller.current.epoch;
  const epochInitialValue = controller.current.initialValue;
  const [stored,setStored] = useState<ContainerResourceSnapshot<T>>(() => emptySnapshot(epoch,epochInitialValue));
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
  const updateCurrent = useCallback((update: Partial<Omit<ContainerResourceSnapshot<T>,'epoch'>>) => {
    if (!isCurrent()) return;
    setStored((current) => ({
      ...(current.epoch === epoch ? current : emptySnapshot(epoch,epochInitialValue)),
      ...update,
      epoch,
    }));
  },[epoch,epochInitialValue,isCurrent]);

  const ownsMutation = useCallback((token: symbol) => (
    isCurrent()
      && controller.current.mutation?.epoch === epoch
      && controller.current.mutation.token === token
  ),[epoch,isCurrent]);
  const refreshResource = useCallback(async (mutationToken?: symbol) => {
    if (!isCurrent()) return false;
    if (controller.current.mutation && (!mutationToken || !ownsMutation(mutationToken))) return false;
    const ownerIsCurrent = () => isCurrent() && (!mutationToken || ownsMutation(mutationToken));
    const request = ++controller.current.request;
    const requestIsCurrent = () => ownerIsCurrent() && controller.current.request === request;
    updateCurrent({ busy: true,error: '' });
    try {
      const nextValue = await load();
      if (requestIsCurrent()) updateCurrent({ value: nextValue });
      return requestIsCurrent();
    } catch (loadError) {
      if (requestIsCurrent()) updateCurrent({ error: containerErrorMessage(loadError,loadFailure) });
      return false;
    } finally {
      if (requestIsCurrent() && !mutationToken) updateCurrent({ busy: false });
    }
  },[isCurrent,load,loadFailure,ownsMutation,updateCurrent]);
  const refresh = useCallback(() => refreshResource(),[refreshResource]);

  useEffect(() => {
    void refresh();
  },[refresh]);

  const execute = useCallback(async (
    task: () => Promise<ContainerCommandResult>,
    successFallback: string,
    failureFallback = successFallback,
  ) => {
    // This synchronous gate also rejects an old event handler that resumes
    // after confirmation once its target/load epoch has changed.
    if (!isCurrent() || controller.current.mutation) return false;
    const mutationToken = Symbol('container-resource-mutation');
    controller.current.mutation = { epoch,token: mutationToken };
    controller.current.request += 1;
    updateCurrent({ busy: true,error: '',output: '' });
    try {
      const result = await task();
      if (!ownsMutation(mutationToken)) return false;
      updateCurrent({ output: result.output || result.path || successFallback });
      await Promise.all([refreshResource(mutationToken),afterMutation?.()]);
      return ownsMutation(mutationToken);
    } catch (commandError) {
      if (ownsMutation(mutationToken)) updateCurrent({ error: containerErrorMessage(commandError,failureFallback) });
      return false;
    } finally {
      if (ownsMutation(mutationToken)) {
        controller.current.mutation = undefined;
        updateCurrent({ busy: false });
      }
    }
  },[afterMutation,epoch,isCurrent,ownsMutation,refreshResource,updateCurrent]);

  const clearOutput = useCallback(() => {
    if (isCurrent()) updateCurrent({ output: '' });
  },[isCurrent,updateCurrent]);

  return {
    value: visible.value,
    busy: visible.busy,
    error: visible.error,
    output: visible.output,
    refresh,
    execute,
    clearOutput,
  };
}

function emptySnapshot<T>(epoch: number,value: T): ContainerResourceSnapshot<T> {
  return { epoch,value,busy: false,error: '',output: '' };
}

export function containerErrorMessage(error: unknown,fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
