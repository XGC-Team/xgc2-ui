import type { AppLanguage } from '../../shared/localization/languagePreference';

type RecordingLibraryCopy = {
  title: string;
  foldersLabel: string;
  searchPlaceholder: string;
  loadError: string;
  retry: string;
  empty: string;
  emptyHint: string;
  systemFolder: string;
  xgcFolder: string;
  selectTitle: string;
  selectHint: string;
  playbackLoading: string;
  playbackError: string;
  stop: string;
  openFolder: string;
  openingFolder: string;
  openFolderError: string;
  remove: string;
  confirmRemove: string;
  cancel: string;
  removing: string;
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
    systemFolder: 'System recordings',
    xgcFolder: 'XGC recordings',
    selectTitle: 'No recording selected',
    selectHint: 'Select a recording on the left to play it here.',
    playbackLoading: 'Loading video…',
    playbackError: 'Could not load this recording.',
    stop: 'Stop',
    openFolder: 'Open folder',
    openingFolder: 'Opening…',
    openFolderError: 'Could not open the recording folder.',
    remove: 'Delete',
    confirmRemove: 'Confirm delete',
    cancel: 'Cancel',
    removing: 'Deleting…',
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
    systemFolder: '系统录屏',
    xgcFolder: 'XGC 录屏',
    selectTitle: '未选择录屏',
    selectHint: '在左侧选择一段录屏，在此播放。',
    playbackLoading: '正在加载视频…',
    playbackError: '无法加载这段录屏。',
    stop: '停止',
    openFolder: '打开所在文件夹',
    openingFolder: '正在打开…',
    openFolderError: '无法打开录屏文件夹。',
    remove: '删除',
    confirmRemove: '确认删除',
    cancel: '取消',
    removing: '正在删除…',
    recordedAt: '录制于',
    duration: '时长',
    size: '大小',
    resolution: '分辨率',
  },
};
