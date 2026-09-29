import { Camera } from 'lucide-react';
import { EmptyState } from '@xgc2/ui-react';
import { useCameraText } from './cameraMessages';
import '../../styles/camera-calibration-panel.css';
import '../../styles/camera-intrinsic-panel.css';

/** Read-only placeholder used wherever a calibration image is not available. */
export function CalibrationImagePlaceholder({ text }: { text: string }) {
  return <EmptyState
    className="panels-camera-calibration-image-placeholder"
    appearance="plain"
    density="compact"
    fill
    title={text}
  />;
}

/**
 * The detection-image card shared by the full intrinsic workspace and the
 * read-only shared surface. Pure props: the owner decides the status text and
 * the image source; this component only presents them.
 */
export function CameraCalibrationDetectionPreview({ id,status,statusTitle,detected,imageUrl,imageAlt,placeholder }: {
  id: string;
  status: string;
  statusTitle?: string;
  detected?: boolean;
  imageUrl: string;
  imageAlt: string;
  placeholder: string;
}) {
  const t = useCameraText();
  return <section className="panels-camera-intrinsic-card panels-camera-intrinsic-detection-preview"
    data-xgc-role="camera-intrinsic-annotated-view" data-xgc-id={id}>
    <header><div><Camera size={14} /><strong>{t('Detection result')}</strong></div>
      <span data-xgc-role="camera-intrinsic-detection"
        data-xgc-id={id}
        data-xgc-detected={detected ? 'true' : undefined}
        title={statusTitle}>
        {status}
      </span></header>
    {imageUrl
      ? <img src={imageUrl} alt={imageAlt} draggable={false}
          data-xgc-role="camera-intrinsic-annotated-frame" data-xgc-id={id} />
      : <CalibrationImagePlaceholder text={placeholder} />}
  </section>;
}

/** Small labelled fact list for a read-only calibration status presentation. */
export function CameraCalibrationStateFacts({ id,items }: {
  id: string;
  items: readonly { label: string; value: string }[];
}) {
  return <dl className="camera-calibration-state-facts" data-xgc-role="camera-calibration-state-facts" data-xgc-id={id}>
    {items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
  </dl>;
}
