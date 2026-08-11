import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AudioCaptureControl,
  Button,
  ButtonLink,
  CodeBlock,
  DataTable,
  FormField,
  FormGroup,
  Input,
  Modal,
  Panel,
  ProductBrand,
  SegmentedControl,
  Select,
  StatCard,
  StatusBadge,
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
        <StatusBadge status="Running" />
        <StatusBadge status="Waiting" />
        <StatusBadge status="Failed" />
        <StatusBadge status="Custom" />
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
  const [skin, setSkin] = useState('light');
  const [captureState, setCaptureState] = useState<AudioCaptureState>('idle');
  return (
    <div className="xgc-gallery-form">
      <Topbar
        leading={<ProductBrand product="STT" mark="X" />}
        actions={<StatusBadge status="Ready">Engine ready</StatusBadge>}
      />
      <FormField label="Language">
        <Select value={language} onValueChange={setLanguage}>
          <option value="auto">Automatic</option>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
        </Select>
      </FormField>
      <FormGroup label="Appearance">
        <SegmentedControl
          ariaLabel="Appearance"
          value={skin}
          options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]}
          onValueChange={setSkin}
        />
      </FormGroup>
      <Panel title="Audio input" padding="none">
        <AudioCaptureControl
          state={captureState}
          actionLabel={captureState === 'recording' ? 'Stop recording' : 'Start recording'}
          onAction={() => setCaptureState(captureState === 'recording' ? 'idle' : 'recording')}
          onCancel={() => setCaptureState('idle')}
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
        <DataTable>
          <table>
            <thead><tr><th>Package</th><th>Version</th><th>Actions</th></tr></thead>
            <tbody><tr><td>libxgc2-control</td><td>1.4.0</td><td><ButtonLink href="#">Download</ButtonLink></td></tr></tbody>
          </table>
        </DataTable>
      </Panel>
      <CodeBlock terminal label="Install" content="sudo apt-get update\nsudo apt-get install libxgc2-control" />
    </div>
  ),
};
