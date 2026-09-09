// @vitest-environment jsdom

import { act,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it } from 'vitest';
import { ControlGallery } from './ControlGallery';

describe('ControlGallery skin', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    delete document.documentElement.dataset.skin;
  });

  it('uses the query fallback and delegates switching and persistence to the shared skin hook', () => {
    window.history.replaceState(null, '', '/?xgc-control-gallery=1&skin=light');
    render(<ControlGallery />);

    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.skin).toBe('light');

    act(() => screen.getByRole('button', { name: 'Dark' }).click());
    expect(document.documentElement.dataset.skin).toBe('dark');
    expect(window.localStorage.getItem('xgc.control-gallery.skin')).toBe('dark');
  });
});
