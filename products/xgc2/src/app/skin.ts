import type { SkinStorageOptions } from '@xgc2/ui-react';

/** XGC2's product skin contract; shared by pre-render initialization and React state. */
export const xgcSkinStorageOptions = {
  defaultSkin: 'light',
  storageKey: 'xgc.skin',
} as const satisfies SkinStorageOptions;
