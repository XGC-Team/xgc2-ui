import { useLocalizedText,type LocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const terminalZhMessages: MessageCatalog = {
  'Address': '地址',
  'Close {title}': '关闭 {title}',
  'Connection': '连接',
  'Credentials': '凭据',
  'Delete {name}': '删除 {name}',
  Common: 'Common',
  'Direct shell': '本机 Shell',
  'Edit host': '编辑主机',
  'Edit {name}': '编辑 {name}',
  'Grid': '网格',
  'Host credentials': '主机凭据',
  'Host group': '主机分组',
  'Use an explicit host group; Default is not allowed.': '请填写明确的主机分组；不允许使用 Default。',
  'Terminal host ID must be a stable ASCII ID.': '终端主机 ID 必须是稳定的 ASCII ID。',
  'Terminal host ID is reserved.': '终端主机 ID 已保留。',
  'Terminal host group is required.': '必须填写终端主机分组。',
  'Terminal host group must be canonical UTF-8 of at most 128 bytes.': '终端主机分组必须是最多 128 字节的 canonical UTF-8。',
  'Terminal host group Default is retired; use an explicit group.': '终端主机分组 Default 已退役；请填写明确分组。',
  'Terminal host group must contain only visible Unicode and ordinary spaces.': '终端主机分组只能包含可见 Unicode 与普通空格。',
  'Terminal host group must contain visible text.': '终端主机分组必须包含可见文本。',
  'Hosts': '主机',
  'Local group': '本机',
  'New host': '新建主机',
  'No login targets for the selected Core or Agent.': '当前选中的 Core 或 Agent 没有可用登录目标。',
  'No matching hosts': '没有匹配的主机',
  'No user scripts': '暂无用户脚本',
  'No hosts yet': '暂无主机',
  'No terminal session': '暂无终端会话',
  'Notes': '备注',
  'Off: do not store the password. On: save for later connects.': '关闭：不保存密码。开启：保存以便下次连接。',
  'Optional to save. If empty (and not already stored), you will be asked for the password each time you connect. Password is used only for that SSH session.': '可选保存。若为空（且尚未存储），每次连接时都会提示输入密码。密码仅用于该次 SSH 会话。',
  'Password': '密码',
  'Port': '端口',
  'Remember password': '记住密码',
  'Insert {name} into the current terminal: {command}': '插入脚本到当前终端：{name}：{command}',
  'Could not place the script on this terminal.': '无法把脚本放到当前终端。',
  'Search hosts': '搜索主机',
  'Select Direct shell, loopback, a Host, or a robot on the left to open a session as the currently selected Core or Agent.': '在左侧选择本机 Shell、回环、主机或机器人，以当前选中的 Core 或 Agent 打开会话。',
  'Tabs': '标签页',
  'Targets': '登录目标',
  'Terminal chrome': '终端顶栏',
  'Terminal layout': '终端布局',
  'Terminal sessions': '终端会话',
  'User': '用户',
  'Use New to add an SSH host.': '点击「新建」添加 SSH 主机。',
  'local shell': '本机 Shell',
  'Not saved — used only for this session': '不保存 — 仅用于本次会话',
};

export function useTerminalText() {
  return useLocalizedText(terminalZhMessages);
}

/** Translate known catalog / rail group labels; leave custom operator groups unchanged. */
export function terminalGroupLabel(group: string, t: LocalizedText): string {
  if (group === 'all') return t('All groups');
  if (
    group === 'Hosts' || group === 'Robots' ||
    group === 'FS150' || group === 'Common' || group === 'Scout' || group === 'Wheeltec' ||
    group === 'User scripts' ||
    group === 'Ungrouped'
  ) {
    return t(group);
  }
  if (group === 'Local') return t('Local group');
  return group;
}
