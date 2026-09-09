import { CodeBlock,EmptyState,Notice,type DataTableColumn,type DataTableRowProps } from '@xgc2/ui-react';
import { SortableDataTable } from '../../components/SortableDataTable';
import { useEffect,useMemo,useState } from 'react';
import type { ReactNode } from 'react';
import { SearchControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { useAutomationExecutionText } from './automationExecutionMessages';
import '../../styles/automation-runtime-inspector.css';
import { writeAutomationInputFieldDrag } from './automationInputExpression';
import type { AutomationJSONSchema } from './automationDefinitionContracts';
import type { AutomationNodeExecutionSummary } from './automationExecutionContracts';
import {
  automationRuntimeFailure,
  type AutomationRuntimeFailure,
} from './automationRuntimeResultModel';
import {
  automationRuntimeRowLimit,
  flattenRuntimeSchema,
  flattenRuntimeValue,
  runtimeJSON,
  type AutomationRuntimeRow,
} from './automationRuntimeData';
import {
  useAutomationRuntimeViewMode,
  type AutomationRuntimePane,
  type AutomationRuntimeViewMode,
} from './useAutomationRuntimeViewMode';
import { AutomationPaneTabs } from './AutomationNodePanelTabs';

export type AutomationRuntimeInputSource = {
  id: string;
  label: string;
  outputSchema?: AutomationJSONSchema;
};

type RuntimeInputBindingSource = {
  sourceId: string;
  multipleSources: boolean;
  scope?: 'run-parameters';
};

const runtimeModes: Array<{ mode: AutomationRuntimeViewMode;label: string }> = [
  { mode: 'schema',label: 'Schema' },
  { mode: 'table',label: 'Table' },
  { mode: 'json',label: 'JSON' },
];

export function AutomationNodeInputPanel({
  nodeId,
  runId,
  nodeSummary,
  sources,
  showRunParameters = false,
  runParameters,
  loading = false,
  error = '',
}: {
  nodeId: string;
  runId?: string;
  nodeSummary?: AutomationNodeExecutionSummary;
  sources: AutomationRuntimeInputSource[];
  showRunParameters?: boolean;
  runParameters?: Record<string,unknown>;
  loading?: boolean;
  error?: string;
}) {
  const t = useAutomationExecutionText();
  const recordedInputs = runtimeRecord(nodeSummary?.inputs);
  const availableSources = useMemo(() => mergeInputSources(sources, recordedInputs), [recordedInputs,sources]);
  const [selectedSourceId, setSelectedSourceId] = useState(() => availableSources[0]?.id ?? '');
  const [viewMode, setViewMode] = useAutomationRuntimeViewMode('input');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!availableSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(availableSources[0]?.id ?? '');
    }
  }, [availableSources,selectedSourceId]);

  const selectedSource = availableSources.find((source) => source.id === selectedSourceId);
  const selectedInput = selectedSource && recordedInputs ? recordedInputs[selectedSource.id] : undefined;
  // The occurrence-derived summary is execution truth, including a missing
  // route input. Static schemas are authoring help only.
  const authoringSchema = nodeSummary ? undefined : selectedSource?.outputSchema;
  const searchableInputAvailable = showRunParameters
    ? Boolean(runId)
    : Boolean(selectedSource && (selectedInput !== undefined || authoringSchema));

  return (
    <section className="automation-node-runtime-panel" data-xgc-role="automation-node-input" data-xgc-id={nodeId}>
      <RuntimePanelHeader title="Input" pane="input" mode={viewMode} onModeChange={setViewMode}>
        {!showRunParameters && availableSources.length > 1 ? (
          <SelectControl
            compact
            className="automation-runtime-source-select"
            value={selectedSourceId}
            options={availableSources.map((source) => ({ value: source.id,label: source.label }))}
            onChange={setSelectedSourceId}
            ariaLabel={t('Source')}
            dataXgcRole="automation-node-input-source"
            dataXgcId={nodeId}
          />
        ) : null}
      </RuntimePanelHeader>
      <RuntimeSearchRow
        pane="input"
        value={search}
        disabled={loading || Boolean(error) || !searchableInputAvailable}
        onChange={setSearch}
      />
      <RuntimePanelState
        loading={loading}
        error={error}
        runId={runId}
        nodeSummary={nodeSummary}
        allowWithoutRun={!showRunParameters && Boolean(authoringSchema)}
        allowWithoutSummary={showRunParameters ? Boolean(runId) : Boolean(authoringSchema)}
        emptyTitle="No input yet"
        emptyBody="The selected execution has not reached this node."
      >
        {showRunParameters ? (
          <RuntimeDataView
            pane="input"
            mode={viewMode}
            search={search}
            value={runParameters ?? {}}
            inputSource={{ sourceId: 'run.parameters',multipleSources: false,scope: 'run-parameters' }}
          />
        ) : selectedSource ? (
          selectedInput === undefined
            ? authoringSchema
              ? <RuntimeDataView
                  pane="input"
                  mode={viewMode}
                  search={search}
                  schema={authoringSchema}
                  inputSource={{ sourceId: selectedSource.id,multipleSources: availableSources.length > 1 }}
                />
              : <RuntimeEmpty title={t('No input on this route')} body={t('No value was captured from {source} in the selected execution.', { source: selectedSource.label })} />
            : <RuntimeDataView
                pane="input"
                mode={viewMode}
                search={search}
                value={selectedInput}
                inputSource={{ sourceId: selectedSource.id,multipleSources: availableSources.length > 1 }}
              />
        ) : (
          <RuntimeEmpty title={t('No upstream input')} body={t('Connect an upstream node to inspect the value presented to this node.')} />
        )}
      </RuntimePanelState>
    </section>
  );
}

