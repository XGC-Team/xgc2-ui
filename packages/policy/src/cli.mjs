#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCT_CONTROL_GEOMETRY_HOOKS,
  edgeMarkerViolations,
  forbiddenControlAppearanceDefinitions,
  isProductProductionSource,
  rawFoundationValueViolations,
  semanticGeometryViolations,
  sharedSelectorViolations,
  skinLifecycleViolations,
  statusVisualContractViolations,
} from './contract.mjs';
import { sharedOwnedClasses, sharedOwnedTokens } from './ownership.mjs';

const ignoredDirectories = new Set([
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storybook-static',
]);
const sharedClasses = new Set(sharedOwnedClasses);
const sharedTokens = new Set(sharedOwnedTokens);

function usage() {
  return `Usage: xgc2-style-policy --root <source-directory> [--root <directory> ...] [--html <entry.html> ...]\n\nEvery provided path must exist. At least one CSS file and one production script or HTML file must be scanned.`;
}

function parseArguments(argv) {
  const roots = [];
  const html = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root' || argument === '--html') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      (argument === '--root' ? roots : html).push(resolve(value));
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (roots.length === 0) throw new Error('at least one --root is required');
  for (const file of html) {
    if (!/\.html?$/i.test(file)) throw new Error(`--html requires an .html or .htm entry: ${file}`);
  }
  return { roots: [...new Set(roots)], html: [...new Set(html)] };
}

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await collect(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function existingDirectory(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} does not exist: ${path}`);
    throw error;
  }
  if (!metadata.isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
}

async function existingFile(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} does not exist: ${path}`);
    throw error;
  }
  if (!metadata.isFile()) throw new Error(`${label} is not a file: ${path}`);
}

async function findPackageManifest(start, expectedName) {
  let directory = dirname(start);
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name === expectedName) return { directory, manifest };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`could not locate ${expectedName} package.json from ${start}`);
    directory = parent;
  }
}

async function verifyReactContract() {
  const policy = await findPackageManifest(fileURLToPath(import.meta.url), '@xgc2/ui-policy');
  let reactEntry;
  try {
    reactEntry = fileURLToPath(import.meta.resolve('@xgc2/ui-react'));
  } catch {
    throw new Error('@xgc2/ui-react is not installed alongside @xgc2/ui-policy');
  }
  const react = await findPackageManifest(reactEntry, '@xgc2/ui-react');
  const expected = policy.manifest.peerDependencies['@xgc2/ui-react'];
  if (react.manifest.version !== expected) {
    throw new Error(`policy ${policy.manifest.version} requires @xgc2/ui-react ${expected}, found ${react.manifest.version}`);
  }
  return react.manifest.version;
}

function record(violations, file, message) {
  violations.push(`${relative(process.cwd(), file) || file}: ${message}`);
}

function inspectCss(file, css, violations) {
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of declarations.matchAll(/--space-\d+\b/g)) record(violations, file, `numeric spacing token ${match[0]}`);
  for (const match of declarations.matchAll(/--(?:font-(?:2xs|3xl|4xl)|line-height-(?:snug|ui|readable)|tracking-(?:tight|wide|wider|condensed))\b/g)) {
    record(violations, file, `retired dense token ${match[0]}`);
  }
  for (const token of forbiddenControlAppearanceDefinitions(declarations)) record(violations, file, `product control appearance override ${token}`);
  for (const message of statusVisualContractViolations(declarations)) record(violations, file, message);
  for (const message of edgeMarkerViolations(declarations)) record(violations, file, message);
  for (const message of rawFoundationValueViolations(declarations)) record(violations, file, message);
  for (const message of semanticGeometryViolations(declarations)) record(violations, file, message);
  for (const message of sharedSelectorViolations(declarations, sharedClasses)) {
    record(violations, file, `${message}; compose through a product-owned class or component API`);
  }
  for (const match of declarations.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    const token = match[1];
    if (sharedTokens.has(token) && !PRODUCT_CONTROL_GEOMETRY_HOOKS.has(token)) {
      record(violations, file, `product redefines shared token ${token}`);
    }
    if (token.startsWith('--color-automation-')) record(violations, file, `product defines parallel workflow palette ${token}`);
    if (/^--(?:duration|easing|opacity)-/.test(token)) record(violations, file, `product defines parallel motion/opacity token ${token}`);
  }
}

async function run() {
  const { roots, html } = parseArguments(process.argv.slice(2));
  for (const root of roots) await existingDirectory(root, 'source root');
  for (const file of html) await existingFile(file, 'HTML entry');
  const rootFiles = (await Promise.all(roots.map(collect))).flat();
  const cssFiles = rootFiles.filter((file) => extname(file).toLowerCase() === '.css');
  const sourceFiles = [...new Set([
    ...rootFiles.filter((file) => isProductProductionSource(file)),
    ...html,
  ])];
  if (cssFiles.length === 0) throw new Error(`no CSS files found under: ${roots.join(', ')}`);
  if (sourceFiles.length === 0) throw new Error(`no production script or HTML files found under: ${roots.join(', ')}`);

  const reactVersion = await verifyReactContract();
  const violations = [];
  for (const file of cssFiles) inspectCss(file, await readFile(file, 'utf8'), violations);
  for (const file of sourceFiles) {
    const sourceType = extname(file).toLowerCase().startsWith('.htm') ? 'html' : 'script';
    for (const message of skinLifecycleViolations(await readFile(file, 'utf8'), { sourceType })) {
      record(violations, file, `${message}; use initializeSkin/useSkin from @xgc2/ui-react`);
    }
  }

  process.stdout.write(`XGC2 UI policy ${reactVersion}: scanned ${roots.length} root(s), ${cssFiles.length} CSS file(s), ${sourceFiles.length} production script/HTML file(s)\n`);
  if (violations.length > 0) {
    process.stderr.write(`XGC2 visual policy violations:\n${violations.join('\n')}\n`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`XGC2 UI policy configuration error: ${error.message}\n${usage()}\n`);
  process.exitCode = 2;
});
