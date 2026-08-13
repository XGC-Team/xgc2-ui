import {
  useId,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';

export const WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR = '.xgc-workspace-panel-drag-handle';
export const WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR = '.xgc-workspace-panel-interactive, .xgc-workspace-panel-interactive *';
/** JS geometry companion to the shared `--size-header-panel` design token. */
export const WORKSPACE_PANEL_HEADER_HEIGHT_PX = 34;
const WORKSPACE_PANEL_INTERACTIVE_SELECTOR = [
  'a', 'button', 'input', 'select', 'textarea', 'summary',
  '[contenteditable="true"]',
  '[role="button"]', '[role="checkbox"]', '[role="combobox"]',
  '[role="link"]', '[role="menuitem"]', '[role="option"]',
  '[role="radio"]', '[role="slider"]', '[role="switch"]', '[role="tab"]',
  '[data-xgc-workspace-panel-interactive="true"]',
].join(',');

type DataAttributes = {
  [attribute: `data-${string}`]: string | number | boolean | undefined;
};

export type WorkspacePanelProps = Omit<HTMLAttributes<HTMLElement>, 'title' | 'onSelect'> & DataAttributes & {
  actions?: ReactNode;
  actionsClassName?: string;
  bodyClassName?: string;
  bodyLayout?: 'block' | 'column';
  bodyProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'> & DataAttributes;
  bodyScroll?: boolean;
  chrome?: 'framed' | 'seamed';
  editing?: boolean;
  headerClassName?: string;
  headerProps?: Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'> & DataAttributes;
  interactiveWhileEditing?: boolean;
  onSelect?: () => void;
  padding?: 'default' | 'none';
  selected?: boolean;
  selectLabel?: string;
  title?: ReactNode;
};

/**
 * Shared shell for draggable/resizable operator panels.
 *
 * It deliberately owns only panel chrome and edit interaction. Grid engines,
 * domain controls, permissions, and persistence remain in the consumer.
 */
export function WorkspacePanel({
  actions,
  actionsClassName,
  bodyClassName,
  bodyLayout = 'block',
  bodyProps,
  bodyScroll = false,
  children,
  chrome = 'framed',
  className,
  editing = false,
  headerClassName,
  headerProps,
  interactiveWhileEditing = false,
  onClick,
  onSelect,
  padding = 'none',
  selected = false,
  selectLabel = 'Select panel',
  title,
  ...props
}: WorkspacePanelProps) {
  const titleId = useId();
  const showSelected = editing && selected;
  const bodyInteractionLocked = editing && !interactiveWhileEditing;
  const heading = title ?? (editing && onSelect ? selectLabel : undefined);

  function selectFromPointer(event: MouseEvent<HTMLElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !editing) return;
    const target = event.target;
    if (target instanceof Element && target.closest(WORKSPACE_PANEL_INTERACTIVE_SELECTOR)) return;
    onSelect?.();
  }

  return (
    <article
      {...props}
      aria-labelledby={heading ? titleId : props['aria-labelledby']}
      className={classNames('xgc-workspace-panel', className)}
      data-chrome={chrome}
      data-editing={editing || undefined}
      data-interactive-while-editing={editing && interactiveWhileEditing || undefined}
      data-selected={showSelected || undefined}
      onClick={selectFromPointer}
    >
      <header
        {...headerProps}
        className={classNames(
          'xgc-workspace-panel-header',
          editing && 'xgc-workspace-panel-drag-handle',
          headerClassName,
        )}
      >
        {heading ? (
          <h2 className="xgc-workspace-panel-title" id={titleId}>
            {editing && onSelect ? (
              <button
                aria-pressed={showSelected}
                className="xgc-workspace-panel-select xgc-workspace-panel-interactive"
                onClick={onSelect}
                type="button"
              >
                {heading}
              </button>
            ) : heading}
          </h2>
        ) : null}
        <div className={classNames('xgc-workspace-panel-actions', 'xgc-workspace-panel-interactive', actionsClassName)}>{actions}</div>
      </header>
      <div
        {...bodyProps}
        aria-disabled={bodyInteractionLocked ? true : undefined}
        className={classNames('xgc-workspace-panel-body', bodyClassName)}
        data-layout={bodyLayout}
        data-padding={padding}
        data-scroll={bodyScroll || undefined}
        inert={bodyInteractionLocked ? true : undefined}
      >
        {children}
      </div>
    </article>
  );
}
