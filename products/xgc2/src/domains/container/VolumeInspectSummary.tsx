import { useMemo } from 'react';
import { summarizeVolumeInspect } from './volumeInspectViewModel';
import { DockerInspectDataView,DockerInspectFacts } from './DockerInspectDataView';

export function VolumeInspectSummary({ content }: { content: string }) {
  const summary = useMemo(() => summarizeVolumeInspect(content), [content]);

  if (content.trim() === 'Loading inspect...') {
    return (
      <p className="container-network-endpoints-empty" data-xgc-role="container-volume-inspect-loading" data-xgc-id="container-volume-inspect-loading">
        Loading inspect…
      </p>
    );
  }

  return (
    <DockerInspectDataView
      content={content}
      structured={summary.structured}
      ariaLabel="Volume inspect view"
      rootRole="container-volume-inspect-summary"
      tabsRole="container-volume-inspect-view-tabs"
      modeRole="container-volume-inspect-view-mode"
      rawRole="container-volume-inspect-raw"
    >
      <DockerInspectFacts facts={summary.facts} dataXgcRole="container-volume-inspect-facts" dataXgcId="container-volume-inspect-facts" />
    </DockerInspectDataView>
  );
}
