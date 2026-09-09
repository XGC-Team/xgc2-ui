// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { writeClipboardText } from '../../shared/utils/clipboard';
import {
  MARK_PROMPT_DOCK_STORAGE_KEY,
  writeMarkPromptDockVisible,
} from '../../shared/preferences/markPromptDockPreference';
import { MarkPromptDock } from './MarkPromptDock';
import { MarkPromptCommandError,listMarkPromptTargets,sendMarkPromptCommand } from './markPromptCommandService';
import type { DevAnnotation } from './markPromptHelpers';

vi.mock('../../shared/utils/clipboard', () => ({
  writeClipboardText: vi.fn(),
}));

vi.mock('./markPromptCommandService', () => ({
  MarkPromptCommandError: class MarkPromptCommandError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'MarkPromptCommandError';
      this.code = code;
    }
  },
  listMarkPromptTargets: vi.fn(),
  sendMarkPromptCommand: vi.fn(),
  MARK_PROMPT_DEFAULT_PANE_LABEL: 'xgc2_lead',
}));

const defaultTargets = [
  {
    paneId: 'workspace:primary',
    paneLabel: 'xgc2_lead',
    kind: 'codex',
    agentStatus: 'working' as const,
    primary: true,
  },
  {
    paneId: 'workspace:codex1',
    paneLabel: 'xgc2_codex1',
    kind: 'codex',
    agentStatus: 'idle' as const,
    primary: false,
  },
];

const annotation: DevAnnotation = {
  id: 'mark-1',
  page: 'Experiments',
  text: 'Refresh stopped state',
  selector: 'article:nth-of-type(1)',
  stableSelector: '[data-xgc-role="experiment-row"][data-xgc-id="exp-1"]',
  semanticPath: 'page=Experiments > role=experiment-row > id=exp-1',
  role: 'experiment-row',
  elementId: 'exp-1',
  elementLabel: 'Experiment one Running',
  elementTag: 'article',
  anchorX: 0.5,
  anchorY: 0.5,
  x: 100,
  y: 200,
};

