import { describe,expect,it } from 'vitest';
import { formatLocalizedText } from './localizedText';

const messages = {
  'Run {name}': '运行 {name}',
  'Stop all ({count})': '全部停止（{count}）',
};

describe('formatLocalizedText', () => {
  it('keeps English source text and interpolates values', () => {
    expect(formatLocalizedText('en-US', messages, 'Run {name}', { name: '巡检' })).toBe('Run 巡检');
  });

  it('uses the domain catalog before shared copy', () => {
    expect(formatLocalizedText('zh-CN', messages, 'Run {name}', { name: '巡检' })).toBe('运行 巡检');
    expect(formatLocalizedText('zh-CN', messages, 'Stop all ({count})', { count: 3 })).toBe('全部停止（3）');
  });

  it('reuses shared copy and preserves unknown product text', () => {
    expect(formatLocalizedText('zh-CN', messages, 'Cancel')).toBe('取消');
    expect(formatLocalizedText('zh-CN', messages, 'PX4 custom diagnostic')).toBe('PX4 custom diagnostic');
  });
});
