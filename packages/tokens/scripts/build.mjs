import { cp, mkdir, rm } from 'node:fs/promises';

await rm(new URL('../dist/', import.meta.url), { force: true, recursive: true });
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL('../src/index.css', import.meta.url), new URL('../dist/index.css', import.meta.url)),
  cp(new URL('../src/base.css', import.meta.url), new URL('../dist/base.css', import.meta.url)),
  cp(new URL('../src/v016.css', import.meta.url), new URL('../dist/v016.css', import.meta.url)),
]);
