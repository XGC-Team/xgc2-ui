import { fireEvent,screen } from '@testing-library/react';

export function openSelectControl(label: string) {
  const trigger = screen.getByLabelText(label);
  fireEvent.click(trigger);
  return trigger;
}

export function selectControlOption(label: string, option: string) {
  const trigger = openSelectControl(label);
  fireEvent.click(screen.getByRole('option', { name: option }));
  return trigger;
}
