import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AudioCaptureControl,
  Button,
  ButtonLink,
  Checkbox,
  CodeBlock,
  Drawer,
  EmptyState,
  FormField,
  FormGroup,
  Input,
  Inline,
  LogTablePage,
  Modal,
  Panel,
  ProgressBar,
  ResponsiveGrid,
  SegmentedControl,
  Select,
  SelectMenu,
  SortableDataTable,
  StatCard,
  Stack,
  StatusText,
  Switch,
  Tabs,
  Toolbar,
  Topbar,
  type AudioCaptureState,
} from '@xgc2/ui-react';

const meta = {
  title: 'Foundations/Components',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Controls: Story = {
  render: () => (
    <div className="xgc-gallery-form">
      <div className="xgc-gallery-stack">
        <Button>Default</Button>
        <Button tone="primary">Primary</Button>
        <Button tone="success">Success</Button>
        <Button tone="danger">Danger</Button>
        <Button appearance="ghost">Ghost</Button>
      </div>
      <label className="xgc-gallery-field">
        Robot name
        <Input placeholder="robot-01" unit="ID" />
      </label>
      <div className="xgc-gallery-stack">
        <StatusText status="Running" />
        <StatusText status="Waiting" />
        <StatusText status="Failed" />
        <StatusText status="Custom" />
      </div>
    </div>
  ),
};

export const Surface: Story = {
  render: () => (
    <Panel
      title="Speech service"
      description="Shared surface and action geometry"
      actions={<Button uiSize="compact">Configure</Button>}
    >
      Runtime content remains owned by the consuming product.
    </Panel>
  ),
};

function ModalExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="primary" onClick={() => setOpen(true)}>Open dialog</Button>
      <Modal
        open={open}
        title="Start workflow"
        description="Focus is trapped and restored by the shared component."
        onClose={() => setOpen(false)}
        actions={(
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button tone="primary" onClick={() => setOpen(false)}>Start</Button>
          </>
        )}
      >
        Confirm the selected target before starting.
      </Modal>
    </>
  );
}

export const Dialog: Story = {
  render: () => <ModalExample />,
};

function FormAndMediaExample() {
  const [language, setLanguage] = useState('zh');
  const [target, setTarget] = useState('lab');
  const [skin, setSkin] = useState('light');
  const [captureState, setCaptureState] = useState<AudioCaptureState>('idle');
  const [view, setView] = useState('live');
  return (
    <div className="xgc-gallery-form">
      <Topbar
        title="XGC2 STT"
        actions={<Button appearance="ghost" uiSize="compact">Settings</Button>}
      />
      <FormField label="Language">
        <Select value={language} onValueChange={setLanguage}>
          <option value="auto">Automatic</option>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
        </Select>
      </FormField>
      <FormField label="Execution target">
        <SelectMenu
          ariaLabel="Execution target"
          fill
          onValueChange={setTarget}
          options={[
            { group: 'Local', label: 'Development lab', value: 'lab' },
            { group: 'Remote', label: 'Robot A', value: 'robot-a' },
          ]}
          value={target}
        />
      </FormField>
      <FormGroup label="Appearance">
        <SegmentedControl
          ariaLabel="Appearance"
          value={skin}
          options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]}
          onValueChange={setSkin}
        />
      </FormGroup>
      <Checkbox label="Include timestamps" checked onCheckedChange={() => undefined} />
      <Switch label="Live updates" checked onCheckedChange={() => undefined} />
      <FormGroup label="View">
        <Tabs
          ariaLabel="Transcription view"
          value={view}
          options={[{ label: 'Live', value: 'live' }, { label: 'History', value: 'history' }]}
          onValueChange={setView}
        />
      </FormGroup>
      <Panel title="Audio input" padding="none">
        <AudioCaptureControl
          state={captureState}
          actionLabel={captureState === 'recording' ? 'Stop recording' : 'Start recording'}
          onAction={() => setCaptureState(captureState === 'recording' ? 'idle' : 'recording')}
          onCancel={() => setCaptureState('idle')}
          waveformLevels={captureState === 'recording' ? [0.04, 0.08, 0.16, 0.28, 0.42, 0.31, 0.18, 0.1] : []}
          waveformLabel="Audio input activity"
        />
      </Panel>
    </div>
  );
}

