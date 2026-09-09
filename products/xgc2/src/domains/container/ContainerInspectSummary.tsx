import { useMemo } from 'react';
import { summarizeContainerInspect } from './containerInspectViewModel';
import { DockerInspectDataView,DockerInspectFacts } from './DockerInspectDataView';

/**
 * Operator-readable inspect summary with a mutually exclusive JSON view.
 * Mirrors workflow node I/O: compact view tabs + plain preformatted JSON
 * (not xterm — terminal fit collapses inside the drawer).
 */
export function ContainerInspectSummary({ content }: { content: string }) {
  const summary = useMemo(() => summarizeContainerInspect(content), [content]);

  return (
    <DockerInspectDataView
      content={content}
      structured={summary.structured}
      ariaLabel="Inspect data view"
      rootRole="container-inspect-summary"
      tabsRole="container-inspect-view-tabs"
      modeRole="container-inspect-view-mode"
      rawRole="container-inspect-raw"
    >
      <DockerInspectFacts facts={summary.facts} dataXgcRole="container-inspect-facts" dataXgcId="container-inspect-facts" />
    </DockerInspectDataView>
  );
}
