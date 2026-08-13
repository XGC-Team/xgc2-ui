import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Feedback';
import { NoticeRegion } from './NoticeRegion';

describe('NoticeRegion', () => {
  it('stacks notices in one labelled viewport region', () => {
    render(
      <NoticeRegion placement="bottom-end">
        <Notice tone="success">Saved</Notice>
        <Notice tone="danger">Failed</Notice>
      </NoticeRegion>,
    );
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute('data-placement', 'bottom-end');
    expect(screen.getByRole('region', { name: 'Notifications' }).children).toHaveLength(2);
  });
});
