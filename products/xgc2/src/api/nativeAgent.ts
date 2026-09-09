import type { NativeStreamTransport } from '@xgc2/native-agent/react';
import { requestStationResponse } from './http';
import { openReplayJSONStream } from './streams';

function nativePath(input: RequestInfo | URL) {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(value,window.location.origin);
  const experiment = /^\/api\/experiments\/[A-Za-z0-9._-]+\/native-agents(?:\/|$)/.test(url.pathname);
  const settings = /^\/api\/native-agents\/settings(?:\/refresh)?$/.test(url.pathname) && !url.search;
  if (url.origin !== window.location.origin || (!experiment && !settings)) {
    throw new Error('Native Agent transport requires this station and an exact Experiment or provider settings resource.');
  }
  return `${url.pathname}${url.search}`;
}

/** Shared native protocol transport with the existing station authority. */
export const fetchNativeAgent: typeof fetch = (input,init) => {
  const path = nativePath(input);
  return requestStationResponse(path,init);
};

export const openNativeAgentStream: NativeStreamTransport = (options) => {
  const path = nativePath(options.url).slice('/api'.length);
  return openReplayJSONStream({
    path: () => path,
    lastEventId: options.lastEventId,
    onValue: (value,message) => { if (message.event === 'native-agent') options.onEvent(value); },
    onOpen: () => options.onOpen(),
    onError: (error) => {
      if (error instanceof SyntaxError) options.onInvalid(error);
      else options.onError(error);
    },
    reconnectDelayMs: 1_000,
  });
};

/** Consent is scoped to this client's explicit create/resume call, never prompts. */
export function experimentServicesTransport(enabled: boolean): typeof fetch {
  return (input,init) => {
    const path = nativePath(input);
    const headers = new Headers(init?.headers);
    headers.delete('X-XGC-Agent-Enrollment');
    headers.delete('X-XGC-Experiment-Services');
    if (enabled && init?.method === 'POST' && /\/native-agents\/sessions(?:\/[A-Za-z0-9._-]+\/reconnect)?$/.test(path)) headers.set('X-XGC-Experiment-Services','1');
    return fetchNativeAgent(input,{...init,headers});
  };
}
