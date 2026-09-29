import { Clapperboard,History } from 'lucide-react';
import { useContext,useMemo,useState } from 'react';
import { PanelViewSwitcher } from '../../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../../types';
import { useVideoProductionText } from './videoProductionMessages';
import {
  VideoProductionFrameContext,
  type VideoProductionView,
} from './videoProductionPanelFrameState';

export function VideoProductionFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<VideoProductionView>('studio');
  const value = useMemo(() => ({ panelId:panel.id,view,setView }),[panel.id,view]);
  return <VideoProductionFrameContext.Provider value={value}>{children}</VideoProductionFrameContext.Provider>;
}

export function VideoProductionHeaderLeading({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frame = useContext(VideoProductionFrameContext);
  const t = useVideoProductionText();
  if (!frame || frame.panelId !== panel.id) return null;
  return (
    <div
      className="video-production-header-leading"
      data-xgc-role="video-production-header-leading"
      data-xgc-id={panel.id}
      data-xgc-renders-view-active={frame.view === 'renders' ? 'true' : undefined}
    >
      <PanelViewSwitcher
        appearance="panel"
        ariaLabel={t('Video production views')}
        dataXgcId={panel.id}
        dataXgcRole="video-production-views"
        disabled={editing}
        items={[
          { id:'studio' as const,label:t('Studio'),icon:Clapperboard },
          { id:'renders' as const,label:t('Renders'),icon:History },
        ]}
        onChange={frame.setView}
        optionDataXgcRole="video-production-view"
        presentation="icons"
        value={frame.view}
      />
    </div>
  );
}
