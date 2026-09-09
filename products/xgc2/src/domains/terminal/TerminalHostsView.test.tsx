// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { createEmptyTerminalHost } from './terminalCatalogModel';
import { TerminalHostsView } from './TerminalHostsView';

describe('TerminalHostsView host group admission',() => {
  it.each([
    ['',false],
    ['Default',false],
    [' Hosts ',false],
    ['Field\u200brobots',false],
    ['Field\u2028robots',false],
    ['\u0301',false],
    ['Hosts',true],
    ['Field robots',true],
    ['现场机器人',true],
  ])('requires an explicit canonical non-Default group %j', (group,valid) => {
    const onSave=vi.fn();
    const { container }=render(<TerminalHostsView
      hosts={[]} folders={[]} groups={['all']} query="" groupFilter="all" collapsedFolders={[]}
      draft={{ ...createEmptyTerminalHost(),group,address:'192.0.2.10' }} drawerOpen error=""
      busy={{ save:false,remove:false,move:false }}
      onQueryChange={vi.fn()} onGroupFilterChange={vi.fn()} onCollapsedFoldersChange={vi.fn()}
      onDraftChange={vi.fn()} onDrawerOpenChange={vi.fn()} onCreate={vi.fn()} onConnect={vi.fn()}
      onEdit={vi.fn()} onDelete={vi.fn()} onResetGroup={vi.fn()} onMove={vi.fn()} onSave={onSave}
    />);
    const input=container.querySelector<HTMLInputElement>('#terminal-host-group')!;
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('title','Use an explicit host group; Default is not allowed.');
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    expect(onSave).toHaveBeenCalledTimes(valid ? 1 : 0);
  });
});
