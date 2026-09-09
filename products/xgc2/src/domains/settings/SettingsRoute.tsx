import { useNavigation } from '../../app/navigationContext';
import '../../styles/settings.css';
import { SettingsPage } from './SettingsPage';

export function SettingsRoute() {
  const nav = useNavigation();

  return (
    <SettingsPage
      skin={nav.skin}
      language={nav.language}
      onLanguageChange={nav.setLanguage}
      onSkinChange={nav.setSkin}
    />
  );
}
