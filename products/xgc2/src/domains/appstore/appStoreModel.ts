import type { CommandReceipt,ExecutionJob } from '../execution/executionPublic';

export type AppStoreInstallOperation = 'start' | 'stop' | 'restart' | 'upgrade' | 'uninstall';

export type AppParam = {
  envKey: string;
  label: string;
  type: string;
  default: unknown;
  required: boolean;
  random: boolean;
  rule: string;
  options: string[];
  description: string;
};

export type AppStoreApp = {
  id: string;
  key: string;
  name: string;
  type: string;
  description: string;
  icon: string;
  resource: string;
  status: string;
  limit: number;
  website: string;
  github: string;
  document: string;
  tags: string[];
  architectures: string[];
  crossVersionUpdate: boolean;
  batchInstallSupport: boolean;
  updatedAt: string;
};

export type AppStoreDetail = {
  id: string;
  appId: string;
  appKey: string;
  version: string;
  params: AppParam[];
  dockerCompose: string;
  robotMeta?: RobotAppMeta;
  status: string;
  updatedAt: string;
};

export type RobotAppMeta = {
  kind?: string;
  compatibility?: {
    architectures?: string[];
    os?: string[];
    rosDistros?: string[];
    stages?: string[];
  };
  runtime?: {
    contract?: string;
    commands?: string[];
    ports?: number[];
    env?: string[];
  };
  simulation?: {
    simulator?: string;
    bridge?: string;
    requiredTopics?: string[];
  };
  deployment?: {
    strategy?: string;
    requiredDevices?: string[];
    requiredVolumes?: string[];
    networkModes?: string[];
  };
  verification?: {
    healthChecks?: string[];
    probes?: string[];
  };
  capture?: {
    captureLogs?: boolean;
    captureTelemetry?: boolean;
    sourcePolicy?: string;
    redactedPathGlobs?: string[];
  };
  security?: {
    requiresPrivileged?: boolean;
    requiresHostNetwork?: boolean;
    secretEnv?: string[];
  };
};

export type AppStoreInstall = {
  id: string;
  appId: string;
  appKey: string;
  appDetailId: string;
  name: string;
  version: string;
  env: Record<string, string>;
  dockerCompose: string;
  status: string;
  message: string;
  containerName: string;
  serviceName: string;
  httpPort: number;
  installPath: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type AppStoreVersionDiff = {
  installId: string;
  appKey: string;
  fromVersion: string;
  toVersion: string;
  composeDiff: string;
  paramDiff: string;
};

export type AppStoreSetting = {
  id: string;
  registry: 'aliyun' | 'ghcr' | 'custom';
  imageSource: 'default' | 'mirror';
  mirrorPrefix: string;
  updatedAt: string;
};

/** Canonical image prefixes aligned with core-xgc appstore defaults. */
export const APP_STORE_REGISTRY_IMAGE_PREFIX = {
  aliyun: 'registry.cn-hangzhou.aliyuncs.com/xgc2-app-store',
  /** Matches defaultXGCAppStoreImagePrefix without trailing slash. */
  ghcr: 'ghcr.io/lxk36/xgc2-app-store',
} as const;

export type AppStoreSelectableRegistry = keyof typeof APP_STORE_REGISTRY_IMAGE_PREFIX;

export function selectableAppStoreRegistry(registry: AppStoreSetting['registry']): AppStoreSelectableRegistry {
  return registry === 'ghcr' ? 'ghcr' : 'aliyun';
}

/** Display/effective image prefix for the selected registry (prefix is not operator-editable). */
export function imagePrefixForAppStoreRegistry(registry: AppStoreSetting['registry']): string {
  return APP_STORE_REGISTRY_IMAGE_PREFIX[selectableAppStoreRegistry(registry)];
}

/** Apply a registry choice and the matching non-editable prefix / imageSource. */
export function withAppStoreRegistry(setting: AppStoreSetting, registry: AppStoreSelectableRegistry): AppStoreSetting {
  return {
    ...setting,
    registry,
    imageSource: registry === 'ghcr' ? 'default' : 'mirror',
    mirrorPrefix: APP_STORE_REGISTRY_IMAGE_PREFIX[registry],
  };
}

export const DEFAULT_APP_STORE_SETTING: AppStoreSetting = {
  id: 'default',
  registry: 'aliyun',
  imageSource: 'mirror',
  mirrorPrefix: APP_STORE_REGISTRY_IMAGE_PREFIX.aliyun,
  updatedAt: '',
};

export type AppStoreSnapshot = {
  apps: AppStoreApp[];
  details: AppStoreDetail[];
  installed: AppStoreInstall[];
  setting: AppStoreSetting;
};

export type AppStoreJobResponse = {
  job: ExecutionJob;
  receipt: CommandReceipt;
};
