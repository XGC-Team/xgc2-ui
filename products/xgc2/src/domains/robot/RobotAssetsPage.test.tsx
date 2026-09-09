// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { useState } from 'react';
import { describe,expect,it,vi } from 'vitest';
import type { ConfigAssetSortMode } from '../assets/assetsPublic';
import { RobotAssetsPage } from './RobotAssetsPage';
import {
  PX4_MODEL_FS150,
  PX4_MODEL_MOCAP_ROTOR,
  PX4_MOCAP_ROTOR_PROFILE_ID,
  isPX4RobotAsset,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import { px4RobotAssetKindContributionForModels } from './builtInRobotAssetKindContributions';
import { assembleRobotAssetKindComposition } from './robotAssetKindComposition';

const b2Composition = robotAssetKindCompositionWithUnitreeB2;
const mocapRotorComposition = assembleRobotAssetKindComposition(
  px4RobotAssetKindContributionForModels({ fs150: false,mocapRotor: true,simulation: false }),
);
import './robot-assets.css';

describe('RobotAssetsPage', () => {
  it('uses the workspace catalog column, not ListPage full-bleed', () => {
    const { container } = render(
      <RobotAssetsPage assets={[]} onCreate={vi.fn()} />,
    );

    const page = container.querySelector('[data-xgc-role="robot-assets-page"][data-xgc-id="robot"]');
    expect(page).toHaveClass('xgc-workspace-full-span');
    expect(page).not.toHaveAttribute('data-xgc-content-width');
    expect(page?.querySelector('[data-xgc-content-width]')).toBeNull();
  });

  it('groups robots into chassis folders and shows card attributes without navigation or tags', () => {
    const px4 = robot('robot-px4','PX4 A',{ kind: 'px4_multirotor' });
    const scout = robot('robot-scout','Scout A',{ kind: 'scout_mini' });
    const mecanum = robot('robot-mecanum','Mecanum A',{ kind: 'mecanum_ugv' });
    const b2 = robot('robot-b2','B2 01',{ kind: 'unitree_b2' });
    const onConfigure = vi.fn();
    const onCheckReachability = vi.fn();
    const onArchive = vi.fn();
    const { container } = render(
      <RobotAssetsPage
        assets={[px4,scout,mecanum,b2]}
        onCreate={vi.fn()}
        onConfigure={onConfigure}
        onCheckReachability={onCheckReachability}
        onArchive={onArchive}
        composition={b2Composition}
      />,
    );

    // Catalog chrome borrowed from experiment lists is not shown for robots.
    expect(container.querySelector('[data-xgc-role="robot-folder-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-list-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-tag-filter"]')).toBeNull();
    const create = container.querySelector('[data-xgc-role="robot-asset-create"]');
    expect(create).not.toBeNull();
    expect(create?.parentElement).toHaveClass('xgc-list-controls');
    expect(create?.parentElement?.lastElementChild).toBe(create);
    expect(container.querySelector('[data-xgc-role="robot-asset-product-shortcuts"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-product-shortcut"]')).toBeNull();
    const chassisFilter = container.querySelector('[data-xgc-role="robot-asset-chassis-filter"]');
    expect(chassisFilter).not.toBeNull();
    expect(chassisFilter).toHaveAttribute('data-value', 'all');
    expect(chassisFilter).toHaveAttribute('data-xgc-compact', 'true');
    expect(chassisFilter).not.toHaveAttribute('data-xgc-fill');
    const filters = container.querySelector('[data-xgc-role="robot-asset-list-filters"]');
    const sort = container.querySelector('[data-xgc-role="robot-asset-sort"]');
    const controls = create?.parentElement;
    expect(filters).toContainElement(chassisFilter as HTMLElement);
    expect(controls?.firstElementChild).toBe(filters);
    expect(sort).toHaveAttribute('data-value', 'updated-desc');
    expect(sort).toHaveAttribute('data-xgc-compact', 'true');
    expect(sort?.parentElement).toHaveClass('robot-asset-list-view-controls');
    expect(sort?.parentElement?.nextElementSibling).toBe(create);
    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    expect([...screen.getAllByRole('option')].map((option) => option.textContent)).toEqual([
      'All', 'Multirotor', 'Mecanum', 'Unicycle',
    ]);
    expect(screen.getByRole('option', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('option', { name: 'All' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort robots' }));
    expect([...screen.getAllByRole('option')].map((option) => option.textContent)).toEqual([
      'Recently updated', 'Oldest updated', 'Name A-Z',
    ]);
    expect(screen.getByRole('option', { name: 'Recently updated' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('option', { name: 'Recently updated' }), { key: 'Escape' });

    const folders = [...container.querySelectorAll('[data-xgc-role="robot-folder"]')];
    expect(folders.map((folder) => folder.getAttribute('data-xgc-id'))).toEqual([
      'multirotor','mecanum','unicycle',
    ]);
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="templates"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="user"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="px4"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="scout"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="differential"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="quadruped"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="unitreeB2"]')).toBeNull();

    const px4Folder = container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="multirotor"]')!;
    const unicycleFolder = container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="unicycle"]')!;
    const mecanumFolder = container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="mecanum"]')!;
    expect(folderTitle(px4Folder)).toBe('Multirotor');
    expect(folderTitle(unicycleFolder)).toBe('Unicycle');
    expect(folderTitle(mecanumFolder)).toBe('Mecanum');
    expect(px4Folder.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-px4"]')).not.toBeNull();
    expect(unicycleFolder.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-scout"]')).not.toBeNull();
    expect(mecanumFolder.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-mecanum"]')).not.toBeNull();

    const px4Row = row(container,'robot-px4');
    const px4Attrs = px4Row.querySelector('[data-xgc-role="robot-asset-attrs"]')!;
    expect(px4Attrs).not.toBeNull();
    expect(px4Attrs).toHaveAttribute('data-xgc-kind','px4');
    expect([...px4Attrs.querySelectorAll('code')].map((node) => node.closest('[data-xgc-role="robot-asset-attr"]')?.getAttribute('data-xgc-id')))
      .toEqual(['vrpn-pose','mavros-fcu']);
    expect(px4Attrs.querySelector('[data-xgc-id="model"] code')).toBeNull();
    expect(px4Attrs.querySelector('[data-xgc-id="mav-system-id"] code')).toBeNull();
    // Main list shows connection parameters only — no nested configure-drawer groups.
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr-group"]')).toBeNull();
    const px4AttrIds = [...px4Attrs.querySelectorAll('[data-xgc-role="robot-asset-attr"]')]
      .map((node) => node.getAttribute('data-xgc-id'));
    // Model first, then physical link fields — SSH is configure-only, not on the card.
    expect(px4AttrIds).toEqual([
      'model','mav-system-id','remote-ip','mavlink-local','mavlink-remote',
      'mocap','vrpn-pose','mavros-fcu',
    ]);
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="model"]')).toHaveTextContent('FS150');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mav-system-id"]')).toHaveTextContent('1');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="remote-ip"]')).toHaveTextContent('192.0.2.10');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mavlink-local"]')).toHaveTextContent('9010');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mavlink-remote"]')).toHaveTextContent('14550');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mocap"]')).toHaveTextContent('robot-px4');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="vrpn-pose"]'))
      .toHaveTextContent('/vrpn_client_node/robot-px4/pose');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mavros-fcu"]'))
      .toHaveTextContent('udp://:9010@192.0.2.10:14550');
    expect(px4Row.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="ssh"]')).toBeNull();

    const scoutRow = row(container,'robot-scout');
    const scoutAttrIds = [...scoutRow.querySelectorAll('[data-xgc-role="robot-asset-attr"]')]
      .map((node) => node.getAttribute('data-xgc-id'));
    // Ground robots only show connection fields — no launch package / profile / product.
    expect(scoutAttrIds).toEqual(['remote-ip','connector','telemetry-remote','control-local','mocap','vrpn-pose']);
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="remote-ip"]')).toHaveTextContent('192.0.2.20');
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mocap"]')).toHaveTextContent('robot-scout');
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="vrpn-pose"]')).toHaveTextContent('/vrpn_client_node/robot-scout/pose');
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="launch-package"]')).toBeNull();
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="launch-file"]')).toBeNull();
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="profile"]')).toBeNull();
    expect(scoutRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="product"]')).toBeNull();

    const mecanumRow = row(container,'robot-mecanum');
    const mecanumAttrIds = [...mecanumRow.querySelectorAll('[data-xgc-role="robot-asset-attr"]')]
      .map((node) => node.getAttribute('data-xgc-id'));
    // Mecanum card matches Scout UGV fields (only display name differs).
    expect(mecanumAttrIds).toEqual([
      'remote-ip','connector','telemetry-remote','control-local','mocap','vrpn-pose',
    ]);
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="remote-ip"]')).toHaveTextContent('192.0.2.30');
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="connector"]')).toHaveTextContent('swarm_ros_bridge');
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="mocap"]')).toHaveTextContent('robot-mecanum');
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="vrpn-pose"]')).toHaveTextContent('/vrpn_client_node/robot-mecanum/pose');
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="vrpn-twist"]')).toBeNull();
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="launch-package"]')).toBeNull();
    expect(mecanumRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="profile"]')).toBeNull();

    expect(px4Row.querySelector('[data-xgc-role="robot-edit-tags"]')).toBeNull();
    expect(px4Row.querySelector('.xgc-list-item-subtitle')).toBeNull();
    expect(px4Row.querySelector('[data-xgc-role="list-page-item-main"]')).toBeNull();
    expect(px4Row.querySelector('.xgc-row-open-button')).toBeNull();
    // Row is not a navigation control: configure/archive are icon actions only.

    const builtIn = robot('robot-built-in','Built-in UAV',{ kind: 'px4_multirotor',system: true,tags: ['built-in'] });
    const view = render(
      <RobotAssetsPage
        assets={[builtIn]}
        onCreate={vi.fn()}
        onConfigure={onConfigure}
        onCheckReachability={onCheckReachability}
        onArchive={onArchive}
      />,
    );
    const builtInRow = row(view.container,'robot-built-in');
    expect(builtInRow).toHaveAttribute('data-xgc-kind','px4');
    expect(builtInRow).toHaveAttribute('data-xgc-system','true');
    expect(builtInRow).not.toHaveAttribute('data-xgc-readonly');
    expect(builtInRow).not.toHaveAttribute('data-xgc-protection');
    expect(builtInRow).not.toHaveAttribute('draggable');
    expect(action(builtInRow,'robot-asset-settings')).not.toBeDisabled();
    expect(action(builtInRow,'robot-asset-connectivity')).not.toBeDisabled();
    expect(action(builtInRow,'robot-asset-connectivity').nextElementSibling)
      .toBe(action(builtInRow,'robot-asset-settings'));
    expect(builtInRow.querySelector('[data-xgc-role="robot-asset-delete"]')).toBeNull();
    expect(builtInRow.querySelector('[data-xgc-role="robot-edit-tags"]')).toBeNull();

    fireEvent.click(action(builtInRow,'robot-asset-connectivity'));
    fireEvent.click(action(builtInRow,'robot-asset-settings'));
    expect(onCheckReachability).toHaveBeenCalledWith(builtIn);
    expect(onConfigure).toHaveBeenCalledWith(builtIn);
    expect(onArchive).not.toHaveBeenCalledWith(builtIn);
  });

  it('filters the chassis folders from the All combobox without adding a fourth folder', () => {
    const px4 = robot('robot-px4', 'PX4 A', { kind: 'px4_multirotor' });
    const scout = robot('robot-scout', 'Scout A', { kind: 'scout_mini' });
    const mecanum = robot('robot-mecanum', 'Mecanum A', { kind: 'mecanum_ugv' });
    const onCreate = vi.fn();
    const onToggleFolder = vi.fn();
    const { container } = render(
      <RobotAssetsPage
        assets={[px4, scout, mecanum]}
        onCreate={onCreate}
        onToggleFolder={onToggleFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unicycle' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(onToggleFolder).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('[data-xgc-role="robot-folder"]')]
      .map((folder) => folder.getAttribute('data-xgc-id'))).toEqual(['unicycle']);
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="scout"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-scout"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-px4"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-mecanum"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="unicycle"]')
      ?.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-scout"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-chassis-filter"]'))
      .toHaveAttribute('data-value', 'unicycle');

    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'Multirotor' }));
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-px4"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-scout"]')).toBeNull();
    expect([...container.querySelectorAll('[data-xgc-role="robot-folder"]')]
      .map((folder) => folder.getAttribute('data-xgc-id'))).toEqual(['multirotor']);
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="multirotor"]')
      ?.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-px4"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mecanum' }));
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-mecanum"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-px4"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="mecanum"]')
      ?.querySelector('[data-xgc-role="robot-asset-row"][data-xgc-id="robot-mecanum"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    expect([...container.querySelectorAll('[data-xgc-role="robot-folder"]')]
      .map((folder) => folder.getAttribute('data-xgc-id'))).toEqual([
      'multirotor', 'mecanum', 'unicycle',
    ]);
    expect(container.querySelector('[data-xgc-role="robot-asset-chassis-filter"]'))
      .toHaveAttribute('data-value', 'all');
  });

  it('expands the matching chassis folder when the selected folder is collapsed', () => {
    const scout = robot('robot-scout', 'Scout A', { kind: 'scout_mini' });
    const onToggleFolder = vi.fn();
    const { container } = render(
      <RobotAssetsPage
        assets={[scout]}
        collapsedFolders={['unicycle']}
        onCreate={vi.fn()}
        onToggleFolder={onToggleFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filter robots by folder' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unicycle' }));
    expect(onToggleFolder).toHaveBeenCalledWith('unicycle');
    expect(container.querySelector('[data-xgc-role="robot-folder"][data-xgc-id="unicycle"]')).not.toBeNull();
  });

  it('sorts projected rows through the controlled catalog view state', () => {
    const older = robot('robot-older','Alpha',{ kind: 'scout_mini' });
    const newer = robot('robot-newer','Zulu',{ kind: 'scout_mini' });
    older.head.updatedAt = '2026-07-29T00:00:00Z';
    newer.head.updatedAt = '2026-07-31T00:00:00Z';
    const { container } = render(<SortableRobotAssets assets={[older,newer]} />);

    expect([...container.querySelectorAll('[data-xgc-role="robot-asset-row"]')]
      .map((item) => item.getAttribute('data-xgc-id'))).toEqual(['robot-newer','robot-older']);

    fireEvent.click(screen.getByRole('button', { name: 'Sort robots' }));
    fireEvent.click(screen.getByRole('option', { name: 'Name A-Z' }));
    expect([...container.querySelectorAll('[data-xgc-role="robot-asset-row"]')]
      .map((item) => item.getAttribute('data-xgc-id'))).toEqual(['robot-older','robot-newer']);
    expect(container.querySelector('[data-xgc-role="robot-asset-sort"]'))
      .toHaveAttribute('data-value', 'name-asc');
  });

  it.each([
    ['14 ms response',14,true,'success','success'],
    ['15 ms response',15,true,'warning','default'],
    ['slow response',250,true,'warning','default'],
    ['unreachable',0,false,'danger','danger'],
  ] as const)(
    'maps %s from structured reachability fields',
    (_label,latencyMs,reachable,level,tone) => {
      const asset = robot('robot-connectivity','Connectivity',{ kind: 'px4_multirotor' });
      const { container } = render(
        <RobotAssetsPage
          assets={[asset]}
          onCreate={vi.fn()}
          reachabilityById={{
            'robot-connectivity': {
              status: 'checked',
              result: {
                address: '192.0.2.10',reachable,latencyMs,
                detail: reachable ? 'unreachable timeout words are not classification input' : 'fast response words',
                checkedAt: '2026-08-10T10:00:00Z',
              },
            },
          }}
        />,
      );
      const connectivity = action(row(container,'robot-connectivity'),'robot-asset-connectivity');
      expect(connectivity).toHaveAttribute('data-xgc-state',level);
      expect(connectivity).toHaveAttribute('data-xgc-tone',tone);
      expect(connectivity).toHaveAttribute('data-xgc-check-state','checked');
      if (reachable) expect(connectivity).toHaveAttribute('data-xgc-latency-ms',String(latencyMs));
      else expect(connectivity).not.toHaveAttribute('data-xgc-latency-ms');
    },
  );

  it('maps a timeout error to danger from the structured check status', () => {
    const asset = robot('robot-timeout','Timeout',{ kind: 'px4_multirotor' });
    const { container } = render(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        reachabilityById={{
          'robot-timeout': { status: 'error',message: 'reachable in 1 ms words are not classification input' },
        }}
      />,
    );
    const connectivity = action(row(container,'robot-timeout'),'robot-asset-connectivity');
    expect(connectivity).toHaveAttribute('data-xgc-state','danger');
    expect(connectivity).toHaveAttribute('data-xgc-tone','danger');
    expect(connectivity).toHaveAttribute('data-xgc-check-state','error');
  });

  it('keeps unknown and unchecked connectivity neutral', () => {
    const asset = robot('robot-unknown','Unknown',{ kind: 'px4_multirotor' });
    const { container,rerender } = render(
      <RobotAssetsPage assets={[asset]} onCreate={vi.fn()} />,
    );
    let connectivity = action(row(container,'robot-unknown'),'robot-asset-connectivity');
    expect(connectivity).toHaveAttribute('data-xgc-state','neutral');
    expect(connectivity).toHaveAttribute('data-xgc-tone','default');
    expect(connectivity).toHaveAttribute('data-xgc-check-state','unknown');

    rerender(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        reachabilityById={{ 'robot-unknown': { status: 'checked' } }}
      />,
    );
    connectivity = action(row(container,'robot-unknown'),'robot-asset-connectivity');
    expect(connectivity).toHaveAttribute('data-xgc-state','neutral');
    expect(connectivity).toHaveAttribute('data-xgc-check-state','checked');
  });

  it('keeps the latest connectivity level stable while rechecking and after feedback settles', () => {
    const asset = robot('robot-reachable','Reachable management address',{ kind: 'px4_multirotor' });
    const result = {
      address: '192.0.2.10',reachable: true,latencyMs: 15,
      detail: 'management address responded',checkedAt: '2026-08-10T10:00:00Z',
    };
    const { container,rerender } = render(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        reachabilityById={{ 'robot-reachable': { status: 'reachable',result } }}
      />,
    );
    const robotRow = row(container,'robot-reachable');
    expect(action(robotRow,'robot-asset-connectivity')).toHaveAttribute('data-xgc-state','warning');
    expect(action(robotRow,'robot-asset-connectivity')).toHaveAttribute('data-xgc-tone','default');

    rerender(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        reachabilityById={{ 'robot-reachable': { status: 'checking',result } }}
      />,
    );
    expect(action(robotRow,'robot-asset-connectivity')).toHaveAttribute('data-xgc-state','warning');
    expect(action(robotRow,'robot-asset-connectivity')).toBeDisabled();

    rerender(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        reachabilityById={{ 'robot-reachable': { status: 'checked',result } }}
      />,
    );
    expect(action(robotRow,'robot-asset-connectivity')).toHaveAttribute('data-xgc-state','warning');
    expect(action(robotRow,'robot-asset-connectivity')).not.toBeDisabled();
    expect(action(robotRow,'robot-asset-connectivity')).toHaveAttribute(
      'title',
      'Last management reachability check · Management address reachable · '
        + '192.0.2.10 · 15 ms · management address responded',
    );
    expect(robotRow.querySelector('[data-xgc-role="robot-asset-attr"][data-xgc-id="vrpn-pose"]'))
      .toHaveTextContent('/vrpn_client_node/robot-reachable/pose');
  });

  it('does not offer the local-fleet management diagnostic for Mocap Rotor', () => {
    const asset = robot('mocap-rotor-1','Mocap Rotor 01',{ kind: 'px4_multirotor' });
    if (!isPX4RobotAsset(asset)) throw new Error('expected PX4 fixture');
    asset.spec.profileId = PX4_MOCAP_ROTOR_PROFILE_ID;
    asset.spec.px4.modelId = PX4_MODEL_MOCAP_ROTOR;

    const { container } = render(
      <RobotAssetsPage
        assets={[asset]}
        onCreate={vi.fn()}
        composition={mocapRotorComposition}
      />,
    );

    expect(row(container,'mocap-rotor-1').querySelector(
      '[data-xgc-role="robot-asset-connectivity"]',
    )).toBeNull();
  });
});

