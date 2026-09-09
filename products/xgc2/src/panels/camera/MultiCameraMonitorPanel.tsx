import { EmptyState } from '@xgc2/ui-react';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginProps } from '../types';
import { CameraVideoPanel } from './CameraVideoPanel';
import {
  decodeMultiCameraMonitorStreams,
  multiCameraMonitorOptions,
} from './multiCameraMonitorModel';
import '../../styles/multi-camera-monitor.css';
import {
  localizeCameraValidationIssue,
  useCameraText,
} from './cameraMessages';

export function MultiCameraMonitorPanel({
  panel,context,
}: PanelPluginProps<readonly ['visualization']>) {
  const t = useCameraText();
  const decoded = decodeMultiCameraMonitorStreams(panel.options.streamsJson);
  const options = multiCameraMonitorOptions(panel.options);
  const streams = options.streams.filter((stream) => stream.enabled);
  if (decoded.error || streams.length === 0) {
    return <EmptyState appearance="plain" fill
      title={t('Configure camera sources')}
      description={decoded.issue
        ? localizeCameraValidationIssue(t,decoded.issue)
        : t('Enable at least one camera source in the panel settings.')}
      data-xgc-role="multi-camera-monitor-state" data-xgc-id={panel.id} data-state="waiting" />;
  }
  return <section className="multi-camera-monitor-root"
    data-xgc-role="multi-camera-monitor" data-xgc-id={panel.id}>
    <div className="multi-camera-monitor-grid"
      data-columns={options.layoutColumns} data-aspect-ratio={options.tileAspectRatio}>
      {streams.map((stream) => {
        const streamPanel: PanelInstance = {
          ...panel,
          id:`${panel.id}:${stream.id}`,
          title:stream.name,
          options:{
            edgeUrl:stream.edgeUrl,
            sourceId:stream.sourceId,
            imageFit:options.imageFit,
            reconnectPolicy:options.reconnectPolicy,
            showMetadata:options.showMetadata,
          },
        };
        return <article className="multi-camera-monitor-tile" key={stream.id}
          data-xgc-role="multi-camera-monitor-tile" data-xgc-id={`${panel.id}:${stream.id}`}>
          <CameraVideoPanel panel={streamPanel} context={context} />
          <span className="multi-camera-monitor-tile-name" data-xgc-role="multi-camera-monitor-tile-name"
            data-xgc-id={`${panel.id}:${stream.id}`}>{stream.name}</span>
        </article>;
      })}
    </div>
  </section>;
}
