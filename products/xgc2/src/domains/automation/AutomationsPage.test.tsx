// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { useExecutionTarget } from '../execution/executionPublic';
import { automationCatalogTraits } from './automationCatalogTestFixtures';
import type {
  AutomationDocument,
  AutomationNamespace,
} from './automationDefinitionContracts';
import type { AutomationDefinitionWorkspaceProps } from './AutomationDefinitionWorkspace.types';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';
import { AutomationsPage } from './AutomationsPage';
import { automationUserViewStorageKey } from './automationNavigation';
import { emptyAutomationNodeWebComposition } from './nodes/automationNodeWebComposition';
import { useAutomationWorkspace } from './useAutomationWorkspace';
import type * as AutomationWorkspaceModule from './useAutomationWorkspace';
import type * as ExecutionPublicModule from '../execution/executionPublic';

const notificationMocks = vi.hoisted(() => ({ useError: vi.fn() }));

vi.mock('../execution/executionPublic', async (loadOriginal) => {
  const original = await loadOriginal<typeof ExecutionPublicModule>();
  return { ...original,useExecutionTarget: vi.fn() };
});

vi.mock('../groundStationInteraction/groundStationInteractionPublic', async (loadOriginal) => ({
  ...await loadOriginal<Record<string, unknown>>(),
  useGroundStationErrorNotification: notificationMocks.useError,
}));

vi.mock('./useAutomationWorkspace', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationWorkspaceModule>();
  return { ...original,useAutomationWorkspace: vi.fn() };
});

const open = vi.fn();
const create = vi.fn();
const duplicate = vi.fn();
const runDocument = vi.fn();
const stop = vi.fn();
const refreshExecutionHistory = vi.fn();
const addNamespace = vi.fn();
const renameNamespace = vi.fn();
const archiveNamespace = vi.fn();
const move = vi.fn();
const refreshMCPConnections = vi.fn();
const pageMocks = vi.hoisted(() => ({ workspaceProps: vi.fn() }));

vi.mock('./AutomationDefinitionWorkspace', () => ({
  AutomationDefinitionWorkspace: (props: AutomationDefinitionWorkspaceProps) => {
    pageMocks.workspaceProps(props);
    return <div data-xgc-role="automation-definition-detail" data-xgc-id={props.document.head.resourceId} />;
  },
}));

