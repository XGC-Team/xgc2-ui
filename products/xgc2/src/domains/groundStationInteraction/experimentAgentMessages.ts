import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';
export const experimentAgentZhMessages: MessageCatalog = {
  'Frozen Action review': '冻结 Action 审批',
  'Queued for execution': '已加入执行队列',
  'Action': '操作',
};
export function useExperimentAgentText() { return useLocalizedText(experimentAgentZhMessages); }