export function AutomationNodeOutputPanel({
  nodeId,
  runId,
  nodeSummary,
  loading = false,
  error = '',
  trigger = false,
}: {
  nodeId: string;
  runId?: string;
  nodeSummary?: AutomationNodeExecutionSummary;
  loading?: boolean;
  error?: string;
  trigger?: boolean;
}) {
  const t = useAutomationExecutionText();
  const [viewMode, setViewMode] = useAutomationRuntimeViewMode('output');
  const [search, setSearch] = useState('');
  const failure = automationRuntimeFailure(nodeSummary);
  const searchableOutputAvailable = Boolean(nodeSummary && !failure && nodeSummary.output !== undefined && nodeSummary.output !== null);

  return (
    <section className="automation-node-runtime-panel" data-xgc-role="automation-node-output" data-xgc-id={nodeId}>
      <RuntimePanelHeader title="Output" pane="output" mode={viewMode} onModeChange={setViewMode} />
      <RuntimeSearchRow
        pane="output"
        value={search}
        disabled={loading || Boolean(error) || !searchableOutputAvailable}
        onChange={setSearch}
      />
      <RuntimePanelState
        loading={loading}
        error={error}
        runId={runId}
        nodeSummary={nodeSummary}
        emptyTitle={trigger ? 'No trigger output' : 'No output yet'}
        emptyBody={trigger ? 'Run this Automation to inspect the emitted value.' : 'The selected execution has not reached this node.'}
        noRunTitle={trigger ? 'No trigger output' : undefined}
        noRunBody={trigger ? 'Run this Automation to inspect the emitted value.' : undefined}
      >
        {failure
          ? <RuntimeFailure id={nodeId} failure={failure} />
          : nodeSummary && (nodeSummary.output === undefined || nodeSummary.output === null)
          ? <RuntimeEmpty title={t('No persisted output')} body={t('This node completed without a public output payload.')} />
          : nodeSummary ? <RuntimeDataView pane="output" mode={viewMode} search={search} value={nodeSummary.output} /> : null}
      </RuntimePanelState>
    </section>
  );
}

export function AutomationRuntimeValuePanel({ title,pane,role,id,value,empty,failure }: {
  title: string;
  pane: AutomationRuntimePane;
  role: string;
  id: string;
  value: unknown;
  empty: string;
  failure?: AutomationRuntimeFailure;
}) {
  const [viewMode, setViewMode] = useAutomationRuntimeViewMode(pane);
  const [search, setSearch] = useState('');
  return (
    <section className="automation-node-runtime-panel automation-runtime-value-panel" data-xgc-role={role} data-xgc-id={id}>
      <RuntimePanelHeader title={title} pane={pane} mode={viewMode} onModeChange={setViewMode} />
      <RuntimeSearchRow
        pane={pane}
        value={search}
        disabled={Boolean(failure) || value === undefined || value === null}
        onChange={setSearch}
      />
      {failure
        ? <RuntimeFailure id={id} failure={failure} />
        : value === undefined || value === null
        ? <RuntimeEmpty title={empty} />
        : <RuntimeDataView pane={pane} mode={viewMode} search={search} value={value} />}
    </section>
  );
}

