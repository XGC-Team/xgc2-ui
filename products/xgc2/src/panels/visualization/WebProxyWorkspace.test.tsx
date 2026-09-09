// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { WebProxyWorkspace } from './WebProxyWorkspace';

vi.mock('../../api/http', () => ({
  request: vi.fn(),
}));

describe('WebProxyWorkspace', () => {
  it('shows a plain empty state when no URL is configured', () => {
    render(<WebProxyWorkspace panel={{
      id: 'web-proxy',
      pluginId: 'web-proxy',
      title: 'Field panel',
      gridPos: { x: 0, y: 0, w: 8, h: 6 },
      query: {},
      options: {},
      fieldConfig: {},
      portBindings: [],
    }} context={{ ports: { data: {}, actions: {} } } as never} />);
    expect(screen.getByText('No panel URL')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks the operator to fill a URL instead of pretending teleop :8100 is field-panel', () => {
    render(<WebProxyWorkspace panel={{
      id: 'web-proxy',
      pluginId: 'web-proxy',
      title: 'Field panel',
      gridPos: { x: 0, y: 0, w: 8, h: 6 },
      query: {},
      options: {},
      fieldConfig: {},
      portBindings: [],
    }} context={{ ports: { data: {}, actions: {} } } as never} />);
    expect(screen.getByText(/8099/)).toBeInTheDocument();
    expect(screen.queryByText(/8100/)).toBeNull();
  });
});
