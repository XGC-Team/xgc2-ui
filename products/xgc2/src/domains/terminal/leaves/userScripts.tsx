import { useState } from 'react';
import { EmptyState } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import {
  groupUsernodeAssetsForTerminal,
  UsernodeAssetsPage,
  type UsernodeTerminalScriptItem,
} from '../../usernode/usernodePublic';
import type { TerminalUserScriptsLeafProps } from '../terminalComposition';
import { TerminalSidebarGroup } from '../terminalSidebarGroup';
import type { LocalizedText } from '../../../shared/localization/localizedText';
import { terminalGroupLabel, useTerminalText } from '../terminalMessages';
import { useTerminalUserScripts } from '../useTerminalUserScripts';

/**
 * Product.UserScripts exclusive Terminal leaf: session rail + User scripts
 * subpage. Product roots that leave UserScripts unset must not import this module.
 */
export function TerminalUserScriptsLeaf({
  onInserted,
  onSendCommand,
  surface = 'rail',
  targetCoreId,
}: TerminalUserScriptsLeafProps) {
  const t = useTerminalText();
  const { items } = useTerminalUserScripts(targetCoreId, { enabled: true });
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const groups = groupUsernodeAssetsForTerminal(items);

  const rail = groups.length === 0 ? (
    <EmptyState
      appearance="plain"
      className="terminal-usernode-script-empty"
      data-xgc-id="usernode"
      data-xgc-role="terminal-usernode-script-empty"
      density="compact"
      title={t('No user scripts')}
    />
  ) : (
    <>
      {groups.map((group) => (
        <TerminalSidebarGroup
          collapsed={collapsedIds.includes(group.id)}
          id={group.id}
          key={group.id}
          onToggle={() => setCollapsedIds((current) => toggleCollapsed(current, group.id))}
          role="terminal-usernode-script-group"
          title={terminalGroupLabel(group.title, t)}
          toggleRole="terminal-usernode-script-group-toggle"
        >
          {group.items.map((item) => (
            <ScriptRailButton
              item={item}
              key={item.resourceId}
              onInserted={onInserted}
              onSendCommand={onSendCommand}
              t={t}
            />
          ))}
        </TerminalSidebarGroup>
      ))}
    </>
  );

  if (surface !== 'page') return rail;

  return (
    <div
      className="xgc-workspace-full-span"
      data-xgc-id="usernode"
      data-xgc-role="terminal-usernode-scripts-page"
    >
      <UsernodeAssetsPage />
    </div>
  );
}

function ScriptRailButton({
  item,
  onInserted,
  onSendCommand,
  t,
}: {
  item: UsernodeTerminalScriptItem;
  onInserted?: () => void;
  onSendCommand: (command: string) => void | Promise<void>;
  t: LocalizedText;
}) {
  return (
    <ControlButton
      appearance="ghost"
      aria-label={t('Insert {name} into the current terminal: {command}', { name: item.name, command: item.insertText })}
      className="terminal-sidebar-item terminal-usernode-script"
      dataXgcId={item.resourceId}
      dataXgcRole="terminal-usernode-script"
      onClick={() => {
        void Promise.resolve(onSendCommand(item.insertText)).then(() => onInserted?.());
      }}
      size="compact"
      title={`${item.name} · ${item.insertText}`}
    >
      <span className="terminal-usernode-script-copy">
        <span className="terminal-usernode-script-name">{item.name}</span>
        <span className="terminal-usernode-script-summary" data-xgc-role="terminal-script-command" data-xgc-id={item.resourceId}>{item.insertText}</span>
      </span>
    </ControlButton>
  );
}

function toggleCollapsed(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}
