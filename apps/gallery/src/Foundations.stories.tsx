import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AudioCaptureControl,
  ActionMenu,
  AgentActivity,
  Button,
  ButtonLink,
  Checkbox,
  ChoiceCardGroup,
  CodeBlock,
  ColorControl,
  ComposableWorkspace,
  ConversationComposer,
  ConversationMessage,
  ConversationRegion,
  ConfigSection,
  Disclosure,
  Drawer,
  EmptyState,
  FormField,
  FormGroup,
  FormSection,
  FormSectionSpan,
  Input,
  InputActionControl,
  Inline,
  LogTablePage,
  Modal,
  MarkdownContent,
  Notice,
  Panel,
  ProgressBar,
  ResponsiveGrid,
  SegmentedControl,
  Select,
  SelectMenu,
  SelectableList,
  SelectableListItem,
  SortableDataTable,
  StatCard,
  Stack,
  StatusText,
  Switch,
  Tabs,
  Toolbar,
  Topbar,
  Vector3Control,
  WorkspacePanel,
  WorkspaceTabs,
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

type WorkspaceGalleryItem = {
  id: string;
  title: string;
  position: { x: number; y: number; w: number; h: number };
};

function ComposableWorkspaceExample() {
  const items: WorkspaceGalleryItem[] = [
    { id: 'telemetry', title: 'Telemetry', position: { x: 0, y: 0, w: 7, h: 3 } },
    { id: 'camera', title: 'Camera', position: { x: 7, y: 0, w: 5, h: 3 } },
  ];
  return (
    <div className="xgc-gallery-workspace">
      <ComposableWorkspace
        columns={12}
        editing
        gap={[8, 8]}
        grid="editing"
        getConstraints={() => ({ minW: 3, minH: 2 })}
        getItemId={(item) => item.id}
        getPosition={(item) => item.position}
        items={items}
        onLayoutCommit={() => undefined}
        renderItem={(item) => (
          <WorkspacePanel
            actions={<Button appearance="ghost" uiSize="compact">Configure</Button>}
            editing
            title={item.title}
          >
            <div className="xgc-gallery-workspace-panel-body">Product-owned content</div>
          </WorkspacePanel>
        )}
        renderLayout={({ children, className }) => <div className={className}>{children}</div>}
        rowHeight={40}
      />
    </div>
  );
}