function SortableRobotAssets({ assets }: { assets: RobotAssetDocument[] }) {
  const [sortMode,setSortMode] = useState<ConfigAssetSortMode>('updated-desc');
  return (
    <RobotAssetsPage
      assets={assets}
      onCreate={vi.fn()}
      sortMode={sortMode}
      onSortModeChange={setSortMode}
    />
  );
}

function row(container: HTMLElement,id: string) {
  return container.querySelector<HTMLElement>(
    `[data-xgc-role="robot-asset-row"][data-xgc-id="${id}"]`,
  )!;
}

function action(rowElement: HTMLElement,role: string) {
  return rowElement.querySelector<HTMLButtonElement>(`[data-xgc-role="${role}"]`)!;
}

function folderTitle(folder: Element) {
  return folder.querySelector('.xgc-list-folder-title strong')?.textContent ?? '';
}

function robot(
  resourceId: string,
  name: string,
  options: {
    kind: RobotAssetSpec['kind'];
    system?: boolean;
    tags?: string[];
  },
): RobotAssetDocument {
  const timestamp = '2026-07-30T00:00:00Z';
  const tags = options.tags ?? [];
  const simulation = {
    productId: options.kind === 'px4_multirotor'
      ? 'xgc2-gazebo-sim-fs150-sitl'
      : options.kind === 'mecanum_ugv' ? 'xgc2-gazebo-sim-mecanum' : 'xgc2-gazebo-sim-scout',
    launchPackage: options.kind === 'px4_multirotor'
      ? 'gazebo_sim_fs150_sitl'
      : options.kind === 'mecanum_ugv' ? 'gazebo_sim_mecanum' : 'gazebo_sim_scout',
    launchFile: options.kind === 'px4_multirotor'
      ? 'fs150.launch'
      : options.kind === 'mecanum_ugv' ? 'spawn.launch' : 'spawn_accurate.launch',
  };
  const profileId = options.kind === 'px4_multirotor'
    ? 'px4.multirotor.ros1.v9'
    : options.kind === 'mecanum_ugv'
      ? 'mecanum-ugv.ros1.v3'
      : options.kind === 'unitree_b2' ? 'unitree.b2.v1' : 'scout-mini.ros1.v6';
  const spec: RobotAssetSpec = options.kind === 'px4_multirotor'
    ? {
      name,description: 'Physical-capable PX4 multirotor',tags,kind: 'px4_multirotor',profileId,
      px4: {
        modelId: PX4_MODEL_FS150,
        mavSystemId: 1,managementIp: '192.0.2.10',sshUsername: 'pilot',sshPassword: 'secret',
        mocapRigidBodyName: resourceId,physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14550,
        simulationLocalPort: 15000,simulationRemotePort: 15300,simulation,
      },
    }
    : options.kind === 'mecanum_ugv'
      ? {
        name,description: '',tags,kind: 'mecanum_ugv',profileId,
        mecanum: {
          managementAddress: '192.0.2.30',
          connector: 'swarm_ros_bridge',
          sshUsername: 'wheeltec',
          sshPassword: 'dongguan',
          telemetryRemotePort: 3001,
          controlLocalPort: 3001,
          mocapRigidBodyName: resourceId,
          simulation,
        },
      }
      : options.kind === 'unitree_b2'
        ? {
          name,description: '',tags,kind: 'unitree_b2',profileId,
          unitreeB2: {
            serialNumber: 'b2-01.lab.local',
            robotAddress: 'b2-01.lab.local',
            rosDomainId: 42,
            sshUsername: 'thor',
            sshPassword: '1',
          },
        }
        : {
          name,description: '',tags,kind: 'scout_mini',profileId,
          scout: {
            managementAddress: '192.0.2.20',
            connector: 'swarm_ros_bridge',
            sshUsername: 'wheeltec',
            sshPassword: 'dongguan',
            telemetryRemotePort: 3001,
            controlLocalPort: 3001,
            mocapRigidBodyName: resourceId,
            simulation,
          },
        };
  return {
    head: {
      domain: 'robot',resourceId,name,description: '',tags,system: options.system,
      mainCommitId: `${resourceId}-commit`,currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
