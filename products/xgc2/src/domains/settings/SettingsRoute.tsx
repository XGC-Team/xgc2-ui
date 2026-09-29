import { useNavigation } from '../../app/navigationContext';
import { useOperatorTime } from '../../shared/operatorTimeContext';
import '../../styles/settings.css';
import { SettingsPage } from './SettingsPage';

export function SettingsRoute() {
  const nav = useNavigation((state) => ({
    skin: state.skin,language: state.language,setLanguage: state.setLanguage,setSkin: state.setSkin,
  }));
  const timezone = useOperatorTime();

  return (
    <SettingsPage
      skin={nav.skin}
      language={nav.language}
      timezonePreference={timezone.preference}
      timezoneResolved={timezone.resolved}
      onLanguageChange={nav.setLanguage}
      onSkinChange={nav.setSkin}
      onTimezoneChange={(preference) => { void timezone.setPreference(preference); }}
    />
  );
}
