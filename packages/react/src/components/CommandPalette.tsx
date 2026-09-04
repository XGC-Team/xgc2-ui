import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { classNames } from '../utils';
import { OverlayOwner, useOverlayStack } from './OverlayStack';
import './CommandPalette.css';

export type CommandPaletteCommand = {
  description?: ReactNode;
  disabled?: boolean;
  group?: string;
  icon?: ReactNode;
  id: string;
  keywords?: readonly string[];
  label: string;
  shortcut?: readonly string[];
};

export type CommandPaletteProps = {
  ariaLabel?: string;
  className?: string;
  commands: readonly CommandPaletteCommand[];
  emptyLabel?: ReactNode;
  maxResults?: number;
  onCommand: (command: CommandPaletteCommand) => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange?: (query: string) => void;
  open: boolean;
  placeholder?: string;
  query?: string;
};

type RankedCommand = {
  command: CommandPaletteCommand;
  score: number;
};

export function CommandPalette({
  ariaLabel = 'Command palette',
  className,
  commands,
  emptyLabel = 'No matching commands',
  maxResults = 80,
  onCommand,
  onOpenChange,
  onQueryChange,
  open,
  placeholder = 'Type a command or search…',
  query,
}: CommandPaletteProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolvedQuery = query ?? internalQuery;
  const filtered = useMemo(
    () => rankCommands(commands, resolvedQuery).slice(0, Math.max(1, maxResults)),
    [commands, maxResults, resolvedQuery],
  );
  const overlay = useOverlayStack({
    close: () => onOpenChange(false),
    open,
    rootRef: dialogRef,
  });
  const onDialogKeyDown = useDialogFocus({
    dialogId: overlay.overlayId,
    dialogRef,
    dismissible: true,
    open,
  });

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, resolvedQuery]);

  if (!open || typeof document === 'undefined') return null;

  const active = filtered[activeIndex]?.command;
  const updateQuery = (next: string) => {
    if (query === undefined) setInternalQuery(next);
    onQueryChange?.(next);
  };
  const execute = (command: CommandPaletteCommand | undefined) => {
    if (!command || command.disabled) return;
    onCommand(command);
    onOpenChange(false);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((current) => (
        (current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length
      ));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
      return;
    }
    if (event.key === 'Enter' && document.activeElement === inputRef.current) {
      event.preventDefault();
      execute(active);
      return;
    }
    onDialogKeyDown(event);
  };

  return createPortal(
    <div
      className="xgc-command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className={classNames('xgc-command-palette', className)}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <OverlayOwner id={overlay.overlayId}>
          <div className="xgc-command-palette-search">
            <svg aria-hidden="true" className="xgc-command-palette-search-icon" viewBox="0 0 20 20">
              <circle cx="8.5" cy="8.5" r="5.25" />
              <path d="m12.5 12.5 4 4" />
            </svg>
            <input
              aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
              aria-autocomplete="list"
              aria-controls={listId}
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              data-dialog-initial-focus
              onChange={(event) => updateQuery(event.currentTarget.value)}
              placeholder={placeholder}
              ref={inputRef}
              role="combobox"
              spellCheck={false}
              value={resolvedQuery}
            />
            {resolvedQuery ? (
              <button
                aria-label="Clear search"
                className="xgc-command-palette-clear"
                onClick={() => {
                  updateQuery('');
                  inputRef.current?.focus();
                }}
                type="button"
              >
                ×
              </button>
            ) : (
              <kbd className="xgc-command-palette-escape">Esc</kbd>
            )}
          </div>

          <div className="xgc-command-palette-results" id={listId} role="listbox">
            {filtered.length ? filtered.map(({ command }, index) => {
              const groupChanged = command.group !== filtered[index - 1]?.command.group;
              return (
                <div className="xgc-command-palette-entry" key={command.id}>
                  {groupChanged && command.group ? (
                    <div className="xgc-command-palette-group" role="presentation">{command.group}</div>
                  ) : null}
                  <button
                    aria-disabled={command.disabled || undefined}
                    aria-selected={index === activeIndex}
                    className="xgc-command-palette-item"
                    data-active={index === activeIndex || undefined}
                    disabled={command.disabled}
                    id={`${listId}-${command.id}`}
                    onClick={() => execute(command)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    {command.icon ? <span className="xgc-command-palette-icon" aria-hidden="true">{command.icon}</span> : null}
                    <span className="xgc-command-palette-copy">
                      <strong>{command.label}</strong>
                      {command.description ? <span>{command.description}</span> : null}
                    </span>
                    {command.shortcut?.length ? (
                      <span className="xgc-command-palette-shortcut" aria-label={`Shortcut ${command.shortcut.join(' ')}`}>
                        {command.shortcut.map((key) => <kbd key={key}>{key}</kbd>)}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            }) : (
              <div className="xgc-command-palette-empty">{emptyLabel}</div>
            )}
          </div>
        </OverlayOwner>
      </section>
    </div>,
    document.body,
  );
}

function rankCommands(commands: readonly CommandPaletteCommand[], query: string): RankedCommand[] {
  const needle = normalize(query);
  if (!needle) return commands.map((command, index) => ({ command, score: commands.length - index }));

  return commands.flatMap((command, index) => {
    const label = normalize(command.label);
    const haystack = normalize([
      command.label,
      typeof command.description === 'string' ? command.description : '',
      ...(command.keywords ?? []),
    ].join(' '));
    const score = rank(label, haystack, needle);
    return score < 0 ? [] : [{ command, score: score * 1000 - index }];
  }).sort((left, right) => right.score - left.score);
}

function rank(label: string, haystack: string, needle: string) {
  if (label === needle) return 100;
  if (label.startsWith(needle)) return 90 - Math.min(20, label.length - needle.length);
  const labelIndex = label.indexOf(needle);
  if (labelIndex >= 0) return 75 - Math.min(20, labelIndex);
  const haystackIndex = haystack.indexOf(needle);
  if (haystackIndex >= 0) return 55 - Math.min(20, haystackIndex);

  let score = 35;
  let searchFrom = 0;
  let previous = -2;
  for (const character of needle) {
    const next = haystack.indexOf(character, searchFrom);
    if (next < 0) return -1;
    if (next === previous + 1) score += 3;
    else score -= Math.min(2, next - searchFrom);
    previous = next;
    searchFrom = next + 1;
  }
  return score;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFKD');
}
