import { useMemo } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { CodeBlock,Notice,OperatorWorkspace } from '@xgc2/ui-react';
import type { ContainerTab } from './containerNavigation';
import { ComposeProjectsPanel } from './ComposeProjectsPanel';
import { ContainerImagesPanel } from './ContainerImagesPanel';
import { ContainerListPanel } from './ContainerListPanel';
import { ContainerNetworksPanel } from './ContainerNetworksPanel';
import { ContainerInspectSummary } from './ContainerInspectSummary';
import { ContainerTerminalLog } from './ContainerTerminalLog';
import { ContainerVolumesPanel } from './ContainerVolumesPanel';
import { NetworkInspectSummary } from './NetworkInspectSummary';
import { VolumeInspectSummary } from './VolumeInspectSummary';
import { useContainerComposeProjects } from './useContainerComposeProjects';
import { useContainerImages } from './useContainerImages';
import { useContainerNetworks } from './useContainerNetworks';
import { useContainerRuntime } from './useContainerRuntime';
import { useContainerVolumes } from './useContainerVolumes';
import { useDockerContainers } from './useDockerContainers';

export function ContainerPage({
  activeTab,
  targetId = 'local',
  targetCoreId,
}: {
  activeTab: ContainerTab;
  /** Execution host id for path browsing (compose workdir picker). */
  targetId?: string;
  targetCoreId?: string;
}) {
  const target = useMemo(() => targetCoreId ? { targetCoreId } : undefined,[targetCoreId]);
  const runtime = useContainerRuntime(target);
  const containers = useDockerContainers(target,runtime.refresh);
  const compose = useContainerComposeProjects(target,runtime.refresh);
  const images = useContainerImages(target,runtime.refresh);
  const networks = useContainerNetworks(target,runtime.refresh);
  const volumes = useContainerVolumes(target,runtime.refresh);
  const activeResourceError: Record<ContainerTab,string> = {
    containers: containers.error,
    compose: compose.error,
    images: images.error,
    networks: networks.error,
    volumes: volumes.error,
  };
  const visibleErrors = Array.from(new Set([runtime.error,activeResourceError[activeTab]].filter(Boolean)));

  return (
    <OperatorWorkspace
      className="xgc-workspace-full-span container-page"
      padding="none"
      data-xgc-role="container-page" data-xgc-id="container-page"
      data-xgc-tab={activeTab}
    >
      <ContainerPageNotices
        dockerAvailable={runtime.status?.dockerAvailable}
        errors={visibleErrors}
        runtimeMessage={runtime.status?.message}
      />

      {/*
        Full workspace width, left-aligned with shell topbar tabs (not a centered
        ops column). Each tab is one OpsSection filling remaining height.
      */}
      <main className="container-main" data-xgc-role="container-main" data-xgc-id="container-main">
        {activeTab === 'containers' && (
          <ContainerListPanel
            busy={containers.busy}
            containers={containers.containers}
            draft={containers.draft}
            drawerOpen={containers.drawerOpen}
            query={containers.query}
            stateFilter={containers.stateFilter}
            onCloseDrawer={() => containers.setDrawerOpen(false)}
            onCreate={() => void containers.create()}
            onDraftChange={containers.setDraft}
            onInspect={(container) => void containers.showInspect(container)}
            onLogs={(container) => void containers.showLogs(container)}
            onOpenDrawer={() => containers.setDrawerOpen(true)}
            onOperate={(container,operation,force) => void containers.operate(container,operation,force)}
            onQueryChange={containers.setQuery}
            onRefresh={() => void containers.refresh()}
            onStateFilterChange={containers.setStateFilter}
          />
        )}
        {activeTab === 'compose' && (
          <ComposeProjectsPanel
            busy={compose.busy}
            configBusy={compose.configBusy}
            draft={compose.draft}
            projects={compose.projects}
            targetId={targetId}
            onCreate={() => compose.create()}
            onDraftChange={compose.setDraft}
            onOperate={(project,operation,force) => void compose.operate(project,operation,force)}
            onShowConfig={(project) => {
              void compose.showConfig(project);
            }}
            onRefresh={() => void compose.refresh()}
          />
        )}
        {activeTab === 'images' && (
          <ContainerImagesPanel
            busy={images.busy}
            buildDraft={images.buildDraft}
            buildOpen={images.buildOpen}
            images={images.images}
            page={images.page}
            pageSize={images.pageSize}
            pullValue={images.pullValue}
            query={images.query}
            sortDir={images.sortDir}
            sortKey={images.sortKey}
            tagDraft={images.tagDraft}
            targetId={targetId}
            total={images.total}
            onBuild={() => void images.build()}
            onBuildDraftChange={images.setBuildDraft}
            onBuildOpenChange={images.setBuildOpen}
            onExport={(name) => void images.exportImage(name)}
            onImport={(file) => void images.importImage(file)}
            onInspect={(name) => void images.inspect(name)}
            onPageChange={images.setPage}
            onPageSizeChange={images.setPageSize}
            onPrune={(all) => void images.prune(all)}
            onPruneBuildCache={() => void images.pruneBuildCache()}
            onPull={() => void images.pull()}
            onPullValueChange={images.setPullValue}
            onPush={(name) => void images.push(name)}
            onQueryChange={images.setQuery}
            onRefresh={() => void images.refresh()}
            onRemove={(name) => void images.remove(name)}
            onTag={() => void images.tag()}
            onTagDraftChange={images.setTagDraft}
            onToggleSort={images.toggleSort}
          />
        )}
        {activeTab === 'networks' && (
          <ContainerNetworksPanel
            busy={networks.busy}
            draft={networks.draft}
            drawerOpen={networks.drawerOpen}
            networks={networks.networks}
            page={networks.page}
            pageSize={networks.pageSize}
            query={networks.query}
            selectedNames={networks.selectedNames}
            total={networks.total}
            parentInterfaces={networks.parentInterfaces}
            onCloseCreate={() => networks.setDrawerOpen(false)}
            onCreate={() => void networks.create()}
            onDraftChange={networks.setDraft}
            onInspect={(network) => void networks.showInspect(network)}
            onOpenCreate={networks.openCreate}
            onPageChange={networks.setPage}
            onPageSizeChange={networks.setPageSize}
            onPrune={() => void networks.prune()}
            onQueryChange={networks.setQuery}
            onRefresh={() => void networks.refresh()}
            onRemove={(names) => void networks.remove(names)}
            onToggleSelectAllVisible={networks.toggleSelectAllVisible}
            onToggleSelected={networks.toggleSelected}
          />
        )}
        {activeTab === 'volumes' && (
          <ContainerVolumesPanel
            busy={volumes.busy}
            createError={volumes.createError}
            draft={volumes.draft}
            drawerOpen={volumes.drawerOpen}
            page={volumes.page}
            pageSize={volumes.pageSize}
            query={volumes.query}
            selected={volumes.selected}
            total={volumes.total}
            volumes={volumes.volumes}
            onCloseCreate={() => {
              volumes.setDrawerOpen(false);
              volumes.setCreateError('');
            }}
            onCreate={() => void volumes.create()}
            onDraftChange={(draft) => {
              volumes.setDraft(draft);
              volumes.setCreateError('');
            }}
            onInspect={(name) => void volumes.showInspect(name)}
            onOpenCreate={() => {
              volumes.setCreateError('');
              volumes.setDrawerOpen(true);
            }}
            onPageChange={volumes.setPage}
            onPageSizeChange={volumes.setPageSize}
            onPrune={() => void volumes.prune()}
            onQueryChange={volumes.setQuery}
            onRefresh={() => void volumes.refresh()}
            onRemove={(name) => void volumes.remove(name)}
            onRemoveSelected={() => void volumes.removeSelected()}
            onToggleSelectAll={volumes.toggleSelectAllVisible}
            onToggleSelected={volumes.toggleSelected}
          />
        )}
      </main>

      {activeTab === 'containers' && containers.output && (
        <ContainerOutputDrawer
          content={containers.output}
          kind={containers.detailKind ?? 'output'}
          title={containers.selectedContainer?.names || containers.selectedContainer?.name || 'Docker output'}
          onClose={containers.closeDetail}
        />
      )}
      {activeTab === 'compose' && compose.output && (
        <ContainerOutputDrawer content={compose.output} kind="output" title="Docker output" onClose={compose.closeOutput} />
      )}
      {activeTab === 'compose' && compose.configView && (
        <ContainerOutputDrawer
          content={compose.configView.content}
          kind="yaml"
          path={compose.configView.path}
          title={compose.configView.title}
          onClose={compose.closeConfig}
        />
      )}
      {activeTab === 'images' && images.output && (
        <ContainerOutputDrawer content={images.output} kind="output" title="Docker output" onClose={images.closeOutput} />
      )}
      {activeTab === 'images' && images.inspectContent && (
        <ContainerOutputDrawer
          content={images.inspectContent}
          kind="inspect"
          title={images.inspectTitle || 'Image'}
          onClose={images.closeInspect}
        />
      )}
      {activeTab === 'networks' && networks.output && (
        <ContainerOutputDrawer content={networks.output} kind="output" title="Docker output" onClose={networks.closeOutput} />
      )}
      {activeTab === 'networks' && networks.inspectContent && (
        <ConfigDrawer
          ariaLabel={`Network details: ${networks.inspectName || 'network'}`}
          bodyClassName="container-detail-inspect"
          className="config-drawer-extra-wide container-output-drawer"
          closeOnBackdrop
          dataXgcRole="container-network-detail-drawer"
          dataXgcId={networks.inspectName || 'network'}
          title={networks.inspectName || 'Network'}
          onClose={networks.closeInspect}
        >
          <NetworkInspectSummary
            busy={networks.busy}
            containerOptions={networks.containerOptions}
            content={networks.inspectContent}
            onConnect={(draft) => void networks.connect(draft)}
            onDisconnect={(container) => void networks.disconnect(container)}
          />
        </ConfigDrawer>
      )}
      {activeTab === 'volumes' && volumes.output && (
        <ContainerOutputDrawer content={volumes.output} kind="output" title="Docker output" onClose={volumes.closeOutput} />
      )}
      {activeTab === 'volumes' && volumes.inspectContent && (
        <ConfigDrawer
          ariaLabel={`Volume details: ${volumes.inspectName || 'volume'}`}
          bodyClassName="container-detail-inspect"
          className="config-drawer-extra-wide container-output-drawer"
          closeOnBackdrop
          dataXgcRole="container-volume-detail-drawer"
          dataXgcId={volumes.inspectName || 'volume'}
          title={volumes.inspectName || 'Volume'}
          onClose={volumes.closeInspect}
        >
          <VolumeInspectSummary content={volumes.inspectContent} />
        </ConfigDrawer>
      )}
      {volumes.confirmationDialog}
      {containers.confirmationDialog}
      {networks.confirmationDialog}
      {images.confirmationDialog}
    </OperatorWorkspace>
  );
}

