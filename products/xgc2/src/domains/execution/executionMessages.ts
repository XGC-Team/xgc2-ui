import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const executionZhMessages: MessageCatalog = {
  'Table rows': '表格行',
  'kill': '强制终止',
  'stop': '停止',
  'Actions': '操作',
  'Automation / Run / Node': '自动化 / 运行 / 节点',

  'Close process runtime details': '关闭进程运行时详情',
  'Health': '健康状态',
  'Kill': '强制终止',
  'Kill process': '强制终止进程',
  'Kill all': '全部强制终止',
  'Kill all supervised processes': '强制终止全部受监管进程',
  'Kill {label}': '强制终止 {label}',
  'Killing…': '正在强制终止…',
  'Last transition': '最近转换',
  'Loading': '正在加载',
  'Logs and runtime details': '日志和运行时详情',
  'No process instances are registered for this execution target.': '此运行目标未注册任何进程实例。',
  'No supervised processes match this search.': '没有与此次搜索匹配的受监管进程。',
  'No matching supervised processes': '没有匹配的受监管进程',
  'No supervised processes': '暂无受监管进程',
  'Next page': '下一页',
  'Operations': '运行管理',
  'Owner': '所有者',
  'Page': '页',
  'Previous page': '上一页',
  'Process / Definition': '进程 / 定义',
  'Process runtime': '进程运行时',
  'Processes per page': '每页进程数',
  'Recent': '最近',
  '/ page': '条/页',

  'Restarts / Revision': '重启次数 / 修订版',
  'Run / Node': '运行 / 节点',
  'Runtime': '运行时',
  'Runtime details for {id}': '{id} 的运行时详情',
  'Search supervised processes': '搜索受监管进程',
  'Started / Uptime': '启动时间 / 运行时长',
  'State': '状态',
  'State / Health': '状态 / 健康',
  'Stop {label}': '停止 {label}',
  'Stop process': '停止进程',
  'Total': '总计',
  'View logs for {label}': '查看 {label} 的日志',
  '{operation} {label}?': '{operation} {label}？',
};

export function useExecutionText() {
  return useLocalizedText(executionZhMessages);
}
