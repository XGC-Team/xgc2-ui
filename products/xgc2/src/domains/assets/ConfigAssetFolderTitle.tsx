import { ChevronDown,ChevronRight,Folder } from 'lucide-react';
import { useRef,useState } from 'react';
import { InputControl } from '../../components/controls/TextControls';
import type { ConfigAssetNamespace } from './configAssetCatalog';

export function ConfigAssetFolderTitle<Namespace extends ConfigAssetNamespace>({
  title,
  itemCount,
  collapsed,
  namespace,
  titleClassName,
  renameLabel = 'Folder name',
  onRename,
}: {
  title: string;
  itemCount: number;
  collapsed: boolean;
  namespace?: Namespace;
  titleClassName?: string;
  renameLabel?: string;
  onRename?: (namespace: Namespace, name: string) => void;
}) {
  const [editing,setEditing] = useState(false);
  const [draft,setDraft] = useState('');
  const editingRef = useRef(false);

  function startRename() {
    if (!namespace || !onRename) return;
    editingRef.current = true;
    setDraft(namespace.name);
    setEditing(true);
  }

  function finishRename(commit: boolean) {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const name = draft.trim();
    if (commit && namespace && onRename && name && name !== namespace.name) onRename(namespace, name);
  }

  return (
    <>
      {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      <Folder size={15} />
      {editing && namespace ? (
        <InputControl
          className="xgc-list-folder-name-input"
          size="compact"
          aria-label={renameLabel}
          value={draft}
          autoFocus
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onChange={setDraft}
          onBlur={() => finishRename(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') finishRename(false);
          }}
        />
      ) : (
        <strong
          className={titleClassName}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename();
          }}
        >{title}</strong>
      )}
      <span>{itemCount}</span>
    </>
  );
}
