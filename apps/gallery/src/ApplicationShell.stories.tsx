import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AppShell,
  AppSidebar,
  Button,
  Panel,
  SidebarNav,
  SidebarNavItem,
  StatusBadge,
  Topbar,
} from '@xgc2/ui-react';

const meta = {
  title: 'Layout/Application Shell',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ShellExample() {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState('Overview');
  const sidebar = (
    <AppSidebar
      collapsed={collapsed}
      brandLabel="XGC2"
      brandMark="X"
      onCollapsedChange={setCollapsed}
    >
      <SidebarNav aria-label="Product navigation">
        {['Overview', 'Agents', 'Automations', 'Settings'].map((item, index) => (
          <SidebarNavItem
            key={item}
            active={page === item}
            icon={<span>{['⌂', '◎', '↯', '⚙'][index]}</span>}
            label={item}
            onSelect={() => setPage(item)}
          />
        ))}
      </SidebarNav>
    </AppSidebar>
  );
  const topbar = (
    <Topbar
      leading={<strong>{page}</strong>}
      actions={<Button tone="primary" uiSize="compact">Run</Button>}
    />
  );

  return (
    <div className="xgc-gallery-shell">
      <AppShell height="parent" sidebar={sidebar} topbar={topbar}>
        <div className="xgc-gallery-content-grid">
          <Panel title="Runtime">Shared shell content</Panel>
          <Panel title="Status"><StatusBadge status="Running" /></Panel>
        </div>
      </AppShell>
    </div>
  );
}

export const Default: Story = {
  render: () => <ShellExample />,
};
