import {
  Box,
  LayoutDashboard,
  List,
  Plus,
  Save,
  Search,
  Settings,
  Table2,
  Trash2,
} from 'lucide-react';
import { useState,type ReactNode } from 'react';
import { InputActionControl,useSkin } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,SearchControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { CheckboxControl,FormActions,FormField,SwitchControl } from '../../components/FormPrimitives';
import { Modal } from '../../components/Modal';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import { ResourceMetadataFields,type ResourceMetadataValue } from '../../components/ResourceMetadataFields';
import { SegmentedControl } from '../../components/SegmentedControl';
import './control-gallery.css';

type GallerySkin = 'dark' | 'light';
type GalleryOverlay = 'modal' | 'drawer' | null;

const selectOptions = [
  { value: 'local',label: 'Local core',group: 'Available' },
  { value: 'robot-a',label: 'Robot A',group: 'Available' },
  { value: 'offline',label: 'Offline host',group: 'Unavailable',disabled: true },
];

const segmentOptions = [
  { value: 'overview',label: 'Overview',icon: <LayoutDashboard size={13} /> },
  { value: 'details',label: 'Details',icon: <List size={13} /> },
  { value: 'disabled',label: 'Disabled',disabled: true },
] as const;

const panelViewItems = [
  { id: 'table',label: 'Table',icon: Table2 },
  { id: 'cards',label: 'Cards',icon: Box },
  { id: 'settings',label: 'Settings',icon: Settings },
] as const;

