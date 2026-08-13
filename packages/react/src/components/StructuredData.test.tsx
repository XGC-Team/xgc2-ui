// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DescriptionItem,
  DescriptionList,
  ResourceMeter,
  SettingRow,
  SettingsList,
} from './StructuredData';

describe('structured operational data', () => {
  it('uses native description-list semantics and a consistent empty value', () => {
    const { container } = render(
      <DescriptionList columns={2} density="compact" orientation="vertical" wrapValues>
        <DescriptionItem label="Hostname" value="robot-01" />
        <DescriptionItem label="Kernel" value="" />
      </DescriptionList>,
    );
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(container.querySelectorAll('dd')).toHaveLength(2);
    expect(container.querySelector('dl')).toHaveAttribute('data-columns', '2');
    expect(container.querySelector('dl')).toHaveAttribute('data-density', 'compact');
    expect(container.querySelector('dl')).toHaveAttribute('data-orientation', 'vertical');
    expect(container.querySelector('dl')).toHaveAttribute('data-wrap-values', 'true');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('keeps setting copy, control, and actions in stable regions', () => {
    render(
      <SettingsList>
        <SettingRow actions={<button type="button">Edit</button>} description="Used by operators" title="Display name" value="Lab" />
      </SettingsList>,
    );
    expect(screen.getByRole('list')).toContainElement(screen.getByRole('listitem'));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('composes bounded resource usage with the shared progress primitive', () => {
    const { container } = render(<ResourceMeter detail="12 GB / 10 GB" label="Disk" percent={120} tone="warning" />);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(container.querySelector('.xgc-progress')).toHaveAttribute('data-xgc-tone', 'warning');
    expect(container.querySelector('.xgc-progress')).toHaveAttribute('aria-hidden', 'true');
  });
});
