import { FolderOpen,Network,Settings2,Terminal } from 'lucide-react';
import { Button } from '@xgc2/ui-react';
import { useMemo,useState } from 'react';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useExperimentText } from '../../domains/experiment/experimentPublic';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  ExperimentEnvironmentFrameContext,
  isExperimentEnvironmentView,
  useExperimentEnvironmentFrame,
} from './experimentEnvironmentFrameContext';

function viewKey(panelId: string) {
  return `xgc.panel.experiment-environment.view.${panelId}`;
}

export function ExperimentEnvironmentPanelFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = usePersistentState(viewKey(panel.id), 'files', isExperimentEnvironmentView);
  const [operationsOpen,setOperationsOpen] = useState(false);
  const value = useMemo(() => ({ view,setView,operationsOpen,setOperationsOpen }), [setView,view,operationsOpen]);
  return (
    <ExperimentEnvironmentFrameContext.Provider value={value}>
      {children}
    </ExperimentEnvironmentFrameContext.Provider>
  );
}

export function ExperimentEnvironmentPanelHeaderLeading({ panel }: PanelPluginHeaderActionsProps) {
  const frame = useExperimentEnvironmentFrame();
  const t = useExperimentText();
  return (
    <PanelViewSwitcher
      value={frame.view}
      items={[
        { id: 'files',label: t('Environment files'),icon: FolderOpen },
        { id: 'terminal',label: t('Environment terminal'),icon: Terminal },
        { id: 'network',label: t('Environment network'),icon: Network },
      ]}
      onChange={frame.setView}
      ariaLabel={t('Experiment environment')}
      presentation="icons"
      appearance="panel"
      dataXgcRole="experiment-environment-views"
      dataXgcId={panel.id}
      optionDataXgcRole="experiment-environment-view"
    />
  );
}

export function ExperimentEnvironmentPanelHeaderActions({ panel }: PanelPluginHeaderActionsProps) {
  const t = useExperimentText();
  const frame = useExperimentEnvironmentFrame();
  return (
    <Button
      uiSize="compact"
      iconOnly
      aria-label={t('Environment operations')}
      title={t('Environment operations')}
      data-xgc-role="experiment-environment-operations"
      data-xgc-id={panel.id}
      onClick={() => frame.setOperationsOpen(true)}
    >
      <Settings2 size={14} aria-hidden />
    </Button>
  );
}
