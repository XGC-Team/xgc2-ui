import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import type { ROSBagRecording } from '../../domains/recording/recordingPublic';
import { useAppLanguage } from '../../shared/localization/localizedText';
import {
  scientificGalleryBagCount,
  scientificGalleryBagFileName,
  scientificGalleryBagTree,
  type ScientificGalleryBagNode,
} from './scientificGalleryPanelModel';
import { useRuntimePanelText } from './runtimeMessages';
import { formatOperatorDateTime } from '../../shared/operatorTime';

export function ScientificGalleryBagTree({
  bags,
  panelId,
  selectedId,
  onSelect,
}:{
  bags: readonly ROSBagRecording[];
  panelId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const t = useRuntimePanelText();
  const language = useAppLanguage();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const folders = scientificGalleryBagTree(bags).map((folder) => (
    folder.id === 'data' ? { ...folder, title: t('Data files') } : folder
  ));

  return (
    <div
      className="scientific-gallery-bag-list"
      aria-label={t('Bag folders')}
      data-xgc-role="scientific-gallery-bag-list"
      data-xgc-id={panelId}
    >
      {folders.map((folder) => (
        <BagFolder
          key={folder.id}
          collapsed={collapsed}
          folder={folder}
          language={language}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggle={(id) => setCollapsed((current) => (
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
          ))}
        />
      ))}
    </div>
  );
}

function BagFolder({
  collapsed,
  folder,
  language,
  selectedId,
  onSelect,
  onToggle,
}:{
  collapsed: readonly string[];
  folder: ScientificGalleryBagNode<ROSBagRecording>;
  language: ReturnType<typeof useAppLanguage>;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const t = useRuntimePanelText();
  const isCollapsed = collapsed.includes(folder.id);
  return (
    <section
      className="xgc-list-folder scientific-gallery-bag-folder"
      data-xgc-role="scientific-gallery-bag-folder"
      data-xgc-id={folder.id}
      data-xgc-collapsed={isCollapsed || undefined}
    >
      <div className="xgc-list-folder-header">
        <ControlButton
          appearance="ghost"
          className="xgc-list-folder-title"
          type="button"
          aria-expanded={!isCollapsed}
          dataXgcRole="scientific-gallery-bag-folder-toggle"
          dataXgcId={folder.id}
          onClick={() => onToggle(folder.id)}
        >
          <FolderChevron collapsed={isCollapsed} />
          <strong
            className="scientific-gallery-bag-folder-title"
            data-xgc-role="scientific-gallery-bag-folder-title"
            data-xgc-id={folder.id}
          >{folder.title}</strong>
          <span data-xgc-role="scientific-gallery-bag-folder-count" data-xgc-id={folder.id}>
            {scientificGalleryBagCount(folder)}
          </span>
        </ControlButton>
      </div>
      {isCollapsed ? null : (
        <ul className="xgc-list-folder-items">
          {folder.bags.map((bag) => (
            <li key={bag.id}>
              <ControlButton
                appearance="ghost"
                type="button"
                className="scientific-gallery-bag-row"
                aria-pressed={bag.id === selectedId}
                dataXgcRole="scientific-gallery-bag-row"
                dataXgcId={bag.id}
                onClick={() => onSelect(bag.id)}
              >
                <span className="scientific-gallery-bag-main">
                  <span
                    className="scientific-gallery-bag-name"
                    data-xgc-role="scientific-gallery-bag-row-name"
                    data-xgc-id={bag.id}
                  >{scientificGalleryBagFileName(bag.name)}</span>
                  <span
                    className="scientific-gallery-bag-meta"
                    data-xgc-role="scientific-gallery-bag-row-meta"
                    data-xgc-id={bag.id}
                  >
                    <span>{bag.startedAt ? formatBagTimestamp(bag.startedAt, language) : t('Time unknown')}</span>
                    <span>{formatBagBytes(bag.size)}</span>
                  </span>
                </span>
              </ControlButton>
            </li>
          ))}
          {folder.folders.map((child) => (
            <li key={child.id}>
              <BagFolder
                collapsed={collapsed}
                folder={child}
                language={language}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FolderChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-xgc-collapsed={collapsed || undefined}
      fill="none"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function formatBagBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const rounded = exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

function formatBagTimestamp(iso: string, language: ReturnType<typeof useAppLanguage>) {
  return formatOperatorDateTime(iso, language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