export const FormsAndAudio: Story = {
  render: () => <FormAndMediaExample />,
};

export const DataDisplay: Story = {
  render: () => (
    <div className="xgc-gallery-data">
      <div className="xgc-gallery-content-grid">
        <StatCard label="Packages" value="42" detail="focal, noble" />
        <StatCard label="Repository size" value="1.8 GB" detail="128 files" />
      </div>
      <Toolbar>
        <Input type="search" placeholder="Search packages" />
        <Select aria-label="Distribution" defaultValue="focal"><option>focal</option><option>noble</option></Select>
        <Button>Refresh</Button>
      </Toolbar>
      <Panel title="Packages" padding="none">
        <SortableDataTable
          columns={[
            { id: 'package', header: 'Package', sortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
            { id: 'version', header: 'Version', sortable: true, sortValue: (row) => row.version, cell: (row) => row.version },
            { id: 'actions', header: 'Actions', cell: () => <ButtonLink href="#">Download</ButtonLink> },
          ]}
          defaultSort={{ columnId: 'package', direction: 'ascending' }}
          rowKey={(row) => row.name}
          rows={[{ name: 'libxgc2-control', version: '1.4.0' }]}
          selection={{ selectedRowKeys: new Set(), onChange: () => undefined }}
        />
      </Panel>
      <CodeBlock terminal label="Install" language="shell" content="sudo apt-get update\nsudo apt-get install libxgc2-control" />
    </div>
  ),
};

export const Scrollbars: Story = {
  render: () => (
    <Panel title="Global scrollbar" description="Inherited by every scrollable product surface.">
      <div className="xgc-gallery-scroll-region" tabIndex={0}>
        {Array.from({ length: 18 }, (_, index) => (
          <div className="xgc-gallery-scroll-row" key={index}>Operator event {String(index + 1).padStart(2, '0')}</div>
        ))}
      </div>
    </Panel>
  ),
};

function OverlayExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <Drawer
        dirty
        discardChanges={['Language: Chinese → English']}
        footer={({ requestClose }) => <Button onClick={requestClose}>Cancel</Button>}
        onClose={() => setOpen(false)}
        open={open}
        title="Speech settings"
      >
        <FormField label="Language"><Select defaultValue="en"><option value="en">English</option></Select></FormField>
      </Drawer>
    </>
  );
}

export const LayoutFeedbackAndProgress: Story = {
  render: () => (
    <Stack gap="comfortable">
      <ResponsiveGrid>
        <Panel title="Transfer">
          <Stack gap="compact">
            <Inline justify="between"><span>Package upload</span><StatusText status="Running" /></Inline>
            <ProgressBar label="Package upload" max={100} percent={62} value={62} />
          </Stack>
        </Panel>
        <EmptyState appearance="plain" title="No pending jobs" />
      </ResponsiveGrid>
      <OverlayExample />
    </Stack>
  ),
};

export const OperationsLogTable: Story = {
  render: () => (
    <div className="xgc-gallery-log-page">
      <LogTablePage
        columns={[
          { id: 'time', title: 'Time', width: 'narrow', render: (row) => row.time },
          { id: 'message', title: 'Message', width: 'wide', render: (row) => row.message },
        ]}
        getRowId={(row) => row.id}
        onPage={() => undefined}
        onPageSize={() => undefined}
        onRefresh={() => undefined}
        page={1}
        pageSize={20}
        rows={[
          { id: '1', time: '10:42:12', message: 'Repository metadata refreshed' },
          { id: '2', time: '10:42:19', message: 'Worker connected' },
        ]}
        search={{ onChange: () => undefined, placeholder: 'Filter logs', value: '' }}
        title="Runtime logs"
        total={2}
      />
    </div>
  ),
};
