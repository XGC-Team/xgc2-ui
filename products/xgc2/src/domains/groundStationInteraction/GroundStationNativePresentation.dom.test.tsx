// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { NativeConversation } from '@xgc2/native-agent/react';
import { emptyStream } from '@xgc2/native-agent/state';

describe('shared native conversation embedding', () => {
  it('keeps one viewport owner while preserving the same native decision callback', () => {
    const state = emptyStream('session-a','codex');
    state.pending['request-a'] = { id: 'request-a',kind: 'permission',title: 'Read experiment logs',
      options: [{ id: 'decline',label: 'Decline',kind: 'reject' }],questions: [],submitted: false };
    const answer = vi.fn().mockResolvedValue(undefined);
    const view = render(<NativeConversation state={state} locale="en" onAnswer={answer} />);
    expect(view.container.querySelectorAll('[data-xgc-role="native-agent-conversation"]')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="native-agent-conversation"]')).toHaveAttribute('data-xgc-id','session-a');
    fireEvent.click(screen.getByRole('button',{ name: 'Decline' }));
    expect(answer).toHaveBeenCalledWith('request-a',{ optionId: 'decline' });
  });
});
