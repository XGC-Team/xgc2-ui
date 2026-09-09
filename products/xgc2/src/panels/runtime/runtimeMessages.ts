import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const runtimePanelZhMessages:MessageCatalog = {
  'Recording':'录制',
  'Recorded bags':'录制产物',
  'Refresh recorded bags':'刷新录制产物',
  'No recorded bags':'暂无录制产物',
  'Some recording history is unavailable.':'部分录制历史暂不可用。',
  'Download recorded bag {name}':'下载录制产物 {name}',
  'Load older':'加载更早记录',
  'Recording topics and output settings are inputs of the connected Recording Action preset.':'录制话题和输出设置由已连接的录制操作预设提供。',
  'Connect the recording artifacts Data port to browse completed bags.':'连接录制产物数据端口以浏览已完成的 bag。',
  'Recorded bag':'已录制的 bag',
  'Select a rosbag':'选择 rosbag',
  'Showing every bag in the archive. Connect Recording artifacts to limit this Experiment.':'当前显示归档中的全部 bag。连接录制产物后可限定到此实验。',
  'No plottable scalar fields in this bag.':'此 bag 中没有可绘制的标量字段。',
  'Drop a field to plot':'拖入字段以绘图',
  'Open a bag, expand a topic, and drag a field onto this canvas. Drop onto an existing plot to overlay curves.':'打开 bag，展开话题，并将字段拖到此画布。拖到已有图表上可叠加曲线。',
  'Rosbag time series':'Rosbag 时间序列',
};

export function useRuntimePanelText() {
  return useLocalizedText(runtimePanelZhMessages);
}
