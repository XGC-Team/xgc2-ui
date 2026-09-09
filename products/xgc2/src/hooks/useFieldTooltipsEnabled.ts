import { useEffect,useState } from 'react';
import {
  FIELD_TOOLTIPS_CHANGE_EVENT,
  readFieldTooltipsEnabled,
} from '../shared/preferences/fieldTooltipPreference';

/** Reactive global field-tooltip preference (default off). */
export function useFieldTooltipsEnabled() {
  const [enabled, setEnabled] = useState(readFieldTooltipsEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readFieldTooltipsEnabled());
    window.addEventListener(FIELD_TOOLTIPS_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FIELD_TOOLTIPS_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return enabled;
}
