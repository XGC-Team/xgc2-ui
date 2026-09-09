import { useMemo,useState,type ReactNode } from 'react';
import { CodeBlock } from '@xgc2/ui-react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { ContainerTerminalLog } from './ContainerTerminalLog';
import { prettyDockerInspectJson,type DockerInspectFact } from './dockerInspectPrimitives';

type InspectViewMode = 'summary' | 'json';

const viewModes: Array<{ mode: InspectViewMode;label: string }> = [
  { mode: 'summary',label: 'Summary' },
  { mode: 'json',label: 'JSON' },
];

export function DockerInspectDataView({
  content,
  structured,
  ariaLabel,
  rootRole,
  tabsRole,
  modeRole,
  rawRole,
  summaryClassName,
  children,
}: {
  content: string;
  structured: boolean;
  ariaLabel: string;
  rootRole: string;
  tabsRole: string;
  modeRole: string;
  rawRole: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const rawJson = useMemo(() => prettyDockerInspectJson(content), [content]);
  const [viewMode,setViewMode] = useState<InspectViewMode>('summary');

  if (!structured) return <ContainerTerminalLog content={content} />;

  return (
    <div className="container-inspect-summary" data-xgc-role={rootRole} data-xgc-id={rootRole}>
      <SegmentedControl
        ariaLabel={ariaLabel}
        asTabs
        className="container-inspect-view-tabs"
        dataXgcRole={tabsRole} dataXgcId={tabsRole}
        onChange={setViewMode}
        optionDataXgcRole={modeRole}
        options={viewModes.map((entry) => ({ dataXgcId: entry.mode, label: entry.label, value: entry.mode }))}
        size="compact"
        value={viewMode}
      />

      {viewMode === 'summary' ? (
        <div className={summaryClassName} role="tabpanel">
          {children}
        </div>
      ) : (
        <CodeBlock
          className="container-inspect-json"
          content={rawJson}
          copyable={false}
          data-xgc-role={rawRole} data-xgc-id={rawRole}
          language="json"
          role="tabpanel"
          tabIndex={0}
        />
      )}
    </div>
  );
}

export function DockerInspectFacts({
  facts,
  dataXgcRole,
  dataXgcId,
}: {
  facts: readonly DockerInspectFact[];
  dataXgcRole: string;
  dataXgcId: string;
}) {
  return (
    <dl className="container-inspect-facts" data-xgc-role={dataXgcRole} data-xgc-id={dataXgcId}>
      {facts.map((fact) => (
        <div className="container-inspect-fact" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd title={fact.value}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
