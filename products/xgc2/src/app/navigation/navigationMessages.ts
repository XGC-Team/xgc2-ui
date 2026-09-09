import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const navigationZhMessages: MessageCatalog = {
  'Collapse navigation': '收起导航',
  'Expand navigation': '展开导航',
};

export function useNavigationText() {
  return useLocalizedText(navigationZhMessages);
}

