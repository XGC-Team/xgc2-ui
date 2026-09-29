import type { AppLanguage } from '../../shared/localization/languagePreference';

type RecordingLibraryCopy = {
  title: string;
  foldersLabel: string;
  searchPlaceholder: string;
  loadError: string;
  retry: string;
  empty: string;
  emptyHint: string;
  noMatches: string;
  recentTitle: string;
  selectTitle: string;
  selectHint: string;
  playbackLoading: string;
  playbackError: string;
  stop: string;
  remove: string;
  removeTitle: string;
  removeMessage: (name: string) => string;
  cancel: string;
  recordedAt: string;
  duration: string;
  size: string;
  resolution: string;
};

export const recordingLibraryCopy: Record<AppLanguage, RecordingLibraryCopy> = {
  'en-US': {
    title: 'Screen recordings',
    foldersLabel: 'Recording folders',
    searchPlaceholder: 'Search recordings by name',
    loadError: 'Could not load recordings.',
    retry: 'Retry',
    empty: 'No archived recordings',
    emptyHint: 'This library displays previously saved videos.',
    noMatches: 'No matching recordings',
    recentTitle: 'Recent recordings',
    selectTitle: 'No recording selected',
    selectHint: 'Select a recording on the left to play it here.',
    playbackLoading: 'Loading video…',
    playbackError: 'Could not load this recording.',
    stop: 'Stop',
    remove: 'Delete',
    removeTitle: 'Delete recording',
    removeMessage: (name) => `Delete ${name}?`,
    cancel: 'Cancel',
    recordedAt: 'Recorded',
    duration: 'Duration',
    size: 'Size',
    resolution: 'Resolution',
  },
  'zh-CN': {
    title: '历史录屏',
    foldersLabel: '录屏目录',
    searchPlaceholder: '按名称搜索录屏',
    loadError: '无法加载录屏列表。',
    retry: '重试',
    empty: '暂无历史录屏',
    emptyHint: '这里展示已保存的视频档案。',
    noMatches: '没有匹配的录屏',
    recentTitle: '最近录屏',
    selectTitle: '未选择录屏',
    selectHint: '在左侧选择一段录屏，在此播放。',
    playbackLoading: '正在加载视频…',
    playbackError: '无法加载这段录屏。',
    stop: '停止',
    remove: '删除',
    removeTitle: '删除录屏',
    removeMessage: (name) => `删除 ${name}？`,
    cancel: '取消',
    recordedAt: '录制于',
    duration: '时长',
    size: '大小',
    resolution: '分辨率',
  },
};
