// Local development only: consume xgc2-ui from local source instead of the
// pinned release tgz, so edits in the shared UI repo hot-reload here.
// Usage: npm run dev -- --config vite.local-xgc2-ui.ts
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import baseConfig from './vite.config';

const uiPackages = fileURLToPath(
  new URL('../../webui/xgc2-ui/packages', import.meta.url),
);

export default mergeConfig(baseConfig, {
  resolve: {
    alias: [
      { find: /^@xgc2\/ui-react\/styles\.css$/, replacement: `${uiPackages}/react/src/styles.css` },
      { find: /^@xgc2\/ui-react\/focus\.css$/, replacement: `${uiPackages}/react/src/styles/focus.css` },
      { find: /^@xgc2\/ui-react$/, replacement: `${uiPackages}/react/src/index.ts` },
      { find: /^@xgc2\/ui-workflow\/styles\.css$/, replacement: `${uiPackages}/workflow/src/styles.css` },
      { find: /^@xgc2\/ui-workflow$/, replacement: `${uiPackages}/workflow/src/index.ts` },
      { find: /^@xgc2\/ui-tokens\/base\.css$/, replacement: `${uiPackages}/tokens/src/base.css` },
      { find: /^@xgc2\/ui-tokens$/, replacement: `${uiPackages}/tokens/src/index.css` },
    ],
  },
  server: {
    fs: {
      allow: ['.', uiPackages],
    },
  },
  optimizeDeps: {
    exclude: ['@xgc2/ui-react', '@xgc2/ui-workflow', '@xgc2/ui-tokens'],
  },
});
