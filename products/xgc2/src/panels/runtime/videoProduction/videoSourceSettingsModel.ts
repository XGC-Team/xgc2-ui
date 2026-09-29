import type { VideoLayerName,VideoSettings } from '../../../domains/recording/recordingPublic';

export const videoLayerNames = [['history','History'],['predictions','Predictions'],['labels','Labels'],['obstacles','Obstacles']] as const;
export function initialVideoSettings(): VideoSettings {
  return { calibrationTopic: '',fixedFrame: '',transformTopics: [],staticTransformTopics: [],layerTopics: { history: [],predictions: [],labels: [],obstacles: [] },pathColors: {},pathWidth: 0.01 };
}

type RecordedTopic = { name: string;type: string;messageCount: number };

/** Fill an empty new-bag source. Existing operator choices stay. */
export function seedRecordedSource(topics: readonly RecordedTopic[], settings: VideoSettings) {
  const present = topics.filter((topic) => topic.messageCount > 0);
  const named = new Set(present.map((topic) => topic.name));
  const ofType = (type: string) => present.filter((topic) => topic.type === type).map((topic) => topic.name);
  const layerTopics: VideoSettings['layerTopics'] = {
    history: [...settings.layerTopics.history],
    predictions: [...settings.layerTopics.predictions],
    labels: [...settings.layerTopics.labels],
    obstacles: [...settings.layerTopics.obstacles],
  };
  const claimed = new Set(Object.values(layerTopics).flat());
  const claim = (role: VideoLayerName, names: readonly string[]) => {
    if (layerTopics[role].length > 0) return;
    const fresh = names.filter((name) => !claimed.has(name));
    if (!fresh.length) return;
    layerTopics[role] = fresh;
    for (const name of fresh) claimed.add(name);
  };
  claim('history', ofType('nav_msgs/Path'));
  claim('obstacles', [...ofType('visualization_msgs/Marker'), ...ofType('visualization_msgs/MarkerArray')]);
  const next: VideoSettings = {
    ...settings,
    layerTopics,
    transformTopics: [...settings.transformTopics],
    staticTransformTopics: [...settings.staticTransformTopics],
  };
  if (!next.calibrationTopic) {
    const calibration = ofType('sensor_msgs/CameraInfo');
    if (calibration.length === 1) next.calibrationTopic = calibration[0]!;
  }
  if (!next.fixedFrame.trim()) next.fixedFrame = 'world';
  if (next.transformTopics.length === 0) {
    if (named.has('/tf')) next.transformTopics.push('/tf');
    if (named.has('/tf_static')) {
      next.transformTopics.push('/tf_static');
      next.staticTransformTopics.push('/tf_static');
    }
    if (next.transformTopics.length === 0) {
      const transforms = ofType('tf2_msgs/TFMessage');
      if (transforms.length === 1) next.transformTopics.push(transforms[0]!);
    }
  }
  return next;
}

/** An enabled layer with no topic blocks Save. Turn only those layers off. */
export function releaseEmptyVideoLayers(settings: VideoSettings, layers: Record<VideoLayerName, boolean>) {
  const next = { ...layers };
  for (const [role] of videoLayerNames) {
    if (next[role] && settings.layerTopics[role].length === 0) next[role] = false;
  }
  return next;
}
export function videoSettingsIssue(settings: VideoSettings,layers: Record<VideoLayerName,boolean>) {
  if (!settings.calibrationTopic || !settings.fixedFrame.trim() || !settings.transformTopics.length) return 'Select calibration, fixed frame and TF topics.';
  if (!Number.isFinite(settings.pathWidth) || settings.pathWidth < 0.001 || settings.pathWidth > 1) return 'Path width must be between 0.001 and 1 metre.';
  if (videoLayerNames.some(([role]) => layers[role] && !settings.layerTopics[role].length)) return 'Select recorded topics for every enabled layer.';
  if (Object.values(settings.pathColors ?? {}).some((colour) => !/^#[0-9a-fA-F]{6}$/.test(colour))) return 'Path colours must use #RRGGBB.';
  const names = Object.values(settings.layerTopics).flat();
  if (new Set(names).size !== names.length) return 'A recorded topic must have one declared layer role.';
  return '';
}
