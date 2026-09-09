import { useEffect,useState } from 'react';
import {
  MARK_PROMPT_DOCK_CHANGE_EVENT,
  readMarkPromptDockVisible,
} from '../shared/preferences/markPromptDockPreference';

/** Reactive Mark Prompt hover-control preference (default visible). */
export function useMarkPromptDockVisible() {
  const [visible, setVisible] = useState(readMarkPromptDockVisible);

  useEffect(() => {
    const sync = () => setVisible(readMarkPromptDockVisible());
    window.addEventListener(MARK_PROMPT_DOCK_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MARK_PROMPT_DOCK_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return visible;
}