/** Wide right drawer for Logs / Inspect / command output / compose YAML. */
function ContainerOutputDrawer({
  content,
  kind,
  path,
  title,
  onClose,
}: {
  content: string;
  kind: 'logs' | 'inspect' | 'output' | 'yaml';
  path?: string;
  title: string;
  onClose: () => void;
}) {
  // Title only (container name) — no muted subtitle under the header; matches
  // other right drawers that lead with a single strong title line.
  const ariaKind = kind === 'logs'
    ? 'Logs'
    : kind === 'inspect'
      ? 'Details'
      : kind === 'yaml'
        ? 'Compose YAML'
        : 'Output';
  return (
    <ConfigDrawer
      ariaLabel={`${ariaKind}: ${title}`}
      bodyClassName={
        kind === 'inspect'
          ? 'container-detail-inspect'
          : kind === 'yaml'
            ? 'container-detail-yaml'
            : 'container-detail-output'
      }
      className="config-drawer-extra-wide container-output-drawer"
      closeOnBackdrop
      dataXgcRole="container-detail-drawer"
      dataXgcId={kind}
      title={title}
      onClose={onClose}
    >
      {kind === 'inspect' ? (
        <ContainerInspectSummary content={content} />
      ) : kind === 'yaml' ? (
        <div className="container-yaml-view" data-xgc-role="container-compose-yaml" data-xgc-id="container-compose-yaml">
          {path ? <div className="container-yaml-path" data-xgc-role="container-compose-yaml-path" data-xgc-id={path}>{path}</div> : null}
          <CodeBlock className="container-yaml-pre" content={content} copyable={false} />
        </div>
      ) : (
        /* Terminal surface (xterm, read-only) for logs / command output. */
        <ContainerTerminalLog content={content} />
      )}
    </ConfigDrawer>
  );
}

function ContainerPageNotices({
  errors,
  dockerAvailable,
  runtimeMessage,
}: {
  errors: string[];
  dockerAvailable?: boolean;
  runtimeMessage?: string;
}) {
  if (errors.length === 0 && dockerAvailable !== false) return null;
  return (
    <div className="container-runtime-notices" data-xgc-role="container-runtime-notices" data-xgc-id="container-runtime-notices">
      {errors.map((error) => <Notice density="compact" key={error} tone="danger">{error}</Notice>)}
      {dockerAvailable === false && (
        <Notice density="compact" tone="danger">
          {runtimeMessage || 'Docker runtime unavailable.'}
        </Notice>
      )}
    </div>
  );
}
