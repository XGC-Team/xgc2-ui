// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ControlButton } from './controls/ControlButton';
import { InputControl } from './controls/TextControls';
import { CheckboxControl,FormActions,FormField,FormGroup,SwitchControl } from './FormPrimitives';
import { Modal } from './Modal';
import { SegmentedControl } from './SegmentedControl';

describe('shared UI primitives', () => {
  it('connects form labels and exposes descriptions, errors, and action status', () => {
    render(
      <>
        <FormField label="Name" htmlFor="name" description="Shown to operators" error="Required" required>
          <InputControl id="name" />
        </FormField>
        <FormActions status="Unsaved"><ControlButton>Save</ControlButton></FormActions>
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Name' });
    const alert = screen.getByRole('alert');
    expect(field).toHaveAttribute('aria-invalid','true');
    expect(field.getAttribute('aria-describedby')).toContain(alert.id);
    expect(alert).toHaveTextContent('Required');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved');
  });

  it('stamps unique FormField and FormGroup label leaves from the field cluster role', () => {
    const { container } = render(
      <>
        <FormField
          label="Description"
          htmlFor="description"
          dataXgcRole="experiment-settings-description-field"
          dataXgcId="exp-1"
        >
          <InputControl id="description" />
        </FormField>
        <FormGroup
          legend="Run modes"
          dataXgcRole="experiment-settings-run-modes-field"
          dataXgcId="exp-1"
        >
          <InputControl id="run-modes" />
        </FormGroup>
      </>,
    );
    const descriptionLabel = container.querySelector('[data-xgc-role="experiment-settings-description-label"]');
    const runModesLabel = container.querySelector('[data-xgc-role="experiment-settings-run-modes-label"]');
    expect(container.querySelector('[data-xgc-role="experiment-settings-description-field"]')).toHaveAttribute('data-xgc-id', 'exp-1');
    expect(descriptionLabel).toHaveClass('xgc-form-field-label');
    expect(descriptionLabel).toHaveAttribute('data-xgc-id', 'exp-1');
    expect(descriptionLabel).toHaveTextContent('Description');
    expect(runModesLabel?.tagName).toBe('LEGEND');
    expect(runModesLabel).toHaveAttribute('data-xgc-id', 'exp-1');
    expect(container.querySelectorAll('[data-xgc-role="experiment-settings-description-label"][data-xgc-id="exp-1"]')).toHaveLength(1);
  });

  it('owns checkbox and switch semantics', () => {
    const onCheckbox = vi.fn();
    const onSwitch = vi.fn();
    render(
      <>
        <CheckboxControl checked={false} onChange={onCheckbox} label="Keep logs" />
        <SwitchControl checked onChange={onSwitch} label="Enabled" description="Allow new runs" />
      </>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep logs' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onCheckbox).toHaveBeenCalledWith(true);
    expect(onSwitch).toHaveBeenCalledWith(false);
  });

  it('stacks boolean title above the control row with On/Off status', () => {
    const { container } = render(
      <SwitchControl checked label="Show grid" onChange={() => undefined} />,
    );
    const root = container.querySelector('.xgc-boolean-control')!;
    expect(root.querySelector('.xgc-boolean-title')).toHaveTextContent('Show grid');
    expect(root.querySelector('.xgc-boolean-control-row input')).toHaveAttribute('role', 'switch');
    expect(root.querySelector('.xgc-boolean-status')).toHaveTextContent('On');
    // Title precedes the control row in DOM (field layout, not inline control+label).
    expect(root.firstElementChild).toHaveClass('xgc-boolean-title');
    expect(root.lastElementChild).toHaveClass('xgc-boolean-control-row');
  });

  it('uses fieldset semantics for grouped controls', () => {
    render(
      <FormGroup legend="Capabilities" description="Select every supported capability" required>
        <CheckboxControl checked={false} onChange={() => undefined} label="Telemetry" />
        <CheckboxControl checked onChange={() => undefined} label="Commands" />
      </FormGroup>,
    );
    const group = screen.getByRole('group', { name: 'Capabilities' });
    expect(group).toHaveAttribute('aria-describedby');
    expect(group).toHaveTextContent('Select every supported capability');
    expect(screen.getByRole('checkbox', { name: 'Telemetry' })).toBeInTheDocument();
  });

  it('owns segmented selection and tab semantics', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        asTabs
        value="grid"
        options={[{ value: 'grid',label: 'Grid' },{ value: 'list',label: 'List' }]}
        onChange={onChange}
        ariaLabel="View"
        dataXgcRole="view-switcher"
        optionDataXgcRole="view-tab"
      />,
    );
    expect(screen.getByRole('tab', { name: 'Grid' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-xgc-role="view-tab"][data-xgc-id="grid"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('traps focus and handles explicit and backdrop dismissal', () => {
    const onClose = vi.fn();
    render(<Modal title="Settings" description="Configure this item" backdropClassName="settings-backdrop"
      onClose={onClose}><button type="button">First</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toHaveClass('settings-backdrop');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
