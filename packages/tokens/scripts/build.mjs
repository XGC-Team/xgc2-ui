import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { buildGeometry } from './geometry.mjs';

await rm(new URL('../dist/', import.meta.url), { force: true, recursive: true });
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL('../src/index.css', import.meta.url), new URL('../dist/index.css', import.meta.url)),
  cp(new URL('../src/base.css', import.meta.url), new URL('../dist/base.css', import.meta.url)),
  cp(new URL('../src/typography.css', import.meta.url), new URL('../dist/typography.css', import.meta.url)),
  cp(new URL('../src/v016.css', import.meta.url), new URL('../dist/v016.css', import.meta.url)),
  cp(new URL('../src/v016-monochrome.css', import.meta.url), new URL('../dist/v016-monochrome.css', import.meta.url)),
]);

const v016 = await readFile(new URL('../src/v016.css', import.meta.url), 'utf8');
const geometry = buildGeometry(v016);
await Promise.all([
  writeFile(new URL('../dist/geometry.mjs', import.meta.url), geometry.module),
  writeFile(new URL('../dist/geometry.d.ts', import.meta.url), `${geometry.types}\n`),
]);
