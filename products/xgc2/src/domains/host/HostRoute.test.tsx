// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe,expect,it,vi } from 'vitest';
import type * as ManagedHostPublicModule from '../managedHost/managedHostPublic';
import { HostRoute } from './HostRoute';
import { defineHostSystemComposition } from './hostSystemComposition';

const navigation = vi.hoisted(() => ({ section: 'files',managedHostId: 'local' }));
vi.mock('../../app/navigationContext',() => ({
  useNavigation: () => ({ ...navigation,pageSection: () => navigation.section,setPageSection: vi.fn() }),
}));
vi.mock('../../app/useTargetCore',() => ({ useTargetCore: () => ({}) }));
vi.mock('../managedHost/managedHostPublic',async (original) => ({
  ...await original<typeof ManagedHostPublicModule>(),useManagedHosts: () => [],
}));

function Files() {
  const [path,setPath] = useState('/home/operator');
  return <input aria-label="Parked file path" value={path} onChange={(event) => setPath(event.target.value)} />;
}

describe('HostRoute parking across Maintenance',() => {
  it('retains the existing Files leaf while the sibling Maintenance route is selected',async () => {
    navigation.section = 'files';
    const composition = defineHostSystemComposition({ Files });
    const { rerender } = render(<HostRoute composition={composition} />);
    const path = await screen.findByLabelText('Parked file path');
    fireEvent.change(path,{ target: { value: '/home/operator/Documents' } });
    await waitFor(() => expect(path).toBeVisible());

    navigation.section = 'maintenance';
    rerender(<HostRoute composition={composition} />);
    expect(screen.getByLabelText('Parked file path')).toBe(path);
    expect(screen.queryByText('Maintenance unavailable')).toBeNull();

    navigation.section = 'files';
    rerender(<HostRoute composition={composition} />);
    expect(screen.getByLabelText('Parked file path')).toBe(path);
    expect(path).toHaveValue('/home/operator/Documents');
  });
});
