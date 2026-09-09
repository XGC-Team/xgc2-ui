import { useEffect,useMemo,useRef,useState } from 'react';
import type { NativeComposerSelection,NativeProviderConfiguration } from '@xgc2/native-agent/react';
import { useGroundStationNativeAgentRegistry } from './GroundStationNativeAgentProvider';
import type { GroundStationNativeBinding } from './groundStationNativeAgentTypes';
import { bindGroundStationWorkspace,getGroundStationNativeCapabilities,type GroundStationNativeCapabilities } from './groundStationNativeAgentService';
import { getNativeProviderSettings,refreshNativeProviderSettings } from './groundStationNativeSettingsService';
import { isNativeCompanionUnavailable,operatorNativeErrorMessage } from './nativeCompanionAvailability';
import { waitForNativeConversation } from './waitForNativeConversation';

/** Owns reviewed connection options, experiment-surface attach, and recovery decisions. */
export function useGroundStationNativeConnection(experimentId: string,binding?: GroundStationNativeBinding,configuredWorkspaceId?:string) {
  const registry = useGroundStationNativeAgentRegistry();
  const [capabilities,setCapabilities] = useState<GroundStationNativeCapabilities>();
  const [profileId,setProfileId] = useState('');
  const [workspaceId,setWorkspaceId] = useState('');
  const [providers,setProviders] = useState<NativeProviderConfiguration[]>([]);
  const [draft,setDraft] = useState<{ key:string; value:NativeComposerSelection }>();
  const [refresh,setRefresh] = useState(0);
  const [busy,setBusy] = useState(false);
  const sending = useRef(false);
  const [error,setError] = useState('');
  const consentKey = binding?.sessionId ?? `new:${experimentId}`;
  const [consent,setConsent] = useState({key:consentKey,enabled:true});
  const controlled = capabilities?.experimentServices === true && (consent.key !== consentKey || consent.enabled);
  const setControlled = (enabled: boolean) => setConsent({key:consentKey,enabled});
  const [unavailable,setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getGroundStationNativeCapabilities(experimentId,controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setCapabilities(value);
      setProfileId((current) => value.profiles.some((profile) => profile.id === current && profile.available)
        ? current : value.profiles.find((profile) => profile.available)?.id ?? '');
      setWorkspaceId(value.workspaceBinding?.workspace.id ?? (value.workspaces.length === 1 ? value.workspaces[0].id : ''));
      setUnavailable(false);
      setError('');
      if (!value.workspaceBinding && value.workspaces.length === 1) {
        const only = value.workspaces[0];
        void bindGroundStationWorkspace(experimentId,{id:only.id,revision:only.revision},0).then((workspaceBinding) => {
          if (controller.signal.aborted) return;
          setCapabilities((current) => current ? {...current,workspaceBinding} : current);
          setWorkspaceId(only.id);
        }).catch(() => undefined);
      }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
    });
    return () => controller.abort();
  },[experimentId,refresh]);
  const [providersLoaded,setProvidersLoaded] = useState(false);
  useEffect(() => {
    if (capabilities === undefined) return;
    if (!capabilities.available) {
      setProvidersLoaded(true);
      return;
    }
    const controller = new AbortController();
    setProvidersLoaded(false);
    void getNativeProviderSettings(controller.signal).then(async (value) => {
      if (controller.signal.aborted) return;
      setProviders(value.providers);
      setUnavailable(false);
      setError('');
      setProvidersLoaded(true);
      let providers = value.providers;
      for (const provider of providers) {
        if (!provider.enabled || !provider.available || provider.models.length > 0) continue;
        try {
          providers = (await refreshNativeProviderSettings(provider.id)).providers;
          if (controller.signal.aborted) return;
          setProviders(providers);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
    }).catch((cause:unknown) => {
      if (controller.signal.aborted) return;
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
      setProvidersLoaded(true);
    });
    return () => controller.abort();
  },[capabilities,refresh]);
  const state = binding?.projection?.state;
  const profiles = capabilities?.profiles.filter((profile) => profile.available) ?? [];
  const canConnect = !binding;
  const ready = Boolean(capabilities?.available && profiles.length && capabilities.workspaces.length && providersLoaded);
  const initialization = useMemo(() => {
    let resolve!:(error?:string)=>void;
    const promise = new Promise<string | undefined>(done => {resolve=done;});
    return {experimentId,revision:refresh,promise,resolve,mounted:false};
  },[experimentId,refresh]);
  useEffect(() => {
    if (error) initialization.resolve(error);
    else if (ready) initialization.resolve();
    else if (capabilities && !capabilities.available) initialization.resolve(capabilities.detail || 'The local native Agent is unavailable.');
  },[ready,error,capabilities,initialization]);
  useEffect(() => {
    initialization.mounted=true;
    return () => {
      initialization.mounted=false;
      queueMicrotask(() => {if (!initialization.mounted) initialization.resolve('The conversation was closed before connection settings loaded.');});
    };
  },[initialization]);
  const selectedProfileId = canConnect ? profileId : binding?.session?.scope.profileId ?? '';
  const selectionKey = canConnect ? `connect:${experimentId}:${selectedProfileId}` : binding?.sessionId ?? '';
  const provider = providers.find((item) => item.id === selectedProfileId);
  const selection:NativeComposerSelection = draft?.key === selectionKey ? draft.value : {
    profileId:selectedProfileId,...provider?.defaults,...(!canConnect ? binding?.session?.options : undefined),
  };
  const { model,effort,permission } = selection;
  const options = { model,effort,permission };
  const select = (value:NativeComposerSelection) => {
    if (!canConnect && value.profileId !== selectedProfileId) throw new Error('Choose a model from the connected native provider.');
    setProfileId(value.profileId);
    setDraft({key:canConnect ? `connect:${experimentId}:${value.profileId}` : selectionKey,value});
  };
  const operate = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(''); setUnavailable(false);
    try { await action(); } catch (cause) {
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
    } finally { setBusy(false); }
  };
  const adoptWorkspace = async () => {
    if (configuredWorkspaceId && capabilities?.workspaceBinding?.workspace.id !== configuredWorkspaceId) {
      const selected = capabilities?.workspaces.find(item => item.id === configuredWorkspaceId);
      if (!selected) throw new Error('The workspace configured for this chat panel is unavailable.');
      const workspaceBinding = await bindGroundStationWorkspace(experimentId,{id:selected.id,revision:selected.revision},capabilities?.workspaceBinding?.revision ?? 0);
      setCapabilities(value => value ? {...value,workspaceBinding} : value);
      return workspaceBinding;
    }
    if (capabilities?.workspaceBinding) return capabilities.workspaceBinding;
    const only = capabilities?.workspaces.length === 1 ? capabilities.workspaces[0]
      : capabilities?.workspaces.find((item) => item.id === workspaceId);
    if (!only) throw new Error('Choose an available experiment workspace.');
    const workspaceBinding = await bindGroundStationWorkspace(experimentId,{id:only.id,revision:only.revision},0);
    setCapabilities((value) => value ? {...value,workspaceBinding} : value);
    setWorkspaceId(only.id);
    return workspaceBinding;
  };
  const create = async () => {
    if (!registry) throw new Error('The local native Agent registry is unavailable.');
    if (!profiles.some((profile) => profile.id === profileId)) throw new Error('Choose an available native provider.');
    const workspaceBinding = await adoptWorkspace();
    const workspace = capabilities?.workspaces.find((item) => item.id === workspaceBinding.workspace.id && item.revision === workspaceBinding.workspace.revision);
    if (!workspace) throw new Error('Choose an available experiment workspace.');
    return registry.connect(experimentId,{ profileId,workspace: { id: workspace.id,revision: workspace.revision },nativeAccessConfirmed: true,options },controlled);
  };
  const prepareCurrentSession = async (requestedSession:GroundStationNativeBinding['session']) => {
    const session = requestedSession ?? await create();
    if (session.archived) throw new Error('Restore this conversation before sending a message.');
    if (session.state === 'closed' || session.state === 'disconnected') await registry?.reconnect(experimentId,controlled);
    if (session.state === 'starting' || session.state === 'closed' || session.state === 'disconnected') await waitForNativeConversation(experimentId,session.id);
    return session.id;
  };
  const currentPreparation = useRef({experimentId,prepare:prepareCurrentSession});
  currentPreparation.current = {experimentId,prepare:prepareCurrentSession};
  const prepareQueueSession = async () => {
    const failure = await initialization.promise;
    if (failure) throw new Error(failure);
    if (currentPreparation.current.experimentId !== initialization.experimentId) throw new Error('The experiment changed before connection settings loaded.');
    return currentPreparation.current.prepare(binding?.session);
  };
  const send = async (message:string,onPrepared?:(sessionId:string)=>void) => {
    if (sending.current || busy) throw new Error('Wait for the current message to finish.');
    if (!registry) throw new Error('The local native Agent registry is unavailable.');
    sending.current = true; setBusy(true); setError('');
    try {
      const session = binding?.session ?? await create();
      onPrepared?.(session.id);
      if (session.archived) throw new Error('Restore this conversation before sending a message.');
      if (session.state === 'closed' || session.state === 'disconnected') await registry.reconnect(experimentId,controlled);
      if (session.state !== 'ready') await waitForNativeConversation(experimentId,session.id);
      const turnId = await registry.send(experimentId,message,options,session.id);
      return {sessionId:session.id,turnId};
    } finally { sending.current = false; setBusy(false); }
  };
  return {
    available: Boolean(registry),capabilities,profileId,setProfileId,workspaceId,setWorkspaceId,
    busy,error,unavailable,state,profiles,canConnect,ready,send,prepareQueueSession,selection,select,options,controlled,setControlled,
    close: () => operate(async () => registry?.close(experimentId)),
    saveWorkspace: () => operate(async () => {
      const workspace = capabilities?.workspaces.find(item => item.id === workspaceId);
      if (!workspace) throw new Error('Choose an available experiment workspace.');
      const workspaceBinding = await bindGroundStationWorkspace(experimentId,{id:workspace.id,revision:workspace.revision},capabilities?.workspaceBinding?.revision ?? 0);
      setCapabilities(value => value ? {...value,workspaceBinding} : value);
    }),
    providers:providers.filter((item) => canConnect || item.id === selectedProfileId),
    reconnect: () => operate(async () => {
      if (!registry) throw new Error('The local native Agent registry is unavailable.');
      return registry.reconnect(experimentId,controlled);
    }),
    recover: () => operate(async () => {
      if (!registry) throw new Error('The local native Agent registry is unavailable.');
      return registry.recover(experimentId);
    }),
    reload: () => registry?.reload(experimentId),
    refresh: () => setRefresh((value) => value + 1),
  };
}
