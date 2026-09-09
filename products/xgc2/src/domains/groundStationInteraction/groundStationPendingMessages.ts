import type { NativeItem } from '@xgc2/native-agent/state';
export type PendingChatMessage = {id:string;sessionId:string;text:string;createdAt:string;state:'sending'|'sent'|'failed';error?:string;turnId?:string;knownKeys:string[]};
export function pendingMessageVisible(message:PendingChatMessage,sessionId:string,items:readonly NativeItem[]) {
  if (message.sessionId !== sessionId) return false;
  return !items.some(item => item.role === 'user' && (message.turnId ? item.turnId === message.turnId
    : !message.knownKeys.includes(item.key) && item.text === message.text && item.status === 'submitted'));
}
