import { configDefaults,defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: [...configDefaults.exclude, 'visual-tests/**', 'live-tests/**'],
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [
      ['src/**/*.dom.test.{ts,tsx}', 'jsdom'],
      ['src/**/*.component.test.{ts,tsx}', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/*TestFixtures.{ts,tsx}',
        'src/devtools/**',
        'src/main.tsx',
      ],
      reportOnFailure: true,
    },
  },
});
