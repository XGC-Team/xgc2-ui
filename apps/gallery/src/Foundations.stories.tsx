import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Input, Modal, Panel, StatusBadge } from '@xgc2/ui-react';

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