describe('AutomationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useExecutionTarget).mockReturnValue({
      targetId: 'local',processDefinitions: [],processInstances: [],processInstancesTruncated:false,jobs: [],events: [],
      streamId: '',lastOffset: 0,streamState: 'disconnected',loading: false,error: '',
    });
    refreshMCPConnections.mockResolvedValue([]);
    open.mockResolvedValue(documentFixture('automation-a', 'Mission A', 'indoor'));
    create.mockResolvedValue(documentFixture('automation-c', 'Mission C', 'flight'));
    duplicate.mockResolvedValue(documentFixture('automation-copy', 'Mission A copy', 'indoor'));
    runDocument.mockResolvedValue(runFixture);
    stop.mockResolvedValue({ ...runFixture,status: 'stopping' });
    refreshExecutionHistory.mockResolvedValue([]);
    addNamespace.mockResolvedValue(namespaceFixture('hangar', 'Hangar', 'indoor'));
    renameNamespace.mockResolvedValue(namespaceFixture('indoor', 'Lab'));
    archiveNamespace.mockResolvedValue(undefined);
    move.mockResolvedValue(documentFixture('automation-a', 'Mission A', 'flight'));
    vi.mocked(useAutomationWorkspace).mockReturnValue(workspaceFixture());
  });

  it('switches the Automations catalog with the selected execution host', () => {
    const localFixed = documentFixture('local-fixed', 'Local only', 'indoor');
    localFixed.spec.targetPolicy = { mode: 'fixed',executionTargetId: 'local' };
    const agentFixed = documentFixture('agent-fixed', 'Agent only', 'indoor');
    agentFixed.spec.targetPolicy = { mode: 'fixed',executionTargetId: 'agent-b2' };
    const coreSystem = documentFixture('core-system', 'Run Experiment workflows', '');
    coreSystem.head.system = true;
    coreSystem.spec.targetPolicy = { mode: 'inherit',executionTargetId: '' };
    coreSystem.spec.metadata.tags = ['built-in','experiment','system'];
    const userPortable = documentFixture('user-portable', 'User portable', 'flight');
    userPortable.spec.targetPolicy = { mode: 'inherit',executionTargetId: '' };
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),
      documents: [localFixed, agentFixed, coreSystem, userPortable],
    });

    const localView = render(<AutomationsPage targetId="local" />);
    expect(localView.container.querySelector('[data-xgc-id="local-fixed"]')).not.toBeNull();
    expect(localView.container.querySelector('[data-xgc-id="core-system"]')).toBeNull();
    showProtectedWorkflows(localView.container);
    expect(localView.container.querySelector('[data-xgc-id="core-system"]')).not.toBeNull();
    expect(localView.container.querySelector('[data-xgc-id="user-portable"]')).not.toBeNull();
    expect(localView.container.querySelector('[data-xgc-id="agent-fixed"]')).toBeNull();
    localView.unmount();

    const agentView = render(<AutomationsPage targetId="agent-b2" />);
    showProtectedWorkflows(agentView.container);
    expect(agentView.container.querySelector('[data-xgc-role="automations-page"][data-xgc-id="agent-b2"]')).not.toBeNull();
    expect(agentView.container.querySelector('[data-xgc-id="agent-fixed"]')).not.toBeNull();
    expect(agentView.container.querySelector('[data-xgc-id="user-portable"]')).not.toBeNull();
    expect(agentView.container.querySelector('[data-xgc-id="local-fixed"]')).toBeNull();
    const row = agentView.container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="agent-fixed"]')!;
    expect(row).not.toHaveTextContent('agent-b2');
    expect(row.querySelector('[aria-label*="agent-b2"], [title*="agent-b2"]')).toBeNull();
    expect(agentView.container.querySelector('[data-xgc-id="core-system"]')).toBeNull();
  });

  it('uses shared folder sections without a dedicated namespace sidebar', () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    showProtectedWorkflows(container);
    expect(container.querySelector('[data-xgc-role="automations-page"][data-xgc-id="local"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-namespace-tree"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="indoor"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="flight"]')).not.toBeNull();
    const userFolder = container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="user"]')!;
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="system"]')).toHaveTextContent('System workflows');
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="templates"]')).toHaveTextContent('Templates');
    expect(userFolder).toHaveTextContent('User workflows');
    expect(container.querySelector('[data-xgc-role="automation-folder-archive"][data-xgc-id="user"]')).toBeNull();
    fireEvent.doubleClick(userFolder.querySelector('.xgc-list-folder-title strong')!);
    expect(userFolder.querySelector('.xgc-list-folder-name-input')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-tag-filter"]')).toHaveClass('xgc-select-control');
    expect(container.querySelector('[data-xgc-role="automation-sort"]')).toHaveClass('xgc-select-control');
    expect(container.querySelector('[data-xgc-role="automation-definition-search"]')).toHaveClass('xgc-input', 'xgc-list-search');
    expect(container.querySelector('[data-xgc-role="automation-tag-filter"]')).toHaveAttribute('data-xgc-control', 'select');
    expect(container.querySelector('[data-xgc-role="automation-sort"]')).toHaveAttribute('data-xgc-control', 'select');
    expect(container.querySelector('[data-xgc-role="automation-view-toggle"]')).toHaveAttribute('data-xgc-control', 'button');
    expect(container.querySelector('[data-xgc-role="automation-view-toggle"]')).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(container.querySelector('[data-xgc-role="automation-view-toggle"]')).toHaveAccessibleName('List view');
    expect(container.querySelector('[data-xgc-role="automation-folder-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-list-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-create"]')).toHaveClass('xgc-button');
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="flight"]')).toHaveTextContent('User workflows / Indoor / Flight');
    expect(screen.queryByRole('heading', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Create and manage reusable typed Automations.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-xgc-role="automation-definition-row"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-xgc-role="automation-definition-row"] [data-xgc-role="list-page-item-main"]')).toHaveLength(2);
    expect(container.querySelector('[data-xgc-role="list-page-item-main"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-row-open"][data-xgc-id="automation-a"]')).toHaveTextContent('Mission A');
    expect(container.querySelector('[data-xgc-role="automation-row-description"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"]')).toHaveClass('xgc-list-row');
    expect(container.querySelector('[data-xgc-role="automation-definition-row"]')).toHaveAttribute('data-xgc-layout', 'catalog');
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .xgc-list-item-title-icon')).toHaveAttribute('width', '15');
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .automation-definition-row-meta')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .automation-definition-row-meta')).toHaveClass('xgc-list-item-meta');
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .automation-definition-row-actions')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .automation-definition-row-actions')).toHaveClass('xgc-list-item-actions');
    expect(container.querySelector('[data-xgc-role="automation-definition-history"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="config-resource-history-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"]')).not.toHaveTextContent(/main\s*·\s*v\d+/i);
    expect(screen.queryByText(/namespace/i)).toBeNull();
  });

  it('uses shared catalog tag chrome for user workflows instead of static isolated tags', async () => {
    const indoor = documentFixture('automation-a', 'Mission A', 'indoor');
    indoor.spec.metadata.tags = ['survey'];
    const flight = documentFixture('automation-b', 'Mission B', 'flight');
    const commit = vi.fn().mockResolvedValue(indoor);
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),
      documents: [indoor, flight],
      commit,
    });

    const { container } = render(<AutomationsPage targetId="local" />);
    const chip = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="automation-row-tag"][data-xgc-id="automation-a:survey"]',
    )!;
    expect(container.querySelector('[data-xgc-role="automation-row-tags"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(chip).toHaveClass('xgc-list-tag');
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('data-xgc-variant', 'default');
    expect(chip).toHaveAccessibleName('Remove survey');
    expect(container.querySelector('span.xgc-list-tag')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-edit-tags"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="automation-definition-row"]')).toHaveLength(2);

    fireEvent.click(chip);
    expect(open).not.toHaveBeenCalled();
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ tags: [] }),
    }));
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="automation-b"]')).not.toBeNull();
  });

  it('hides system workflows by default while templates remain independently visible', () => {
    const system = documentFixture('system-workflow', 'System workflow', '');
    system.head.system = true;
    system.spec.metadata.tags = ['system-only'];
    const template = documentFixture('template-workflow', 'Template workflow', '');
    template.head.system = true;
    template.spec.metadata.tags = ['template','template-only'];
    const user = documentFixture('user-workflow', 'User workflow', '');
    user.spec.metadata.tags = ['user-only'];
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),documents: [system,template,user],
    });

    const { container } = render(<AutomationsPage targetId="local" />);
    const page = container.querySelector('[data-xgc-role="automation-definitions-page"][data-xgc-id="automation"]')!;
    const controls = page.querySelector('[data-xgc-role="list-page-controls"] .xgc-list-controls')!;
    const viewControls = controls.querySelector('.config-asset-catalog-view-controls')!;
    const systemToggle = controls.querySelector<HTMLButtonElement>('[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]')!;
    const templateToggle = controls.querySelector<HTMLButtonElement>('[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]')!;

    expect(viewControls.firstElementChild).toBe(systemToggle);
    expect(systemToggle.nextElementSibling).toBe(templateToggle);
    expect(templateToggle.nextElementSibling).toHaveAttribute('data-xgc-role', 'automation-view-toggle');
    expect(templateToggle.nextElementSibling?.nextElementSibling).toHaveAttribute('data-xgc-role', 'automation-sort');
    expect(systemToggle).toHaveAttribute('data-xgc-size', 'default');
    expect(templateToggle).toHaveAttribute('data-xgc-size', 'default');
    expect(templateToggle.nextElementSibling).toHaveAttribute('data-xgc-size', 'default');
    expect(templateToggle.nextElementSibling?.nextElementSibling).toHaveAttribute('data-xgc-size', 'default');
    expect(systemToggle).toHaveAccessibleName('Show system workflows');
    expect(systemToggle).toHaveAttribute('aria-pressed', 'true');
    expect(systemToggle).toHaveAttribute('data-xgc-active', 'true');
    expect(templateToggle).toHaveAccessibleName('Hide template workflows');
    expect(templateToggle).toHaveAttribute('aria-pressed', 'false');
    expect(templateToggle).not.toHaveAttribute('data-xgc-active');
    const systemIcon = systemToggle.querySelector('.protected-catalog-visibility-icon[data-xgc-id="system"]')!;
    const templateIcon = templateToggle.querySelector('.protected-catalog-visibility-icon[data-xgc-id="templates"]')!;
    expect(systemIcon).toHaveTextContent('S');
    expect(templateIcon).toHaveTextContent('T');
    expect(systemIcon).toHaveAttribute('width', '18');
    expect(systemIcon.querySelector('text')).toHaveAttribute('font-size', '13.5');
    expect(templateIcon).toHaveAttribute('width', '18');
    expect(templateIcon.querySelector('text')).toHaveAttribute('font-size', '13.5');
    expect(systemIcon.querySelector('.protected-catalog-visibility-hidden-mark')).not.toBeNull();
    expect(templateIcon.querySelector('.protected-catalog-visibility-hidden-mark')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="templates"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="system-workflow"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="template-workflow"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="user-workflow"]')).not.toBeNull();

    fireEvent.click(systemToggle);

    expect(systemToggle).toHaveAccessibleName('Hide system workflows');
    expect(systemToggle).toHaveAttribute('aria-pressed', 'false');
    expect(systemToggle).not.toHaveAttribute('data-xgc-active');
    expect(systemToggle.querySelector('.protected-catalog-visibility-hidden-mark')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="system"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="templates"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="system-workflow"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="template-workflow"]')).not.toBeNull();

    fireEvent.click(templateToggle);
    expect(templateToggle).toHaveAccessibleName('Show template workflows');
    expect(templateToggle).toHaveAttribute('aria-pressed', 'true');
    expect(templateToggle).toHaveAttribute('data-xgc-active', 'true');
    expect(templateToggle.querySelector('.protected-catalog-visibility-hidden-mark')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="system"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="templates"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="system-workflow"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="template-workflow"]')).toBeNull();
  });

  it('restores protected workflow visibility and list position for the same execution target',() => {
    const storageScope = automationUserViewStorageKey('local','catalog');
    window.localStorage.setItem(`${storageScope}.hideSystem`,'false');
    window.localStorage.setItem(`${storageScope}.hideTemplates`,'true');
    window.localStorage.setItem(`${storageScope}.viewMode`,'"list"');
    window.localStorage.setItem(`${storageScope}.scrollPosition`,JSON.stringify({ version: 1,list: { fraction: .4 } }));
    const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollHeight');
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientHeight');
    Object.defineProperty(HTMLElement.prototype,'scrollHeight',{ configurable:true,get:() => 1000 });
    Object.defineProperty(HTMLElement.prototype,'clientHeight',{ configurable:true,get:() => 400 });
    try {
      const view = render(<AutomationsPage targetId="local" />);
      const systemToggle = view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      );
      const templateToggle = view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      );
      const scroller = view.container.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')!;
      const viewToggle = view.container.querySelector('[data-xgc-role="automation-view-toggle"]');
      expect(systemToggle).toHaveAccessibleName('Hide system workflows');
      expect(templateToggle).toHaveAccessibleName('Show template workflows');
      expect(viewToggle).toHaveAccessibleName('Folder view');
      expect(viewToggle).toHaveAttribute('data-xgc-mode','list');
      expect(scroller.scrollTop).toBe(240);

      scroller.scrollTop = 360;
      fireEvent(scroller,new Event('scrollend'));
      const storedScroll = JSON.parse(window.localStorage.getItem(`${storageScope}.scrollPosition`) ?? '{}') as {
        list?: { anchor?: { role?: string; id?: string; offset?: number }; fraction?: number };
      };
      expect(storedScroll.list?.fraction).toBe(.6);
      expect(storedScroll.list?.anchor).toEqual(expect.objectContaining({
        role: 'automation-definition-row',id: expect.any(String),offset: expect.any(Number),
      }));

      view.rerender(<AutomationsPage targetId="agent-a" />);
      expect(view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      )).toHaveAccessibleName('Show system workflows');
      expect(view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      )).toHaveAccessibleName('Hide template workflows');
      expect(view.container.querySelector('[data-xgc-role="automation-view-toggle"]'))
        .toHaveAttribute('data-xgc-mode','folder');

      view.rerender(<AutomationsPage targetId="local" />);
      expect(view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      )).toHaveAccessibleName('Hide system workflows');
      expect(view.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      )).toHaveAccessibleName('Show template workflows');
      expect(view.container.querySelector('[data-xgc-role="automation-view-toggle"]'))
        .toHaveAttribute('data-xgc-mode','list');
      expect(view.container.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')?.scrollTop)
        .toBe(360);
      view.unmount();
    } finally {
      if (scrollHeight) Object.defineProperty(HTMLElement.prototype,'scrollHeight',scrollHeight);
      else delete (HTMLElement.prototype as { scrollHeight?:number }).scrollHeight;
      if (clientHeight) Object.defineProperty(HTMLElement.prototype,'clientHeight',clientHeight);
      else delete (HTMLElement.prototype as { clientHeight?:number }).clientHeight;
    }
  });

  it('restores the catalog view after unmount and keeps corrupted state at safe defaults',() => {
    const storageScope = automationUserViewStorageKey('local','catalog');
    const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollHeight');
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientHeight');
    Object.defineProperty(HTMLElement.prototype,'scrollHeight',{ configurable:true,get:() => 1000 });
    Object.defineProperty(HTMLElement.prototype,'clientHeight',{ configurable:true,get:() => 400 });
    try {
      const first = render(<AutomationsPage targetId="local" />);
      const systemToggle = first.container.querySelector<HTMLElement>(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      )!;
      const templateToggle = first.container.querySelector<HTMLElement>(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      )!;
      fireEvent.click(systemToggle);
      fireEvent.click(templateToggle);
      fireEvent.click(first.container.querySelector('[data-xgc-role="automation-view-toggle"]')!);
      const scroller = first.container.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')!;
      scroller.scrollTop = 320;
      fireEvent(scroller,new Event('scrollend'));
      first.unmount();

      const restored = render(<AutomationsPage targetId="local" />);
      expect(restored.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      )).toHaveAccessibleName('Hide system workflows');
      expect(restored.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      )).toHaveAccessibleName('Show template workflows');
      expect(restored.container.querySelector('[data-xgc-role="automation-view-toggle"]'))
        .toHaveAttribute('data-xgc-mode','list');
      expect(restored.container.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')?.scrollTop)
        .toBe(320);
      restored.unmount();

      window.localStorage.setItem(`${storageScope}.hideSystem`,'broken');
      window.localStorage.setItem(`${storageScope}.hideTemplates`,'{}');
      window.localStorage.setItem(`${storageScope}.viewMode`,'"grid"');
      window.localStorage.setItem(`${storageScope}.scrollPosition`,'not-json');
      const corrupted = render(<AutomationsPage targetId="local" />);
      expect(corrupted.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
      )).toHaveAccessibleName('Show system workflows');
      expect(corrupted.container.querySelector(
        '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="templates"]',
      )).toHaveAccessibleName('Hide template workflows');
      expect(corrupted.container.querySelector('[data-xgc-role="automation-view-toggle"]'))
        .toHaveAttribute('data-xgc-mode','folder');
      corrupted.unmount();
    } finally {
      if (scrollHeight) Object.defineProperty(HTMLElement.prototype,'scrollHeight',scrollHeight);
      else delete (HTMLElement.prototype as { scrollHeight?:number }).scrollHeight;
      if (clientHeight) Object.defineProperty(HTMLElement.prototype,'clientHeight',clientHeight);
      else delete (HTMLElement.prototype as { clientHeight?:number }).clientHeight;
    }
  });

  it('keeps MCP connection management out of the Automation list controls', async () => {
    const workspace = workspaceFixture();
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspace,
      catalog: [...workspace.catalog,{
        kind: 'mcp.tool.call',typeVersion: 1,label: 'Call MCP tool',category: 'MCP',traits: automationCatalogTraits('mcp.tool.call'),
        parameterSchema: { type: 'object',properties: {} },
      }],
    });

    const { container } = render(<AutomationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="mcp-connections-open"]')).toBeNull();
    await waitFor(() => expect(refreshMCPConnections).toHaveBeenCalledWith(expect.any(AbortSignal)));
  });

  it('does not let an incomplete empty-tags response black out the list', () => {
    const incomplete = documentFixture('automation-empty', 'New Automation', '');
    (incomplete.spec.metadata as unknown as { tags?: string[] }).tags = undefined;
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [incomplete] });

    const { container } = render(<AutomationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="automation-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-edit-tags"][data-xgc-id="automation-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-row"] .xgc-list-tag-row')).not.toBeEmptyDOMElement();
  });

  it('lets a user workflow add a catalog tag from the row without opening the editor', async () => {
    const commit = vi.fn().mockResolvedValue(documentFixture('automation-a', 'Mission A', 'indoor'));
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),commit });
    const { container } = render(<AutomationsPage targetId="local" />);
    const userRow = container.querySelector('[data-xgc-role="automation-definition-row"][data-xgc-id="automation-a"]')!;
    fireEvent.click(userRow.querySelector('[data-xgc-role="automation-edit-tags"][data-xgc-id="automation-a"]')!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'lab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ tags: ['lab'] }),
    }));
    expect(commit.mock.calls[0]?.[2]).toBe('Update Automation tags');
    expect(commit.mock.calls[0]?.[4]).toBe(false);
    await waitFor(() => expect(container.querySelector('[data-xgc-role="automation-tag-dialog"]')).toBeNull());
  });

  it('keeps the create action available in the empty flat catalog', () => {
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [] });
    const { container } = render(<AutomationsPage targetId="local" />);

    fireEvent.click(container.querySelector('[data-xgc-role="automation-view-toggle"]')!);
    const empty = container.querySelector<HTMLElement>('.xgc-list-empty')!;
    expect(empty).toHaveTextContent('No Automation definitions');
    expect(empty.querySelector('button')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'automation-definition-create-drawer');
  });

  it('groups protected definitions into fixed read-only roots while preserving Run controls', async () => {
    const system = documentFixture('automation-system', 'ROS Bag Recorder', 'indoor');
    system.head.system = true;
    const template = documentFixture('automation-template', 'Template workflow', 'flight');
    template.head.system = true;
    template.spec.metadata.tags = ['template'];
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [system,template] });

    const { container } = render(<AutomationsPage targetId="local" />);
    showProtectedWorkflows(container);
    const systemRow = container.querySelector<HTMLElement>('[data-xgc-role="automation-definition-row"][data-xgc-id="automation-system"]')!;
    const templateRow = container.querySelector<HTMLElement>('[data-xgc-role="automation-definition-row"][data-xgc-id="automation-template"]')!;

    expect(container.querySelector<HTMLElement>('[data-xgc-role="automation-folder"][data-xgc-id="system"]')).toContainElement(systemRow);
    expect(container.querySelector<HTMLElement>('[data-xgc-role="automation-folder"][data-xgc-id="templates"]')).toContainElement(templateRow);
    expect(systemRow).toHaveAttribute('data-xgc-protection', 'system');
    expect(templateRow).toHaveAttribute('data-xgc-protection', 'template');
    expect(systemRow).toHaveAttribute('data-xgc-readonly', 'true');
    expect(systemRow).not.toHaveAttribute('draggable');
    const systemMeta = systemRow.querySelector<HTMLElement>('[data-xgc-role="automation-definition-meta"][data-xgc-id="automation-system"]');
    const templateMeta = templateRow.querySelector<HTMLElement>('[data-xgc-role="automation-definition-meta"][data-xgc-id="automation-template"]');
    expect(systemMeta).toHaveTextContent('0 nodes');
    expect(systemMeta).not.toHaveTextContent('local');
    expect(templateMeta).not.toBeNull();
    expect(systemRow.querySelector('.automation-definition-row-actions')?.previousElementSibling).toBe(systemMeta);
    expect(templateRow.querySelector('.automation-definition-row-actions')?.previousElementSibling).toBe(templateMeta);
    expect(systemRow.querySelector('[data-xgc-role="automation-definition-archive"]')).toBeNull();
    expect(templateRow.querySelector('[data-xgc-role="automation-definition-archive"]')).toBeNull();
    expect(systemRow.querySelector('[data-xgc-role="automation-edit-tags"]')).toBeNull();
    expect(templateRow.querySelector('[data-xgc-role="automation-edit-tags"]')).toBeNull();
    expect(systemRow.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-system"]')).toHaveAttribute('data-xgc-state', 'idle');
    expect(templateRow.querySelector('[data-xgc-role="automation-run-open"]')).toHaveAttribute('data-xgc-state', 'idle');

    fireEvent.drop(container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="user"]')!, {
      dataTransfer: { getData: () => 'automation-system',dropEffect: 'move' },
    });
    expect(move).not.toHaveBeenCalled();

    fireEvent.click(templateRow.querySelector('[data-xgc-role="automation-run-open"]')!);
    await waitFor(() => expect(runDocument).toHaveBeenCalledWith(template, {}, undefined, undefined, 'run'));
  });

  it('duplicates a user workflow directly into the same folder', async () => {
    const { container } = render(<AutomationsPage targetId="local" />);

    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-duplicate"][data-xgc-id="automation-a"]')!);

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(duplicate).toHaveBeenCalledWith(expect.objectContaining({
      head: expect.objectContaining({ resourceId: 'automation-a',namespaceId: 'indoor' }),
    })));
  });

  it('uses a New-style user-folder drawer when duplicating a protected workflow', async () => {
    const system = documentFixture('automation-system', 'ROS data bridge and Lichtblick', 'indoor');
    system.head.system = true;
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [system] });
    const { container } = render(<AutomationsPage targetId="local" />);
    showProtectedWorkflows(container);

    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-duplicate"][data-xgc-id="automation-system"]')!);
    const dialog = screen.getByRole('dialog', { name: 'Duplicate Automation' });
    expect(dialog).toHaveAttribute('data-xgc-role', 'automation-definition-duplicate-drawer');
    expect(dialog.querySelector('.config-drawer-body')).toHaveClass('xgc-config-form', 'automation-page-duplicate-form');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('ROS data bridge and Lichtblick copy');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'User workflows / Indoor / Flight' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(duplicate).toHaveBeenCalledWith(system, 'flight', 'ROS data bridge and Lichtblick copy'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Duplicate Automation' })).toBeNull());
  });

  it('opens an unsaved blank Automation in the editor and creates it on first valid save', async () => {
    const onOpenDocument = vi.fn();
    const { container } = render(<AutomationsPage targetId="local" onOpenDocument={onOpenDocument} />);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-xgc-role', 'automation-definition-create-drawer');
    expect(dialog).not.toHaveTextContent('Typed definition for local');
    expect(within(dialog).getByLabelText('Name').parentElement).toHaveAttribute('data-xgc-control', 'input');
    expect(within(dialog).getByLabelText('Tags').parentElement).toHaveAttribute('data-xgc-control', 'input');
    expect(within(dialog).getByLabelText('Description').parentElement).toHaveAttribute('data-xgc-control', 'textarea');
    expect(within(dialog).getByLabelText('Name').parentElement?.querySelector('svg')).toBeNull();
    expect(dialog.querySelector('.segmented-control')).toBeNull();
    expect(dialog.querySelector('select')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-create-node-control"][data-xgc-id="new"]')).toBeNull();
    expect(dialog.querySelectorAll('.xgc-form-field')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mission C' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Typed mission' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'flight, test' } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create-submit"]')!);

    await waitFor(() => expect(container.querySelector(
      '[data-xgc-role="automation-definition-detail"][data-xgc-id="new"]',
    )).not.toBeNull());
    expect(create).not.toHaveBeenCalled();
    const props = pageMocks.workspaceProps.mock.lastCall?.[0] as AutomationDefinitionWorkspaceProps;
    expect(props.document.spec).toEqual(expect.objectContaining({
      metadata: { name: 'Mission C',description: 'Typed mission',tags: ['flight','test'] },
      targetPolicy: { mode: 'fixed',executionTargetId: 'local' },
      actions: [expect.objectContaining({ id: 'run',entryNodeId: 'manual' })],
      nodes: [expect.objectContaining({ id: 'manual',kind: 'trigger.manual',displayName: 'Manual start' })],
    }));

    const saveDraft = structuredClone(props.document.spec);
    await act(async () => {
      await props.authoring.onCommit(props.document, saveDraft, 'Update Automation definition');
    });

    expect(create).toHaveBeenCalledWith(undefined, expect.objectContaining({
      metadata: { name: 'Mission C',description: 'Typed mission',tags: ['flight','test'] },
      nodes: [expect.objectContaining({ kind: 'trigger.manual',displayName: 'Manual start' })],
    }));
    expect(onOpenDocument).toHaveBeenCalledWith('automation-c');
  });

  it('offers trigger kinds in the editor instead of requiring one in the New drawer', async () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);

    const dialog = screen.getByRole('dialog', { name: 'New' });
    expect(within(dialog).queryByRole('button', { name: 'Initial trigger' })).toBeNull();
    expect(dialog).not.toHaveTextContent('When called by Automation');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reusable mission' } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create-submit"]')!);

    await waitFor(() => expect(pageMocks.workspaceProps).toHaveBeenCalled());
    const props = pageMocks.workspaceProps.mock.lastCall?.[0] as AutomationDefinitionWorkspaceProps;
    expect(props.authoring.catalog.filter((entry) => entry.traits.includes('trigger')).map((entry) => entry.label)).toEqual([
      'Manual trigger',
      'Schedule trigger',
      'On form submission',
      'On chat message',
      'On webhook call',
      'When called by Automation',
    ]);
    expect(props.document.spec.nodes).toEqual([
      expect.objectContaining({ id: 'manual',kind: 'trigger.manual',displayName: 'Manual start' }),
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a folder from the same New drawer', async () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parent folder' }));
    // The select menu is portaled out of `container`; query the document for it.
    fireEvent.click(document.querySelector('[role="option"][data-xgc-id="new:indoor"]')!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hangar' } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-namespace-create-submit"]')!);
    await waitFor(() => expect(addNamespace).toHaveBeenCalledWith('Hangar', 'indoor'));
  });

  it('closes the shared New drawer from Cancel or the empty backdrop', () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-create"]')!);
    fireEvent.mouseDown(container.querySelector('.config-drawer-backdrop')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renames and archives empty folders and moves definitions by drag and drop', async () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    const indoor = container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="indoor"]')!;
    fireEvent.doubleClick(indoor.querySelector('.xgc-list-folder-title strong')!);
    const nameInput = indoor.querySelector('.xgc-list-folder-name-input input')!;
    fireEvent.change(nameInput, { target: { value: 'Lab' } });
    fireEvent.blur(nameInput);
    await waitFor(() => expect(renameNamespace).toHaveBeenCalledWith(expect.objectContaining({ namespaceId: 'indoor' }), 'Lab'));

    fireEvent.click(container.querySelector('[data-xgc-role="automation-folder-archive"][data-xgc-id="empty"]')!);
    expect(archiveNamespace).toHaveBeenCalledWith(expect.objectContaining({ namespaceId: 'empty' }));

    const flight = container.querySelector('[data-xgc-role="automation-folder"][data-xgc-id="flight"]')!;
    fireEvent.drop(flight, { dataTransfer: { getData: () => 'automation-a',dropEffect: 'move' } });
    await waitFor(() => expect(move).toHaveBeenCalledWith(expect.objectContaining({ head: expect.objectContaining({ resourceId: 'automation-a' }) }), 'flight'));
  });

  it('starts a parameterless Automation directly without a redundant confirmation', async () => {
    const { container } = render(<AutomationsPage targetId="local" />);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(runDocument).toHaveBeenCalledWith(expect.objectContaining({
      head: expect.objectContaining({ resourceId: 'automation-a' }),
      branch: expect.objectContaining({ name: 'main' }),
    }), {}, undefined, undefined, 'run'));
  });

  it('removes direct Run and Stop shortcuts from every event-driven workflow row', () => {
    const kinds = [
      'trigger.schedule',
      'trigger.form-submission',
      'trigger.chat-message',
      'trigger.webhook',
      'trigger.automation-call',
    ];
    const documents = kinds.map((kind, index) => {
      const document = documentFixture(`automation-event-${index}`, kind, 'indoor');
      document.spec.nodes[0] = { ...document.spec.nodes[0],kind };
      return document;
    });
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents });

    const { container } = render(<AutomationsPage targetId="local" />);

    for (const document of documents) {
      const row = container.querySelector(`[data-xgc-role="automation-definition-row"][data-xgc-id="${document.head.resourceId}"]`)!;
      expect(row.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
      expect(row.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
      expect(row.querySelector('[data-xgc-role="automation-run-stopping"]')).toBeNull();
    }
  });

  it('opens the parameter dialog only when the Automation declares an input', () => {
    const parameterized = documentFixture('automation-parameters', 'Parameterized', 'indoor');
    parameterized.spec.actions[0]!.inputSchema.fields = [{ name: 'mode',label: 'Mode',kind: 'string' }];
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [parameterized] });
    const { container } = render(<AutomationsPage targetId="local" />);

    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-parameters"]')!);

    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'automation-run-parameter-dialog');
    expect(runDocument).not.toHaveBeenCalled();
  });

  it('observes execution history for every workflow shown in the list', async () => {
    render(<AutomationsPage targetId="local" />);

    await waitFor(() => {
      expect(refreshExecutionHistory).toHaveBeenCalledWith('automation-a', expect.any(AbortSignal));
      expect(refreshExecutionHistory).toHaveBeenCalledWith('automation-b', expect.any(AbortSignal));
    });
  });

  it('does not poll active list Runs when the execution stream connects or disconnects', async () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(globalThis.document, 'visibilityState');
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true,value: 'hidden' });
    const activeRun = runSummaryFixture('automation-a', 'waiting', '2026-07-14T02:00:00Z', 'run-waiting');
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),runSummaries: [activeRun],executionStreamState: 'connected',
    });
    const { rerender } = render(<AutomationsPage targetId="local" />);
    await waitFor(() => expect(refreshExecutionHistory).toHaveBeenCalledTimes(2));

    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refreshExecutionHistory).toHaveBeenCalledTimes(2);

      vi.mocked(useAutomationWorkspace).mockReturnValue({
        ...workspaceFixture(),runSummaries: [activeRun],executionStreamState: 'disconnected',
      });
      rerender(<AutomationsPage targetId="local" />);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refreshExecutionHistory).toHaveBeenCalledTimes(2);

      Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true,value: 'visible' });
      fireEvent(globalThis.document, new Event('visibilitychange'));
      expect(refreshExecutionHistory).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refreshExecutionHistory).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
      if (originalVisibility) Object.defineProperty(globalThis.document, 'visibilityState', originalVisibility);
    }
  });

  it('turns the list Run control into Stop when the latest run is active', async () => {
    const activeRun = runSummaryFixture('automation-a', 'running', '2026-07-14T02:00:00Z', 'run-active');
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),runSummaries: [activeRun] });
    const { container } = render(<AutomationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')).toBeNull();
    const stopButton = container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-active"]')!;
    expect(stopButton).toHaveAttribute('data-xgc-state', 'running');
    expect(stopButton).toHaveAttribute('data-xgc-resource-id', 'automation-a');
    expect(stopButton).toHaveAttribute('data-xgc-status', 'running');

    fireEvent.click(stopButton);
    await waitFor(() => expect(stop).toHaveBeenCalledWith(activeRun));
    expect(runDocument).not.toHaveBeenCalled();
  });

  it('shows a disabled Stopping control for a latest run that is stopping', () => {
    const stoppingRun = runSummaryFixture('automation-a', 'stopping', '2026-07-14T02:00:00Z', 'run-stopping');
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),runSummaries: [stoppingRun] });
    const { container } = render(<AutomationsPage targetId="local" />);

    const stoppingButton = container.querySelector('[data-xgc-role="automation-run-stopping"][data-xgc-id="run-stopping"]')!;
    expect(stoppingButton).toBeDisabled();
    expect(stoppingButton).toHaveAttribute('data-xgc-state', 'stopping');
    expect(stoppingButton).toHaveAttribute('data-xgc-status', 'stopping');
  });

  it('uses the newest run status instead of an older active run', async () => {
    const document = documentFixture('automation-a', 'Parallel mission', 'indoor');
    const olderActiveRun = runSummaryFixture('automation-a', 'running', '2026-07-14T01:00:00Z', 'run-older-active');
    const latestCompletedRun = runSummaryFixture('automation-a', 'succeeded', '2026-07-14T02:00:00Z', 'run-latest-completed');
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),documents: [document],runSummaries: [olderActiveRun,latestCompletedRun],
    });
    const { container } = render(<AutomationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
    const runButton = container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!;
    expect(runButton).toHaveAttribute('data-xgc-run-id', 'run-latest-completed');
    expect(runButton).toHaveAttribute('data-xgc-status', 'succeeded');
    fireEvent.click(runButton);
    await waitFor(() => expect(runDocument).toHaveBeenCalledWith(document, {}, undefined, undefined, 'run'));
  });

  it('passes Automation choices to the workspace and opens a related run workflow', async () => {
    const selected = documentFixture('automation-a', 'Mission A', 'indoor');
    const documents = [selected,documentFixture('automation-b', 'Mission B', 'flight')];
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),selected,documents });
    const onOpenDocument = vi.fn();
    const nodeComposition = emptyAutomationNodeWebComposition();
    render(<AutomationsPage
      targetId="local"
      resourceId="automation-a"
      nodeComposition={nodeComposition}
      onOpenDocument={onOpenDocument}
    />);

    const props = pageMocks.workspaceProps.mock.lastCall?.[0] as {
      authoring: {
        automationDocuments: AutomationDocument[];
        nodeComposition: typeof nodeComposition;
      };
      execution: { onOpenRelatedRun: (run: typeof runFixture) => void };
    };
    expect(useAutomationWorkspace).toHaveBeenCalledWith('local', nodeComposition);
    // Catalog projection may filter; same host keeps the full local set by value.
    expect(props.authoring.automationDocuments).toEqual(documents);
    expect(props.authoring.nodeComposition).toBe(nodeComposition);
    await act(async () => {
      props.execution.onOpenRelatedRun({
        ...runFixture,id: 'run-child',automationResourceId: 'automation-b',
        sourceRef: { ...runFixture.sourceRef,resourceId: 'automation-b',commitId: 'automation-b-commit' },
      });
    });

    await waitFor(() => expect(open).toHaveBeenCalledWith('automation-b'));
    expect(onOpenDocument).toHaveBeenCalledWith('automation-b');
  });

  it('returns an authoritatively missing deep link to the Automation list', async () => {
    vi.mocked(useAutomationWorkspace).mockReturnValue({ ...workspaceFixture(),documents: [],documentsLoaded: true,selectionResourceId: 'missing',selectionNotFound: true });
    const onInvalidDocument = vi.fn();

    render(<AutomationsPage targetId="local" resourceId="missing" onInvalidDocument={onInvalidDocument} />);

    await waitFor(() => expect(onInvalidDocument).toHaveBeenCalledOnce());
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps a new exact document pending behind one wordless ring even when the cached catalog omits it', () => {
    const workspace = {
      ...workspaceFixture(),documents: [],documentsLoaded: true,
      selectionResourceId: 'previous-document',selectionLoading: false,
    };
    vi.mocked(useAutomationWorkspace).mockReturnValue(workspace);
    const onInvalidDocument = vi.fn();
    const { container,rerender } = render(<AutomationsPage targetId="local" resourceId="new-document" onInvalidDocument={onInvalidDocument} />);
    const pending = container.querySelector('[data-xgc-role="workspace-busy-overlay"][data-xgc-id="automation-document"]');
    expect(pending).toHaveAttribute('aria-label','Loading Automation');
    expect(pending).toHaveTextContent('');
    expect(container).not.toHaveTextContent('Loading Automation');
    expect(container).not.toHaveTextContent('Automation not found');
    expect(onInvalidDocument).not.toHaveBeenCalled();
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspace,selectionResourceId:'new-document',selected:documentFixture('new-document','New document',''),
    });
    rerender(<AutomationsPage targetId="local" resourceId="new-document" onInvalidDocument={onInvalidDocument} />);
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-detail"]')).toHaveAttribute('data-xgc-id','new-document');
    expect(onInvalidDocument).not.toHaveBeenCalled();
  });

  it('preserves a deep link while the authoritative Automation list is unavailable', () => {
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),documents: [],documentsLoaded: false,loading: false,error: 'Core unavailable',
    });
    const onInvalidDocument = vi.fn();

    const { container } = render(<AutomationsPage targetId="local" resourceId="automation-a" onInvalidDocument={onInvalidDocument} />);

    expect(onInvalidDocument).not.toHaveBeenCalled();
    expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local','Core unavailable',expect.objectContaining({ source: 'automation-definitions' }),
    );
    const state = container.querySelector('[data-xgc-role="automation-definition-loading"]')!;
    expect(state).toHaveTextContent('Automation unavailable');
    expect(state).not.toHaveTextContent('Automation not found');
    expect(state).not.toHaveTextContent('automation-a');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-retry"]')!);
    expect(open).toHaveBeenLastCalledWith('automation-a');
  });

  it('opens an exact Automation document when its independent catalog request failed', () => {
    const document = documentFixture('automation-a','Record the Experiment Session to a ROS bag','');
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),selected:document,documents:[],documentsLoaded:false,
      documentsError:'request timeout after 8000ms: /automations',error:'request timeout after 8000ms: /automations',
    });
    const { container } = render(<AutomationsPage targetId="local" resourceId="automation-a" />);
    expect(container.querySelector('[data-xgc-role="automation-definition-detail"][data-xgc-id="automation-a"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="automation-definition-loading"]')).toBeNull();
  });

  it('rejects an exact document outside the selected target without leaking its identifier', () => {
    const document = documentFixture('automation-a','Local only','');
    document.spec.targetPolicy = { mode:'fixed',executionTargetId:'local' };
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),selected:document,documents:[document],documentsLoaded:true,
    });
    const onInvalidDocument = vi.fn();
    const { container } = render(<AutomationsPage targetId="agent-b" resourceId="automation-a" onInvalidDocument={onInvalidDocument} />);
    expect(container.querySelector('[data-xgc-role="automation-definition-detail"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-loading"]')).not.toHaveTextContent('automation-a');
    expect(onInvalidDocument).toHaveBeenCalledOnce();
  });

  it('distinguishes a confirmed document 404 from an unavailable catalog', () => {
    vi.mocked(useAutomationWorkspace).mockReturnValue({
      ...workspaceFixture(),documents:[],documentsLoaded:false,selectionResourceId:'missing',selectionNotFound:true,
      selectionError:'404 Not Found',error:'404 Not Found',
    });
    const { container } = render(<AutomationsPage targetId="local" resourceId="missing" />);
    expect(container.querySelector('[data-xgc-role="automation-definition-loading"]')).toHaveTextContent('Automation not found');
    expect(container.querySelector('[data-xgc-role="automation-definition-retry"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-back"]')).toBeInTheDocument();
  });
});

