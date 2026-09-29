import type { ComponentType, LazyExoticComponent } from 'react';

/** Wire envelope shared by compiled functional owners; owner payloads stay opaque. */
export type SharedSurfaceProjection = {
  contractVersion: 1;
  entryId: string;
  name: string;
  expiresAt: string;
  moduleId: string;
  viewContractVersion: number;
  actions: readonly string[];
  endpoints: readonly SharedSurfaceEndpoint[];
  readonly [field: string]: unknown;
};

export type SharedSurfaceEndpoint = {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  protocol: 'http' | 'sse' | 'webrtc';
  action: string;
};

/** Cookie-only transport bound to the exact projected endpoint set. Rejects non-success HTTP responses. */
export type SharedSurfaceClient = {
  request: (endpointId: string, options?: {
    params?: Readonly<Record<string, string>>;
    body?: unknown;
    signal?: AbortSignal;
  }) => Promise<Response>;
};

export type SharedSurfaceProps = {
  projection: SharedSurfaceProjection;
  client: SharedSurfaceClient;
};

/** Static build contribution, independent of runtime grants and availability. */
export type SharedSurfaceContribution = {
  moduleId: string;
  viewContractVersion: number;
  component: LazyExoticComponent<ComponentType<SharedSurfaceProps>>;
};
