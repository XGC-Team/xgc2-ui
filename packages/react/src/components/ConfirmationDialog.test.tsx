import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('keeps a compact title/message and equal action tracks in every container', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        request={{ title: 'Delete environment', message: 'Delete the prepared environment for this member?', confirmLabel: 'Delete' }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('alertdialog').className).toContain('xgc-confirmation-dialog');
    expect(document.querySelector('.xgc-confirmation-actions')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles.css'), 'utf8');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('@container (max-width: 22rem)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('white-space: normal;');
  });
});
