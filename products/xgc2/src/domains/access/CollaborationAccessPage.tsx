import { formatOperatorDateTime } from '../../shared/operatorTime';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowLeft, Copy, Filter, Link2, Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react';
import { Button, Checkbox, Notice, Panel, StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { ListPage, ListPageHost, ListPageItemMain, ListPageItemMeta, ListPageRow } from '../../components/ListPage';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { SegmentedControl } from '../../components/SegmentedControl';
import { ConfigDrawer, ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { FormField } from '../../components/FormPrimitives';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import type {
  ExperimentDocument,
  ExperimentRobotBinding,
} from '../experiment/experimentPublic';
import { experimentRobotRoleLabel } from '../experiment/experimentPublic';
import { accessEntryLinkCandidates, buildAccessEntryLink } from './accessLink';
import { useAccessCatalog, useSharedPanelTitle, useSharingResources } from './useSharingResources';
import { useAccessEntries,useAccessEntryParticipants } from './useAccessEntries';
import type { AccessEntriesFailure } from './useAccessEntries';
import {
  ACCESS_ACTION_CALIBRATION_IMAGE_READ,
  ACCESS_ACTION_CALIBRATION_STATE_READ,
  ACCESS_ACTION_CAMERA_LIVE,
  ACCESS_ACTION_CAMERA_SNAPSHOT,
  ACCESS_ACTION_REMOTE_MOTION,
  ACCESS_ACTION_SURFACE_READ,
  accessEntryKindLabel,
  type AccessCatalogResource,
  type AccessEntry,
  type AccessEntryIssued,
  type AccessEntryStatus,
  type CreateAccessEntryBody,
} from './accessTypes';
import '../../styles/access-sharing.css';

const KNOWN_ACTIONS: readonly string[] = [
  ACCESS_ACTION_SURFACE_READ,
  ACCESS_ACTION_CAMERA_LIVE,
  ACCESS_ACTION_CAMERA_SNAPSHOT,
  ACCESS_ACTION_REMOTE_MOTION,
  ACCESS_ACTION_CALIBRATION_STATE_READ,
  ACCESS_ACTION_CALIBRATION_IMAGE_READ,
];

const DURATION_HOUR_OPTIONS = ['1', '2', '4', '8'];

type ShareKindFilter = 'all' | 'camera' | 'remote' | 'calibration';
type ShareSortMode = 'name-asc' | 'expires-asc' | 'expires-desc';

export function CollaborationAccessPage({ language }: { language: AppLanguage }) {
  const copy = accessSharingCopy[language];
  const {
    entries, loading, error, actionError, createError, busyId,
    refresh, clearActionError, clearCreateError, create, start, stop, rotate, revoke,
  } = useAccessEntries();
  const [selectedId, setSelectedId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [issued, setIssued] = useState<AccessEntryIssued | null>(null);
  const { experiments, experimentsFailed, robotAssets, retryExperiments } = useSharingResources();

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    clearActionError();
  }, [selectedId, clearActionError]);

  useEffect(() => {
    if (!issued) return;
    const current = entries.find((entry) => entry.id === issued.entry.id);
    if (!current || current.status !== 'running') setIssued(null);
  }, [entries, issued]);

  const assetName = useCallback((resourceId: string) => (
    robotAssets.find((asset) => asset.head.resourceId === resourceId)?.spec.name?.trim() ?? ''
  ), [robotAssets]);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ShareKindFilter>('all');
  const [sortMode, setSortMode] = useState<ShareSortMode>('name-asc');
  const hasEntries = entries.length > 0;
  const filtering = search.trim() !== '' || kindFilter !== 'all';
  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = entries.filter((entry) => {
      const kind = accessEntryKindLabel(entry);
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      if (!query) return true;
      const experimentName = experimentDisplayName(experiments, entry.surface.experimentId);
      const haystack = `${entry.name} ${copy.kind[kind]} ${experimentName} ${copy.status[entry.status]}`.toLowerCase();
      return haystack.includes(query);
    });
    return matched.sort((left, right) => compareShareEntries(left, right, sortMode));
  }, [copy, entries, experiments, kindFilter, search, sortMode]);
  const showEmpty = visibleEntries.length === 0 && !loading && !error;
  const openDrawer = useCallback(() => {
    clearCreateError();
    setDrawerOpen(true);
  }, [clearCreateError]);

  const shareList = (
    <ListPageHost className="access-sharing-list" aria-busy={loading || undefined}>
      {error ? <Notice density="compact" tone="danger">{copy.feedback[error]}</Notice> : null}
      <ListPage<AccessEntry>
        dataXgcRole="access-entry-list"
        dataXgcId="access-entry-list"
        search={{
          value: search,
          placeholder: copy.search,
          onChange: setSearch,
          role: 'access-entry-search',
        }}
        controls={(
          <div className="access-sharing-catalog-controls">
            <div className="access-sharing-catalog-filters">
              <SelectControl
                className="access-sharing-catalog-filter"
                compact
                menuAlign="start"
                value={kindFilter}
                options={[
                  { value: 'all', label: copy.allFunctions },
                  { value: 'camera', label: copy.kind.camera },
                  { value: 'remote', label: copy.kind.remote },
                  { value: 'calibration', label: copy.kind.calibration },
                ]}
                onChange={(value) => setKindFilter(value as ShareKindFilter)}
                icon={<Filter size={15} />}
                ariaLabel={copy.filterByFunction}
                dataXgcRole="access-entry-kind-filter"
                dataXgcId="access-entry-kind-filter"
              />
            </div>
            <div className="access-sharing-catalog-actions">
              <SelectControl
                className="access-sharing-catalog-sort"
                compact
                value={sortMode}
                options={[
                  { value: 'name-asc', label: copy.sortName },
                  { value: 'expires-asc', label: copy.sortExpiresSoon },
                  { value: 'expires-desc', label: copy.sortExpiresLast },
                ]}
                onChange={(value) => setSortMode(value as ShareSortMode)}
                icon={<ArrowDownUp size={15} />}
                ariaLabel={copy.sort}
                dataXgcRole="access-entry-sort"
                dataXgcId="access-entry-sort"
              />
              <ControlButton
                aria-label={copy.refresh}
                iconOnly
                disabled={loading}
                onClick={() => void refresh()}
                dataXgcRole="access-entries-refresh"
                dataXgcId="access-entries-refresh"
              >
                <RefreshCw size={15} aria-hidden="true" />
              </ControlButton>
              <Button
                tone="primary"
                onClick={openDrawer}
                data-xgc-role="access-entry-create"
                data-xgc-id="access-entry-create"
              >
                <Plus aria-hidden="true" />
                {copy.create}
              </Button>
            </div>
          </div>
        )}
        folders={showEmpty ? [] : [{ id: 'shares', title: copy.listTitle, items: visibleEntries }]}
        showFolderHeaders={false}
        renderItem={(entry) => {
          const kind = accessEntryKindLabel(entry);
          const experimentName = experimentDisplayName(experiments, entry.surface.experimentId);
          const description = `${copy.kind[kind]}${experimentName ? ` · ${experimentName}` : ''}`;
          return (
            <ListPageRow
              key={entry.id}
              selected={selectedId === entry.id}
              data-xgc-role="access-entry-row"
              data-xgc-id={entry.id}
              onClick={() => setSelectedId(entry.id)}
            >
              <ListPageItemMain
                dataXgcId={entry.id}
                titleRole="access-entry-row-open"
                descriptionRole="access-entry-row-description"
                title={entry.name}
                description={description}
                icon={Link2}
                openLabel={entry.name}
                current={selectedId === entry.id}
                onOpen={() => setSelectedId(entry.id)}
              />
              <ListPageItemMeta data-xgc-role="access-entry-row-status" data-xgc-id={entry.id}>
                <StatusText status={entryStatusTone(entry.status)} data-xgc-level={entry.status}>
                  {copy.status[entry.status]}
                </StatusText>
              </ListPageItemMeta>
            </ListPageRow>
          );
        }}
        emptyTitle={hasEntries && filtering ? copy.noMatches : copy.empty}
        emptyDescription={hasEntries && filtering ? copy.noMatchesDescription : copy.emptyDescription}
      />
    </ListPageHost>
  );

  return (
    <div
      className="access-sharing-page xgc-workspace-full-span"
      data-xgc-role="access-sharing-page"
      data-xgc-id="access-sharing-page"
    >
      {selected ? (
        <div className="access-sharing-detail">
          <AccessEntryDetail
            entry={selected}
            experiments={experiments}
            assetName={assetName}
            issued={issued && issued.entry.id === selected.id ? issued : null}
            busy={busyId !== ''}
            actionError={actionError && actionError.id === selected.id ? actionError.reason : ''}
            copy={copy}
            onBack={() => setSelectedId('')}
            onStart={() => void start(selected.id).then((next) => {
              if (next) setIssued(next);
            })}
            onStop={() => void stop(selected.id)}
            onRotate={() => void rotate(selected.id).then((next) => {
              if (next) setIssued(next);
            })}
            onRevoke={() => {
              const revokedId = selected.id;
              void revoke(revokedId).then((ok) => {
                if (!ok) return;
                setSelectedId((current) => (current === revokedId ? '' : current));
                setIssued((current) => (current?.entry.id === revokedId ? null : current));
              });
            }}
          />
        </div>
      ) : shareList}
      {drawerOpen ? (
        <CreateShareDrawer
          experiments={experiments ?? []}
          experimentsReady={experiments !== null}
          experimentsFailed={experimentsFailed}
          onRetryExperiments={retryExperiments}
          busy={busyId === 'new'}
          createError={createError}
          copy={copy}
          onDismiss={() => setDrawerOpen(false)}
          onCreated={(next) => {
            setDrawerOpen(false);
            setIssued(next);
            setSelectedId(next.entry.id);
          }}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

function AccessEntryDetail({
  entry,
  experiments,
  assetName,
  issued,
  busy,
  actionError,
  copy,
  onBack,
  onStart,
  onStop,
  onRotate,
  onRevoke,
}: {
  entry: AccessEntry;
  experiments: ExperimentDocument[] | null;
  assetName: (resourceId: string) => string;
  issued: AccessEntryIssued | null;
  busy: boolean;
  actionError: AccessEntriesFailure;
  copy: AccessSharingCopy;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const [arming, setArming] = useState(false);
  useEffect(() => {
    setArming(false);
  }, [entry.id, entry.status]);

  const panelSurfaceExperimentId = entry.surface.kind === 'experiment-panel' ? entry.surface.experimentId : '';
  const panelSurfacePanelId = entry.surface.kind === 'experiment-panel' ? entry.surface.panelId : '';
  const panelTitle = useSharedPanelTitle(panelSurfaceExperimentId, panelSurfacePanelId);

  const kind = accessEntryKindLabel(entry);
  const unknownActions = entry.actions.filter((action) => !KNOWN_ACTIONS.includes(action));
  const blocked = unknownActions.length > 0;
  const canStart = !blocked && (entry.status === 'stopped' || entry.status === 'failed');
  const canStop = entry.status === 'running';
  const canRotate = !blocked && entry.status === 'running';
  const canRevoke = entry.status !== 'revoked';

  const experiment = (experiments ?? []).find(
    (document) => document.head.resourceId === entry.surface.experimentId,
  );
  const experimentLabel = experiment?.spec.name?.trim() || copy.unavailable;
  const targetLabel = entry.surface.kind === 'experiment-panel'
    ? panelTitle || copy.unavailable
    : entry.surface.robotIds.map((robotId) => robotTargetLabel(
      experiment?.spec.robots.find((binding) => binding.id === robotId),
      robotId,
      assetName,
      copy.unavailable,
    )).join(' · ');
  const portLabel = entry.status === 'running'
    ? entry.requestedPort > 0
      ? `${copy.portSpecified} · ${entry.boundPort}`
      : `${copy.portAuto} · ${entry.boundPort}`
    : entry.requestedPort > 0
      ? `${copy.portSpecified} ${entry.requestedPort}`
      : copy.portAuto;

  return (
    <Panel
      bodyLayout="column"
      fill
      className="access-entry-detail"
      data-xgc-role="access-entry-detail"
      data-xgc-id={entry.id}
    >
      <div className="access-entry-detail-body">
        <div className="access-entry-detail-header">
          <ControlButton
            className="access-entry-back"
            aria-label={copy.back}
            iconOnly
            onClick={onBack}
            dataXgcRole="access-entry-back"
            dataXgcId="access-entry-back"
          >
            <ArrowLeft size={15} aria-hidden="true" />
          </ControlButton>
          <strong>{entry.name}</strong>
          <StatusText status={entryStatusTone(entry.status)} data-xgc-level={entry.status}>
            {copy.status[entry.status]}
          </StatusText>
        </div>
        <div className="access-entry-actions">
          {canStop ? (
            <ControlButton
              disabled={busy}
              onClick={onStop}
              dataXgcRole="access-entry-stop"
              dataXgcId={entry.id}
            >
              <Square size={13} aria-hidden="true" /> {copy.actions.stop}
            </ControlButton>
          ) : null}
          {canStart ? (
            <ControlButton
              disabled={busy}
              onClick={onStart}
              dataXgcRole="access-entry-start"
              dataXgcId={entry.id}
            >
              <Play size={13} aria-hidden="true" /> {copy.actions.start}
            </ControlButton>
          ) : null}
          {canRotate ? (
            <ControlButton
              disabled={busy}
              onClick={onRotate}
              dataXgcRole="access-entry-rotate"
              dataXgcId={entry.id}
            >
              <Link2 size={13} aria-hidden="true" /> {copy.actions.rotate}
            </ControlButton>
          ) : null}
          {canRevoke ? (
            <ControlButton
              tone="danger"
              disabled={busy}
              title={arming ? copy.actions.revokeConfirmTitle : undefined}
              onClick={() => (arming ? onRevoke() : setArming(true))}
              dataXgcRole="access-entry-revoke"
              dataXgcId={entry.id}
            >
              <Trash2 size={13} aria-hidden="true" /> {arming ? copy.actions.revokeConfirm : copy.actions.revoke}
            </ControlButton>
          ) : null}
        </div>
        {entry.error ? <Notice density="compact" tone="danger">{copy.entryError}</Notice> : null}
        {actionError ? <Notice density="compact" tone="danger">{copy.feedback[actionError]}</Notice> : null}
        {blocked ? (
          <Notice density="compact" tone="warning">{copy.blockedNotice}</Notice>
        ) : null}
        {entry.status === 'running' ? (
          <section
            className="access-entry-section"
            data-xgc-role="access-entry-link"
            data-xgc-id={entry.id}
          >
            <span className="access-entry-section-title">{copy.sections.link}</span>
            {issued ? (
              <AccessEntryLinkSection issued={issued} copy={copy} />
            ) : (
              <div className="access-sharing-muted">{copy.linkPending}</div>
            )}
          </section>
        ) : null}
        <section className="access-entry-section">
          <span className="access-entry-section-title">{copy.sections.permissions}</span>
          <ul className="access-entry-permissions">
            {KNOWN_ACTIONS.filter((action) => entry.actions.includes(action)).map((action) => (
              <li key={action}>{copy.actionLabels[action as KnownAction]}</li>
            ))}
          </ul>
          {blocked ? (
            <div className="access-sharing-muted">{copy.unknownPermissions}</div>
          ) : null}
        </section>
        <section className="access-entry-section">
          <span className="access-entry-section-title">{copy.sections.target}</span>
          <dl className="access-entry-facts">
            <div><dt>{copy.facts.kind}</dt><dd>{copy.kind[kind]}</dd></div>
            <div><dt>{copy.facts.experiment}</dt><dd>{experimentLabel}</dd></div>
            <div><dt>{copy.facts.target}</dt><dd>{targetLabel}</dd></div>
            <div><dt>{copy.facts.expires}</dt><dd>{formatTime(entry.expiresAt)}</dd></div>
            <div><dt>{copy.facts.port}</dt><dd>{portLabel}</dd></div>
          </dl>
        </section>
        {entry.status === 'running' ? <AccessEntryVisitors entryId={entry.id} busy={busy} copy={copy} /> : null}
      </div>
    </Panel>
  );
}

function AccessEntryVisitors({
  entryId, busy, copy,
}: {
  entryId: string;
  busy: boolean;
  copy: AccessSharingCopy;
}) {
  const { participants, failed, remove } = useAccessEntryParticipants(entryId);

  return (
    <section className="access-entry-section" data-xgc-role="access-entry-visitors" data-xgc-id={entryId}>
      <span className="access-entry-section-title">{copy.sections.visitors}</span>
      {failed ? <div className="access-sharing-muted">{copy.feedback.action}</div> : null}
      {participants === null ? null : participants.length === 0 ? (
        <div className="access-sharing-muted">{copy.noVisitors}</div>
      ) : (
        <ul className="access-entry-visitors">
          {participants.map((participant, index) => (
            <li key={participant.id} data-xgc-role="access-entry-visitor" data-xgc-id={participant.id}>
              <span>{copy.visitor(index + 1)}</span>
              <span className="access-sharing-muted">
                {participant.holdingControl ? copy.visitorControl : copy.visitorWatching}
              </span>
              <ControlButton
                tone="danger"
                disabled={busy}
                onClick={() => remove(participant.id)}
                dataXgcRole="access-entry-remove-visitor"
                dataXgcId={participant.id}
              >
                {copy.removeVisitor}
              </ControlButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccessEntryLinkSection({ issued, copy }: { issued: AccessEntryIssued; copy: AccessSharingCopy }) {
  const candidates = useMemo(() => accessEntryLinkCandidates(issued.entry), [issued.entry]);
  const [host, setHost] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const preferred = candidates.find((candidate) => candidate.isPrivateIPv4 && !candidate.isLoopback)
      ?? candidates[0];
    setHost(preferred?.host ?? '');
    setCopied(false);
  }, [candidates, issued.bootstrapToken]);

  const bootstrapExpired = Date.parse(issued.bootstrapExpiresAt) <= Date.now();
  const candidate = candidates.find((item) => item.host === host);
  const link = candidate
    ? buildAccessEntryLink(candidate, issued.entry.boundPort, issued.bootstrapToken)
    : '';
  const copyLink = useCallback(async () => {
    if (Date.parse(issued.bootstrapExpiresAt) <= Date.now()) return;
    if (link && await copyTextToClipboard(link)) {
      setCopied(true);
    }
  }, [issued.bootstrapExpiresAt, link]);

  if (bootstrapExpired) {
    return <div className="access-sharing-muted">{copy.linkExpired}</div>;
  }

  return (
    <div className="access-entry-link">
      {candidates.length === 0 ? (
        <Notice density="compact" tone="danger">{copy.link.noCandidates}</Notice>
      ) : (
        <>
          <FormField label={copy.link.host}>
            <SelectControl
              size="compact"
              value={host}
              options={candidates.map((item) => ({
                value: item.host,
                label: item.isPrivateIPv4 && !item.isLoopback
                  ? `${item.host} (${copy.link.lan})`
                  : item.isLoopback
                    ? `${item.host} (${copy.link.local})`
                    : item.host,
              }))}
              onChange={setHost}
              ariaLabel={copy.link.host}
              dataXgcRole="access-entry-link-host"
              dataXgcId={issued.entry.id}
            />
          </FormField>
          <div className="access-entry-link-preview">
            <code data-xgc-role="access-entry-link-url" data-xgc-id={issued.entry.id}>{link}</code>
            <ControlButton
              disabled={!link}
              onClick={() => void copyLink()}
              dataXgcRole="access-entry-link-copy"
              dataXgcId={issued.entry.id}
            >
              <Copy size={13} aria-hidden="true" /> {copy.link.copy}
            </ControlButton>
            <span className="access-entry-link-copied" data-visible={copied} aria-live="polite">
              {copy.link.copied}
            </span>
          </div>
          <div className="access-sharing-muted">
            {copy.link.tokenNote(formatTime(issued.bootstrapExpiresAt))}
          </div>
        </>
      )}
    </div>
  );
}

function CreateShareDrawer({
  experiments,
  experimentsReady,
  experimentsFailed,
  onRetryExperiments,
  busy,
  createError,
  copy,
  onDismiss,
  onCreated,
  onCreate,
}: {
  experiments: ExperimentDocument[];
  experimentsReady: boolean;
  experimentsFailed: boolean;
  onRetryExperiments: () => void;
  busy: boolean;
  createError: AccessEntriesFailure;
  copy: AccessSharingCopy;
  onDismiss: () => void;
  onCreated: (issued: AccessEntryIssued) => void;
  onCreate: (body: CreateAccessEntryBody) => Promise<AccessEntryIssued | undefined>;
}) {
  const [experimentId, setExperimentId] = useState(experiments[0]?.head.resourceId ?? '');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [moduleId, setModuleId] = useState('');
  const [resourceKey, setResourceKey] = useState('');
  const [actionSelection, setActionSelection] = useState<{ resource: AccessCatalogResource; checked: string[] }>();
  const [name, setName] = useState('');
  const [durationHours, setDurationHours] = useState('2');
  const [portMode, setPortMode] = useState<'auto' | 'fixed'>('auto');
  const [port, setPort] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!experimentId && experiments.length > 0) {
      setExperimentId(experiments[0]!.head.resourceId);
    }
  }, [experiments, experimentId]);

  const { catalog, catalogFor, sessionMissing } = useAccessCatalog(experimentId, catalogRetry);
  useEffect(() => {
    setModuleId('');
    setResourceKey('');
  }, [experimentId, catalogRetry]);

  const catalogDocument = catalog.state === 'ready' && catalogFor === experimentId
    ? catalog.document
    : null;
  const modules = useMemo(() => catalogDocument?.modules ?? [], [catalogDocument]);
  const currentModule = useMemo(() => (
    modules.find((module) => module.moduleId === moduleId) ?? modules[0] ?? null
  ), [modules, moduleId]);
  const availableResources = useMemo(() => (
    (currentModule?.resources ?? []).filter((resource) => resource.available)
  ), [currentModule]);
  const currentResource = useMemo(() => (
    resourceKey
      ? availableResources[Number(resourceKey)] ?? null
      : availableResources[0] ?? null
  ), [availableResources, resourceKey]);
  const unavailableResources = useMemo(() => (
    (currentModule?.resources ?? []).filter((resource) => !resource.available)
  ), [currentModule]);
  const requiredActions = useMemo(() => (
    (currentResource?.actions ?? []).filter((action) => action.required)
  ), [currentResource]);
  const requiredUnavailable = useMemo(() => (
    requiredActions.filter((action) => !action.available)
  ), [requiredActions]);
  const optionalActions = useMemo(() => (
    (currentResource?.actions ?? []).filter((action) => !action.required && action.available)
  ), [currentResource]);

  // Defaults and visible choices belong to the same catalog snapshot, including
  // its first render. A later effect must not briefly expose unchecked defaults.
  const checkedActions = actionSelection?.resource === currentResource
    ? actionSelection.checked
    : optionalActions.map((action) => action.id);

  const toggleValue = (list: string[], value: string) => (
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  );

  const catalogCurrent = catalog.state !== 'loading' && catalogFor === experimentId;
  const canSubmit = experimentsReady && !experimentsFailed && !busy && catalogCurrent
    && catalogDocument !== null && currentModule !== null && currentResource !== null
    && requiredUnavailable.length === 0;

  const submit = async () => {
    setFormError('');
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError(copy.errors.nameRequired);
    if (!experimentId) return setFormError(copy.errors.experimentRequired);
    if (!catalogDocument || !currentModule || !currentResource) {
      return setFormError(copy.errors.resourceRequired);
    }
    if (requiredUnavailable.length > 0) return setFormError(copy.actionsUnavailable);
    let portNumber = 0;
    if (portMode === 'fixed') {
      const parsed = Number(port.trim());
      if (!/^\d{1,5}$/.test(port.trim()) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return setFormError(copy.errors.portInvalid);
      }
      portNumber = parsed;
    }
    const actionIds = [
      ...requiredActions.map((action) => action.id),
      ...checkedActions.filter((id) => !requiredActions.some((action) => action.id === id)),
    ];
    if (!actionIds.includes(ACCESS_ACTION_SURFACE_READ)) actionIds.unshift(ACCESS_ACTION_SURFACE_READ);
    const expiresAt = new Date(Date.now() + Number(durationHours) * 3_600_000).toISOString();
    const issued = await onCreate({
      name: trimmedName,
      listenHost: '0.0.0.0',
      port: portNumber,
      expiresAt,
      moduleId: currentModule.moduleId,
      actions: actionIds,
      surface: currentResource.surface,
    });
    if (issued) onCreated(issued);
    return undefined;
  };

  return (
    <ConfigDrawer
      title={copy.createTitle}
      onClose={onDismiss}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      bodyClassName="access-sharing-form"
      dataXgcRole="access-entry-create-drawer"
      dataXgcId="access-entry-create-drawer"
      actions={(
        <>
          <ControlButton
            size="compact"
            tone="primary"
            disabled={!canSubmit}
            onClick={() => void submit()}
            dataXgcRole="access-entry-create-submit"
            dataXgcId="access-entry-create-submit"
          >
            {copy.create}
          </ControlButton>
          <ConfigDrawerDismissButton size="compact" disabled={busy}>{copy.cancel}</ConfigDrawerDismissButton>
        </>
      )}
    >
      {formError ? <Notice density="compact" tone="danger">{formError}</Notice> : null}
      {createError ? <Notice density="compact" tone="danger">{copy.feedback[createError]}</Notice> : null}
      {experimentsFailed ? (
        <Notice
          density="compact"
          tone="danger"
          actions={<ControlButton size="compact" onClick={onRetryExperiments}
            dataXgcRole="access-share-experiments-retry" dataXgcId="access-share-experiments-retry">{copy.retry}</ControlButton>}
        >
          {copy.experimentsLoadFailed}
        </Notice>
      ) : null}
      {!experimentsFailed && experimentsReady && experiments.length === 0 ? (
        <Notice density="compact" tone="warning">{copy.noExperiments}</Notice>
      ) : null}
      <FormField label={copy.fields.experiment}>
        <SelectControl
          size="compact"
          value={experimentId}
          options={experiments.map((document) => ({
            value: document.head.resourceId,
            label: document.spec.name || copy.unavailable,
          }))}
          onChange={setExperimentId}
          ariaLabel={copy.fields.experiment}
          dataXgcRole="access-share-experiment"
          dataXgcId="access-share-experiment"
        />
      </FormField>
      {sessionMissing ? (
        <Notice
          density="compact"
          tone="warning"
          actions={(
            <ControlButton size="compact" onClick={() => setCatalogRetry((current) => current + 1)}
              dataXgcRole="access-share-catalog-retry" dataXgcId={experimentId}>
              {copy.retry}
            </ControlButton>
          )}
        >
          {copy.experimentNotReady}
        </Notice>
      ) : null}
      {!sessionMissing && catalog.state === 'failed' && catalogFor === experimentId ? (
        <Notice
          density="compact"
          tone="danger"
          actions={(
            <ControlButton size="compact" onClick={() => setCatalogRetry((current) => current + 1)}
              dataXgcRole="access-share-catalog-retry" dataXgcId={experimentId}>
              {copy.retry}
            </ControlButton>
          )}
        >
          {copy.catalogLoadFailed}
        </Notice>
      ) : null}
      {catalogDocument && modules.length === 0 ? (
        <Notice density="compact" tone="warning">{copy.noFunctions}</Notice>
      ) : null}
      {catalogDocument && currentModule ? (
        <FormField label={copy.fields.module}>
          <SelectControl
            size="compact"
            value={currentModule.moduleId}
            options={modules.map((module) => ({
              value: module.moduleId,
              label: module.title.trim() || copy.unavailable,
            }))}
            onChange={(value) => {
              setModuleId(value);
              setResourceKey('');
              setActionSelection(undefined);
            }}
            ariaLabel={copy.fields.module}
            dataXgcRole="access-share-module"
            dataXgcId="access-share-module"
          />
        </FormField>
      ) : null}
      {catalogDocument && currentModule && availableResources.length > 0 ? (
        <FormField label={copy.fields.resource}>
          <SelectControl
            size="compact"
            value={resourceKey || '0'}
            options={availableResources.map((resource, index) => ({
              value: String(index),
              label: resource.title.trim() || copy.unavailable,
            }))}
            onChange={(value) => {
              setResourceKey(value);
              setActionSelection(undefined);
            }}
            ariaLabel={copy.fields.resource}
            dataXgcRole="access-share-resource"
            dataXgcId="access-share-resource"
          />
        </FormField>
      ) : null}
      {catalogDocument && currentModule && availableResources.length === 0 ? (
        <Notice density="compact" tone="warning">{copy.noResources}</Notice>
      ) : null}
      {unavailableResources.map((resource) => (
        <div key={resource.title} className="access-sharing-muted">
          {copy.resourceUnavailable(resource.title.trim() || copy.unavailable, resource.reason?.trim() || copy.unavailable)}
        </div>
      ))}
      {requiredUnavailable.length > 0 ? (
        <Notice density="compact" tone="warning">{copy.actionsUnavailable}</Notice>
      ) : null}
      {currentResource && requiredUnavailable.length === 0 ? (
        <FormField label={copy.fields.actions}>
          <div
            className="access-sharing-checkboxes"
            data-xgc-role="access-share-actions"
            data-xgc-id="access-share-actions"
          >
            {requiredActions.map((action) => (
              <div key={action.id} className="access-sharing-muted">
                {copy.requiredAction(action.label.trim() || copy.unavailable)}
              </div>
            ))}
            {optionalActions.map((action) => (
              <Checkbox
                key={action.id}
                checked={checkedActions.includes(action.id)}
                label={action.label.trim() || copy.unavailable}
                aria-label={action.label.trim() || copy.unavailable}
                onCheckedChange={() => {
                  if (currentResource) setActionSelection({ resource: currentResource, checked: toggleValue(checkedActions, action.id) });
                }}
              />
            ))}
          </div>
        </FormField>
      ) : null}
      <FormField label={copy.fields.name} htmlFor="access-share-name">
        <InputControl
          id="access-share-name"
          value={name}
          onChange={setName}
          aria-label={copy.fields.name}
          placeholder={copy.fields.namePlaceholder}
        />
      </FormField>
      <FormField label={copy.fields.duration}>
        <SelectControl
          size="compact"
          value={durationHours}
          options={DURATION_HOUR_OPTIONS.map((hours) => ({
            value: hours,
            label: copy.durationLabel(hours),
          }))}
          onChange={setDurationHours}
          ariaLabel={copy.fields.duration}
          dataXgcRole="access-share-duration"
          dataXgcId="access-share-duration"
        />
      </FormField>
      <FormField label={copy.fields.port}>
        <SegmentedControl
          ariaLabel={copy.fields.port}
          dataXgcRole="access-share-port-mode"
          dataXgcId="access-share-port-mode"
          options={[
            { value: 'auto', label: copy.portAuto },
            { value: 'fixed', label: copy.portSpecified },
          ]}
          value={portMode}
          onChange={(value) => setPortMode(value === 'fixed' ? 'fixed' : 'auto')}
        />
      </FormField>
      {portMode === 'fixed' ? (
        <FormField label={copy.fields.portNumber} htmlFor="access-share-port">
          <InputControl
            id="access-share-port"
            value={port}
            onChange={setPort}
            aria-label={copy.fields.portNumber}
            placeholder={copy.fields.portPlaceholder}
          />
        </FormField>
      ) : null}
    </ConfigDrawer>
  );
}

type KnownAction =
  | typeof ACCESS_ACTION_SURFACE_READ
  | typeof ACCESS_ACTION_CAMERA_LIVE
  | typeof ACCESS_ACTION_CAMERA_SNAPSHOT
  | typeof ACCESS_ACTION_REMOTE_MOTION
  | typeof ACCESS_ACTION_CALIBRATION_STATE_READ
  | typeof ACCESS_ACTION_CALIBRATION_IMAGE_READ;

function compareShareEntries(left: AccessEntry, right: AccessEntry, sortMode: ShareSortMode): number {
  if (sortMode === 'name-asc') return left.name.localeCompare(right.name);
  const leftExpires = Date.parse(left.expiresAt);
  const rightExpires = Date.parse(right.expiresAt);
  const delta = (Number.isNaN(leftExpires) ? 0 : leftExpires) - (Number.isNaN(rightExpires) ? 0 : rightExpires);
  if (delta !== 0) return sortMode === 'expires-asc' ? delta : -delta;
  return left.name.localeCompare(right.name);
}

function experimentDisplayName(
  experiments: ExperimentDocument[] | null,
  experimentId: string,
): string {
  const match = (experiments ?? []).find((document) => document.head.resourceId === experimentId);
  return match?.spec.name?.trim() ?? '';
}

/**
 * Human robot identity: the logical role (UAV-01 / UGV-02) plus the assigned
 * asset name. Falls back to the caller's unavailable label — never to a raw
 * slot id — when neither resolves.
 */
function robotTargetLabel(
  binding: Pick<ExperimentRobotBinding, 'id' | 'ref'> | undefined,
  robotId: string,
  assetName: (resourceId: string) => string,
  unavailable: string,
): string {
  if (!binding) return unavailable;
  const role = experimentRobotRoleLabel({ id: binding.id });
  const asset = assetName(binding.ref.resourceId);
  if (role !== robotId) return asset ? `${role} — ${asset}` : role;
  return asset || unavailable;
}

function entryStatusTone(status: AccessEntryStatus): 'info' | 'warning' | 'failed' {
  if (status === 'failed') return 'failed';
  if (status === 'revoked' || status === 'expired') return 'warning';
  return 'info';
}

function formatTime(value: string): string {
  return formatOperatorDateTime(value);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Non-secure LAN origins fall back to the hidden-textarea path below.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

type AccessSharingCopy = {
  listTitle: string;
  search: string;
  allFunctions: string;
  filterByFunction: string;
  sort: string;
  sortName: string;
  sortExpiresSoon: string;
  sortExpiresLast: string;
  noMatches: string;
  noMatchesDescription: string;
  refresh: string;
  retry: string;
  create: string;
  createTitle: string;
  cancel: string;
  back: string;
  empty: string;
  emptyDescription: string;
  unavailable: string;
  portAuto: string;
  portSpecified: string;
  blockedNotice: string;
  unknownPermissions: string;
  noVisitors: string;
  visitor: (ordinal: number) => string;
  visitorControl: string;
  visitorWatching: string;
  removeVisitor: string;
  linkPending: string;
  linkExpired: string;
  entryError: string;
  noExperiments: string;
  experimentsLoadFailed: string;
  catalogLoadFailed: string;
  experimentNotReady: string;
  noFunctions: string;
  noResources: string;
  actionsUnavailable: string;
  resourceUnavailable: (title: string, reason: string) => string;
  requiredAction: (label: string) => string;
  kind: Record<'camera' | 'remote' | 'calibration', string>;
  status: Record<AccessEntryStatus, string>;
  actionLabels: Record<KnownAction, string>;
  sections: { link: string; permissions: string; target: string; visitors: string };
  feedback: Record<'load' | 'action' | 'create', string>;
  fields: {
    experiment: string;
    module: string;
    resource: string;
    actions: string;
    name: string;
    namePlaceholder: string;
    duration: string;
    port: string;
    portNumber: string;
    portPlaceholder: string;
  };
  facts: {
    kind: string;
    experiment: string;
    target: string;
    expires: string;
    port: string;
  };
  actions: {
    start: string;
    stop: string;
    rotate: string;
    revoke: string;
    revokeConfirm: string;
    revokeConfirmTitle: string;
  };
  link: {
    host: string;
    lan: string;
    copy: string;
    copied: string;
    noCandidates: string;
    local: string;
    tokenNote: (expires: string) => string;
  };
  durationLabel: (hours: string) => string;
  errors: {
    nameRequired: string;
    experimentRequired: string;
    resourceRequired: string;
    portInvalid: string;
  };
};

const accessSharingCopy: Record<AppLanguage, AccessSharingCopy> = {
  'en-US': {
    listTitle: 'Share entries',
    search: 'Search shares',
    allFunctions: 'All functions',
    filterByFunction: 'Filter shares by function',
    sort: 'Sort shares',
    sortName: 'Name A-Z',
    sortExpiresSoon: 'Expiring soon',
    sortExpiresLast: 'Expiring last',
    noMatches: 'No matching shares.',
    noMatchesDescription: 'Change the search or the function filter.',
    refresh: 'Refresh',
    retry: 'Retry',
    create: 'New share',
    createTitle: 'New share',
    cancel: 'Cancel',
    back: 'Back to the list',
    empty: 'Nothing shared yet.',
    emptyDescription: 'Create a share to send one function of a running experiment to people on this network.',
    unavailable: 'Unavailable',
    portAuto: 'Automatic',
    portSpecified: 'Specified port',
    blockedNotice: 'This share grants permissions this version cannot describe. Starting it and generating links are disabled so no unexplained access is handed out; you can still stop or revoke it.',
    unknownPermissions: 'This share also grants permissions this version does not recognize; they are kept unchanged.',
    noVisitors: 'Nobody has opened this link yet.',
    visitor: (ordinal) => `Visitor ${ordinal}`,
    visitorControl: 'Controlling',
    visitorWatching: 'Viewing',
    removeVisitor: 'Remove',
    linkPending: 'The access link appears once when the share is created, started, or a new link is generated. Use "Generate new link" above when you need one.',
    linkExpired: 'This link credential has expired. Use "Generate new link" above to hand out a fresh access link.',
    entryError: 'The station reported that the last action on this share failed. Retry, or revoke and create it again.',
    noExperiments: 'No experiments are available yet. Create an experiment first.',
    experimentsLoadFailed: 'Could not load the experiment list.',
    catalogLoadFailed: 'Could not load the shareable functions for this experiment.',
    experimentNotReady: 'The experiment is not ready yet. Retry in a moment.',
    noFunctions: 'This experiment currently has no supported function that can be shared.',
    noResources: 'This experiment currently has no supported resource that can be shared.',
    actionsUnavailable: 'A required permission of this resource is not available right now; it cannot be shared.',
    resourceUnavailable: (title, reason) => `${title} is unavailable right now: ${reason}.`,
    requiredAction: (label) => `${label} (always included)`,
    kind: { camera: 'Camera view', remote: 'Robot remote', calibration: 'Calibration (read-only)' },
    status: {
      running: 'Running',
      stopped: 'Stopped',
      revoked: 'Revoked',
      expired: 'Expired',
      failed: 'Failed',
    },
    actionLabels: {
      [ACCESS_ACTION_SURFACE_READ]: 'Open the shared page and see its status (always included)',
      [ACCESS_ACTION_CAMERA_LIVE]: 'Watch the live view',
      [ACCESS_ACTION_CAMERA_SNAPSHOT]: 'Capture the current image',
      [ACCESS_ACTION_REMOTE_MOTION]: 'Drive the selected robots',
      [ACCESS_ACTION_CALIBRATION_STATE_READ]: 'View the calibration state',
      [ACCESS_ACTION_CALIBRATION_IMAGE_READ]: 'View the calibration image',
    },
    sections: {
      link: 'Access link',
      permissions: 'What recipients can do',
      target: 'Target and validity',
      visitors: 'Current visitors',
    },
    feedback: {
      load: 'Could not load the share entries. Retry in a moment.',
      action: 'The action did not complete. Check the share state and retry.',
      create: 'The share could not be created. Review the fields and retry.',
    },
    fields: {
      experiment: 'Experiment',
      module: 'Function',
      resource: 'Resource',
      actions: 'What recipients can do',
      name: 'Name',
      namePlaceholder: 'Name this share',
      duration: 'Valid for',
      port: 'Port',
      portNumber: 'Port number',
      portPlaceholder: '1–65535',
    },
    facts: {
      kind: 'Function',
      experiment: 'Experiment',
      target: 'Target',
      expires: 'Valid until',
      port: 'Port',
    },
    actions: {
      start: 'Start',
      stop: 'Stop',
      rotate: 'Generate new link',
      revoke: 'Revoke',
      revokeConfirm: 'Confirm revoke',
      revokeConfirmTitle: 'Revoking permanently closes this share; its links stop working immediately.',
    },
    link: {
      host: 'Address for the recipient',
      lan: 'local network',
      copy: 'Copy link',
      copied: 'Copied',
      noCandidates: 'No address on this network is available for recipients right now. Connect the station to the local network and start the share again.',
      local: 'this station only',
      tokenNote: (expires) => `The link credential works once; open it before ${expires}. Browsers that already opened it stay connected until you stop or revoke the share, or it expires.`,
    },
    durationLabel: (hours) => `${hours} hours`,
    errors: {
      nameRequired: 'Enter a name.',
      experimentRequired: 'Select an experiment.',
      resourceRequired: 'Select a function and a resource.',
      portInvalid: 'The port must be a whole number between 1 and 65535.',
    },
  },
  'zh-CN': {
    listTitle: '分享入口',
    search: '搜索分享',
    allFunctions: '全部功能',
    filterByFunction: '按功能筛选分享',
    sort: '排序分享',
    sortName: '名称 A-Z',
    sortExpiresSoon: '即将到期',
    sortExpiresLast: '最晚到期',
    noMatches: '没有匹配的分享。',
    noMatchesDescription: '调整搜索或功能筛选。',
    refresh: '刷新',
    retry: '重试',
    create: '新建分享',
    createTitle: '新建分享',
    cancel: '取消',
    back: '返回列表',
    empty: '还没有分享。',
    emptyDescription: '新建一个分享，把正在运行的实验的某个功能发给同一网络里的协作者。',
    unavailable: '不可用',
    portAuto: '自动分配',
    portSpecified: '指定端口',
    blockedNotice: '此分享包含本版本无法说明的权限。为避免继续分发说不清的权限，已禁止启动和生成新链接；仍可停止或撤销。',
    unknownPermissions: '此分享还包含本版本无法识别的权限，已按原样保留。',
    noVisitors: '还没有人打开这个链接。',
    visitor: (ordinal) => `访问者 ${ordinal}`,
    visitorControl: '正在控制',
    visitorWatching: '正在查看',
    removeVisitor: '撤回',
    linkPending: '访问链接只在创建、启动或生成新链接时出现一次。需要新链接时点上方「生成新链接」。',
    linkExpired: '该链接凭据已过期。请点上方「生成新链接」获取新的访问链接。',
    entryError: '主站报告该分享最近一次操作失败。请重试，或撤销后重新创建。',
    noExperiments: '还没有可用的实验，请先创建实验。',
    experimentsLoadFailed: '无法读取实验列表。',
    catalogLoadFailed: '无法读取该实验当前可分享的功能。',
    experimentNotReady: '实验尚未就绪，请稍后重试。',
    noFunctions: '当前实验没有可分享的已支持功能。',
    noResources: '当前实验没有可分享的已支持资源。',
    actionsUnavailable: '该资源的一项必需权限当前不可用，无法分享。',
    resourceUnavailable: (title, reason) => `${title} 当前不可用：${reason}。`,
    requiredAction: (label) => `${label}（始终包含）`,
    kind: { camera: '相机画面', remote: '遥控机器人', calibration: '标定（只读）' },
    status: {
      running: '运行中',
      stopped: '已停止',
      revoked: '已撤销',
      expired: '已过期',
      failed: '失败',
    },
    actionLabels: {
      [ACCESS_ACTION_SURFACE_READ]: '打开分享页面并查看状态（始终包含）',
      [ACCESS_ACTION_CAMERA_LIVE]: '观看实时画面',
      [ACCESS_ACTION_CAMERA_SNAPSHOT]: '获取当前图片',
      [ACCESS_ACTION_REMOTE_MOTION]: '操控所选机器人运动',
      [ACCESS_ACTION_CALIBRATION_STATE_READ]: '查看标定状态',
      [ACCESS_ACTION_CALIBRATION_IMAGE_READ]: '查看标定图像',
    },
    sections: {
      link: '访问链接',
      permissions: '对方可以做什么',
      target: '目标与有效期',
      visitors: '当前访问者',
    },
    feedback: {
      load: '无法加载分享列表，请稍后重试。',
      action: '操作未完成。请检查分享状态后重试。',
      create: '分享创建失败。请检查填写内容后重试。',
    },
    fields: {
      experiment: '实验',
      module: '功能',
      resource: '资源',
      actions: '对方可以做什么',
      name: '名称',
      namePlaceholder: '为这个分享命名',
      duration: '有效期',
      port: '端口',
      portNumber: '端口号',
      portPlaceholder: '1–65535',
    },
    facts: {
      kind: '功能',
      experiment: '实验',
      target: '目标',
      expires: '有效期至',
      port: '端口',
    },
    actions: {
      start: '启动',
      stop: '停止',
      rotate: '生成新链接',
      revoke: '撤销',
      revokeConfirm: '确认撤销',
      revokeConfirmTitle: '撤销将永久关闭该分享，其链接立即失效且不可恢复。',
    },
    link: {
      host: '接收设备使用的地址',
      lan: '局域网',
      copy: '复制链接',
      copied: '已复制',
      noCandidates: '当前没有可供局域网设备使用的地址。请确认主站已连局域网，然后重新启动分享。',
      local: '仅本机',
      tokenNote: (expires) => `链接凭据一次性有效，请在 ${expires} 前打开；已打开的浏览器在停止、撤销或到期前保持可用。`,
    },
    durationLabel: (hours) => `${hours} 小时`,
    errors: {
      nameRequired: '请填写名称。',
      experimentRequired: '请选择实验。',
      resourceRequired: '请选择功能和资源。',
      portInvalid: '端口必须是 1–65535 的整数。',
    },
  },
};
