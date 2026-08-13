import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentActivity,
  ConversationComposer,
  ConversationMessage,
  ConversationRegion,
} from './Conversation';

describe('Conversation foundation', () => {
  it('exposes an accessible live log and speaker-aware message structure', () => {
    render(
      <ConversationRegion busy label="Agent conversation">
        <ConversationMessage
          author="Codex"
          avatar={<span>AI</span>}
          dateTime="2026-08-13T10:00:00Z"
          speaker="agent"
          timestamp="10:00"
        >
          <p>Analysis complete.</p>
        </ConversationMessage>
        <ConversationMessage speaker="operator"><p>Apply it.</p></ConversationMessage>
      </ConversationRegion>,
    );

    const log = screen.getByRole('log', { name: 'Agent conversation' });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-busy', 'true');
    const messages = log.querySelectorAll('.xgc-conversation-message');
    const agentMessage = messages.item(0);
    const operatorMessage = messages.item(1);
    expect(agentMessage).toHaveAttribute('data-speaker', 'agent');
    expect(agentMessage).toHaveAttribute('data-appearance', 'plain');
    expect(operatorMessage).toHaveAttribute('data-speaker', 'operator');
    expect(operatorMessage).toHaveAttribute('data-appearance', 'surface');
    expect(operatorMessage.querySelector('.xgc-visually-hidden')).toHaveTextContent('Operator');
    expect(operatorMessage.textContent?.indexOf('Operator')).toBeLessThan(operatorMessage.textContent?.indexOf('Apply it.') ?? 0);
    expect(screen.getByText('10:00').closest('time')).toHaveAttribute('dateTime', '2026-08-13T10:00:00Z');
  });

  it('submits trimmed input on Enter but preserves Shift+Enter and IME composition', () => {
    const onSubmitMessage = vi.fn();
    const onValueChange = vi.fn();
    render(
      <ConversationComposer
        label="Message composer"
        onSubmitMessage={onSubmitMessage}
        onValueChange={onValueChange}
        submitLabel="Send"
        value="  inspect the run  "
      />,
    );
    const textbox = screen.getByRole('textbox', { name: 'Message composer' });

    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(textbox, { key: 'Enter', isComposing: true });
    expect(onSubmitMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(onSubmitMessage).toHaveBeenCalledWith('inspect the run');
    fireEvent.change(textbox, { target: { value: 'next' } });
    expect(onValueChange).toHaveBeenCalledWith('next');
  });

  it('disables empty or busy submission and announces errors without decorated state chrome', () => {
    const onSubmitMessage = vi.fn();
    const { rerender } = render(
      <ConversationComposer
        error="Gateway unavailable"
        label="Message composer"
        onSubmitMessage={onSubmitMessage}
        onValueChange={() => undefined}
        supportingText="Enter submits; Shift+Enter adds a line."
        submitLabel="Send"
        value="   "
      />,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    const textbox = screen.getByRole('textbox', { name: 'Message composer' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Gateway unavailable');
    expect(textbox).toHaveAttribute('aria-errormessage', alert.id);
    expect(document.getElementById(textbox.getAttribute('aria-describedby')!)).toHaveTextContent('Shift+Enter');

    rerender(
      <ConversationComposer
        busy
        label="Message composer"
        onSubmitMessage={onSubmitMessage}
        onValueChange={() => undefined}
        submitLabel="Send"
        value="run"
      />,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('renders collapsible agent activity with undecorated status text', () => {
    render(
      <AgentActivity collapsible defaultOpen status="running" title="Shell">
        <pre>pnpm test</pre>
      </AgentActivity>,
    );

    const disclosure = screen.getByText('Shell').closest('details');
    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByText('running')).toHaveClass('xgc-status-text');
    expect(screen.getByText('pnpm test')).toBeVisible();
  });
});
