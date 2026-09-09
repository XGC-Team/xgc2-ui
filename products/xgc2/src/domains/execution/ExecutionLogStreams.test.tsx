// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ExecutionLogStreams } from './ExecutionLogStreams';
import { useExecutionLog } from './executionJobLogStore';

const mocks = vi.hoisted(() => ({
  refreshStdout: vi.fn(() => Promise.resolve()),
  refreshStderr: vi.fn(() => Promise.resolve()),
}));

vi.mock('./executionJobLogStore', () => ({
  useExecutionLog: vi.fn(({ stream }: { stream: 'stdout' | 'stderr' }) => stream === 'stdout'
    ? { content: 'normal output',loading: false,error: '',refresh: mocks.refreshStdout }
    : { content: 'diagnostic output',loading: false,error: 'stderr follow disconnected',refresh: mocks.refreshStderr }),
}));

describe('ExecutionLogStreams', () => {
  it('keeps stdout and stderr as separate target-scoped byte streams', () => {
    const { container } = render(<ExecutionLogStreams targetId="agent-a" entityType="process-instance" entityId="roscore-1" follow />);

    expect(useExecutionLog).toHaveBeenCalledWith({ targetId: 'agent-a',entityType: 'process-instance',entityId: 'roscore-1',stream: 'stdout',follow: true });
    expect(useExecutionLog).toHaveBeenCalledWith({ targetId: 'agent-a',entityType: 'process-instance',entityId: 'roscore-1',stream: 'stderr',follow: true });
    expect(container.querySelector('[data-xgc-id="roscore-1:stdout"]')).toHaveTextContent('normal output');
    expect(container.querySelector('[data-xgc-id="roscore-1:stdout"] strong')).toHaveTextContent('stdout');
    expect(container.querySelector('[data-xgc-id="roscore-1:stderr"]')).toHaveTextContent('diagnostic output');
    expect(screen.getByRole('alert')).toHaveTextContent('stderr follow disconnected');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mocks.refreshStdout).toHaveBeenCalledOnce();
    expect(mocks.refreshStderr).toHaveBeenCalledOnce();
  });

  it('shows output and errors as full-width pages when tabbed display is requested', () => {
    const { container } = render(<ExecutionLogStreams targetId="local" entityType="orchestration" entityId="run-a" follow displayMode="tabs" />);

    const tabs = screen.getByRole('tablist', { name: 'Log stream' });
    const output = screen.getByRole('tab', { name: 'Output' });
    const errors = screen.getByRole('tab', { name: 'Errors' });
    expect(tabs).toHaveAttribute('data-xgc-role', 'orchestration-log-stream-tabs');
    expect(output).toHaveAttribute('aria-selected', 'true');
    const stdoutPanel = container.querySelector('[data-xgc-role="orchestration-log-stream"][data-xgc-id="run-a:stdout"]');
    expect(stdoutPanel).toHaveTextContent('normal output');
    expect(stdoutPanel?.querySelector('strong')).toBeNull();
    expect(container.querySelector('[data-xgc-role="orchestration-log-stream"][data-xgc-id="run-a:stderr"]')).toBeNull();

    fireEvent.click(errors);
    expect(errors).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-xgc-role="orchestration-log-stream"][data-xgc-id="run-a:stdout"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="orchestration-log-stream"][data-xgc-id="run-a:stderr"]')).toHaveTextContent('diagnostic output');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', errors.id);
  });
});
