// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationChatPanel } from './GroundStationChatPanel';

describe('GroundStationChatPanel', () => {
  it('opens the empty global chat from the launcher without exposing a fake command channel', async () => {
    render(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={0}
      streamState="connected"
    />);

    const launcher = screen.getByRole('button', { name: 'Open ground station chat' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(launcher).toHaveAttribute('data-xgc-tone', 'primary');
    fireEvent.click(launcher);

    const panel = screen.getByRole('complementary', { name: 'Ground station chat' });
    expect(panel).toBeInTheDocument();
    await waitFor(() => expect(panel).toHaveFocus());
    expect(screen.getByRole('log', { name: 'Current ground station activity' })).toBeEmptyDOMElement();
    expect(panel.querySelector('[data-xgc-role="ground-station-chat-welcome"]')).toBeNull();
    expect(screen.queryByText('Ready for updates')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message the ground station' })).toBeNull();
    expect(panel.querySelector('[data-xgc-role="ground-station-chat-composer"]')).toBeNull();
    expect(panel.querySelector('[data-xgc-role="ground-station-chat-footer"]')).toBeNull();
    expect(screen.queryByText(/Activity only/)).toBeNull();
  });

  it('renders dashboard activity as an embedded panel without a launcher or collapse control', () => {
    render(<GroundStationChatPanel
      enabled
      presentation="panel"
      targetId="local"
      activityCount={0}
      streamState="connected"
    />);

    const panel = screen.getByRole('complementary', { name: 'Ground station chat' });
    expect(panel).toHaveAttribute('data-xgc-presentation', 'panel');
    expect(screen.queryByRole('button', { name: 'Open ground station chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close ground station chat' })).toBeNull();
    // Embedded in Experiment PanelFrame: no second chrome row (header or spacer).
    expect(panel.querySelector('.xgc-ground-station-chat-panel-header')).toBeNull();
    expect(panel.querySelector('.xgc-ground-station-chat-panel-spacer')).toBeNull();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByText('local')).toBeNull();
    expect(panel.querySelector('.xgc-empty-state-icon')).toBeNull();
    expect(screen.queryByText('Hello')).toBeNull();
    expect(panel.querySelector('[data-xgc-role="ground-station-chat-welcome"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message the ground station' })).toBeNull();
    expect(panel.querySelector('[data-xgc-role="ground-station-chat-composer"][data-xgc-id="local"]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(panel).toBeInTheDocument();
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    panel.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
  });

  it('keeps the local composer stable owner around the shared input', () => {
    render(<GroundStationChatPanel
      enabled
      presentation="panel"
      targetId="local"
      activityCount={0}
      streamState="connected"
      onSendMessage={vi.fn()}
    />);

    const footer = document.querySelector('[data-xgc-role="ground-station-chat-footer"]');
    const composer = footer?.querySelector<HTMLFormElement>(
      '[data-xgc-role="ground-station-chat-composer"][data-xgc-id="local"]',
    );
    if (!composer) throw new Error('local ground station composer is unavailable');

    expect(composer).toHaveAttribute('data-density', 'compact');
    expect(composer.querySelector('textarea')).toHaveClass('xgc-conversation-composer-input');
  });

  it.each(['connecting','replaying','disconnected'] as const)(
    'keeps transient %s stream commentary out of the composer',
    (streamState) => {
      render(<GroundStationChatPanel
        enabled
        presentation="panel"
        targetId="local"
        activityCount={0}
        streamState={streamState}
        onSendMessage={vi.fn()}
      />);
      const composer = document.querySelector(
        '[data-xgc-role="ground-station-chat-composer"][data-xgc-id="local"]',
      );
      expect(composer).not.toHaveTextContent(/Connecting|Replaying updates|Offline/);
      expect(document.querySelector('[data-xgc-role="ground-station-chat-panel"]'))
        .toHaveAttribute('data-xgc-stream-state',streamState);
    },
  );

  it('announces a same-count activity revision that arrives while collapsed', async () => {
    const { rerender } = render(<GroundStationChatPanel
      enabled
      targetId="agent-a"
      activityCount={1}
      activityVersion="status:mission:1"
      attentionSeverity="info"
      streamState="connected"
    ><article>Running</article></GroundStationChatPanel>);
    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat, 1 updates. New activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close ground station chat' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open ground station chat, 1 updates' })).toHaveFocus());

    rerender(<GroundStationChatPanel
      enabled
      targetId="agent-a"
      activityCount={1}
      activityVersion="status:mission:2"
      attentionSeverity="error"
      streamState="connected"
    ><article>Failed</article></GroundStationChatPanel>);

    const launcher = screen.getByRole('button', { name: 'Open ground station chat, 1 updates. New activity' });
    expect(launcher).toHaveAttribute('data-xgc-unread', 'true');
    expect(launcher).toHaveAttribute('data-xgc-severity', 'error');
  });

  it('does not close the panel when Escape is used by an IME composition', () => {
    render(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={1}
      activityVersion="message:1"
      streamState="connected"
    ><article>Update</article></GroundStationChatPanel>);
    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat, 1 updates. New activity' }));
    const panel = screen.getByRole('complementary', { name: 'Ground station chat' });

    fireEvent.keyDown(panel, { key: 'Escape',isComposing: true });

    expect(panel).toBeInTheDocument();
  });

  it('follows live updates only while the operator remains near the end of the feed', () => {
    const { rerender } = render(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={1}
      activityVersion="message:1"
      streamState="connected"
    ><article>First update</article></GroundStationChatPanel>);
    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat, 1 updates. New activity' }));
    const feed = screen.getByRole('log', { name: 'Current ground station activity' });
    Object.defineProperties(feed, {
      scrollHeight: { configurable: true,value: 600 },
      clientHeight: { configurable: true,value: 200 },
    });
    feed.scrollTop = 100;
    fireEvent.scroll(feed);

    rerender(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={1}
      activityVersion="message:2"
      streamState="connected"
    ><article>Second update</article></GroundStationChatPanel>);
    expect(feed.scrollTop).toBe(100);

    feed.scrollTop = 390;
    fireEvent.scroll(feed);
    rerender(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={1}
      activityVersion="message:3"
      streamState="connected"
    ><article>Third update</article></GroundStationChatPanel>);
    expect(feed.scrollTop).toBe(600);
  });

  it('keeps current activity in the launcher until the operator opens the compact feed', async () => {
    render(<GroundStationChatPanel
      enabled
      targetId="agent-a"
      activityCount={3}
      streamState="replaying"
    ><article>Three current updates</article></GroundStationChatPanel>);

    const launcher = screen.getByRole('button', { name: 'Open ground station chat, 3 updates' });
    expect(launcher).not.toHaveTextContent('3');
    fireEvent.click(launcher);
    expect(screen.getByRole('complementary', { name: 'Ground station chat' })).toHaveTextContent('Three current updates');
    fireEvent.click(screen.getByRole('button', { name: 'Close ground station chat' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open ground station chat, 3 updates' })).toHaveFocus());
  });

  it('sends trimmed messages on Enter while preserving Shift+Enter for a newline', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    render(<GroundStationChatPanel
      enabled
      targetId="agent-a"
      activityCount={0}
      streamState="connected"
      onSendMessage={onSendMessage}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat' }));
    const composer = screen.getByRole('textbox', { name: 'Message the ground station' });
    fireEvent.change(composer, { target: { value: '  report mission state  ' } });
    fireEvent.keyDown(composer, { key: 'Enter',shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith({
      targetId: 'agent-a',message: 'report mission state',
    }));
    await waitFor(() => expect(composer).toHaveValue(''));
    expect(screen.getByRole('log', { name: 'Current ground station activity' })).toBeEmptyDOMElement();
  });

  it('does not invent missing-activity helper copy from inventory transport failures', () => {
    render(<GroundStationChatPanel
      enabled
      presentation="panel"
      targetId="local"
      activityCount={0}
      streamState="connected"
      inventoryError="Recent activity is unavailable; current pending requests are available. request timeout after 8000ms: /execution-targets/local/ground-station-interactions?limit=256"
    />);
    expect(screen.queryByText(/Some activity may be missing/i)).toBeNull();
    expect(screen.queryByText(/Recent activity is unavailable/i)).toBeNull();
    expect(screen.queryByText(/request timeout after/i)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Message the ground station' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-chat-local-operator"]')).toBeNull();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('keeps a failed draft and renders the handler error', async () => {
    const onSendMessage = vi.fn().mockRejectedValue(new Error('Command gateway unavailable'));
    render(<GroundStationChatPanel
      enabled
      targetId="local"
      activityCount={0}
      streamState="disconnected"
      onSendMessage={onSendMessage}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat' }));
    expect(screen.queryByText('Offline')).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-chat-panel"]'))
      .toHaveAttribute('data-xgc-stream-state','disconnected');
    const composer = screen.getByRole('textbox', { name: 'Message the ground station' });
    fireEvent.change(composer, { target: { value: 'status' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Command gateway unavailable');
    expect(composer).toHaveValue('status');
  });

  it('invalidates a pending send when the target changes, even after returning to the same target id', async () => {
    const earlier = deferred<void>();
    const current = deferred<void>();
    const onSendMessage = vi.fn()
      .mockImplementationOnce(() => earlier.promise)
      .mockImplementationOnce(() => current.promise);
    const view = render(<GroundStationChatPanel
      enabled targetId="agent-a" activityCount={1} streamState="connected" onSendMessage={onSendMessage}
    ><article>Agent A</article></GroundStationChatPanel>);

    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat, 1 updates' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the ground station' }), {
      target: { value: 'old request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    view.rerender(<GroundStationChatPanel
      enabled targetId="agent-b" activityCount={1} streamState="connected" onSendMessage={onSendMessage}
    ><article>Agent B</article></GroundStationChatPanel>);
    view.rerender(<GroundStationChatPanel
      enabled targetId="agent-a" activityCount={1} streamState="connected" onSendMessage={onSendMessage}
    ><article>Agent A again</article></GroundStationChatPanel>);

    fireEvent.click(screen.getByRole('button', { name: 'Open ground station chat, 1 updates' }));
    const composer = screen.getByRole('textbox', { name: 'Message the ground station' });
    expect(composer).toBeEnabled();
    expect(composer).toHaveValue('');
    fireEvent.change(composer, { target: { value: 'current request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await act(async () => current.resolve());
    expect(composer).toHaveValue('');

    await act(async () => earlier.reject(new Error('stale send failed')));
    expect(screen.queryByText('stale send failed')).toBeNull();
    expect(composer).toHaveValue('');
  });

  it('keeps the new target draft when an earlier target send succeeds', async () => {
    const pending = deferred<void>();
    const onSendMessage = vi.fn(() => pending.promise);
    const view = render(<GroundStationChatPanel
      enabled presentation="panel" targetId="agent-a" activityCount={0} streamState="connected" onSendMessage={onSendMessage}
    />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the ground station' }), {
      target: { value: 'old request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('textbox', { name: 'Message the ground station' })).toHaveValue('old request');

    view.rerender(<GroundStationChatPanel
      enabled presentation="panel" targetId="agent-b" activityCount={0} streamState="connected" onSendMessage={onSendMessage}
    />);
    const composer = screen.getByRole('textbox', { name: 'Message the ground station' });
    expect(composer).toHaveValue('');
    fireEvent.change(composer, { target: { value: 'new target draft' } });
    await act(async () => pending.resolve());

    expect(composer).toHaveValue('new target draft');
    expect(composer).toBeEnabled();
    expect(screen.getByRole('log', { name: 'Current ground station activity' })).toBeEmptyDOMElement();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve,onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise,resolve,reject };
}
