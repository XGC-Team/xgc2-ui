import {
Columns3,
History,
LineChart,
RadioTower,
Workflow
} from 'lucide-react';
import { Button } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../../components/ConfigDrawer';
import { useExperimentText } from '../experimentMessages';
import { availablePanelPlugins } from '../../../panels/builtinPanels';
import {
  localizedPanelPluginDescription,
  localizedPanelPluginName,
  type PanelPluginDefinition,
} from '../../../panels/types';
import { useAppLanguage } from '../../../shared/localization/localizedText';
import type { ExperimentDashboard } from '../experimentModel';

export function PanelLibraryDrawer({
  dashboard,
  onClose,
  onAdd,
}: {
  dashboard: ExperimentDashboard;
  onClose: () => void;
  onAdd: (plugin: PanelPluginDefinition) => void;
}) {
  const t = useExperimentText();
  const language = useAppLanguage();
  return (
    <ConfigDrawer
      title={t('Panel library')}
      ariaLabel={t('Panel library for {name}', { name: dashboard.name })}
      className="panel-library-drawer"
      bodyClassName="panel-library-body"
      dataXgcRole="panel-library-drawer"
      dataXgcId={dashboard.id}
      onClose={onClose}
    >
          <div className="panel-library-list">
            {availablePanelPlugins.map((plugin) => {
              const maximum = plugin.maxInstancesPerDashboard;
              const limitReached = maximum !== undefined
                && dashboard.panels.filter((panel) => panel.pluginId === plugin.id).length >= maximum;
              const name = localizedPanelPluginName(plugin,language);
              const description = localizedPanelPluginDescription(plugin,language);
              return (
              <Button
                appearance="ghost"
                key={plugin.id}
                className="panel-library-item"
                type="button"
                disabled={limitReached}
                draggable={!limitReached}
                data-xgc-role="panel-library-item"
                data-xgc-id={plugin.id}
                title={limitReached ? t('{name} is already present on this dashboard.',{ name }) : undefined}
                onDragStart={(event) => {
                  if (limitReached) return;
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('application/x-xgc-panel-plugin', plugin.id);
                  event.dataTransfer.setData('text/plain', name);
                }}
                onClick={() => { if (!limitReached) onAdd(plugin); }}
              >
                <span className="panel-library-icon">
                  <GaugeIcon plugin={plugin} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
              </Button>
              );
            })}
          </div>
    </ConfigDrawer>
  );
}

export function GaugeIcon({ plugin }: { plugin: PanelPluginDefinition }) {
  if (plugin.id === 'automation-workflow-audit') return <History size={18} />;
  if (plugin.id === 'rosbag-plot') return <LineChart size={18} />;
  if (plugin.category === 'Automation' || plugin.category === 'Operations') return <Workflow size={18} />;
  if (plugin.category === 'Control') return <RadioTower size={18} />;
  return <Columns3 size={18} />;
}
