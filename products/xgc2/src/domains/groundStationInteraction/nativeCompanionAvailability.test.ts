import { NativeAgentClientError } from '@xgc2/native-agent/client';
import { describe,expect,it } from 'vitest';
import {
  isNativeCompanionUnavailable,
  isNativeCompanionUnavailableMessage,
  operatorNativeErrorMessage,
} from './nativeCompanionAvailability';

describe('native companion availability', () => {
  it('does not dump Core companion-down copy onto the operator surface', () => {
    const cause = new NativeAgentClientError(502,'native_upstream_unavailable','原生客户端连接中断。');
    expect(isNativeCompanionUnavailable(cause)).toBe(true);
    expect(operatorNativeErrorMessage(cause)).toBe('');
    expect(isNativeCompanionUnavailableMessage('原生客户端连接中断。')).toBe(true);
    expect(operatorNativeErrorMessage(new Error('Settings changed; reload the draft.'))).toBe('Settings changed; reload the draft.');
  });

  it('does not dump request-timeout paths onto the operator surface', () => {
    const capabilities = new Error('request timeout after 8000ms: /experiments/experiment-a/native-agents/capabilities');
    const history = new Error('request timeout after 8000ms: /execution-targets/local/ground-station-interactions?limit=256');
    expect(isNativeCompanionUnavailable(capabilities)).toBe(true);
    expect(operatorNativeErrorMessage(capabilities)).toBe('');
    expect(operatorNativeErrorMessage(history)).toBe('');
    expect(isNativeCompanionUnavailableMessage(capabilities.message)).toBe(true);
  });
});
