import { createAgentClient } from '@xgc2/agent-runtime/client'
export const nativeClient = createAgentClient({basePath:'/api/v1/agent-runtime'})
export const { getNativeSettings, getNativeProfiles, getNativeSessions, createNativeSession, sendNativePrompt, answerNativeRequest, cancelNativeTurn, reconnectNativeSession, closeNativeSession } = nativeClient
