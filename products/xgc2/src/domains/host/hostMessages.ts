import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const hostZhMessages: MessageCatalog = {
  'Performance mode': '性能模式',
  'Host policy': '主机策略',
  'Host timezone': '主机时区',
  'Screen idle timeout': '屏幕空闲超时',
  'Autologin user': '自动登录用户',
  'Network time': '网络时间',
  'Autologin to desktop': '自动登录桌面',
  'Allow sleep': '允许睡眠',
  'Refresh performance mode': '刷新性能模式',
  'Unavailable': '不可用',
  'Network views': '网络视图',
  'End process': '结束进程',
  'End host process': '结束主机进程',
  'End process {pid}{label}?': '结束进程 {pid}{label}？',
  'Enter URL, hostname, or IP': '输入 URL、主机名或 IP',
  'Failed to load host network diagnostics.': '加载主机网络诊断失败。',
  'Failed to load host processes.': '加载主机进程失败。',
  'Failed to load listening ports.': '加载监听端口失败。',
  'Find in current directory': '在当前目录中查找',
  'Host file path': '主机文件路径',
  'Local address / port': '本地地址 / 端口',
  'No files': '没有文件',
  'No matching files': '没有匹配的文件',
  'Refresh files': '刷新文件',
  'Unable to load files': '无法读取文件',
  'Process': '进程',
  'Remote address / port': '远程地址 / 端口',
  'Remote terminate requires process startTicks identity.': '远程终止需要进程 startTicks 身份标识。',
  'Search PID, process, port': '搜索 PID、进程、端口',
  'Search PID, user, process': '搜索 PID、用户、进程',
  'Search interface or address': '搜索网络接口或地址',
  'Search route, gateway, interface': '搜索路由、网关或网络接口',
  'Search user, source, process': '搜索用户、来源或进程',
};

export function useHostText() {
  return useLocalizedText(hostZhMessages);
}
