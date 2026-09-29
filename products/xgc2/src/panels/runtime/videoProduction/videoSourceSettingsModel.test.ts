import { describe,expect,it } from 'vitest';
import { initialVideoSettings,releaseEmptyVideoLayers,seedRecordedSource,videoSettingsIssue } from './videoSourceSettingsModel';

describe('seedRecordedSource', () => {
  it('fills the only calibration, world frame, tf, paths and markers without duplicating a topic', () => {
    const topics = [
      { name: '/xgc/camera/world/camera_info', type: 'sensor_msgs/CameraInfo', messageCount: 1 },
      { name: '/tf', type: 'tf2_msgs/TFMessage', messageCount: 10 },
      { name: '/tf_static', type: 'tf2_msgs/TFMessage', messageCount: 1 },
      { name: '/xgc/camera/world/tf', type: 'tf2_msgs/TFMessage', messageCount: 4 },
      { name: '/ugv1/path', type: 'nav_msgs/Path', messageCount: 3 },
      { name: '/ugv2/path', type: 'nav_msgs/Path', messageCount: 3 },
      { name: '/xgc/scene/markers', type: 'visualization_msgs/MarkerArray', messageCount: 1 },
    ];
    const seeded = seedRecordedSource(topics, initialVideoSettings());
    expect(seeded.calibrationTopic).toBe('/xgc/camera/world/camera_info');
    expect(seeded.fixedFrame).toBe('world');
    expect(seeded.transformTopics).toEqual(['/tf', '/tf_static']);
    expect(seeded.staticTransformTopics).toEqual(['/tf_static']);
    expect(seeded.layerTopics.history).toEqual(['/ugv1/path', '/ugv2/path']);
    expect(seeded.layerTopics.predictions).toEqual([]);
    expect(seeded.layerTopics.labels).toEqual([]);
    expect(seeded.layerTopics.obstacles).toEqual(['/xgc/scene/markers']);
    const layers = releaseEmptyVideoLayers(seeded, { history: true, predictions: true, labels: true, obstacles: true });
    expect(layers).toEqual({ history: true, predictions: false, labels: false, obstacles: true });
    expect(videoSettingsIssue(seeded, layers)).toBe('');
  });

  it('keeps a path the operator already placed and does not duplicate it', () => {
    const current = initialVideoSettings();
    current.layerTopics.predictions = ['/ugv1/path'];
    const seeded = seedRecordedSource([
      { name: '/ugv1/path', type: 'nav_msgs/Path', messageCount: 2 },
      { name: '/ugv2/path', type: 'nav_msgs/Path', messageCount: 2 },
      { name: '/markers', type: 'visualization_msgs/Marker', messageCount: 1 },
    ], current);
    expect(seeded.layerTopics.predictions).toEqual(['/ugv1/path']);
    expect(seeded.layerTopics.history).toEqual(['/ugv2/path']);
    expect(seeded.layerTopics.obstacles).toEqual(['/markers']);
  });

  it('does not replace an operator calibration or transform choice', () => {
    const current = initialVideoSettings();
    current.calibrationTopic = '/kept/camera_info';
    current.transformTopics = ['/custom/tf'];
    current.fixedFrame = 'map';
    const seeded = seedRecordedSource([
      { name: '/other/camera_info', type: 'sensor_msgs/CameraInfo', messageCount: 1 },
      { name: '/tf', type: 'tf2_msgs/TFMessage', messageCount: 1 },
    ], current);
    expect(seeded.calibrationTopic).toBe('/kept/camera_info');
    expect(seeded.transformTopics).toEqual(['/custom/tf']);
    expect(seeded.fixedFrame).toBe('map');
  });
});