export const ComposablePanelWorkspace: Story = {
  render: () => <ComposableWorkspaceExample />,
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

function RichControlsExample() {
  const [color, setColor] = useState('#315fdc');
  const [layout, setLayout] = useState('single');
  return (
    <div className="xgc-gallery-form">
      <FormField label="Marker color">
        <ColorControl ariaLabel="Marker color" onChange={setColor} value={color} />
      </FormField>
      <FormGroup label="Initial layout">
        <ChoiceCardGroup
          ariaLabel="Initial layout"
          onValueChange={setLayout}
          options={[
            { value: 'single', label: 'Single', content: <span>One workspace</span> },
            { value: 'split', label: 'Split', content: <span>Two workspaces</span> },
          ]}
          value={layout}
        />
      </FormGroup>
      <ConfigSection title="Advanced settings">
        <FormField label="Namespace"><Input value="/robot" readOnly /></FormField>
      </ConfigSection>
      <FormSection title="World pose">
        <FormField label="Position">
          <Vector3Control
            axes={[
              { label: 'X', value: 0 },
              { label: 'Y', value: 0 },
              { label: 'Z', value: 1 },
            ]}
            onValueChange={() => undefined}
            unit="m"
          />
        </FormField>
        <FormField label="World file">
          <InputActionControl actionLabel="Browse" onAction={() => undefined} value="/worlds/empty.world" />
        </FormField>
        <FormSectionSpan>
          <Disclosure summary="Advanced launch settings">Product-owned fields belong here.</Disclosure>
        </FormSectionSpan>
      </FormSection>
    </div>
  );
}

export const RichControls: Story = {
  render: () => <RichControlsExample />,
};

function WorkspaceTabsExample() {
  const [tabs, setTabs] = useState([
    { id: 'gcs', label: 'GCS' },
    { id: 'operations', label: 'Operations' },
    { id: 'analysis', label: 'Analysis' },
  ]);
  const [active, setActive] = useState('gcs');
  return (
    <WorkspaceTabs
      ariaLabel="Experiment dashboards"
      createLabel="Add dashboard"
      deleteLabel={(item) => `Delete dashboard ${item.label}`}
      items={tabs}
      onCreate={() => {
        const id = `dashboard-${tabs.length + 1}`;
        setTabs((current) => [...current, { id, label: `Dashboard ${current.length + 1}` }]);
        setActive(id);
      }}
      onDelete={(id) => {
        const next = tabs.filter((item) => item.id !== id);
        setTabs(next);
        if (active === id && next[0]) setActive(next[0].id);
      }}
      onRename={(id, label) => setTabs((current) => current.map((item) => item.id === id ? { ...item, label } : item))}
      onReorder={(orderedIds) => setTabs(orderedIds.map((id) => tabs.find((item) => item.id === id)!))}
      onValueChange={setActive}
      value={active}
    />
  );
}

export const EditableWorkspaceTabs: Story = {
  render: () => <div className="xgc-gallery-form"><WorkspaceTabsExample /></div>,
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

function SharedContentExample() {
  const [selected, setSelected] = useState('one');
  return (
    <div className="xgc-gallery-data">
      <SelectableList aria-label="Documents">
        <SelectableListItem onClick={() => setSelected('one')} selected={selected === 'one'} title="Control paper" description="Markdown" />
        <SelectableListItem onClick={() => setSelected('two')} selected={selected === 'two'} title="Experiment notes" description="Markdown" />
      </SelectableList>
      <ActionMenu
        ariaLabel="Document actions"
        items={[
          { id: 'copy', label: 'Copy link', onSelect: () => undefined },
          { id: 'delete', label: 'Delete', onSelect: () => undefined, tone: 'danger' },
        ]}
        trigger="⋯"
      />
      <MarkdownContent source={'## Evidence\n\nUse the shared code surface:\n\n```bash\nsudo apt-get update\n```'} />
    </div>
  );
}

export const SharedContent: Story = {
  render: () => <SharedContentExample />,
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

export const StatusAndFeedbackContract: Story = {
  render: () => (
    <div className="xgc-gallery-data">
      <Panel title="Runtime state" description="State is text; normal operation stays quiet.">
        <Stack gap="compact">
          <Inline gap="comfortable"><span>Connection</span><StatusText status="connected">Connected</StatusText></Inline>
          <Inline gap="comfortable"><span>Execution</span><StatusText status="running">Running</StatusText></Inline>
          <Inline gap="comfortable"><span>Execution</span><StatusText status="succeeded">Completed</StatusText></Inline>
          <Inline gap="comfortable"><span>Execution</span><StatusText status="cancelled">Cancelled</StatusText></Inline>
          <Inline gap="comfortable"><span>Connection</span><StatusText status="disconnected">Disconnected</StatusText></Inline>
          <Inline gap="comfortable"><span>Execution</span><StatusText status="failed">Failed</StatusText></Inline>
        </Stack>
      </Panel>
      <Notice heading="Package upload failed" tone="danger" actions={<Button uiSize="compact">Retry</Button>}>
        The signing service rejected the package. Review the error before retrying.
      </Notice>
      <EmptyState
        appearance="plain"
        title="No interrupted runs"
        description="Only states that need an operator decision appear here."
      />
    </div>
  ),
};

function ConversationExample() {
  const [draft, setDraft] = useState('');
  return (
    <Panel bodyLayout="column" fill padding="none" title="Agent conversation">
      <ConversationRegion label="Agent conversation">
        <ConversationMessage speaker="operator" timestamp="10:42"><p>Inspect the failed deployment.</p></ConversationMessage>
        <ConversationMessage author="Codex" speaker="agent" timestamp="10:42">
          <MarkdownContent density="compact" emptyContent="" source="I found one failing health check. I’m reading its log now." />
        </ConversationMessage>
        <AgentActivity collapsible defaultOpen status="running" statusLabel="Running" title="Read deployment log">
          <CodeBlock content="GET /health -> 503\nupstream connection refused" language="text" />
        </AgentActivity>
      </ConversationRegion>
      <ConversationComposer
        label="Agent task input"
        onSubmitMessage={() => setDraft('')}
        onValueChange={setDraft}
        placeholder="Message the agent"
        submitLabel="Send"
        value={draft}
      />
    </Panel>
  );
}

export const ConversationAndAgentActivity: Story = {
  render: () => <div className="xgc-gallery-conversation"><ConversationExample /></div>,
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
