import { Check,ChevronDown,Network,Scan,Square,Wrench } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';
import { Button,Popover } from '@xgc2/ui-react';
import { useExperimentSurfaceVisible } from '../../domains/experiment/experimentPublic';
import { useProductRouteVisible } from '../../shared/routeReady';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  LICHTBLICK_EMBED_SURFACES,
  isLichtblickEmbedReadyMessage,
  lichtblickEmbedToggleSurfaceMessage,
  type LichtblickEmbedSurface,
} from './lichtblickEmbedBridge';

export type LichtblickWorkspaceView = 'lichtblick' | 'workflow';

export type LichtblickEmbedBridgeControl = {
  iframeRef: RefCallback<HTMLIFrameElement>;
  ready: boolean;
  capabilities: readonly LichtblickEmbedSurface[];
  visibleSurfaces: readonly LichtblickEmbedSurface[];
  toggleSurface: (surface: LichtblickEmbedSurface) => void;
};

type LichtblickPanelFrameState = {
  panelId: string;
  view: LichtblickWorkspaceView;
  setView: (view: LichtblickWorkspaceView) => void;
  embedBridge: LichtblickEmbedBridgeControl;
};

const LichtblickPanelFrameContext = createContext<LichtblickPanelFrameState | null>(null);
const viewItems = [
  { id: 'lichtblick',label: 'Lichtblick content',icon: Scan },
  { id: 'workflow',label: 'Workflow',icon: Network },
] as const;
const noEmbedCapabilities: readonly LichtblickEmbedSurface[] = [];
const embedToolLabels: Record<LichtblickEmbedSurface,string> = {
  '3d-tools': '3D tools',
  'panel-controls': 'Panel controls',
  'panel-settings': 'Panel settings',
  alerts: 'Alerts',
  topics: 'Topics',
  layouts: 'Layouts',
  variables: 'Variables',
};

export function LichtblickPanelFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<LichtblickWorkspaceView>('lichtblick');
  const iframeElement = useRef<HTMLIFrameElement | null>(null);
  const [embedReady,setEmbedReady] = useState(false);
  const [embedCapabilities,setEmbedCapabilities] = useState(noEmbedCapabilities);
  const [visibleSurfaces,setVisibleSurfaces] = useState(noEmbedCapabilities);
  const iframeRef = useCallback<RefCallback<HTMLIFrameElement>>((element) => {
    if (element === iframeElement.current) return;
    iframeElement.current = element;
    if (!element) return;
    setEmbedReady(false);
    setEmbedCapabilities(noEmbedCapabilities);
    setVisibleSurfaces(noEmbedCapabilities);
  },[]);
  useLayoutEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const iframe = iframeElement.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const origin = trustedLichtblickFrameOrigin(iframe);
      if (!origin || event.origin !== origin || !isLichtblickEmbedReadyMessage(event.data)) return;
      setEmbedCapabilities([...event.data.capabilities]);
      setVisibleSurfaces([...event.data.visibleSurfaces]);
      setEmbedReady(true);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  },[]);
  const toggleSurface = useCallback((surface: LichtblickEmbedSurface) => {
    const iframe = iframeElement.current;
    if (!iframe || !embedReady || !embedCapabilities.includes(surface)) return;
    const origin = trustedLichtblickFrameOrigin(iframe);
    if (!origin) return;
    iframe.contentWindow?.postMessage(lichtblickEmbedToggleSurfaceMessage(surface), origin);
  },[embedCapabilities,embedReady]);
  const embedBridge = useMemo<LichtblickEmbedBridgeControl>(() => ({
    iframeRef,
    ready: embedReady,
    capabilities: embedCapabilities,
    visibleSurfaces,
    toggleSurface,
  }),[embedCapabilities,embedReady,iframeRef,toggleSurface,visibleSurfaces]);
  const value = useMemo(
    () => ({ panelId: panel.id,view,setView,embedBridge }),
    [embedBridge,panel.id,view],
  );
  return <LichtblickPanelFrameContext.Provider value={value}>{children}</LichtblickPanelFrameContext.Provider>;
}

function useLichtblickPanelFrame(panelId: string) {
  const frame = useContext(LichtblickPanelFrameContext);
  if (!frame || frame.panelId !== panelId) {
    throw new Error(`Lichtblick panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frame;
}

export function LichtblickPanelFrameBinding({
  panelId,children,
}: {
  panelId: string;
  children: (view: LichtblickWorkspaceView,embedBridge: LichtblickEmbedBridgeControl) => ReactNode;
}) {
  const frame = useLichtblickPanelFrame(panelId);
  return children(frame.view,frame.embedBridge);
}

export function LichtblickPanelHeaderLeading({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frame = useLichtblickPanelFrame(panel.id);
  return (
    <div className="lichtblick-header-actions" data-xgc-role="lichtblick-header-leading" data-xgc-id={panel.id}
      data-xgc-view={frame.view}
      data-xgc-workflow-view-active={frame.view === 'workflow' ? 'true' : undefined}>
      <PanelViewSwitcher
        value={frame.view}
        items={viewItems}
        onChange={frame.setView}
        ariaLabel="Lichtblick panel views"
        presentation="icons"
        appearance="panel"
        disabled={editing}
        dataXgcId={panel.id}
        optionDataXgcRole="lichtblick-panel-view"
      />
    </div>
  );
}

export function LichtblickPanelHeaderActions({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frame = useLichtblickPanelFrame(panel.id);
  const [open,setOpen] = useState(false);
  const dashboardVisible = useExperimentSurfaceVisible();
  const routeVisible = useProductRouteVisible();

  return (
    <div className="lichtblick-header-actions" data-xgc-role="lichtblick-header-actions" data-xgc-id={panel.id}
      data-xgc-view={frame.view} data-xgc-embed-ready={frame.embedBridge.ready ? 'true' : 'false'}>
      {!editing && (
        <Popover
          open={open && dashboardVisible && routeVisible && frame.view === 'lichtblick'}
          onOpenChange={setOpen}
          align="end"
          ariaLabel="Lichtblick panels"
          dataXgcRole="lichtblick-embed-tools-popover"
          dataXgcId={panel.id}
          trigger={(
            <Button uiSize="compact" disabled={!frame.embedBridge.ready}
              aria-label="Lichtblick tools"
              data-xgc-role="lichtblick-embed-tools-trigger" data-xgc-id={panel.id}>
              <Wrench size={13} aria-hidden="true" />
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
          )}
        >
          <div className="lichtblick-embed-surface-switches">
            {LICHTBLICK_EMBED_SURFACES.map((surface) => {
              const visible = frame.embedBridge.visibleSurfaces.includes(surface);
              const Icon = visible ? Check : Square;
              return (
                <Button key={surface} role="switch" aria-checked={visible}
                  disabled={!frame.embedBridge.ready || !frame.embedBridge.capabilities.includes(surface)}
                  appearance="ghost" uiSize="compact"
                  data-xgc-role="lichtblick-embed-surface-toggle" data-xgc-id={`${panel.id}:${surface}`}
                  onClick={() => frame.embedBridge.toggleSurface(surface)}>
                  <Icon size={13} aria-hidden="true" />{embedToolLabels[surface]}
                </Button>
              );
            })}
          </div>
        </Popover>
      )}
    </div>
  );
}

function trustedLichtblickFrameOrigin(iframe: HTMLIFrameElement) {
  try {
    const origin = new URL(iframe.src, window.location.href).origin;
    return origin === window.location.origin ? origin : '';
  } catch {
    return '';
  }
}