describe('Mark Prompt toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', JSON.stringify([annotation]));
    vi.mocked(writeClipboardText).mockResolvedValue(undefined);
    vi.mocked(listMarkPromptTargets).mockResolvedValue(defaultTargets);
    vi.mocked(sendMarkPromptCommand).mockResolvedValue({
      schemaVersion: 'xgc.mark-prompt-command-receipt/v1',
      status: 'accepted',
      delivery: 'queued',
      target: {
        agent: 'codex',
        paneId: 'workspace:primary',
        tabId: 'workspace:tab',
        workspaceId: 'workspace',
        primary: true,
        visible: true,
      },
    });
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => []),
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true,value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true,value: 768 });
  });

  it('keeps direct Prompt delivery and an explicit copy fallback, without Agent Hub submit', async () => {
    render(<MarkPromptDock page="Experiments" />);
    const toolbar = document.querySelector('[data-xgc-role="mark-prompt-toolbar"]');
    const row = document.querySelector('.mark-prompt-toolbar-row');
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(row).toBeInstanceOf(HTMLElement);
    expect(toolbar).toContainElement(row as HTMLElement);
    const mark = screen.getByRole('button', { name: 'Mark' });
    const pane = await screen.findByRole('button', { name: 'Herdr pane' });
    const send = screen.getByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    const land = screen.getByRole('button', { name: 'Send land-and-reclaim prompt to xgc2_lead' });
    const copy = screen.getByRole('button', { name: 'Copy generated prompt' });
    expect(row).toContainElement(mark);
    expect(row).toContainElement(pane);
    expect(row).toContainElement(send);
    expect(row).toContainElement(copy);
    expect(row).toContainElement(land);
    expect(pane.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(send.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(copy.compareDocumentPosition(land) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(send).toHaveAttribute('data-xgc-icon-only','true');
    expect(send.textContent).toBe('');
    expect(land).toHaveAttribute('data-xgc-icon-only','true');
    expect(land).toHaveAttribute('data-xgc-role','mark-prompt-land');
    expect(land).toHaveAttribute('data-xgc-id','mark-prompt-land');
    expect(land.textContent).toBe('');
    expect(pane).toHaveTextContent('xgc2_lead');
    expect(screen.queryByRole('button', { name: 'Submit marks to Agent Hub' })).toBeNull();
    expect(screen.queryByText('Agent Hub')).toBeNull();
    expect(document.querySelector('.mark-prompt-submit-button')).toBeNull();
    expect(document.querySelector('[data-xgc-role="mark-prompt-robot-focus"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'FS150' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Scout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wheeltec' })).toBeNull();
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('Refresh stopped state'));
    expect(writeClipboardText).toHaveBeenCalledWith(expect.not.stringContaining('机器人焦点'));
  });

  it('sends the generated prompt to the typed current-primary bridge without a receipt caption', async () => {
    render(<MarkPromptDock page="Experiments" />);

    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send generated prompt to xgc2_lead' }));
    });

    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('Refresh stopped state'),
      'workspace:primary',
    );
    expect(document.querySelector('[data-xgc-role="mark-prompt-delivery-status"]')).toBeNull();
    expect(screen.queryByText(/visible primary/i)).toBeNull();
    expect(screen.queryByText(/queued/i)).toBeNull();
    expect(writeClipboardText).not.toHaveBeenCalled();
    const sent = screen.getByRole('button', { name: 'Sent generated prompt to xgc2_lead' });
    expect(sent.textContent).toBe('');
    expect(sent).toBeDisabled();
  });

  it('sends the generated prompt to the pane selected in the Herdr combobox', async () => {
    render(<MarkPromptDock page="Experiments" />);
    const pane = await screen.findByRole('button', { name: 'Herdr pane' });
    await waitFor(() => expect(pane).toBeEnabled());
    fireEvent.click(pane);
    fireEvent.click(await screen.findByRole('option', { name: 'xgc2_codex1' }));
    expect(pane).toHaveTextContent('xgc2_codex1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send generated prompt to xgc2_codex1' }));
    });

    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('Refresh stopped state'),
      'workspace:codex1',
    );
  });

  it('sends the canned land-and-reclaim prompt to the selected pane without marks or clearing annotations', async () => {
    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    const land = screen.getByRole('button', { name: 'Send land-and-reclaim prompt to xgc2_lead' });
    expect(land).toBeEnabled();

    await act(async () => {
      fireEvent.click(land);
    });

    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('用户授权落地'),
      'workspace:primary',
    );
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('回收所有工作者 worktree'),
      'workspace:primary',
    );
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('持续收敛'),
      'workspace:primary',
    );
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('该发车发车'),
      'workspace:primary',
    );
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('APT 发车仅在必要时'),
      'workspace:primary',
    );
    const sentPrompt = vi.mocked(sendMarkPromptCommand).mock.calls.at(-1)?.[0];
    expect(sentPrompt).not.toContain('Refresh stopped state');
    expect(sentPrompt).not.toContain('1. selector=');
    expect(screen.getByRole('button', { name: 'Sent land-and-reclaim prompt to xgc2_lead' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send generated prompt to xgc2_lead' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    expect(screen.getByDisplayValue('Refresh stopped state')).toBeInTheDocument();
  });

  it('sends the land-and-reclaim prompt even when there are no annotations', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    expect(screen.getByRole('button', { name: 'Send generated prompt to xgc2_lead' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send land-and-reclaim prompt to xgc2_lead' }));
    });
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('零兼容'),
      'workspace:primary',
    );
  });

  it('sends the land-and-reclaim prompt to the pane selected in the Herdr combobox', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    render(<MarkPromptDock page="Experiments" />);
    const pane = await screen.findByRole('button', { name: 'Herdr pane' });
    await waitFor(() => expect(pane).toBeEnabled());
    fireEvent.click(pane);
    fireEvent.click(await screen.findByRole('option', { name: 'xgc2_codex1' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send land-and-reclaim prompt to xgc2_codex1' }));
    });

    expect(sendMarkPromptCommand).toHaveBeenCalledWith(
      expect.stringContaining('用户授权落地'),
      'workspace:codex1',
    );
  });

  it('keeps annotations and the copy fallback when direct delivery returns a typed error', async () => {
    vi.mocked(sendMarkPromptCommand).mockRejectedValueOnce(new MarkPromptCommandError(
      'target-not-visible',
      'No focused Herdr workspace is visible.',
    ));
    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send generated prompt to xgc2_lead' }));
    });

    const send = screen.getByRole('button', { name: 'Retry sending generated prompt to xgc2_lead' });
    expect(document.querySelector('[data-xgc-role="mark-prompt-delivery-status"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(send).toHaveAttribute('aria-label','Retry sending generated prompt to xgc2_lead');
    expect(send.textContent).toBe('');
    expect(send).toHaveAttribute('title', 'No focused Herdr workspace is visible.');
    expect(screen.getByRole('button', { name: 'Copy generated prompt' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    expect(screen.getByDisplayValue('Refresh stopped state')).toBeInTheDocument();
  });

  it('keeps offline reasons and Copy while allowing the empty pane list to recover', async () => {
    const message = 'Herdr is not running. Copy remains available.';
    vi.mocked(listMarkPromptTargets).mockRejectedValueOnce(new MarkPromptCommandError('bridge-unavailable', message));
    render(<MarkPromptDock page="Experiments" />);

    const send = screen.getByRole('button', { name:'Send generated prompt to selected Herdr pane' });
    await waitFor(() => expect(send).toHaveAttribute('title', message));
    expect(send).toBeDisabled();
    expect(screen.getByRole('button', { name:'Send land-and-reclaim prompt to selected Herdr pane' })).toBeDisabled();
    expect(screen.getByRole('button', { name:'Copy generated prompt' })).toBeEnabled();
    expect(JSON.parse(window.localStorage.getItem('xgc.markPrompt.annotations.v1') ?? '[]')).toEqual([annotation]);

    const pane = screen.getByRole('button', { name:'Herdr pane' });
    expect(pane).toBeEnabled();
    fireEvent.click(pane);
    const recoveredSend = await screen.findByRole('button', { name:'Send generated prompt to xgc2_lead' });
    await waitFor(() => expect(recoveredSend).toBeEnabled());
    expect(recoveredSend).not.toHaveAttribute('title', message);
    expect(listMarkPromptTargets).toHaveBeenCalledTimes(2);
    expect(sendMarkPromptCommand).not.toHaveBeenCalled();
  });

  it('rediscovers Herdr across repeated focus and visibility changes without remounting', async () => {
    const offline = new MarkPromptCommandError('bridge-unavailable','Herdr is offline.');
    vi.mocked(listMarkPromptTargets)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(defaultTargets)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(defaultTargets);
    render(<MarkPromptDock page="Experiments" />);
    await waitFor(() => expect(document.querySelector('[data-xgc-role="mark-prompt-send"]')).toHaveAttribute('title','Herdr is offline.'));

    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByRole('button', { name:'Send generated prompt to xgc2_lead' })).toBeEnabled());
    fireEvent(document,new Event('visibilitychange'));
    await waitFor(() => expect(document.querySelector('[data-xgc-role="mark-prompt-send"]')).toBeDisabled());
    expect(screen.getByRole('button', { name:'Copy generated prompt' })).toBeEnabled();
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByRole('button', { name:'Send generated prompt to xgc2_lead' })).toBeEnabled());
    expect(listMarkPromptTargets).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole('button', { name:'Send generated prompt to xgc2_lead' }));
    await waitFor(() => expect(sendMarkPromptCommand).toHaveBeenCalledTimes(1));
    expect(sendMarkPromptCommand).toHaveBeenCalledWith(expect.stringContaining(annotation.text),'workspace:primary');
  });

  it('ignores late offline discovery after a newer online refresh and stops listening when hidden', async () => {
    let rejectInitial:(reason:unknown) => void = () => undefined;
    vi.mocked(listMarkPromptTargets).mockReturnValueOnce(new Promise((_resolve,reject) => { rejectInitial = reject; }));
    const { unmount } = render(<MarkPromptDock page="Experiments" />);
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByRole('button', { name:'Send generated prompt to xgc2_lead' })).toBeEnabled());
    await act(async() => rejectInitial(new MarkPromptCommandError('bridge-unavailable','Obsolete offline response.')));
    expect(screen.getByRole('button', { name:'Send generated prompt to xgc2_lead' })).toBeEnabled();
    expect(document.querySelector('[data-xgc-role="mark-prompt-toolbar"]')).not.toHaveAttribute('title');
    unmount();
    fireEvent.focus(window);
    fireEvent(document,new Event('visibilitychange'));
    expect(listMarkPromptTargets).toHaveBeenCalledTimes(2);
  });

  it('refreshes stale discovery after failed delivery without retrying or losing marks', async () => {
    vi.mocked(listMarkPromptTargets).mockResolvedValueOnce(defaultTargets)
      .mockRejectedValue(new MarkPromptCommandError('bridge-unavailable','Herdr stopped.'));
    vi.mocked(sendMarkPromptCommand).mockRejectedValue(new MarkPromptCommandError('bridge-unavailable','Delivery was not accepted.'));
    render(<MarkPromptDock page="Experiments" />);
    const send = await screen.findByRole('button', { name:'Send generated prompt to xgc2_lead' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    await waitFor(() => expect(document.querySelector('[data-xgc-role="mark-prompt-toolbar"]')).toHaveAttribute('title','Herdr stopped.'));
    expect(document.querySelector('[data-xgc-role="mark-prompt-send"]')).toBeDisabled();
    expect(sendMarkPromptCommand).toHaveBeenCalledTimes(1);
    expect(listMarkPromptTargets).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name:'Copy generated prompt' })).toBeEnabled();
    expect(JSON.parse(window.localStorage.getItem('xgc.markPrompt.annotations.v1') ?? '[]')).toEqual([annotation]);
  });

  it('sends a regular annotation prompt without a type field and does not start a pin drag from the change input', async () => {
    vi.mocked(sendMarkPromptCommand).mockRejectedValue(new MarkPromptCommandError(
      'target-not-visible',
      'Keep the annotation for inspection.',
    ));
    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    const change = screen.getByRole('textbox', { name: 'Mark change' });
    const layer = document.querySelector('.dev-annotation-layer');
    expect(layer).toBeInstanceOf(HTMLElement);
    expect(screen.queryByRole('combobox', { name: 'Mark intent' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="mark-prompt-type"]')).toBeNull();

    fireEvent.pointerDown(change, { button: 0,clientX: 100,clientY: 200 });
    fireEvent.pointerMove(layer as HTMLElement, { clientX: 500,clientY: 500 });
    fireEvent.change(change, { target: { value: 'Refresh stopped state' } });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('xgc.markPrompt.annotations.v1') ?? '[]') as DevAnnotation[];
      expect(stored[0]).toMatchObject({ text: 'Refresh stopped state',x: 100,y: 200 });
      expect(stored[0]).not.toHaveProperty('intent', 'layout');
    });

    await act(async () => {
      fireEvent.keyDown(change, { key: 'Enter' });
    });
    expect(sendMarkPromptCommand).toHaveBeenLastCalledWith(
      expect.stringContaining('1. selector='),
      'workspace:primary',
    );
    const lastPrompt = vi.mocked(sendMarkPromptCommand).mock.calls.at(-1)?.[0];
    expect(lastPrompt).not.toMatch(/\btype=/);
    expect(lastPrompt).toContain(
      '无实质知识变化则不机械写回',
    );
    expect(lastPrompt).toContain('若改动共享基础控件');
    expect(lastPrompt).toContain('禁止只改当前页面或 domain overlay 交差');
    expect(lastPrompt).toContain('必须发布匹配 tag 的 tarball');
    expect(lastPrompt).toContain('未发布的内核不算落地');
    expect(lastPrompt).toContain(
      '先判定本次标注是否属于事故',
    );
    expect(lastPrompt).toContain('已统一的输入控件皮以孤立默认残留');
    expect(lastPrompt).toContain('用户决策交互控件从操作者表面消失');
    expect(lastPrompt).toContain('可标注身份缺失导致细粒度选不中控件');
    expect(lastPrompt).toContain('页面/状态特有的控件与样式泄露到其他页');
    expect(lastPrompt).toContain('有 header 的 framed Panel 正文相对顶栏边距孤立');
    expect(lastPrompt).toContain('park 后 catalog 页丢掉离开时的列表/详情位置');
    expect(lastPrompt).toContain('用户已明确删除的执行控件反复回归且后果/目标说不清');
    expect(lastPrompt).toContain('临时插入不固定的显示内容造成操作面移位');
    expect(lastPrompt).toContain('有 header 的 framed Panel 正文相对顶栏边距孤立');
  });

  it('locks the deepest stable control across child hits and only selects the dashboard through explicit hierarchy keys', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    const dashboard = document.createElement('article');
    dashboard.setAttribute('data-xgc-role', 'experiment-dashboard-surface');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Select Scout');
    button.setAttribute('data-xgc-role', 'experiment-robot-assets-panel-robot-select');
    button.setAttribute('data-xgc-id', 'scout');
    const label = document.createElement('span');
    label.textContent = 'Scout';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    button.append(label,icon);
    dashboard.append(button);
    document.body.append(dashboard);
    dashboard.getBoundingClientRect = () => domRect(10,20,700,260);
    button.getBoundingClientRect = () => domRect(42,64,126,32);

    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    const layer = document.querySelector('.dev-annotation-layer');
    expect(layer).toBeInstanceOf(HTMLElement);
    vi.mocked(document.elementsFromPoint).mockReturnValue([layer as Element,label,button,dashboard]);

    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    fireEvent.pointerMove(layer as HTMLElement, { clientX: 60,clientY: 74 });

    const hover = document.querySelector('.dev-annotation-target-outline[data-mark-phase="hover"]');
    expect(hover).toHaveAttribute('data-mark-phase', 'hover');
    expect(hover).toHaveStyle({ left: '42px',top: '64px',width: '126px',height: '32px' });
    expect(hover).toHaveTextContent('[data-xgc-role="experiment-robot-assets-panel-robot-select"][data-xgc-id="scout"]');
    expect(hover).toHaveTextContent('1/2 · Alt+↑ parent');

    vi.mocked(document.elementsFromPoint).mockReturnValue([layer as Element,icon,button,dashboard]);
    fireEvent.pointerMove(layer as HTMLElement, { clientX: 61,clientY: 74 });
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="hover"]')).toBe(hover);
    expect(hover).toHaveStyle({ left: '42px',top: '64px',width: '126px',height: '32px' });

    fireEvent.keyDown(window, { key: 'ArrowUp',altKey: true });
    expect(hover).toHaveStyle({ left: '10px',top: '20px',width: '700px',height: '260px' });
    expect(hover).toHaveTextContent('[data-xgc-role="experiment-dashboard-surface"]');
    fireEvent.keyDown(window, { key: 'ArrowDown',altKey: true });
    expect(hover).toHaveStyle({ left: '42px',top: '64px',width: '126px',height: '32px' });

    fireEvent.pointerDown(layer as HTMLElement, { clientX: 60,clientY: 74,button: 0 });
    const selected = document.querySelector('.dev-annotation-target-outline[data-mark-phase="selected"]');
    expect(selected).toHaveAttribute('data-mark-phase', 'selected');
    expect(selected).toHaveStyle({ left: '42px',top: '64px',width: '126px',height: '32px' });
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="hover"]')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(layer).not.toHaveAttribute('data-xgc-enabled');
    expect(screen.getByRole('button', { name: 'Mark' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="selected"]')).toBeNull();
    dashboard.remove();
  });

  it('does not select page controls through an open drawer backdrop', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    const underlying = document.createElement('button');
    underlying.setAttribute('data-xgc-role', 'underlying-page-control');
    const backdrop = document.createElement('div');
    backdrop.className = 'xgc-drawer-backdrop';
    const dialog = document.createElement('aside');
    dialog.setAttribute('aria-modal', 'true');
    const drawerControl = document.createElement('button');
    drawerControl.setAttribute('data-xgc-role', 'drawer-control');
    drawerControl.getBoundingClientRect = () => domRect(700,20,120,30);
    dialog.append(drawerControl);
    backdrop.append(dialog);
    document.body.append(underlying,backdrop);

    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    const layer = document.querySelector('.dev-annotation-layer');
    expect(layer).toBeInstanceOf(HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    vi.mocked(document.elementsFromPoint).mockReturnValue([layer as Element,backdrop,underlying]);
    fireEvent.pointerMove(layer as HTMLElement, { clientX: 100,clientY: 100 });
    fireEvent.pointerDown(layer as HTMLElement, { clientX: 100,clientY: 100,button: 0 });
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="hover"]')).toBeNull();
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="selected"]')).toBeNull();

    vi.mocked(document.elementsFromPoint).mockReturnValue([
      layer as Element,drawerControl,dialog,backdrop,underlying,
    ]);
    fireEvent.pointerMove(layer as HTMLElement, { clientX: 720,clientY: 30 });
    expect(document.querySelector('.dev-annotation-target-outline[data-mark-phase="hover"]'))
      .toHaveTextContent('[data-xgc-role="drawer-control"]');

    backdrop.remove();
    underlying.remove();
  });

  it('keeps hover captions and pins inside the viewport at right, top, and bottom collisions', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    const host = document.createElement('div');
    const targets = [
      { id: 'right',rect: domRect(1000,100,24,30),point: { x: 1012,y: 115 },placement: 'above' },
      { id: 'top',rect: domRect(300,0,100,20),point: { x: 350,y: 5 },placement: 'below' },
      { id: 'bottom',rect: domRect(400,750,100,18),point: { x: 450,y: 760 },placement: 'above' },
    ].map((fixture) => {
      const target = document.createElement('button');
      target.setAttribute('data-xgc-role', 'edge-target');
      target.setAttribute('data-xgc-id', fixture.id);
      target.getBoundingClientRect = () => fixture.rect;
      host.append(target);
      return { ...fixture,target };
    });
    document.body.append(host);

    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    const layer = document.querySelector('.dev-annotation-layer');
    expect(layer).toBeInstanceOf(HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));

    for (const fixture of targets) {
      vi.mocked(document.elementsFromPoint).mockReturnValue([layer as Element,fixture.target]);
      fireEvent.pointerMove(layer as HTMLElement, { clientX: fixture.point.x,clientY: fixture.point.y });
      const caption = document.querySelector('.dev-annotation-target-caption');
      expect(caption).toHaveAttribute('data-caption-placement', fixture.placement);
      expectBoxInsideViewport(caption as HTMLElement, { width: 560,height: 22 });

      fireEvent.pointerDown(layer as HTMLElement, {
        button: 0,
        clientX: fixture.point.x,
        clientY: fixture.point.y,
      });
      const pin = document.querySelector('[data-xgc-role="mark-prompt-annotation-pin"]');
      expect(pin).toBeInstanceOf(HTMLElement);
      expectBoxInsideViewport(pin as HTMLElement, { width: 520,height: 30 });
      fireEvent.click(screen.getByRole('button', { name: 'Remove mark' }));
    }
    host.remove();
  });

  it('keeps the draggable toolbar inside a narrow viewport too', async () => {
    window.localStorage.setItem('xgc.markPrompt.annotations.v1', '[]');
    Object.defineProperty(window, 'innerWidth', { configurable: true,value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true,value: 200 });

    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });

    const toolbar = document.querySelector('.dev-annotation-toolbar');
    expect(toolbar).toBeInstanceOf(HTMLElement);
    expect(toolbar).toHaveStyle({
      left: '8px',
      top: '154px',
      maxWidth: '304px',
      maxHeight: '184px',
    });
  });

  it('hides the hover toolbar when the Tools preference is off', () => {
    window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, 'false');
    render(<MarkPromptDock page="Experiments" />);
    expect(document.querySelector('[data-xgc-role="mark-prompt-toolbar"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark' })).toBeNull();
  });

  it('unmounts a visible hover toolbar when the Tools preference turns off', async () => {
    render(<MarkPromptDock page="Experiments" />);
    await screen.findByRole('button', { name: 'Send generated prompt to xgc2_lead' });
    expect(document.querySelector('[data-xgc-role="mark-prompt-toolbar"]')).toBeInstanceOf(HTMLElement);
    act(() => {
      writeMarkPromptDockVisible(false);
    });
    expect(document.querySelector('[data-xgc-role="mark-prompt-toolbar"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark' })).toBeNull();
  });
});

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function expectBoxInsideViewport(element: HTMLElement, fallbackSize: { width: number;height: number }) {
  const left = Number.parseFloat(element.style.left);
  const top = Number.parseFloat(element.style.top);
  expect(left).toBeGreaterThanOrEqual(8);
  expect(top).toBeGreaterThanOrEqual(8);
  expect(left + fallbackSize.width).toBeLessThanOrEqual(window.innerWidth - 8);
  expect(top + fallbackSize.height).toBeLessThanOrEqual(window.innerHeight - 8);
}
