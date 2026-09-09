import { List,Network } from 'lucide-react';
import { useEffect,useMemo,type ReactNode } from 'react';
import { EmptyState } from '@xgc2/ui-react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { usePersistentState } from '../../hooks/usePersistentState';
import { HostRuntimeChromeProvider } from './hostRuntimeChrome';
import type { HostSystemLeafComponent,HostSystemLeafContext } from './hostSystemComposition';
import './HostRuntimeShell.css';

type HostRuntimeView = 'processes' | 'network';

export function HostRuntimeShell({
  context,
  processes,
  network,
}: {
  context: HostSystemLeafContext;
  processes?: HostSystemLeafComponent<'Processes'>;
  network?: HostSystemLeafComponent<'Network'>;
}) {
  const preferredView = usePersistentState<HostRuntimeView>(
    'xgc.system.processView',
    'processes',
    isHostRuntimeView,
  );
  const [storedView,setStoredView] = preferredView;
  const availableViews = useMemo(() => [
    ...(processes ? [{ value: 'processes' as const,label: 'Processes',icon: <List size={13} /> }] : []),
    ...(network ? [{ value: 'network' as const,label: 'Network',icon: <Network size={13} /> }] : []),
  ],[network,processes]);
  const focusedProcessView = Boolean(context.runtimeProcessFocus && processes);
  useEffect(() => {
    if (focusedProcessView && storedView !== 'processes') setStoredView('processes');
  },[focusedProcessView,setStoredView,storedView]);
  const activeView: HostRuntimeView = focusedProcessView
    ? 'processes'
    : availableViews.some((view) => view.value === storedView)
      ? storedView
      : (availableViews[0]?.value ?? 'processes');
  const ActiveLeaf = activeView === 'network' ? network : processes;

  const viewSwitcher: ReactNode = availableViews.length > 1 ? (
    <SegmentedControl
      asTabs
      size="compact"
      variant="underline"
      value={activeView}
      options={availableViews}
      onChange={(value) => {
        if (isHostRuntimeView(value) && availableViews.some((view) => view.value === value)) {
          if (value !== 'processes' && context.runtimeProcessFocus) {
            context.onClearRuntimeProcessFocus?.(context.runtimeProcessFocus.requestId);
          }
          setStoredView(value);
        }
      }}
      ariaLabel="Host runtime view"
      className="xgc-host-runtime-view-tabs"
      dataXgcRole="host-runtime-view-switcher" dataXgcId="host-runtime-view-switcher"
      optionDataXgcRole="host-runtime-view"
    />
  ) : null;

  if (availableViews.length === 0) {
    return (
      <div
        className="xgc-host-runtime xgc-host-fill-workspace"
        data-xgc-role="host-runtime" data-xgc-id="host-runtime"
        data-xgc-remote={context.isRemote ? 'true' : undefined}
      >
        <EmptyState
          density="compact"
          title="Runtime unavailable"
          description="Neither Processes nor Network is present in this product and admitted for this host."
          data-xgc-role="host-runtime-unavailable" data-xgc-id="host-runtime-unavailable"
        />
      </div>
    );
  }

  return (
    <div
      className="xgc-host-runtime xgc-host-fill-workspace"
      data-xgc-role="host-runtime" data-xgc-id="host-runtime"
      data-xgc-remote={context.isRemote ? 'true' : undefined}
      data-xgc-active-view={activeView}
      data-xgc-focus-pid={context.runtimeProcessFocus?.pid}
      data-xgc-requests={context.requestsAllowed ? 'allowed' : 'blocked'}
    >
      {!context.requestsAllowed ? (
        <EmptyState
          density="compact"
          title="Runtime offline"
          description="Membership is enabled, but the Agent connection is not ready for automatic requests."
          data-xgc-role="host-runtime-offline" data-xgc-id="host-runtime-offline"
        />
      ) : (
        /*
         * Containers contract: main host fills page; one active leaf owns the
         * OpsSection (toolbar row + scroll table). View switcher is chrome
         * injected into that toolbar via HostRuntimeChromeProvider.
         */
        <div
          className="xgc-host-runtime-main"
          data-xgc-role="host-runtime-leaf"
          data-xgc-id={activeView}
        >
          <HostRuntimeChromeProvider value={{ viewSwitcher }}>
            {ActiveLeaf ? <ActiveLeaf {...context} /> : null}
          </HostRuntimeChromeProvider>
        </div>
      )}
    </div>
  );
}

function isHostRuntimeView(value: unknown): value is HostRuntimeView {
  return value === 'processes' || value === 'network';
}
