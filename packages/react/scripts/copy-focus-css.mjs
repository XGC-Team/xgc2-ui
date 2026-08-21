// The focus contract ships as its own stylesheet so consumers can import it
// unlayered, after their resets. Vite's single-entry lib build only emits the
// bundled styles.css, so this file is copied verbatim into dist.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, 'src/styles/focus.css');
const target = resolve(packageRoot, 'dist/focus.css');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
