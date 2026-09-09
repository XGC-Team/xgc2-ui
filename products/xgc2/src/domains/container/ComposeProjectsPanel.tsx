import { useMemo,useState } from 'react';
import { ArrowDownToLine,FileCode,Play,RotateCcw,Search,Square,Trash2 } from 'lucide-react';
import { Input,Panel,SortableDataTable,Toolbar } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import type { ContainerComposeOperation,DockerComposeProject } from './containerModel';
import { ComposeCreateDrawer } from './ComposeCreateDrawer';
import { ContainerStatusText } from './ContainerStatusText';
import {
  composeProjectIsRunning,
  filterComposeProjects,
  type ComposeDraft,
} from './containerViewModel';

export function ComposeProjectsPanel({
  projects,
  draft,
  busy,
  configBusy = false,
  targetId = 'local',
  onDraftChange,
  onCreate,
  onOperate,
  onShowConfig,
  onRefresh,
}: {
  projects: DockerComposeProject[];
  draft: ComposeDraft;
  busy: boolean;
  /** YAML fetch in flight — does not block other compose row actions. */
  configBusy?: boolean;
  targetId?: string;
  onDraftChange: (draft: ComposeDraft) => void;
  onCreate: () => void | Promise<boolean | void>;
  onOperate: (project: DockerComposeProject,operation: ContainerComposeOperation,force?: boolean) => void;
  onShowConfig: (project: DockerComposeProject) => void;
  onRefresh?: () => void;
}) {
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [query,setQuery] = useState('');
  const filteredProjects = useMemo(() => filterComposeProjects(projects, query), [projects, query]);

  return (
    <Panel bodyLayout="column" className="container-section" data-xgc-role="container-compose-projects" data-xgc-id="container-compose-projects" fill padding="none">
      <div className="container-section-content">
      <Toolbar className="container-table-toolbar" data-xgc-role="container-compose-toolbar" data-xgc-id="container-compose-toolbar">
        <div className="container-toolbar-left" />
        <div className="container-toolbar-right">
          <Input
            aria-label="Search compose projects"
            className="container-search"
            icon={<Search size={14} aria-hidden="true" />}
            placeholder="Search compose projects"
            type="search"
            value={query}
            onValueChange={setQuery}
          />
          {onRefresh && (
            <ControlButton className="container-toolbar-text-action" disabled={busy} onClick={onRefresh} dataXgcRole="container-compose-refresh" dataXgcId="container-compose-refresh">
              Refresh
            </ControlButton>
          )}
          <ControlButton className="container-toolbar-text-action" disabled={busy} tone="primary" onClick={() => setDrawerOpen(true)} dataXgcRole="container-compose-create" dataXgcId="container-compose-create">
            Create
          </ControlButton>
        </div>
      </Toolbar>

      <SortableDataTable
        className="container-data-table-shell"
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (project) => project.name,
          },
          {
            id: 'status',
            header: 'Status',
            cell: (project) => <ContainerStatusText status={project.status} />,
          },
          {
            id: 'config',
            header: 'Config files',
            className: 'container-code-cell',
            cell: (project) => project.configFiles || '-',
          },
          {
            id: 'operation',
            header: 'Operation',
            cell: (project) => {
              const running = composeProjectIsRunning(project.status);
              return (
                <div className="container-actions">
                  {/* One of Up/Stop (not both) · Restart always · Down · YAML · Delete */}
                  {running ? (
                    <ControlButton
                      aria-label={`Stop ${project.name}`}
                      dataXgcId={project.name}
                      dataXgcRole="container-compose-up"
                      disabled={busy}
                      iconOnly
                      size="compact"
                      tone="danger"
                      onClick={() => onOperate(project,'stop')}
                    >
                      <Square size={13} aria-hidden="true" />
                    </ControlButton>
                  ) : (
                    <ControlButton
                      aria-label={`Up ${project.name}`}
                      dataXgcId={project.name}
                      dataXgcRole="container-compose-up"
                      disabled={busy}
                      iconOnly
                      size="compact"
                      tone="success"
                      onClick={() => onOperate(project,'up')}
                    >
                      <Play size={13} aria-hidden="true" />
                    </ControlButton>
                  )}
                  <ControlButton
                    aria-label={`Restart ${project.name}`}
                    dataXgcId={project.name}
                    dataXgcRole="container-compose-restart"
                    disabled={busy}
                    iconOnly
                    size="compact"
                    tone="primary"
                    onClick={() => onOperate(project,'restart')}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    aria-label={`Down ${project.name}`}
                    dataXgcId={project.name}
                    dataXgcRole="container-compose-down"
                    disabled={busy}
                    iconOnly
                    size="compact"
                    onClick={() => onOperate(project,'down')}
                  >
                    <ArrowDownToLine size={13} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    type="button"
                    disabled={configBusy}
                    iconOnly
                    size="compact"
                    aria-label={`View YAML for ${project.name}`}
                    dataXgcRole="container-compose-view-yaml"
                    dataXgcId={project.name}
                    onClick={(event) => {
                      // Row/cell overflow + table hit-testing: keep the click local.
                      event.preventDefault();
                      event.stopPropagation();
                      onShowConfig(project);
                    }}
                  >
                    <FileCode size={13} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    aria-label={`Delete ${project.name}`}
                    dataXgcId={project.name}
                    dataXgcRole="container-compose-delete"
                    disabled={busy}
                    iconOnly
                    size="compact"
                    tone="danger"
                    onClick={() => onOperate(project,'delete',true)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </ControlButton>
                </div>
              );
            },
          },
        ]}
        emptyMessage={
          projects.length === 0
            ? 'No compose projects registered on this host'
            : 'No matching compose projects'
        }
        getRowProps={(project) => ({ 'data-xgc-role': 'container-compose-row','data-xgc-id': project.name })}
        rowKey={(project) => project.name}
        rows={filteredProjects}
        tableProps={{ className: 'container-data-table','data-xgc-role': 'container-data-table','data-xgc-id': 'container-data-table' }}
      />

      {drawerOpen && (
        <ComposeCreateDrawer
          busy={busy}
          draft={draft}
          targetId={targetId}
          onClose={() => setDrawerOpen(false)}
          onCreate={() => {
            void Promise.resolve(onCreate()).then((accepted) => {
              if (accepted !== false) setDrawerOpen(false);
            });
          }}
          onDraftChange={onDraftChange}
        />
      )}
      </div>
    </Panel>
  );
}
