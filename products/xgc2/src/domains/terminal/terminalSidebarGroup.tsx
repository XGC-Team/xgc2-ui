import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';

export function TerminalSidebarGroup({
  children,
  collapsed,
  id,
  onToggle,
  role = 'terminal-sidebar-group',
  title,
  toggleRole = 'terminal-sidebar-group-toggle',
}: {
  children: ReactNode;
  collapsed: boolean;
  id?: string;
  onToggle: () => void;
  role?: string;
  title: string;
  toggleRole?: string;
}) {
  const groupId = id ?? title;
  return (
    <div className="terminal-sidebar-group" data-xgc-role={role} data-xgc-id={groupId}>
      <ControlButton
        appearance="ghost"
        aria-expanded={!collapsed}
        className="terminal-sidebar-group-title"
        dataXgcId={groupId}
        dataXgcRole={toggleRole}
        onClick={onToggle}
        size="compact"
      >
        <ChevronDown size={14} data-xgc-collapsed={collapsed ? 'true' : undefined} aria-hidden="true" />
        <strong>{title}</strong>
      </ControlButton>
      {!collapsed && children}
    </div>
  );
}
