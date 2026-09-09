// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ComposeCreateDrawer } from './ComposeCreateDrawer';
import { createComposeDraft } from './containerViewModel';

vi.mock('../automation/automationPublic', () => ({
  AutomationPathPicker: ({
    targetId,
    kind,
    onSelect,
    onClose,
  }: {
    targetId: string;
    kind: string;
    onSelect: (path: string) => void;
    onClose: () => void;
  }) => (
    <div data-xgc-role="automation-path-picker" data-xgc-id={`${targetId}:${kind}`}>
      <button type="button" onClick={() => onSelect('/home/operator/compose/demo')}>Pick dir</button>
      <button type="button" onClick={onClose}>Close path picker</button>
    </div>
  ),
}));

describe('ComposeCreateDrawer', () => {
  it('reuses InputActionControl and host directory picker for workdir', () => {
    const onDraftChange = vi.fn();
    const { container } = render(
      <ComposeCreateDrawer
        busy={false}
        draft={createComposeDraft()}
        targetId="agent-a"
        onDraftChange={onDraftChange}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    const workdir = container.querySelector('[data-xgc-role="container-compose-workdir"]');
    expect(workdir).toHaveClass('xgc-input-action-control');
    expect(screen.getByRole('textbox', { name: 'Workdir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse workdir' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse workdir' }));
    const picker = container.querySelector('[data-xgc-role="automation-path-picker"]');
    expect(picker).toHaveAttribute('data-xgc-id', 'agent-a:directory');

    fireEvent.click(screen.getByRole('button', { name: 'Pick dir' }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      path: '/home/operator/compose/demo',
    }));
    expect(container.querySelector('[data-xgc-role="automation-path-picker"]')).toBeNull();
  });

  it('keeps compose file as YAML content, not a file-path control', () => {
    render(
      <ComposeCreateDrawer
        busy={false}
        draft={createComposeDraft()}
        onDraftChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByText(/YAML content written as docker-compose.yml/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Browse compose/i })).not.toBeInTheDocument();
  });
});
