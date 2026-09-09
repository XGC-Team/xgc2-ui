// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ConfigAssetCreateDrawer } from './ConfigAssetResourceDrawers';

describe('ConfigAssetResourceDrawers submission errors', () => {
  it('renders an inline fallback when a caller has no external error sink', async () => {
    render(
      <ConfigAssetCreateDrawer
        assetKind="asset"
        assetLabel="Test asset"
        assetIcon={<span aria-hidden="true">A</span>}
        rolePrefix="test-create"
        tagsPlaceholder="Optional"
        namespaces={[]}
        onClose={vi.fn()}
        createSpec={({ name }) => ({ name })}
        onCreateAsset={vi.fn().mockRejectedValue(new Error('Core unavailable'))}
        onCreateNamespace={vi.fn()}
        presentError={(cause) => cause instanceof Error ? cause.message : String(cause)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fallback asset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Core unavailable');
  });

  it('clears the error sink before every attempt and reports a failed attempt', async () => {
    const onError = vi.fn();
    const onCreateAsset = vi.fn()
      .mockRejectedValueOnce(new Error('Core unavailable'))
      .mockResolvedValueOnce(undefined);

    render(
      <ConfigAssetCreateDrawer
        assetKind="asset"
        assetLabel="Test asset"
        assetIcon={<span aria-hidden="true">A</span>}
        rolePrefix="test-create"
        tagsPlaceholder="Optional"
        namespaces={[]}
        onClose={vi.fn()}
        createSpec={({ name }) => ({ name })}
        onCreateAsset={onCreateAsset}
        onCreateNamespace={vi.fn()}
        presentError={(cause) => `Presented: ${cause instanceof Error ? cause.message : String(cause)}`}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Retry asset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(onError.mock.calls).toEqual([
      [''],
      ['Presented: Core unavailable'],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreateAsset).toHaveBeenCalledTimes(2));
    expect(onError.mock.calls).toEqual([
      [''],
      ['Presented: Core unavailable'],
      [''],
    ]);
  });
});