function RuntimeFailure({ id,failure }: { id: string;failure: AutomationRuntimeFailure }) {
  return (
    <Notice density="compact" heading={failure.className} tone="danger" data-xgc-role="automation-node-runtime-error" data-xgc-id={id}>{failure.message}</Notice>
  );
}

function RuntimePanelHeader({ title,pane,mode,onModeChange,children }: {
  title: string;
  pane: AutomationRuntimePane;
  mode: AutomationRuntimeViewMode;
  onModeChange: (mode: AutomationRuntimeViewMode) => void;
  children?: ReactNode;
}) {
  const t = useAutomationExecutionText();
  return (
    <header className="automation-runtime-panel-header">
      <span className="automation-node-pane-title">{t(title)}</span>
      <div className="automation-runtime-panel-actions">
        <RuntimeViewTabs pane={pane} mode={mode} onModeChange={onModeChange} />
        {children}
      </div>
    </header>
  );
}

function RuntimeViewTabs({ pane,mode,onModeChange }: {
  pane: AutomationRuntimePane;
  mode: AutomationRuntimeViewMode;
  onModeChange: (mode: AutomationRuntimeViewMode) => void;
}) {
  const t = useAutomationExecutionText();
  return <AutomationPaneTabs
    ariaLabel={t('{pane} data view', { pane })}
    className="automation-runtime-view-tabs"
    onChange={onModeChange}
    optionDataXgcRole="automation-runtime-view-mode"
    options={runtimeModes.map((entry) => ({
      dataXgcId: `${pane}:${entry.mode}`,
      label: t(entry.label),
      value: entry.mode,
    }))}
    value={mode}
  />;
}

