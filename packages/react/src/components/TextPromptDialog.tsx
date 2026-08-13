import { useEffect, useState } from 'react';
import { Button } from './Button';
import { FormField } from './FormControls';
import { Input } from './Input';
import { Modal } from './Modal';

export type TextPromptDialogRequest = {
  cancelLabel?: string;
  initialValue?: string;
  inputType?: 'password' | 'text';
  label: string;
  placeholder?: string;
  submitLabel?: string;
  title: string;
};

export type TextPromptDialogProps = {
  onCancel: () => void;
  onSubmit: (value: string) => void;
  request: TextPromptDialogRequest;
};

export function TextPromptDialog({ onCancel, onSubmit, request }: TextPromptDialogProps) {
  const [value, setValue] = useState(request.initialValue ?? '');
  useEffect(() => setValue(request.initialValue ?? ''), [request]);
  const password = request.inputType === 'password';
  const ready = password ? value.length > 0 : Boolean(value.trim());
  const submit = () => onSubmit(password ? value : value.trim());

  return (
    <Modal
      actions={(
        <>
          <Button onClick={onCancel}>{request.cancelLabel ?? 'Cancel'}</Button>
          <Button appearance="solid" disabled={!ready} onClick={submit} tone="primary">
            {request.submitLabel ?? 'Continue'}
          </Button>
        </>
      )}
      dialogProps={{ 'data-xgc-role': 'text-prompt-dialog' }}
      onClose={onCancel}
      size="small"
      title={request.title}
    >
      <FormField label={request.label} required>
        <Input
          aria-label={request.label}
          autoComplete={password ? 'new-password' : undefined}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ready) submit();
          }}
          onValueChange={setValue}
          placeholder={request.placeholder}
          type={password ? 'password' : 'text'}
          value={value}
        />
      </FormField>
    </Modal>
  );
}
