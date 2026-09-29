import { useEffect, useState } from 'react';
import { FormSection, Inline, Notice, Stack, StatusText } from '@xgc2/ui-react';
import { listRobotSimulationImages, type RobotSimulationImage } from './robotAssetService';
import { useRobotText } from './robotMessages';

type ImageResult = {
  kind: string;
  model: string | undefined;
  images: RobotSimulationImage[];
  error?: string;
};

export function RobotSimulationImages({ kind, model }: { kind: string; model?: string }) {
  const t = useRobotText();
  const [result, setResult] = useState<ImageResult>();
  useEffect(() => {
    const request = new AbortController();
    void listRobotSimulationImages(kind, model, request.signal).then(
      (images) => { if (!request.signal.aborted) setResult({ kind, model, images }); },
      (cause: unknown) => {
        if (!request.signal.aborted) setResult({ kind, model, images: [], error: cause instanceof Error ? cause.message : '' });
      },
    );
    return () => request.abort();
  }, [kind, model]);
  const current = result?.kind === kind && result.model === model ? result : undefined;
  return (
    <FormSection
      title={t('Available onboard environments')}
      columns={1}
      dataXgcRole="robot-asset-simulation-images"
      dataXgcId="robot-asset-simulation-images"
    >
      {!current ? (
        <StatusText status="running" data-xgc-role="robot-asset-images-status" data-xgc-id="robot-asset-images-status">{t('Checking local images')}</StatusText>
      ) : current.error !== undefined ? (
        <Notice tone="danger" data-xgc-role="robot-asset-images-error" data-xgc-id="robot-asset-images-error">
          {current.error || t('Unable to read local simulation images.')}
        </Notice>
      ) : current.images.length === 0 ? (
        <StatusText status="idle" data-xgc-role="robot-asset-images-status" data-xgc-id="robot-asset-images-status">{t('No simulation image provided for this model.')}</StatusText>
      ) : current.images.map((image) => (
        <Inline key={image.profile} justify="between" gap="compact" data-xgc-role="robot-asset-simulation-image" data-xgc-id={image.profile}>
          <Stack gap="tight">
            <strong data-xgc-role="robot-asset-image-model" data-xgc-id={image.profile}>{image.label}</strong>
            <span data-xgc-role="robot-asset-image-environment" data-xgc-id={image.profile}>{image.os} {image.version} · ROS {image.ros}</span>
          </Stack>
          <StatusText status={image.installed ? 'ready' : 'idle'} data-xgc-role="robot-asset-image-availability" data-xgc-id={image.profile}>
            {image.installed ? t('Available locally') : t('Not available locally')}
          </StatusText>
        </Inline>
      ))}
    </FormSection>
  );
}
