import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const packagesRoot = fileURLToPath(new URL('../../../packages', import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Consume workspace packages from source so gallery edits hot-reload
  // without a dist rebuild.
  viteFinal: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: [
        ...(Array.isArray(config.resolve?.alias) ? config.resolve.alias : []),
        { find: /^@xgc2\/ui-react\/styles\.css$/, replacement: `${packagesRoot}/react/src/styles.css` },
        { find: /^@xgc2\/ui-react$/, replacement: `${packagesRoot}/react/src/index.ts` },
        { find: /^@xgc2\/ui-workflow\/styles\.css$/, replacement: `${packagesRoot}/workflow/src/styles.css` },
        { find: /^@xgc2\/ui-workflow$/, replacement: `${packagesRoot}/workflow/src/index.ts` },
        { find: /^@xgc2\/ui-tokens\/base\.css$/, replacement: `${packagesRoot}/tokens/src/base.css` },
        { find: /^@xgc2\/ui-tokens$/, replacement: `${packagesRoot}/tokens/src/index.css` },
      ],
    },
  }),
};

export default config;
