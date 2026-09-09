export type CoreNode = {
  id: string;
  name: string;
  profile: string;
  baseUrl: string;
  status: 'online' | 'limited' | 'offline' | string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  registeredAt: string;
  lastSeenAt: string;
  updatedAt: string;
};
