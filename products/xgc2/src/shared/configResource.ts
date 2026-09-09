export const CONFIGURATION_MAIN_BRANCH = 'main';

export type ConfigResourceIdentity = {
  domain: string;
  resourceId: string;
};

export type ConfigResourceNamespace = {
  domain: string;
  namespaceId: string;
  parentNamespaceId?: string;
  name: string;
  revision: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A live reference follows one named branch until Core freezes a run. */
export type ConfigRef<Domain extends string = string> = ConfigResourceIdentity & {
  domain: Domain;
  branch: string;
  componentId?: string;
};

/** The immutable source identity returned with an execution run. */
export type PinnedConfigRef<Domain extends string = string> = ConfigRef<Domain> & {
  commitId: string;
  version: number;
  digest: string;
};

export type ConfigResourceHead = ConfigResourceIdentity & {
  namespaceId?: string;
  system?: boolean;
  systemKey?: string;
  originResourceId?: string;
  originCommitId?: string;
  name: string;
  description?: string;
  tags: string[];
  mainCommitId: string;
  currentVersion: number;
  digest: string;
  revision: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConfigResourceBranch = ConfigResourceIdentity & {
  name: string;
  headCommitId: string;
  headVersion: number;
  revision: number;
  createdFromCommitId?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};
