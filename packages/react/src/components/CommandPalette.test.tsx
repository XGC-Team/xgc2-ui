import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

const commands = [
  {
    id: 'robot-open',
    label: 'Open robot FS150',
    description: 'Open the FS150 robot workspace',
    group: 'Robots',
    keywords: ['vehicle', 'fleet'],
    shortcut: ['⌘', '1'],
  },
  {
    id: 'paper-open',
    label: 'Open paper.pdf',
    description: 'Open the current research manuscript',
    group: 'Documents',
    keywords: ['pdf', 'research'],
  },
];

describe('CommandPalette', () => {
  it('filters commands by labels and keywords', () => {
    render(
      <CommandPalette
        commands={commands}
        onCommand={() => undefined}
        onOpenChange={() => undefined}
        open
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'pdf' } });

    expect(screen.getByRole('option', { name: /Open paper\.pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Open robot FS150/i })).not.toBeInTheDocument();
  });

  it('moves the active command with arrows and executes with Enter', () => {
    const onCommand = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        commands={commands}
        onCommand={onCommand}
        onOpenChange={onOpenChange}
        open
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'paper-open' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes through the shared overlay Escape path', () => {
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        commands={commands}
        onCommand={() => undefined}
        onOpenChange={onOpenChange}
        open
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