function RuntimeSearchRow({ pane,value,disabled,onChange }: {
  pane: AutomationRuntimePane;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useAutomationExecutionText();
  return (
    <div className="automation-runtime-view-toolbar">
      <SearchControl
        className="automation-runtime-search"
        size="compact"
        ariaLabel={t('Search {pane} data', { pane })}
        placeholder={t('Search fields')}
        value={value}
        dataXgcRole="automation-runtime-search"
        dataXgcId={pane}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function RuntimePanelState({ loading,error,runId,nodeSummary,emptyTitle,emptyBody,noRunTitle,noRunBody,allowWithoutRun = false,allowWithoutSummary = false,children }: {
  loading: boolean;
  error: string;
  runId?: string;
  nodeSummary?: AutomationNodeExecutionSummary;
  emptyTitle: string;
  emptyBody: string;
  noRunTitle?: string;
  noRunBody?: string;
  allowWithoutRun?: boolean;
  allowWithoutSummary?: boolean;
  children: ReactNode;
}) {
  const t = useAutomationExecutionText();
  if (loading) return <RuntimeEmpty title={t('Loading execution data')} body={t('Reading the durable node state…')} />;
  if (error) return <RuntimeEmpty title={t('Unable to load execution data')} body={error} tone="error" />;
  if (!runId && !allowWithoutRun) return <RuntimeEmpty title={noRunTitle ?? 'No execution selected'} body={noRunBody ?? 'Run this Automation to create inspectable node data.'} />;
  if (!nodeSummary && !allowWithoutSummary) return <RuntimeEmpty title={emptyTitle} body={emptyBody} />;
  return <>{children}</>;
}

function RuntimeDataView({ pane,mode,search,value,schema,inputSource }: {
  pane: AutomationRuntimePane;
  mode: AutomationRuntimeViewMode;
  search: string;
  value?: unknown;
  schema?: AutomationJSONSchema;
  inputSource?: RuntimeInputBindingSource;
}) {
  const t = useAutomationExecutionText();
  const flattened = useMemo(() => schema ? flattenRuntimeSchema(schema) : flattenRuntimeValue(value), [schema,value]);
  const rows = flattened.rows;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = normalizedSearch
    ? rows.filter((row) => `${row.path}\n${row.type}\n${row.value}`.toLowerCase().includes(normalizedSearch))
    : rows;
  const json = runtimeJSON(schema ?? value);
  const visibleJSON = normalizedSearch
    ? json.split('\n').filter((line) => line.toLowerCase().includes(normalizedSearch)).join('\n')
    : json;
  const columns: DataTableColumn<AutomationRuntimeRow>[] = [
    {
      id: 'field',
      header: t('Field'),
      sortable: true,
      sortValue: (row) => row.path,
      cell: (row) => <code title={row.path}>{row.path}</code>,
    },
    {
      id: 'type',
      header: t('Type'),
      sortable: true,
      sortValue: (row) => row.type,
      cell: (row) => row.type,
    },
    ...(mode === 'table' ? [{
      id: 'value',
      header: t('Value'),
      sortable: true,
      sortValue: (row: AutomationRuntimeRow) => row.value,
      cell: (row: AutomationRuntimeRow) => <span title={row.value}>{row.value}</span>,
    }] satisfies DataTableColumn<AutomationRuntimeRow>[] : []),
  ];

  const rowProps = (row: AutomationRuntimeRow): DataTableRowProps => ({
    draggable: Boolean(inputSource),
    'data-xgc-role': inputSource ? 'automation-input-field' : undefined,
    'data-xgc-id': inputSource ? `${inputSource.sourceId}:${row.path}` : undefined,
    title: inputSource ? t('Drag {path} to an Expression field', { path: row.path }) : undefined,
    onDragStart: inputSource ? (event) => {
      writeAutomationInputFieldDrag(event.dataTransfer, {
        sourceId: inputSource.sourceId,
        multipleSources: inputSource.multipleSources,
        segments: row.segments,
        scope: inputSource.scope,
      });
    } : undefined,
  });

  return (
    <div className="automation-runtime-data-view" data-xgc-role="automation-runtime-data" data-xgc-id={pane}>
      <div className="automation-runtime-view-body" role="tabpanel" data-xgc-role="automation-runtime-view" data-xgc-id={`${pane}:${mode}`}>
        {mode === 'json' ? (
          visibleJSON
            ? <CodeBlock
                className="automation-runtime-json"
                content={visibleJSON}
                copyLabel={t('Copy')}
                copySuccessLabel={t('Copied')}
                language="json"
              />
            : <RuntimeEmpty title={t('No matching fields')} body={t('Clear the search to inspect all runtime data.')} />
        ) : visibleRows.length === 0 ? (
          <RuntimeEmpty title={t('No matching fields')} body={t('Clear the search to inspect all runtime data.')} />
        ) : (
          <div className="automation-runtime-table-layout">
            <SortableDataTable
              bodyScroll
              bodyScrollLabel={t('{pane} fields', { pane })}
              className="automation-runtime-table-wrap"
              columns={columns}
              data-sticky-header="true"
              data-xgc-id={`automation-runtime-${pane}`}
              getRowProps={rowProps}
              rowKey={(row) => `${row.path}:${row.type}`}
              rows={visibleRows}
              tableProps={{ className: 'automation-runtime-table' }}
            />
            {flattened.truncated && <small className="automation-runtime-truncated">{t('Showing the first {count} fields.', { count: automationRuntimeRowLimit })}</small>}
          </div>
        )}
      </div>
    </div>
  );
}


function RuntimeEmpty({ title,body,tone = 'neutral' }: { title: string;body?: string;tone?: 'neutral' | 'error' }) {
  const t = useAutomationExecutionText();
  if (tone === 'error') return <Notice density="compact" heading={t(title)} tone="danger">{body ? t(body) : null}</Notice>;
  return <EmptyState appearance="plain" density="compact" title={t(title)} description={body ? t(body) : undefined} />;
}

function mergeInputSources(sources: AutomationRuntimeInputSource[], inputs?: Record<string,unknown>) {
  const merged = new Map(sources.map((source) => [source.id,source]));
  Object.keys(inputs ?? {}).forEach((id) => {
    if (!merged.has(id)) merged.set(id, { id,label: id });
  });
  return [...merged.values()];
}

function runtimeRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
