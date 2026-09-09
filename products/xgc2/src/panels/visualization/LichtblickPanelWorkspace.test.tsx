// @vitest-environment jsdom

import { act,fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import type { AutomationSpec } from '../../domains/automation/automationPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import {
  LichtblickPanelFrameBinding,
  LichtblickPanelFrameProvider,
  LichtblickPanelHeaderActions,
  LichtblickPanelHeaderLeading,
} from './LichtblickPanelFrame';
import { ExperimentSurfaceVisibilityProvider } from '../../domains/experiment/experimentPublic';
import { markLichtblickLayoutBootstrapped } from './lichtblickLayoutBootstrap';
import { LichtblickWorkspacePanel } from './LichtblickPanelWorkspace';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver',ResizeObserverStub);

describe('LichtblickWorkspacePanel Action and Data ports',() => {
  beforeEach(() => {
    window.sessionStorage.clear();
    const style = document.createElement('style');
    style.dataset.xgcRole = 'lichtblick-workspace-test-css';
    style.textContent = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../styles/lichtblick-panel.css'),
      'utf8',
    );
    document.head.append(style);
  });

  it('keeps the panel switches open and reflects viewer state instead of optimistic single selection',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickPanelFrameBinding panelId={panel.id}>{(_view,bridge) => (
        <iframe title="Test viewer" src={window.location.origin} ref={bridge.iframeRef} />
      )}</LichtblickPanelFrameBinding>
    </LichtblickPanelFrameProvider>);
    const iframe = screen.getByTitle('Test viewer') as HTMLIFrameElement;
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const announce = (visibleSurfaces: string[]) => act(() => window.dispatchEvent(new MessageEvent('message', {
      origin:window.location.origin,source:iframe.contentWindow,
      data:{ channel:'xgc2.lichtblick.embed',version:2,sender:'lichtblick',type:'ready',
        capabilities:['panel-controls','topics','variables'],visibleSurfaces },
    })));
    announce(['panel-controls','variables']);
    fireEvent.click(screen.getByRole('button',{ name:'Lichtblick tools' }));
    expect(screen.getByRole('switch',{ name:'Panel controls' })).toHaveAttribute('aria-checked','true');
    expect(screen.getByRole('switch',{ name:'Variables' })).toHaveAttribute('aria-checked','true');
    fireEvent.click(screen.getByRole('switch',{ name:'Topics' }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type:'toggle-surface',surface:'topics' }),window.location.origin);
    expect(screen.getByRole('switch',{ name:'Topics' })).toHaveAttribute('aria-checked','false');
    announce(['panel-controls','topics','variables']);
    expect(screen.getByRole('switch',{ name:'Topics' })).toHaveAttribute('aria-checked','true');
    announce(['panel-controls','variables']);
    expect(screen.getByRole('switch',{ name:'Topics' })).toHaveAttribute('aria-checked','false');
    expect(screen.getByRole('dialog',{ name:'Lichtblick panels' })).toBeInTheDocument();
  });

  it('gates overlay 3D/2D, inspect, and measure through the host Tools 3d-tools switch',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickPanelFrameBinding panelId={panel.id}>{(_view,bridge) => (
        <iframe title="Test viewer" src={window.location.origin} ref={bridge.iframeRef} />
      )}</LichtblickPanelFrameBinding>
    </LichtblickPanelFrameProvider>);
    const iframe = screen.getByTitle('Test viewer') as HTMLIFrameElement;
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const announce = (visibleSurfaces: string[]) => act(() => window.dispatchEvent(new MessageEvent('message', {
      origin:window.location.origin,source:iframe.contentWindow,
      data:{ channel:'xgc2.lichtblick.embed',version:2,sender:'lichtblick',type:'ready',
        capabilities:['3d-tools','panel-controls','topics'],visibleSurfaces },
    })));
    announce(['3d-tools']);
    fireEvent.click(screen.getByRole('button',{ name:'Lichtblick tools' }));
    const overlayTools = screen.getByRole('switch',{ name:'3D tools' });
    expect(overlayTools).toHaveAttribute('aria-checked','true');
    expect(overlayTools).not.toBeDisabled();
    fireEvent.click(overlayTools);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type:'toggle-surface',surface:'3d-tools' }),
      window.location.origin,
    );
    announce([]);
    expect(overlayTools).toHaveAttribute('aria-checked','false');
    expect(document.querySelector('[data-xgc-role="lichtblick-3d-tools-trigger"]')).toBeNull();
  });

  it('disables 3D tools until the viewer advertises the overlay capability',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickPanelFrameBinding panelId={panel.id}>{(_view,bridge) => (
        <iframe title="Test viewer" src={window.location.origin} ref={bridge.iframeRef} />
      )}</LichtblickPanelFrameBinding>
    </LichtblickPanelFrameProvider>);
    const iframe = screen.getByTitle('Test viewer') as HTMLIFrameElement;
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin:window.location.origin,source:iframe.contentWindow,
      data:{ channel:'xgc2.lichtblick.embed',version:2,sender:'lichtblick',type:'ready',
        capabilities:['panel-controls','topics'],visibleSurfaces:[] },
    })));
    fireEvent.click(screen.getByRole('button',{ name:'Lichtblick tools' }));
    expect(screen.getByRole('switch',{ name:'3D tools' })).toBeDisabled();
  });

  it('exposes a vertical 3D-over-augmented stack without a running process',() => {
    const { container } = render(<LichtblickPanelFrameProvider panel={panelFixture()}>
      <LichtblickWorkspacePanel panel={panelFixture()} context={context()} />
    </LichtblickPanelFrameProvider>);
    const workspace = container.querySelector('[data-xgc-role="lichtblick-workspace"]') as HTMLElement;
    expect(workspace).toHaveAttribute('data-xgc-layout-mode', '3d-above-camera-ar');
    expect(workspace).toHaveAttribute('data-xgc-layout-arrangement', 'column');
    expect(workspace).toHaveAttribute('data-xgc-layout-first-pane', '3d');
    expect(workspace).toHaveAttribute('data-xgc-layout-second-pane', 'camera');
    expect(workspace).toHaveAttribute('data-xgc-layout-third-pane', '');
    expect(workspace).toHaveAttribute('data-xgc-layout-runtime-owner', 'provisioning-core');
    expect(workspace).toHaveAttribute('data-xgc-visible-surface', 'empty');
    const style = getComputedStyle(workspace);
    expect(style.display).toBe('grid');
    expect(style.overflow).toBe('hidden');
    expect(style.contain).toContain('layout');
    expect(style.gridTemplateColumns).toMatch(/minmax\(0,\s*1fr\)|minmax\(0px,\s*1fr\)/);
    expect(style.gridTemplateRows).toMatch(/minmax\(0,\s*1fr\)|minmax\(0px,\s*1fr\)/);
    expect(screen.queryByTitle('Lichtblick')).toBeNull();
  });

  it('keeps an operator-saved layoutMode on the workspace instead of migrating it',() => {
    const panel = panelFixture({ layoutMode: 'camera-ar-3d' });
    const { container } = render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickWorkspacePanel panel={panel} context={context()} />
    </LichtblickPanelFrameProvider>);
    const workspace = container.querySelector('[data-xgc-role="lichtblick-workspace"]') as HTMLElement;
    expect(workspace).toHaveAttribute('data-xgc-layout-mode', 'camera-ar-3d');
    expect(workspace).toHaveAttribute('data-xgc-layout-arrangement', 'row');
    expect(workspace).toHaveAttribute('data-xgc-layout-first-pane', 'camera');
    expect(workspace).toHaveAttribute('data-xgc-layout-second-pane', '3d');
    expect(workspace).toHaveAttribute('data-xgc-layout-third-pane', '');
  });

  it('exposes the Plot split without inventing series',() => {
    const panel = panelFixture({ layoutMode: '3d-above-camera-ar-plot',plotPaths:[] });
    const { container } = render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickWorkspacePanel panel={panel} context={context()} />
    </LichtblickPanelFrameProvider>);
    const workspace = container.querySelector('[data-xgc-role="lichtblick-workspace"]') as HTMLElement;
    expect(workspace).toHaveAttribute('data-xgc-layout-mode', '3d-above-camera-ar-plot');
    expect(workspace).toHaveAttribute('data-xgc-layout-arrangement', 'column-split');
    expect(workspace).toHaveAttribute('data-xgc-layout-first-pane', '3d');
    expect(workspace).toHaveAttribute('data-xgc-layout-second-pane', 'camera');
    expect(workspace).toHaveAttribute('data-xgc-layout-third-pane', 'plot');
  });

  it('leaves Panel Workflow lifecycle to the shared frame while preserving visualization tools',() => {
    const action = actionPort();
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(action)} />
    </LichtblickPanelFrameProvider>);

    expect(screen.queryByTitle('Lichtblick')).toBeNull();
    expect(screen.getByRole('button',{ name:'Lichtblick content' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Workflow' })).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="lichtblick-header-leading"]')).toHaveAttribute('data-xgc-view', 'lichtblick');
    expect(document.querySelector('[data-xgc-role="lichtblick-header-leading"]')).toHaveAttribute('data-xgc-id', 'lichtblick');
    expect(document.querySelector('[data-xgc-role="panel-view-switcher"]')).toHaveAttribute('data-xgc-id', 'lichtblick');
    expect(document.querySelector('[data-xgc-role="lichtblick-header-actions"]')).toHaveAttribute('data-xgc-view', 'lichtblick');
    expect(screen.queryByRole('button',{ name:'Open full Lichtblick UI' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Run Lichtblick visualization workflow' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop Lichtblick service Action' })).toBeNull();
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('does not invent local lifecycle chrome for a missing Action connection',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context()} />
    </LichtblickPanelFrameProvider>);
    const empty = document.querySelector('[data-xgc-role="lichtblick-empty-state"]') as HTMLElement;
    expect(empty).toHaveAttribute('data-state','stopped');
    expect(empty).toHaveAttribute('data-xgc-id','lichtblick');
    expect(screen.getByText('No run')).toBeInTheDocument();
    expect(screen.getByText('No viewer')).toBeInTheDocument();
    expect(screen.getByText('No bridge')).toBeInTheDocument();
    expect(empty.querySelector('[data-sample="foxglove-bridge · starting"]')).not.toBeNull();
    expect(empty.querySelector('[data-sample="lichtblick-web · starting"]')).not.toBeNull();
    expect(screen.queryByText('Lichtblick is stopped')).toBeNull();
    expect(screen.queryByText('Panel Workflow is not running.')).toBeNull();
    expect(screen.queryByText('Waiting for the connected Lichtblick runtime projection.')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Run Lichtblick visualization workflow' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop Lichtblick service Action' })).toBeNull();
  });

  it('does not re-bootstrap layout after this process already loaded once',() => {
    markLichtblickLayoutBootstrapped('local','process-lichtblick');
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'))} />
    </LichtblickPanelFrameProvider>);
    const frame = screen.getByTitle('Lichtblick');
    expect(frame).toHaveAttribute('data-xgc-role', 'lichtblick-frame');
    expect(frame).toHaveAttribute('data-xgc-id', 'lichtblick');
    expect(frame.getAttribute('src')).toContain('/api/visualization/targets/local/lichtblick/process-lichtblick/');
    expect(frame.getAttribute('src')).not.toContain('layoutUrl=');
  });

  it('keeps the same iframe mounted while the Experiment dashboard is parked',() => {
    const panel = panelFixture();
    const renderWorkspace = (visible:boolean) => <ExperimentSurfaceVisibilityProvider visible={visible}>
      <LichtblickPanelFrameProvider panel={panel}>
        <LichtblickPanelHeaderLeading panel={panel} editing={false} />
        <LichtblickPanelHeaderActions panel={panel} editing={false} />
        <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'))} />
      </LichtblickPanelFrameProvider>
    </ExperimentSurfaceVisibilityProvider>;
    const view = render(renderWorkspace(true));
    const frame = screen.getByTitle('Lichtblick');
    const workspace = document.querySelector('[data-xgc-role="lichtblick-workspace"]') as HTMLElement;
    expect(workspace).toHaveAttribute('data-xgc-parked', 'false');
    expect(screen.getByRole('status',{ name:'Preparing Lichtblick runtime' }))
      .toHaveAttribute('data-xgc-role', 'lichtblick-embed-busy');

    view.rerender(renderWorkspace(false));
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(workspace).toHaveAttribute('data-xgc-parked', 'true');
    expect(screen.queryByRole('status',{ name:'Preparing Lichtblick runtime' })).toBeNull();
    expect(frame.getAttribute('src')).not.toBe('about:blank');

    view.rerender(renderWorkspace(true));
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(workspace).toHaveAttribute('data-xgc-parked', 'false');
  });

  it('keeps the viewer iframe when the Panel Action hydrates without an active invocation',() => {
    const panel = panelFixture();
    const view = render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'))} />
    </LichtblickPanelFrameProvider>);
    const frame = screen.getByTitle('Lichtblick');

    view.rerender(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickWorkspacePanel panel={panel} context={context(undefined,'running','starting')} />
    </LichtblickPanelFrameProvider>);
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(document.querySelector('[data-xgc-role="lichtblick-workspace"]'))
      .toHaveAttribute('data-xgc-embed-held', 'true');
    expect(screen.queryByText('Lichtblick is stopped')).toBeNull();
    expect(document.querySelector('[data-xgc-role="lichtblick-empty-state"]')).toBeNull();
  });

  it('keeps the viewer iframe mounted while the local workflow view is selected',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'))} />
    </LichtblickPanelFrameProvider>);
    const frame = screen.getByTitle('Lichtblick');

    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(frame).toHaveAttribute('hidden');
    expect(document.querySelector('[data-xgc-role="lichtblick-header-leading"]')).toHaveAttribute('data-xgc-view', 'workflow');
    expect(document.querySelector('[data-xgc-role="lichtblick-workflow-slot"]')).not.toHaveAttribute('hidden');
    expect(document.querySelector('[data-xgc-role="lichtblick-workspace"]')).toHaveAttribute('data-xgc-visible-surface', 'workflow');

    fireEvent.click(screen.getByRole('button',{ name:'Lichtblick content' }));
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(frame).not.toHaveAttribute('hidden');
    expect(document.querySelector('[data-xgc-role="lichtblick-workspace"]')).toHaveAttribute('data-xgc-visible-surface', 'lichtblick');
  });

  it('opens the visualization after its owned WebUI and bridge are ready',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'),'running')} />
    </LichtblickPanelFrameProvider>);
    expect(screen.getByTitle('Lichtblick')).toBeInTheDocument();
  });

  it('does not open a WebSocket before its owned bridge is ready',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'),'running','starting')} />
    </LichtblickPanelFrameProvider>);
    expect(screen.queryByTitle('Lichtblick')).toBeNull();
    expect(screen.queryByText('Lichtblick is stopped')).toBeNull();
    expect(screen.queryByText('Preparing Lichtblick runtime')).toBeNull();
    const empty = document.querySelector('[data-xgc-role="lichtblick-empty-state"]') as HTMLElement;
    expect(empty).toHaveAttribute('data-state','starting');
    expect(empty.querySelector('.xgc-workspace-busy-ring')).toBeNull();
    expect(document.querySelector('[data-xgc-role="lichtblick-empty-state-stage"][data-xgc-id="lichtblick:run"]'))
      .toHaveAttribute('data-xgc-status','ready');
    expect(document.querySelector('[data-xgc-role="lichtblick-empty-state-stage"][data-xgc-id="lichtblick:bridge"]'))
      .toHaveAttribute('data-xgc-status','active');
    expect(empty.querySelector('.workflow-startup-pipeline-rail[data-sending="true"]')).not.toBeNull();
  });

  it('keeps a connected runtime error on the run stage instead of dumping fetch text',() => {
    render(<LichtblickPanelFrameProvider panel={panelFixture()}>
      <LichtblickWorkspacePanel
        panel={panelFixture()}
        context={context(undefined,'running','ready','Core layout artifact unavailable')}
      />
    </LichtblickPanelFrameProvider>);
    const run = document.querySelector('[data-xgc-role="lichtblick-empty-state-stage"][data-xgc-id="lichtblick:run"]') as HTMLElement;
    expect(run).toHaveAttribute('data-xgc-status','failed');
    expect(run).toHaveAttribute('data-current','true');
    expect(run).toHaveAttribute('title','Core layout artifact unavailable');
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(run).not.toHaveTextContent(/Failed to fetch/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Lichtblick runtime unavailable')).toBeNull();
    expect(screen.queryByText('Core layout artifact unavailable')).toBeNull();
  });

  it('keeps Failed to fetch on the run stage title, not as inverted mark copy',() => {
    render(<LichtblickPanelFrameProvider panel={panelFixture()}>
      <LichtblickWorkspacePanel
        panel={panelFixture()}
        context={context(undefined,'running','ready','Failed to fetch')}
      />
    </LichtblickPanelFrameProvider>);
    const run = document.querySelector('[data-xgc-role="lichtblick-empty-state-stage"][data-xgc-id="lichtblick:run"]') as HTMLElement;
    expect(run).toHaveAttribute('data-xgc-status','failed');
    expect(run).toHaveAttribute('data-current','true');
    expect(run).toHaveAttribute('title','Failed to fetch');
    expect(run).not.toHaveTextContent(/Failed to fetch/i);
    expect(run.querySelector('.workflow-startup-pipeline-fact')).toHaveTextContent('unavailable');
  });

  it('unmounts the iframe while the Panel Workflow is stopping',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('stopping'),'stopping')} />
    </LichtblickPanelFrameProvider>);
    expect(screen.queryByTitle('Lichtblick')).toBeNull();
    expect(document.querySelector('[data-xgc-role="lichtblick-empty-state"]'))
      .toHaveAttribute('data-state','stopping');
    expect(screen.queryByText('Stopping Lichtblick')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stopping Lichtblick service Action' })).toBeNull();
  });

  it('draws the exact Panel Workflow snapshot on the workflow view',() => {
    const panel = panelFixture();
    render(<LichtblickPanelFrameProvider panel={panel}>
      <LichtblickPanelHeaderLeading panel={panel} editing={false} />
      <LichtblickPanelHeaderActions panel={panel} editing={false} />
      <LichtblickWorkspacePanel panel={panel} context={context(actionPort('running'))} />
    </LichtblickPanelFrameProvider>);
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(document.querySelector('[data-xgc-role="lichtblick-workflow-view"]')).toBeTruthy();
    expect(screen.getByLabelText('lichtblick-web')).toBeInTheDocument();
    expect(screen.queryByText(/Experiment Run/)).toBeNull();
  });
});

