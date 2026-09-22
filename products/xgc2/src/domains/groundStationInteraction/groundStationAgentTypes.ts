import type { AgentAnswer,AgentRequest,AgentSession,AgentTurnOptions,Scope,StreamState } from '@xgc2/agent-runtime/state';

export type AgentProjection = { state: StreamState; connection: string; error: string; receivedAt?: number };
export type GroundStationNativeBinding = {
  experimentId: string;
  sessionId: string;
  session?: AgentSession;
  projection?: AgentProjection;
  error?: string;
  reload: number;
};
export type GroundStationNativeAttentionItem = {
  id: string;
  experimentId: string;
  sessionId: string;
  request: AgentRequest;
  submitted: boolean;
  summaryOnly?: boolean;
};
export type AgentConversationInventory = { loading: boolean; error: string; nextCursor?: string };
export type GroundStationNativeRegistry = {
  bindings: GroundStationNativeBinding[];
  selected: Record<string,string | null>;
  inventories: Record<string,AgentConversationInventory>;
  select: (experimentId:string,sessionId:string | null) => void;
  open: (experimentId:string,sessionId:string) => Promise<void>;
  refresh: (experimentId:string,signal?:AbortSignal,more?:boolean) => Promise<void>;
  update: (experimentId:string,sessionId:string,changes:{title?:string; archived?:boolean}) => Promise<void>;
  readInputs: (experimentId:string,sessionId:string,signal?:AbortSignal) => Promise<void>;
  pendingInputs: GroundStationNativeAttentionItem[];
  attentionError: string;
  connect: (experimentId: string,scope: Omit<Scope,'context'>,experimentServices?: boolean) => Promise<AgentSession>;
  send: (experimentId: string,message: string,options?: AgentTurnOptions,sessionId?:string) => Promise<string | void>;
  answer: (item: GroundStationNativeAttentionItem,answer: AgentAnswer) => Promise<unknown>;
  cancel: (experimentId: string) => Promise<unknown>;
  reconnect: (experimentId: string,experimentServices?: boolean) => Promise<unknown>;
  close: (experimentId: string) => Promise<unknown>;
  reload: (experimentId: string) => void;
  recover: (experimentId: string) => Promise<void>;
};
