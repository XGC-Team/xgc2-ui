import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import './WorkbenchShell.css';

export type WorkbenchPaneSize = 'compact' | 'default' | 'wide';

export type WorkbenchShellProps = HTMLAttributes<HTMLDivElement> & {
  activityBar?: ReactNode;
  bottomPanel?: ReactNode;
  bottomPanelOpen?: boolean;
  editor: ReactNode;
  explorer?: ReactNode;
  explorerSize?: WorkbenchPaneSize;
  inspector?: ReactNode;
  inspectorSize?: WorkbenchPaneSize;
  statusBar?: ReactNode;
};

/**
 * Shared spatial frame for multi-resource XGC2 workspaces.
 *
 * This component owns only workbench geometry and responsive composition.
 * Products keep resource state, persistence, commands, transport and domain
 * semantics. Heavy editors such as Monaco or PDF.js are passed in through the
 * `editor` slot by their capability package.
 */
export function WorkbenchShell({
  activityBar,
  bottomPanel,
  bottomPanelOpen = Boolean(bottomPanel),
  className,
  editor,
  explorer,
  explorerSize = 'default',
  inspector,
  inspectorSize = 'default',
  statusBar,
  ...props
}: WorkbenchShellProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-workbench', className)}
      data-activity-bar={activityBar ? 'present' : 'absent'}
      data-bottom-panel={bottomPanel && bottomPanelOpen ? 'present' : 'absent'}
      data-explorer={explorer ? 'present' : 'absent'}
      data-explorer-size={explorerSize}
      data-inspector={inspector ? 'present' : 'absent'}
      data-inspector-size={inspectorSize}
    >
      {activityBar ? (
        <aside className="xgc-workbench-activity" aria-label="Workspace activities">
          {activityBar}
        </aside>
      ) : null}
      {explorer ? (
        <aside className="xgc-workbench-explorer">
          {explorer}
        </aside>
      ) : null}
      <section className="xgc-workbench-editor">
        {editor}
      </section>
      {inspector ? (
        <aside className="xgc-workbench-inspector">
          {inspector}
        </aside>
      ) : null}
      {bottomPanel && bottomPanelOpen ? (
        <section className="xgc-workbench-bottom">
          {bottomPanel}
        </section>
      ) : null}
      {statusBar ? (
        <footer className="xgc-workbench-status">
          {statusBar}
        </footer>
      ) : null}
    </div>
  );
}
