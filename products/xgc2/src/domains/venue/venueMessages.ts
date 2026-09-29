import { cameraZhMessages } from '../../panels/camera/cameraMessagesPublic';
import { runtimePanelZhMessages } from '../../panels/runtime/runtimeMessagesPublic';
import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';
import { automationCanvasZhMessages } from '../automation/automationCanvasMessagesPublic';
import { experimentZhMessages } from '../experiment/experimentMessagesPublic';
import { venuePreviewZhMessages } from './venuePreviewMessages';

export const venueZhMessages: MessageCatalog = {
  ...venuePreviewZhMessages,
  'Search venues': '搜索场地',
  'Sort venues': '场地排序',
  'Filter venues by origin': '按来源筛选场地',
  'All venues': '全部场地',
  'Platform presets': '平台预置',
  'User venues': '用户场地',
  'No venue assets': '暂无场地资产',
  'No matching venues': '没有匹配的场地',
  'Unable to load venue assets': '无法加载场地资产',
  'Try loading venues again': '重新加载场地',
  'Saved scenes are available to your experiments.': '已保存的场景可供实验选用。',
  'One real photo. A simulation that chooses this scene keeps that frame as the camera picture.': '一张实拍。仿真选用后，相机一直是这一帧。',
  'A short real clip. A simulation that chooses this scene plays that clip again and again.': '一段实拍。仿真选用后，相机反复播放这一段。',
  'Obstacle layout only, with no photo. A simulation that chooses this scene keeps the simulator camera.': '只有障碍摆放，没有实拍。仿真选用后，仍用仿真相机。',
  'Obstacles stay where this scene saved them, and the experiment does not edit them again.': '障碍停在保存时的位置，实验里不能再改。',
  'Obstacles stay where this scene saved them.': '障碍停在保存时的位置。',
  'Platform preset': '平台预置',
  'Saved by you': '自己保存的场地',
  'Recorded note': '记录说明',
  'Back to scenes': '返回场地列表',
  'Open scene {name}': '打开场地 {name}',
  'Recorded camera frame': '实拍相机画面',
  'Ready for camera replay': '可用于相机画面回放',
  'Not replayable': '不可回放',
  'Labels': '标签',
  'Obstacles': '障碍物',
  'Camera pose': '相机位姿',
  'Looping clip': '循环片段',
  'Still frame': '静态帧',
  'Recording window': '录制窗口',
  'Field site': '场地坐标',
  'Included': '已包含',
  'Provenance': '来源',
  'Session': '会话',
  'Revisions': '版本',
  'current': '当前',
  'missing': '已缺失',
  'Composed from': '组合自',
  'Recorded topics': '已录制话题',
  'Topic playback is not yet available': '暂不支持话题回放',
  'sceneDocument': '障碍布置',
  'cameraInfo': '相机内参',
  'extrinsic': '相机外参',
  'media': '媒体',
  'fieldSite': '场地坐标',
  'Coverage': '覆盖范围',
  'Gazebo': 'Gazebo',
  'Image dimensions': '图片尺寸',
  'No preview': '暂无预览',
  'Preview unavailable': '预览不可用',
  'Simulators': '仿真器',
  'Source files': '源文件',
  'attached': '附带世界文件',
  'carrier': '空世界承载',
  'paired': '与规划场景成对',
  'No captured frame.': '没有实拍画面。',
  'Obstacle poses are not in the scene document, so there is no map preview.': '场景文档没有障碍位姿，因此没有地图预览。',
  'Geometry from the scene document, in meters.': '按场景文档里的几何绘制，单位是米。',
};

export const venueMessageSources = [venueZhMessages,automationCanvasZhMessages,experimentZhMessages,cameraZhMessages,runtimePanelZhMessages] as const;

export function useVenueText() {
  return useLocalizedText(venueMessageSources);
}