function showProtectedWorkflows(container: HTMLElement) {
  const toggle = container.querySelector<HTMLElement>(
    '[data-xgc-role="automation-protected-visibility-toggle"][data-xgc-id="system"]',
  )!;
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(toggle);
}

function workspaceFixture(): ReturnType<typeof useAutomationWorkspace> {
  return {
    targetId: 'local',
    documentsError: '',documentsLoaded: true,documentsLoading: false,
    documents: [documentFixture('automation-a', 'Mission A', 'indoor'),documentFixture('automation-b', 'Mission B', 'flight')],
    namespacesError: '',namespacesLoaded: true,namespacesLoading: false,
    namespaces: [namespaceFixture('indoor', 'Indoor'),namespaceFixture('flight', 'Flight', 'indoor'),namespaceFixture('empty', 'Empty')],
    catalogError: '',catalogLoaded: true,catalogLoading: false,
    catalog: [
      { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'trigger.schedule',typeVersion: 1,label: 'Schedule trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.schedule'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'trigger.form-submission',typeVersion: 1,label: 'On form submission',category: 'Trigger',traits: automationCatalogTraits('trigger.form-submission'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'trigger.chat-message',typeVersion: 1,label: 'On chat message',category: 'Trigger',traits: automationCatalogTraits('trigger.chat-message'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'trigger.webhook',typeVersion: 1,label: 'On webhook call',category: 'Trigger',traits: automationCatalogTraits('trigger.webhook'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'trigger.automation-call',typeVersion: 1,label: 'When called by Automation',category: 'Trigger',traits: automationCatalogTraits('trigger.automation-call'),parameterSchema: { type: 'object',properties: {} } },
      { kind: 'automation.return',typeVersion: 1,label: 'Return from Automation',category: 'Automation',traits: automationCatalogTraits('automation.return'),parameterSchema: { type: 'object',properties: {} },outputPorts: [] },
      { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: { type: 'object',properties: {} } },
    ],
    runSummaries: [],historyEntries: [],historyComplete: true,historyUnavailableSources: [],hasMoreRuns: false,runsLoadingMore: false,
    retryingIngressEventIds: [],ingressRetryErrors: {},ingressTransitionLedgers: {},runDetailsById: {},executionStreamState: 'connected',
    activations: {},activationsError: '',activationsLoading: false,activationCredentials: {},testListeners: {},
    mcpConnections: [],mcpCatalogs: {},mcpConnectionsLoading: false,selected: null,selectionResourceId: 'automation-a',selectionError: '',selectionNotFound: false,selectionLoading: false,
    historyError: '',loading: false,error: '',
    refresh: vi.fn(),refreshExecutionHistory,loadMoreRuns: vi.fn(),setExecutionHistoryVisible: vi.fn(),retryExecutionIngress: vi.fn(),loadIngressTransitions: vi.fn(),loadMoreIngressTransitions: vi.fn(),refreshRun: vi.fn(),loadRun: vi.fn(),refreshMCPConnections,open,create,duplicate,commit: vi.fn(),archive: vi.fn(),restore: vi.fn(),
    activate: vi.fn(),deactivate: vi.fn(),dismissActivationCredential: vi.fn(),
    startTestListener: vi.fn(),cancelTestListener: vi.fn(),submitTestEvent: vi.fn(),runOnce: vi.fn(),
    saveMCPConnection: vi.fn(),removeMCPConnection: vi.fn(),discoverMCPCatalog: vi.fn(),
    move,addNamespace,renameNamespace,archiveNamespace,
    start: vi.fn(),runDocument,runBoundAutomation: vi.fn(),stop,stopRunSet: vi.fn(),cancel: vi.fn(),
    loadRunDetail: vi.fn(),retainRunDetail:vi.fn(() => vi.fn()),close: vi.fn(),
  };
}

const timestamp = '2026-07-14T00:00:00Z';
const runFixture = {
  id: 'run-1',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'opaque-runtime-projection',definitionVersion: 1,actionId:'run',actionVersion:1,definitionDigest: 'd'.repeat(64),
  executionModel: 'orchestration-occurrence-v1' as const,
  sourceKind: 'automation' as const,
  sourceRef: { domain: 'automation' as const,resourceId: 'automation-a',branch: 'main',commitId: 'automation-a-commit',version: 1,digest: 'd'.repeat(64) },
  status: 'running' as const,revision: 1,rootRunId: 'run-1',depth: 0,correlationId: 'run-1',parameters: {},admissionMode: 'limited' as const,admissionScope: 'root' as const,
  admissionKey: 'definition:definition-1',admissionLimit: 1,admissionOnConflict: 'queue' as const,
  acceptedAt: timestamp,createdAt: timestamp,startedAt: timestamp,updatedAt: timestamp,
};

function runSummaryFixture(
  automationResourceId: string,
  status: AutomationExecutionRunSummary['status'],
  createdAt: string,
  id: string,
): AutomationExecutionRunSummary {
  return {
    id,targetId: 'local',automationResourceId,definitionId: 'opaque-runtime-projection',definitionVersion: 1,actionId:'run',actionVersion:1,
    configDigest: 'c'.repeat(64),executionPlanDigest: 'e'.repeat(64),registryDigest: 'r'.repeat(64),
    definitionDigest: 'd'.repeat(64),executionModel: 'orchestration-occurrence-v1',
    sourceKind: 'automation',sourceRef: { domain: 'automation',resourceId: automationResourceId,branch: 'main',commitId: `${automationResourceId}-commit`,version: 1,digest: 'd'.repeat(64) },
    status,revision: 1,
    admissionMode: 'parallel',admissionScope: 'root',acceptedAt: createdAt,createdAt,updatedAt: createdAt,
  };
}

function namespaceFixture(namespaceId: string, name: string, parentNamespaceId?: string): AutomationNamespace {
  return { domain: 'automation',namespaceId,name,parentNamespaceId,revision: 1,createdAt: timestamp,updatedAt: timestamp };
}

function documentFixture(resourceId: string, name: string, namespaceId: string): AutomationDocument {
  const spec = newAutomationSpec(name);
  spec.nodes = [newAutomationNode('trigger.manual')];
  spec.nodes[0].id = 'start';
  spec.actions[0]!.entryNodeId = 'start';
  return {
    head: {
      domain: 'automation',resourceId,namespaceId,name,description: '',tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: 'a'.repeat(64),revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,headVersion: 1,revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