export function ControlGallery() {
  const [skin, setSkin] = useSkin({
    defaultSkin: readSkinFromQuery(),
    storageKey: 'xgc.control-gallery.skin',
  });
  const [overlay, setOverlay] = useState<GalleryOverlay>(null);
  const [search, setSearch] = useState('robot');
  const [input, setInput] = useState('local-core');
  const [notes, setNotes] = useState('Shared controls keep interaction and visual states consistent.');
  const [selection, setSelection] = useState('local');
  const [segment, setSegment] = useState<'overview' | 'details' | 'disabled'>('overview');
  const [panelView, setPanelView] = useState<'table' | 'cards' | 'settings'>('table');
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [metadata, setMetadata] = useState<ResourceMetadataValue>({
    name: 'inspection-run',
    description: 'Reusable metadata fields',
    tags: 'demo, shared-ui',
  });

  return (
    <>
      <main className="xgc-control-gallery" data-testid="control-gallery">
        <header className="xgc-control-gallery-header">
          <div>
            <span>Developer surface</span>
            <h1>XGC2 shared control gallery</h1>
            <p>Canonical controls, states, forms, navigation, and overlays.</p>
          </div>
          <div className="xgc-gallery-theme-controls" aria-label="Gallery theme">
            <ControlButton
              size="compact"
              aria-pressed={skin === 'dark'}
              dataXgcRole="gallery-theme-dark"
              dataXgcId="gallery-theme-dark"
              onClick={() => setSkin('dark')}
            >
              Dark
            </ControlButton>
            <ControlButton
              size="compact"
              aria-pressed={skin === 'light'}
              dataXgcRole="gallery-theme-light"
              dataXgcId="gallery-theme-light"
              onClick={() => setSkin('light')}
            >
              Light
            </ControlButton>
          </div>
        </header>

        <div className="xgc-control-gallery-grid">
          <GallerySection title="Buttons" description="Tone, size, icon, and disabled states.">
            <div className="xgc-gallery-button-row">
              <ControlButton dataXgcRole="gallery-button-default" dataXgcId="gallery-button-default">Default</ControlButton>
              <ControlButton tone="primary" dataXgcRole="gallery-button-primary" dataXgcId="gallery-button-primary"><Plus size={14} />Create</ControlButton>
              <ControlButton tone="success" dataXgcRole="gallery-button-success" dataXgcId="gallery-button-success"><Save size={14} />Save</ControlButton>
              <ControlButton tone="danger" dataXgcRole="gallery-button-danger" dataXgcId="gallery-button-danger"><Trash2 size={14} />Delete</ControlButton>
              <ControlButton size="compact" dataXgcRole="gallery-button-compact" dataXgcId="gallery-button-compact">Compact</ControlButton>
              <ControlButton iconOnly aria-label="Settings" dataXgcRole="gallery-button-icon" dataXgcId="gallery-button-icon"><Settings size={15} /></ControlButton>
              <ControlButton disabled dataXgcRole="gallery-button-disabled" dataXgcId="gallery-button-disabled">Disabled</ControlButton>
            </div>
          </GallerySection>

          <GallerySection title="Text controls" description="Inputs share density, focus, and disabled behavior.">
            <div className="xgc-gallery-field-stack">
              <InputControl value={input} aria-label="Core name" onChange={setInput} />
              <SearchControl value={search} placeholder="Search resources" onChange={setSearch} />
              <InputActionControl
                value="/workspace/config.yaml"
                readOnly
                actionLabel="Browse"
                actionIcon={<Search size={14} />}
                onAction={() => undefined}
              />
              <TextareaControl value={notes} aria-label="Notes" rows={3} onChange={setNotes} />
            </div>
          </GallerySection>

          <GallerySection title="Selection" description="Custom popups and boolean state controls.">
            <div className="xgc-gallery-field-stack">
              <SelectControl
                value={selection}
                options={selectOptions}
                ariaLabel="Execution target"
                dataXgcRole="gallery-target-select"
                dataXgcId="gallery-target-select"
                fill
                onChange={setSelection}
              />
              <SelectControl
                value=""
                options={selectOptions}
                placeholder="Choose a target"
                ariaLabel="Placeholder target"
                dataXgcRole="gallery-placeholder-select"
                dataXgcId="gallery-placeholder-select"
                fill
                onChange={() => undefined}
              />
              <CheckboxControl
                checked={checked}
                label="Include dependencies"
                description="Checkbox semantics with shared styling."
                onChange={setChecked}
              />
              <SwitchControl
                checked={enabled}
                label="Enable live updates"
                description="Switch semantics expose aria-checked."
                onChange={setEnabled}
              />
              <SwitchControl checked={false} label="Unavailable option" disabled onChange={() => undefined} />
            </div>
          </GallerySection>

          <GallerySection title="Navigation" description="One segmented owner and one panel-view owner.">
            <div className="xgc-gallery-field-stack">
              <SegmentedControl
                value={segment}
                options={segmentOptions}
                ariaLabel="Gallery section"
                onChange={setSegment}
              />
              <SegmentedControl
                value={segment}
                options={segmentOptions.slice(0, 2)}
                ariaLabel="Gallery tabs"
                variant="underline"
                asTabs
                onChange={setSegment}
              />
              <PanelViewSwitcher
                value={panelView}
                items={panelViewItems}
                ariaLabel="Panel presentation"
                onChange={setPanelView}
              />
            </div>
          </GallerySection>

          <GallerySection title="Form composition" description="Labels, help, validation, metadata, and actions.">
            <div className="xgc-gallery-form-example">
              <FormField label="Namespace" required description="Used as the resource prefix.">
                <InputControl value="xgc/demo" aria-label="Namespace" readOnly />
              </FormField>
              <FormField label="Validation example" error="A unique identifier is required.">
                <InputControl value="" aria-label="Validation example" aria-invalid="true" />
              </FormField>
              <ResourceMetadataFields
                value={metadata}
                rolePrefix="gallery-metadata"
                showDetails={false}
                onChange={setMetadata}
              />
              <FormActions className="xgc-gallery-form-actions" status="Draft saved">
                <ControlButton size="compact" dataXgcRole="gallery-form-cancel" dataXgcId="gallery-form-cancel">Cancel</ControlButton>
                <ControlButton size="compact" tone="primary" dataXgcRole="gallery-form-apply" dataXgcId="gallery-form-apply">Apply</ControlButton>
              </FormActions>
            </div>
          </GallerySection>

          <GallerySection title="Overlays" description="Shared focus handling, headers, actions, and dismiss behavior.">
            <div className="xgc-gallery-button-row">
              <ControlButton tone="primary" onClick={() => setOverlay('modal')} dataXgcRole="gallery-open-modal" dataXgcId="gallery-open-modal">Open modal</ControlButton>
              <ControlButton onClick={() => setOverlay('drawer')} dataXgcRole="gallery-open-drawer" dataXgcId="gallery-open-drawer">Open drawer</ControlButton>
            </div>
            <div className="xgc-gallery-overlay-notes">
              <span>Modal: centered, three sizes</span>
              <span>Drawer: shared shell and footer</span>
              <span>Both: trapped focus and Escape close</span>
            </div>
          </GallerySection>
        </div>
      </main>

      <Modal
        title="Create automation"
        description="A stable shared modal sample."
        open={overlay === 'modal'}
        onClose={() => setOverlay(null)}
        actions={(
          <>
            <ControlButton onClick={() => setOverlay(null)} dataXgcRole="gallery-modal-cancel" dataXgcId="gallery-modal-cancel">Cancel</ControlButton>
            <ControlButton tone="primary" onClick={() => setOverlay(null)} dataXgcRole="gallery-modal-create" dataXgcId="gallery-modal-create">Create</ControlButton>
          </>
        )}
      >
        <div className="xgc-gallery-overlay-form">
          <FormField label="Name" required htmlFor="gallery-modal-name">
            <InputControl id="gallery-modal-name" defaultValue="daily-inspection" />
          </FormField>
          <SwitchControl checked label="Run after creation" onChange={() => undefined} />
        </div>
      </Modal>

      <ConfigDrawer
        title="Robot settings"
        subtitle="robot-a"
        open={overlay === 'drawer'}
        onClose={() => setOverlay(null)}
        bodyClassName="xgc-config-form"
        footer={(
          <>
            <ControlButton onClick={() => setOverlay(null)} dataXgcRole="gallery-drawer-cancel" dataXgcId="gallery-drawer-cancel">Cancel</ControlButton>
            <ControlButton tone="primary" onClick={() => setOverlay(null)} dataXgcRole="gallery-drawer-save" dataXgcId="gallery-drawer-save">Save changes</ControlButton>
          </>
        )}
      >
        <FormField label="Display name" required htmlFor="gallery-drawer-name">
          <InputControl id="gallery-drawer-name" defaultValue="Inspection robot A" />
        </FormField>
        <FormField label="Description" htmlFor="gallery-drawer-description">
          <TextareaControl id="gallery-drawer-description" defaultValue="Shared drawer form example." />
        </FormField>
        <CheckboxControl checked label="Allow remote control" onChange={() => undefined} />
      </ConfigDrawer>
    </>
  );
}

function GallerySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="xgc-control-gallery-section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function readSkinFromQuery(): GallerySkin {
  return new URLSearchParams(window.location.search).get('skin') === 'light' ? 'light' : 'dark';
}
