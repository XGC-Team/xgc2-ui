import { describe, expect, it } from 'vitest'
import {
  NATIVE_CONNECT_FAILED_NOTICE,
  nativeConnectFailureCopy,
  nativeInventoryWorker,
  nativePendingFirstFailed,
  nativeShouldReconnect,
  nativeUnsignedHint,
} from '../src/features/chat/nativeSendGate'

describe('research native send gate', () => {
  it('keeps a new unsigned draft sendable until the operator actually sends', () => {
    expect(nativeConnectFailureCopy({
      locale: 'zh', login: { status: 'unauthenticated' }, provider: 'grok', worker: 'starting',
    })).toBe('')
    expect(nativeUnsignedHint('zh', { status: 'unauthenticated' }, 'grok')).toBe('Grok 未在本机登录')
  })

  it('explains a disconnected Grok session that never started', () => {
    expect(nativeConnectFailureCopy({
      locale: 'zh',
      login: { status: 'unauthenticated' },
      notices: [NATIVE_CONNECT_FAILED_NOTICE],
      worker: 'disconnected',
      attempted: true,
      provider: 'grok',
    })).toContain('Grok 未在本机登录')
    expect(nativeShouldReconnect({ worker: 'disconnected', login: { status: 'unauthenticated' } })).toBe(false)
    expect(nativePendingFirstFailed('disconnected')).toBe(true)
  })

  it('does not reconnect an unsigned provider, and does resume a signed-in disconnect', () => {
    expect(nativeShouldReconnect({ worker: 'disconnected', login: { status: 'authenticated' } })).toBe(true)
    expect(nativeShouldReconnect({ worker: 'ready', login: { status: 'authenticated' } })).toBe(false)
  })

  it('uses inventory disconnect so starting stream state cannot swallow send', () => {
    expect(nativeInventoryWorker('disconnected', 'starting')).toBe('disconnected')
    expect(nativeInventoryWorker('ready', 'starting')).toBe('starting')
  })

  it('does not claim a live worker failed to send', () => {
    expect(nativeConnectFailureCopy({
      locale: 'zh', login: { status: 'unauthenticated' }, worker: 'ready', attempted: true, provider: 'grok',
    })).toBe('')
  })

  it('maps a connect-failed notice without inventing a Session notice row', () => {
    expect(nativeConnectFailureCopy({
      locale: 'en',
      notices: [NATIVE_CONNECT_FAILED_NOTICE],
      worker: 'disconnected',
      attempted: true,
      login: { status: 'authenticated' },
    })).toContain('Agent connection failed')
  })
})
