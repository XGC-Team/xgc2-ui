import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, FormActions, FormField, FormGroup, SegmentedControl, Select, Switch, Textarea } from './FormControls';
import { Input } from './Input';

describe('form controls', () => {
  it('keeps stable composite metadata on the input container', () => {
    const { container } = render(
      <Input aria-label="Distance" unit="m" containerProps={{ 'data-xgc-role': 'distance-field' }} />,
    );

    const control = container.querySelector('[data-xgc-role="distance-field"]');
    expect(control).toHaveClass('xgc-input');
    expect(control).toHaveAttribute('data-unit', 'true');
    expect(control?.querySelector('.xgc-input-unit')).toHaveTextContent('m');
  });

  it('connects a nested select with its field label', () => {
    const onValueChange = vi.fn();
    render(
      <FormField label="Language">
        <Select value="zh" onValueChange={onValueChange}>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
        </Select>
      </FormField>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'en' } });
    expect(onValueChange).toHaveBeenCalledWith('en');
  });

  it('owns textarea, checkbox, and switch behavior', () => {
    const onText = vi.fn();
    const onChecked = vi.fn();
    render(
      <>
        <Textarea aria-label="Notes" value="hello" onValueChange={onText} />
        <Checkbox checked={false} label="Include logs" onCheckedChange={onChecked} />
        <Switch checked label="Live updates" description="Updates are enabled" onCheckedChange={onChecked} />
      </>,
    );
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include logs' }));
    expect(onText).toHaveBeenCalledWith('updated');
    expect(onChecked).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch', { name: 'Live updates' })).toHaveAttribute('aria-checked', 'true');
  });

  it('supports dense field-layout switches without changing checkbox semantics', () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <Switch
        checked
        description="On"
        label="Show grid"
        layout="field"
        onCheckedChange={onCheckedChange}
      />,
    );
    const root = container.querySelector('.xgc-boolean-control');
    expect(root).toHaveAttribute('data-layout', 'field');
    expect(root?.querySelector('.xgc-boolean-title')).toHaveTextContent('Show grid');
    expect(root?.querySelector('.xgc-boolean-status')).toHaveTextContent('On');
    expect(screen.getByRole('switch', { name: 'Show grid' })).toBeChecked();
  });

  it('associates field descriptions and errors with the owned control', () => {
    render(
      <FormField description="Shown to operators" error="Required" label="Name">
        <input />
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('keeps required field metadata on the composite root', () => {
    const { container } = render(
      <FormField label="Name" required>
        <input />
      </FormField>,
    );

    expect(container.querySelector('.xgc-form-field')).toHaveAttribute('data-required', 'true');
  });

  it('keeps form status and actions in a shared action row', () => {
    render(<FormActions status="Unsaved"><button type="button">Save</button></FormActions>);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('exposes segmented choices as pressed buttons', () => {
    const onValueChange = vi.fn();
    render(
      <FormGroup label="Appearance">
        <SegmentedControl
          ariaLabel="Theme"
          value="light"
          options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]}
          onValueChange={onValueChange}
        />
      </FormGroup>,
    );
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });

  it('associates grouped descriptions and errors', () => {
    render(
      <FormGroup description="Select every supported capability" error="Choose one" label="Capabilities" required>
        <Checkbox checked={false} label="Telemetry" onCheckedChange={() => undefined} />
      </FormGroup>,
    );
    const group = screen.getByRole('group', { name: 'Capabilities' });
    expect(group.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose one');
  });
});
