import type { PanelPluginProps } from '../types';
import { VideoProductionPanel } from './videoProduction/VideoProductionPanel';
import { VideoProductionFrameProvider } from './videoProduction/videoProductionPanelFrame';

type Props = PanelPluginProps<readonly ['visualization','experiment','automation']>;

export function ScientificGalleryVideoView({ panel,context }: Props) {
  return (
    <VideoProductionFrameProvider panel={panel}>
      <div
        className="scientific-gallery-video"
        data-xgc-role="scientific-gallery-video"
        data-xgc-id={panel.id}
      >
        <VideoProductionPanel panel={panel} context={context} />
      </div>
    </VideoProductionFrameProvider>
  );
}
