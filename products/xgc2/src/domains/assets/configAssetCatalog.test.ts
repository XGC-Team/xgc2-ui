import { describe,expect,it } from 'vitest';
import {
  buildConfigAssetCatalog,
  buildProjectedConfigAssetCatalog,
  configAssetFolderTitle,
  configAssetNamespacePath,
  parseConfigAssetTags,
  sortConfigAssetNamespaces,
} from './configAssetCatalog';

const namespaces = [
  { namespaceId: 'flight',name: 'Flight',parentNamespaceId: 'lab' },
  { namespaceId: 'lab',name: 'Lab' },
  { namespaceId: 'loop-a',name: 'Loop A',parentNamespaceId: 'loop-b' },
  { namespaceId: 'loop-b',name: 'Loop B',parentNamespaceId: 'loop-a' },
];

describe('config asset catalog helpers', () => {
  it('builds stable nested folder labels and stops malformed cycles', () => {
    expect(configAssetNamespacePath(namespaces, 'flight')).toBe('Lab / Flight');
    expect(configAssetFolderTitle(namespaces, 'flight')).toBe('User scripts / Lab / Flight');
    expect(configAssetNamespacePath(namespaces, 'missing')).toBe('');
    expect(configAssetNamespacePath(namespaces, 'loop-a')).toBe('Loop B / Loop A');
  });

  it('sorts without mutating the store-owned namespace array', () => {
    const original = [...namespaces];
    const sorted = sortConfigAssetNamespaces(namespaces);

    expect(namespaces).toEqual(original);
    expect(sorted).not.toBe(namespaces);
    expect(sorted.map((namespace) => namespace.namespaceId)).toEqual(['lab','flight','loop-b','loop-a']);
  });

  it('normalizes, removes empty values, and de-duplicates tags', () => {
    expect(parseConfigAssetTags(' lab, mocap, lab, ,室内 ')).toEqual(['lab','mocap','室内']);
  });

  it('builds the shared protected and nested folder catalog without mutating inputs', () => {
    const assets = [
      asset('system', 'System map', '2026-01-04', ['built-in'], { system: true }),
      asset('template', 'Template map', '2026-01-03', ['template'], { system: true }),
      asset('root', 'Root map', '2026-01-02', ['outdoor']),
      asset('flight', 'Flight map', '2026-01-01', ['indoor'], { namespaceId: 'flight' }),
    ];
    const originalAssets = structuredClone(assets);
    const originalNamespaces = structuredClone(namespaces);

    const catalog = buildConfigAssetCatalog({
      assets,
      namespaces,
      search: 'map',
      tagFilter: 'all',
      sortMode: 'updated-desc',
      viewMode: 'folder',
      allAssetsTitle: 'All assets',
    });

    expect(catalog.tags).toEqual(['built-in','indoor','outdoor','template']);
    expect(catalog.visibleAssets.map((item) => item.head.resourceId)).toEqual(['system','template','root','flight']);
    expect(catalog.folders.map((folder) => folder.title)).toEqual([
      'System scripts',
      'Templates',
      'User scripts',
      'User scripts / Lab',
      'User scripts / Lab / Flight',
      'User scripts / Loop A / Loop B',
      'User scripts / Loop B / Loop A',
    ]);
    expect(catalog.folders[0]).toMatchObject({ isSystem: true,readOnly: true });
    expect(catalog.folders[1]).toMatchObject({ readOnly: true });
    expect(catalog.folders[4].items.map((item) => item.head.resourceId)).toEqual(['flight']);
    expect(assets).toEqual(originalAssets);
    expect(namespaces).toEqual(originalNamespaces);
  });

  it('uses one filtering and sorting contract for flat catalogs', () => {
    const assets = [
      asset('beta', 'Beta', '2026-01-01', ['field']),
      asset('alpha', 'Alpha', '2026-01-02', ['lab']),
    ];
    const catalog = buildConfigAssetCatalog({
      assets,
      namespaces: [],
      search: 'A',
      tagFilter: 'missing-filter',
      sortMode: 'name-asc',
      viewMode: 'list',
      allAssetsTitle: 'All test assets',
    });

    expect(catalog.effectiveTagFilter).toBe('all');
    expect(catalog.visibleAssets.map((item) => item.spec.name)).toEqual(['Alpha','Beta']);
    expect(catalog.folders).toEqual([{ id: 'all',title: 'All test assets',items: catalog.visibleAssets }]);
  });

  it('exposes the shared empty state when a flat catalog has no visible assets', () => {
    const catalog = buildConfigAssetCatalog({
      assets: [],
      namespaces: [],
      search: '',
      tagFilter: 'all',
      sortMode: 'updated-desc',
      viewMode: 'list',
      allAssetsTitle: 'All test assets',
    });

    expect(catalog.visibleAssets).toEqual([]);
    expect(catalog.folders).toEqual([]);
  });

  it('supports fixed root folders that replace protection roots and namespaces', () => {
    const catalog = buildProjectedConfigAssetCatalog({
      items: [
        asset('px4-a', 'PX4 A', '2026-01-02', ['flight']),
        asset('scout-a', 'Scout A', '2026-01-01', ['ground']),
      ],
      namespaces,
      search: '',
      tagFilter: 'all',
      sortMode: 'updated-desc',
      viewMode: 'folder',
      allAssetsTitle: 'All robots',
      rootFolders: [
        { id: 'px4', title: 'PX4 Multirotor' },
        { id: 'scout', title: 'Scout Mini' },
        { id: 'mecanum', title: 'Mecanum UGV' },
      ],
      project: (item) => ({
        name: item.spec.name,
        description: item.spec.description,
        tags: item.spec.tags,
        updatedAt: item.head.updatedAt,
        folderId: item.head.resourceId.startsWith('scout') ? 'scout' : 'px4',
      }),
    });

    expect(catalog.folders.map((folder) => folder.id)).toEqual(['px4','scout','mecanum']);
    expect(catalog.folders.map((folder) => folder.title)).toEqual([
      'PX4 Multirotor',
      'Scout Mini',
      'Mecanum UGV',
    ]);
    expect(catalog.folders[0]!.items.map((item) => item.head.resourceId)).toEqual(['px4-a']);
    expect(catalog.folders[1]!.items.map((item) => item.head.resourceId)).toEqual(['scout-a']);
    expect(catalog.folders[2]!.items).toEqual([]);
  });

  it('omits hidden system and template roots from folders, items, and tags', () => {
    const assets = [
      asset('system', 'System map', '2026-01-04', ['system-only'], { system: true }),
      asset('template', 'Template map', '2026-01-03', ['template','template-only'], { system: true }),
      asset('user', 'User map', '2026-01-02', ['user-only']),
    ];

    const hiddenSystem = buildConfigAssetCatalog({
      assets,
      namespaces: [],
      search: '',
      tagFilter: 'all',
      sortMode: 'updated-desc',
      viewMode: 'folder',
      allAssetsTitle: 'All assets',
      hideSystem: true,
    });
    expect(hiddenSystem.folders.map((folder) => folder.id)).toEqual(['templates','user']);
    expect(hiddenSystem.visibleAssets.map((item) => item.head.resourceId)).toEqual(['template','user']);
    expect(hiddenSystem.tags).toEqual(['template','template-only','user-only']);

    const hiddenTemplates = buildConfigAssetCatalog({
      assets,
      namespaces: [],
      search: '',
      tagFilter: 'all',
      sortMode: 'updated-desc',
      viewMode: 'folder',
      allAssetsTitle: 'All assets',
      hideTemplates: true,
    });
    expect(hiddenTemplates.folders.map((folder) => folder.id)).toEqual(['system','user']);
    expect(hiddenTemplates.visibleAssets.map((item) => item.head.resourceId)).toEqual(['system','user']);
    expect(hiddenTemplates.tags).toEqual(['system-only','user-only']);
  });
});

function asset(
  resourceId: string,
  name: string,
  updatedAt: string,
  tags: string[],
  head: { system?: boolean; namespaceId?: string } = {},
) {
  return {
    head: { resourceId,updatedAt,...head },
    spec: { name,description: `${name} description`,tags },
  };
}
