import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationStream } from './ConversationStream';

describe('ConversationStream', () => {
  it('suspends follow-tail when the operator scrolls away and restores it on demand', () => {
    const onFollowingChange = vi.fn();
    render(
      <ConversationStream label="Agent conversation" onFollowingChange={onFollowingChange}>
        <p>First message</p>
        <p>Latest message</p>
      </ConversationStream>,
    );

    const viewport = screen.getByRole('log', { name: 'Agent conversation' });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });

    fireEvent.scroll(viewport);
    expect(onFollowingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /Jump to latest/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Jump to latest/i }));
    expect(onFollowingChange).toHaveBeenLastCalledWith(true);
  });
});
