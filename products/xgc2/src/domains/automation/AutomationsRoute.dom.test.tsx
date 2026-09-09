// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AutomationsRoute } from './AutomationsRoute';
import { automationUserViewStorageKey } from './automationNavigation';

const routeMocks = vi.hoisted(() => ({ page: 'automations',pageProps: vi.fn() }));

vi.mock('../../app/navigationContext', () => ({
  useNavigation: () => ({ managedHostId: 'local',page: routeMocks.page }),
}));

vi.mock('../../app/useTargetCore', () => ({
  useTargetCore: () => ({ selectedTargetCore: undefined }),
}));

vi.mock('../execution/executionPublic', () => ({
  selectedExecutionTargetId: () => 'local',
}));

vi.mock('./AutomationsPage', () => ({
  AutomationsPage: (props: {
    resourceId?: string;
    onOpenDocument?: (resourceId: string) => void;
    onCloseDocument?: () => void;
    onInvalidDocument?: () => void;
  }) => {
    routeMocks.pageProps(props);
    return (
      <div data-xgc-role="automation-route-test-page">
        <button type="button" onClick={() => props.onOpenDocument?.('workflow-b')}>open</button>
        <button type="button" onClick={() => props.onCloseDocument?.()}>close</button>
        <button type="button" onClick={() => props.onInvalidDocument?.()}>invalid</button>
        <output data-xgc-role="automation-route-test-resource">{props.resourceId ?? ''}</output>
      </div>
    );
  },
}));

describe('AutomationsRoute user view state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.page = 'automations';
    window.localStorage.clear();
    window.history.replaceState(null,'','/#/automations/local/workflows');
  });

  it('does not restore a stored workflow when the hash is already the list', () => {
    const key = automationUserViewStorageKey('local','lastResourceId');
    window.localStorage.setItem(key,JSON.stringify('workflow-a'));

    const view = render(<AutomationsRoute />);
    expect(document.querySelector<HTMLOutputElement>('[data-xgc-role="automation-route-test-resource"]')?.textContent).toBe('');
    expect(window.localStorage.getItem(key)).toBeNull();
    view.unmount();
  });

  it('restores the last viewed workflow after a remount from an empty hash', () => {
    window.history.replaceState(null,'','/#/automations/local/workflows/workflow-a');
    const first = render(<AutomationsRoute />);
    expect(screen.getByText('workflow-a')).toBeInTheDocument();
    first.unmount();
    window.history.replaceState(null,'','/');

    const second = render(<AutomationsRoute />);
    expect(screen.getByText('workflow-a')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/automations/local/workflows/workflow-a');
    second.unmount();
  });

  it('forgets the last workflow after close so remount stays on the list', () => {
    const key = automationUserViewStorageKey('local','lastResourceId');
    const first = render(<AutomationsRoute />);
    fireEvent.click(screen.getByRole('button',{ name: 'open' }));
    expect(window.localStorage.getItem(key)).toBe(JSON.stringify('workflow-b'));
    fireEvent.click(screen.getByRole('button',{ name: 'close' }));
    expect(document.querySelector<HTMLOutputElement>('[data-xgc-role="automation-route-test-resource"]')?.textContent).toBe('');
    expect(window.localStorage.getItem(key)).toBeNull();
    first.unmount();
    window.history.replaceState(null,'','/');

    const second = render(<AutomationsRoute />);
    expect(document.querySelector<HTMLOutputElement>('[data-xgc-role="automation-route-test-resource"]')?.textContent).toBe('');
    second.unmount();
  });

  it('rejects malformed last workflow state and keeps target keys separate', () => {
    const localKey = automationUserViewStorageKey('local','lastResourceId');
    const agentKey = automationUserViewStorageKey('agent-b2','lastResourceId');
    window.localStorage.setItem(localKey,'not-json');
    window.localStorage.setItem(agentKey,JSON.stringify('agent-workflow'));

    const view = render(<AutomationsRoute />);
    expect(screen.getByRole('button',{ name: 'open' })).toBeInTheDocument();
    expect(window.localStorage.getItem(agentKey)).toBe(JSON.stringify('agent-workflow'));
    view.unmount();
  });

  it('keeps the last workflow while parked when another page writes the hash', () => {
    const view = render(<AutomationsRoute />);
    fireEvent.click(screen.getByRole('button',{ name: 'open' }));
    expect(screen.getByText('workflow-b')).toBeInTheDocument();

    routeMocks.page = 'experiment';
    view.rerender(<AutomationsRoute />);
    window.history.replaceState(null,'','/#/experiments/exp-1');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(screen.getByText('workflow-b')).toBeInTheDocument();

    routeMocks.page = 'automations';
    view.rerender(<AutomationsRoute />);
    expect(screen.getByText('workflow-b')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/automations/local/workflows/workflow-b');
    view.unmount();
  });

  it('keeps and restores the last workflow when sidebar navigation clears the hash', () => {
    const view = render(<AutomationsRoute />);
    fireEvent.click(screen.getByRole('button',{ name: 'open' }));
    expect(screen.getByText('workflow-b')).toBeInTheDocument();

    routeMocks.page = 'home';
    view.rerender(<AutomationsRoute />);
    window.history.replaceState(null,'','/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(screen.getByText('workflow-b')).toBeInTheDocument();

    routeMocks.page = 'automations';
    view.rerender(<AutomationsRoute />);
    window.history.replaceState(null,'','/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(screen.getByText('workflow-b')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/automations/local/workflows/workflow-b');
    view.unmount();
  });

  it('does not revive a closed workflow when returning from another page', () => {
    const view = render(<AutomationsRoute />);
    fireEvent.click(screen.getByRole('button',{ name: 'open' }));
    fireEvent.click(screen.getByRole('button',{ name: 'close' }));
    expect(document.querySelector<HTMLOutputElement>('[data-xgc-role="automation-route-test-resource"]')?.textContent).toBe('');

    routeMocks.page = 'experiment';
    view.rerender(<AutomationsRoute />);
    window.history.replaceState(null,'','/#/experiments/exp-1');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    routeMocks.page = 'automations';
    view.rerender(<AutomationsRoute />);
    expect(document.querySelector<HTMLOutputElement>('[data-xgc-role="automation-route-test-resource"]')?.textContent).toBe('');
    view.unmount();
  });
});
