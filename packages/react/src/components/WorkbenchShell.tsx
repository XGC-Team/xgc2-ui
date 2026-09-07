import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { XGC_BREAKPOINTS } from '../hooks/useMediaQuery';
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
  explorerOpen?: boolean;
  focusedPane?: 'editor' | 'explorer' | 'inspector';
  inspector?: ReactNode;
  inspectorSize?: WorkbenchPaneSize;
  inspectorOpen?: boolean;
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
  explorerOpen = true,
  focusedPane = 'editor',
  inspector,
  inspectorSize = 'default',
  inspectorOpen = true,
  statusBar,
  ...props
}: WorkbenchShellProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<'desktop' | 'compact' | 'mobile'>('desktop');
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = (width: number) => {
      if (width > 0) setViewport(width <= XGC_BREAKPOINTS.mobile ? 'mobile' : width <= XGC_BREAKPOINTS.compact ? 'compact' : 'desktop');
    };
    measure(host.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry) measure(entry.contentRect.width); });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const focus = focusedPane === 'inspector' && inspector && inspectorOpen ? 'inspector'
    : focusedPane === 'explorer' && explorer && explorerOpen ? 'explorer' : 'editor';
  const single = viewport === 'mobile' || (viewport === 'compact' && focus !== 'editor');
  const explorerVisible = Boolean(explorer && explorerOpen && (single ? focus === 'explorer' : true));
  const inspectorVisible = Boolean(inspector && inspectorOpen && (single ? focus === 'inspector' : viewport === 'desktop'));
  const editorVisible = !single || focus === 'editor';
  const activityVisible = Boolean(activityBar && !single);
  return (
    <div
      {...props}
      ref={hostRef}
      data-viewport={viewport}
      data-focused-pane={focus}
      data-single-pane={single ? 'true' : 'false'}
      className={classNames('xgc-workbench', className)}
      data-activity-bar={activityVisible ? 'present' : 'absent'}
      data-bottom-panel={bottomPanel && bottomPanelOpen ? 'present' : 'absent'}
      data-explorer={explorerVisible ? 'present' : 'absent'}
      data-explorer-size={explorerSize}
      data-inspector={inspectorVisible ? 'present' : 'absent'}
      data-inspector-size={inspectorSize}
    >
      {activityBar ? (
        <aside hidden={!activityVisible} inert={!activityVisible} className="xgc-workbench-activity" aria-label="Workspace activities">
          {activityBar}
        </aside>
      ) : null}
      {explorer ? (
        <aside hidden={!explorerVisible} inert={!explorerVisible} className="xgc-workbench-explorer">
          {explorer}
        </aside>
      ) : null}
      <section hidden={!editorVisible} inert={!editorVisible} className="xgc-workbench-editor">
        {editor}
      </section>
      {inspector ? (
        <aside hidden={!inspectorVisible} inert={!inspectorVisible} className="xgc-workbench-inspector">
          {inspector}
        </aside>
      ) : null}
      {bottomPanel ? (
        <section hidden={!bottomPanelOpen || !editorVisible} inert={!bottomPanelOpen || !editorVisible} className="xgc-workbench-bottom">
          {bottomPanel}
        </section>
      ) : null}
      {statusBar ? (
        <footer className="xgc-workbench-footer">
          {statusBar}
        </footer>
      ) : null}
    </div>
  );
}
