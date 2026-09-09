/**
 * Focused import-graph / source-absence gate for Robot asset kind composition.
 *
 * Product/profile roots wire the production composition through #xgc-profile.
 * This focused gate additionally:
 *  1. Proves shared production hosts never import the Unitree B2 leaf and
 *     contain no B2-specific residue.
 *  2. Follows production static imports for a B2-false entry (built-in seam +
 *     Robot / Experiment hosts) and a B2-true entry (explicit leaf compose).
 *
 * Product-root assembly:
 *   assembleRobotAssetKindComposition(
 *     ...builtInRobotAssetKindContributions,
 *     unitreeB2RobotAssetKindContribution,
 *   )
 *   <RobotAssetKindCompositionProvider composition={...}>
 * See web/test-fixtures/robot-kinds/README.md.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { finalModuleProvenancePlugin } from '../../../finalModuleProvenancePlugin';

declare const process: { cwd: () => string; pid: number };
declare const require: (module: string) => unknown;

const { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('fs') as {
  mkdirSync: (path: string, options: { recursive: true }) => void;
  readFileSync: (path: string, encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  rmSync: (path: string, options: { recursive: true; force: true }) => void;
  statSync: (path: string) => { isDirectory: () => boolean; isFile: () => boolean };
  writeFileSync: (path: string, data: string) => void;
};
const { tmpdir } = require('os') as { tmpdir: () => string };
const { join, relative, resolve } = require('path') as {
  join: (...paths: string[]) => string;
  relative: (from: string, to: string) => string;
  resolve: (...paths: string[]) => string;
};

type ViteBuild = (options: Record<string, unknown>) => Promise<unknown>;

const webRoot = process.cwd();
const scratchRoot = join(tmpdir(), `xgc-robot-kind-graph-${process.pid}-${Date.now()}`);
mkdirSync(scratchRoot, { recursive: true });

afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
});

const sharedProductionRoots = [
  'src/domains/robot',
  'src/domains/experiment',
  'src/panels/robot',
] as const;

const forbiddenSharedResidue = [
  /domains\/robot\/kinds\/unitree-b2/,
  /\bunitree_b2\b/,
  /\bunitreeB2\b/,
  /\bUnitreeB2\b/,
  /\bUNITREE_B2_/,
  /\bisUnitreeB2/,
];

describe('Robot kind source absence and static import graphs', () => {
  it('keeps shared Robot / Experiment / robot panel production free of the B2 leaf', () => {
    const violations: string[] = [];
    for (const root of sharedProductionRoots) {
      for (const file of productionFiles(resolve(webRoot, root))) {
        // Leaf package and its tests own B2 identifiers.
        if (file.includes(`${join('domains', 'robot', 'kinds', 'unitree-b2')}`)) continue;
        if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(file)) continue;
        const source = readFileSync(file, 'utf8');
        const rel = relative(webRoot, file).replace(/\\/g, '/');
        for (const pattern of forbiddenSharedResidue) {
          if (pattern.test(source)) {
            violations.push(`${rel}: ${pattern.source}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps B2-false host graph free of the leaf and includes the leaf only when composed', async () => {
    const falseEntry = join(scratchRoot, 'robot-kind-false.ts');
    const trueEntry = join(scratchRoot, 'robot-kind-true.ts');

    writeFileSync(falseEntry, `
import { RobotAssetsRoute } from ${JSON.stringify(resolve(webRoot, 'src/domains/robot/RobotAssetsRoute.tsx'))};
import { ExperimentRoute } from ${JSON.stringify(resolve(webRoot, 'src/domains/experiment/ExperimentRoute.tsx'))};
import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
  builtInRobotAssetKindComposition,
  RobotAssetKindCompositionProvider,
} from ${JSON.stringify(resolve(webRoot, 'src/domains/robot/robotAssetPublic.ts'))};
import { ExperimentRobotAssetsPanel } from ${JSON.stringify(resolve(webRoot, 'src/panels/robot/ExperimentRobotAssetsPanel.tsx'))};
export const HostA = RobotAssetsRoute;
export const HostB = ExperimentRoute;
export const HostC = ExperimentRobotAssetsPanel;
export const composition = assembleRobotAssetKindComposition(...builtInRobotAssetKindContributions);
export const builtIn = builtInRobotAssetKindComposition();
export const Provider = RobotAssetKindCompositionProvider;
`);

    writeFileSync(trueEntry, `
import { RobotAssetsRoute } from ${JSON.stringify(resolve(webRoot, 'src/domains/robot/RobotAssetsRoute.tsx'))};
import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
} from ${JSON.stringify(resolve(webRoot, 'src/domains/robot/robotAssetPublic.ts'))};
import { unitreeB2RobotAssetKindContribution } from ${JSON.stringify(resolve(webRoot, 'src/domains/robot/kinds/unitree-b2/index.ts'))};
export const Host = RobotAssetsRoute;
export const composition = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
  unitreeB2RobotAssetKindContribution,
);
`);

    const falseGraph = await buildFinalModuleGraph('robot-kind-false', falseEntry);
    const trueGraph = await buildFinalModuleGraph('robot-kind-true', trueEntry);

    expect(hasB2Leaf(falseGraph), 'B2-false graph must not import kinds/unitree-b2').toBe(false);
    expect(hasSeamModule(falseGraph), 'B2-false graph must include composition seam').toBe(true);
    expect(hasBuiltInContributions(falseGraph), 'B2-false graph must include built-in contributions').toBe(true);
    expect(hasRobotAssetsHost(falseGraph), 'B2-false graph must include Robot assets host').toBe(true);
    expect(hasExperimentHost(falseGraph), 'B2-false graph must include Experiment host').toBe(true);

    expect(hasB2Leaf(trueGraph), 'B2-true graph must import the B2 leaf').toBe(true);
    expect(hasSeamModule(trueGraph), 'B2-true graph must still include the seam').toBe(true);
    expect(hasBuiltInContributions(trueGraph), 'B2-true graph must keep built-ins').toBe(true);
  }, 240_000);
});

async function buildFinalModuleGraph(label: string, entryModule: string) {
  const evidencePath = join(scratchRoot, label, 'final-modules.json');
  const viteModule = await import('vite') as { build: ViteBuild };

  await viteModule.build({
    configFile: false,
    root: webRoot,
    plugins: [finalModuleProvenancePlugin(evidencePath)],
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      emptyOutDir: false,
      lib: {
        entry: entryModule,
        formats: ['es'],
        fileName: () => `${label}.js`,
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'lucide-react',
          '@xyflow/react',
        ],
      },
    },
  });

  const parsed = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
    inputs: Record<string, Record<string, never>>;
  };
  return Object.keys(parsed.inputs).map((id) => id.split('?')[0]!.replace(/\\/g, '/'));
}

function hasB2Leaf(ids: readonly string[]) {
  return ids.some((id) => id.includes('/domains/robot/kinds/unitree-b2/'));
}

function hasSeamModule(ids: readonly string[]) {
  return ids.some((id) => id.includes('/robotAssetKindComposition'));
}

function hasBuiltInContributions(ids: readonly string[]) {
  return ids.some((id) => id.includes('/builtInRobotAssetKindContributions'));
}

function hasRobotAssetsHost(ids: readonly string[]) {
  return ids.some((id) => id.includes('/RobotAssetsRoute'));
}

function hasExperimentHost(ids: readonly string[]) {
  return ids.some((id) => id.includes('/ExperimentRoute'));
}

function productionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...productionFiles(path));
    } else if (stat.isFile() && /\.(?:css|ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
