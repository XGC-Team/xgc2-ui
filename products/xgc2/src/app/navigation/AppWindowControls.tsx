import { Button } from '@xgc2/ui-react';
import { Copy,Minus,Square,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { readDesktopWindowApi } from './desktopWindow';

/**
 * Caption buttons for the frameless experiment shell. The browser host has
 * no window to drive, so this renders nothing there.
 */
export function AppWindowControls({ language }: { language: AppLanguage }) {
  const api = readDesktopWindowApi();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!api) return undefined;
    let cancelled = false;
    const sync = () => {
      void api.isMaximized().then((value) => {
        if (!cancelled) setMaximized(Boolean(value));
      });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', sync);
    };
  }, [api]);
  if (!api) return null;
  const zh = language === 'zh-CN';
  return (
    <div
      className="app-window-controls"
      data-xgc-role="app-window-controls"
      data-xgc-id="app-window-controls"
      aria-label={zh ? '窗口控制' : 'Window controls'}
    >
      <Button
        appearance="ghost"
        aria-label={zh ? '最小化' : 'Minimize'}
        data-xgc-role="app-window-minimize"
        data-xgc-id="app-window-minimize"
        iconOnly
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void api.minimize();
        }}
        uiSize="compact"
      >
        <Minus size={12} />
      </Button>
      <Button
        appearance="ghost"
        aria-label={maximized ? (zh ? '还原' : 'Restore') : (zh ? '最大化' : 'Maximize')}
        aria-pressed={maximized}
        data-xgc-role="app-window-maximize"
        data-xgc-id="app-window-maximize"
        iconOnly
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void api.toggleMaximize().then((value) => setMaximized(Boolean(value)));
        }}
        uiSize="compact"
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </Button>
      <Button
        appearance="ghost"
        aria-label={zh ? '关闭' : 'Close'}
        data-xgc-role="app-window-close"
        data-xgc-id="app-window-close"
        iconOnly
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void api.close();
        }}
        uiSize="compact"
      >
        <X size={12} />
      </Button>
    </div>
  );
}
