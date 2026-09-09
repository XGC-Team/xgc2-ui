import { createNativeAgentClient } from '@xgc2/native-agent/client'
export const nativeClient = createNativeAgentClient({basePath:'/api/v1/native-agents'})
export const { getNativeSettings, getNativeProfiles, getNativeSessions, createNativeSession, sendNativePrompt, answerNativeRequest, cancelNativeTurn, reconnectNativeSession, closeNativeSession } = nativeClient
