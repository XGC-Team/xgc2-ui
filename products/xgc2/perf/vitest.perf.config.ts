import { defineConfig } from 'vitest/config';

/** Render-count measurements; not part of test:unit. */
export default defineConfig({
  root: new URL('..', import.meta.url).pathname,
  test: {
    include: ['perf/**/*.perf.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
