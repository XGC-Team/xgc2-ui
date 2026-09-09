export type ContainerTab = 'containers' | 'compose' | 'images' | 'networks' | 'volumes';

export const validContainerTabs = new Set<ContainerTab>([
  'containers',
  'compose',
  'images',
  'networks',
  'volumes',
]);