function panelFixture(options: Record<string, unknown> = {}):PanelInstance {
  return { id:'lichtblick',pluginId:'xgc2-lichtblick',title:'Lichtblick',gridPos:{ x:0,y:0,w:8,h:6 },query:{},options,fieldConfig:{},portBindings:[] };
}

function actionPort(status?:'running'|'stopping'):PanelActionPortRuntime {
  return { id:'lichtblick',label:'Lichtblick',connected:true,disabledReason:'',
    action:{ id:'serve',label:'Serve',kind:'service',controls:['stop'] },defaults:{},
    ...(status ? { activeInvocation:{ id:'run-1',status,revision:1 } } : {}),
    invoke:vi.fn(async () => ({ id:'run-1',status:'running' as const,revision:1 })),control:vi.fn(),
    trace:{ automationResourceId:'lichtblick-workflow',actionId:'serve' } };
}

function context(
  action?:PanelActionPortRuntime,
  runStatus:'running'|'stopping' = 'running',
  bridgeStatus:'ready'|'starting' = 'ready',
  runtimeError = '',
):PanelPluginContext {
  const automationSpec:AutomationSpec = {
    schemaVersion:11,metadata:{ name:'Lichtblick workflow',description:'',tags:[] },
    targetPolicy:{ mode:'inherit',executionTargetId:'' },actions:[],stickyNotes:[],
    nodes:[{ id:'lichtblick-web',displayName:'lichtblick-web',kind:'process.run-definition',typeVersion:1,
      parameters:{ definitionId:'lichtblick-web' },retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } }],edges:[],
  };
  return { ports:{ actions:action ? { lichtblick:action } : {},data:{
    visualization:{ id:'visualization',label:'Runtime',contract:'lichtblick.runtime.v1',connected:true,
      value:{ targetId:'local',activeRun:{ id:'run-1',targetId:'local',status:runStatus,revision:1,runMode:'simulation',
        experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },automationResourceId:'lichtblick-workflow',
        actionId:'serve',rootRunId:'run-1',createdAt:'t',updatedAt:'t',workflowTargets:[{
          workflowInstanceId:'lichtblick',automationRef:{ domain:'automation',resourceId:'lichtblick-workflow',branch:'main' },
          executionTargetId:'local',actionPresetIds:['serve'],
        }] },
      processInstances:[lichtblickProcess(),lichtblickBridgeProcess(bridgeStatus)],documents:[],catalog:[{
        kind:'process.run-definition',typeVersion:1,label:'Process',category:'process',traits:[],parameterSchema:{},
      }],runSummaries:[{
        id:'run-1',targetId:'local',automationResourceId:'lichtblick-workflow',actionId:'serve',actionVersion:1,
        status:runStatus,revision:1,sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-1',
          branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },rootRunId:'run-1',createdAt:'t',updatedAt:'t',
      }],runDetailsById:{ 'run-1':{
        invocations:[],nodeSummaries:[],loading:false,error:'',snapshot:{ automationSpec },
      } },loading:false,error:runtimeError },trace:{} },
  },authoring:{},interactions:{} } };
}

function lichtblickBridgeProcess(status:'ready'|'starting'):ProcessInstance {
  return {
    ...lichtblickProcess(),
    id:'process-foxglove-bridge',definitionId:'foxglove-bridge',
    observedState:status==='ready' ? 'running':'starting',
    readiness:{ status:status==='ready' ? 'passing':'unknown' },
    liveness:{ status:status==='ready' ? 'passing':'unknown' },
  };
}

function lichtblickProcess():ProcessInstance {
  return {
    id:'process-lichtblick',targetId:'local',definitionId:'lichtblick-web',definitionVersion:'1',definitionDigest:'digest',
    ownerType:'orchestration-run',ownerId:'run-1',scope:'run',parameters:{},driver:'host',
    desiredState:'running',observedState:'running',readiness:{ status:'passing',checkedAt:'2026-01-01T00:00:00Z' },
    liveness:{ status:'passing',checkedAt:'2026-01-01T00:00:00Z' },revision:1,restartCount:0,
    createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
  };
}
