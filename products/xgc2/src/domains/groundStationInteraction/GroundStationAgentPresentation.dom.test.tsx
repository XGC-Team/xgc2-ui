// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AgentConversation } from '@xgc2/agent-runtime/react';
import { emptyStream } from '@xgc2/agent-runtime/state';

describe('shared native conversation embedding', () => {
  it('keeps one viewport owner while preserving the same native decision callback', () => {
    const state = emptyStream('session-a','codex');
    state.pending['request-a'] = { id: 'request-a',kind: 'permission',title: 'Read experiment logs',
      options: [{ id: 'decline',label: 'Decline',kind: 'reject' }],questions: [],submitted: false };
    const answer = vi.fn().mockResolvedValue(undefined);
    const view = render(<AgentConversation state={state} locale="en" onAnswer={answer} />);
    expect(view.container.querySelectorAll('[data-xgc-role="agent-conversation"]')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="agent-conversation"]')).toHaveAttribute('data-xgc-id','session-a');
    fireEvent.click(screen.getByRole('button',{ name: 'Decline' }));
    expect(answer).toHaveBeenCalledWith('request-a',{ optionId: 'decline' });
  });
});
