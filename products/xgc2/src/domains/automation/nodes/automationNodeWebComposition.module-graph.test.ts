import { afterAll,describe,expect,it } from 'vitest';
import { finalModuleProvenancePlugin } from '../../../../finalModuleProvenancePlugin';

declare const process: { cwd: () => string;pid: number };
declare const require: (module: string) => unknown;

const { mkdirSync,readFileSync,rmSync,writeFileSync } = require('fs') as {
  mkdirSync: (path: string,options: { recursive: true }) => void;
  readFileSync: (path: string,encoding: 'utf8') => string;
  rmSync: (path: string,options: { recursive: true;force: true }) => void;
  writeFileSync: (path: string,data: string) => void;
};
const { tmpdir } = require('os') as { tmpdir: () => string };
const { join,resolve } = require('path') as {
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
};

type ViteBuild = (options: Record<string,unknown>) => Promise<unknown>;

const webRoot = process.cwd();
const scratchRoot = join(tmpdir(),`xgc-automation-node-graph-${process.pid}-${Date.now()}`);
mkdirSync(scratchRoot,{ recursive: true });

afterAll(() => {
  rmSync(scratchRoot,{ recursive: true,force: true });
});

describe('Automation node web composition module graph', () => {
  it('keeps CoreFlow graph rules out of the generic validation shell', () => {
    const sharedValidation = [
      'src/domains/automation/automationValidation.ts',
      'src/domains/automation/automationCalledFlowValidation.ts',
    ].map((path) => readFileSync(resolve(webRoot,path),'utf8')).join('\n');

    for (const kind of ['stop-and-error','condition','filter','switch']) {
      expect(sharedValidation, `${kind} validation must be leaf-owned`).not.toMatch(
        new RegExp(`["']${kind}["']`),
      );
    }
  });

  it('keeps Parameter and GroundStation library chrome out of the generic shell maps', () => {
    const shellLibrary = readFileSync(resolve(webRoot,'src/domains/automation/automationNodeLibrary.ts'),'utf8');
    const shellVisuals = readFileSync(resolve(webRoot,'src/domains/automation/automationNodeVisuals.ts'),'utf8');
    for (const kind of [
      'trigger.manual','process.run-definition','automation.call','automation.return',
      'gcs.request-confirmation','human.wait-confirmation','gcs.status-card','gcs.offer-context',
    ]) {
      expect(shellLibrary, `${kind} library must be leaf-owned`).not.toMatch(
        new RegExp(`['"]${kind.replace(/\./g,'\\.')}['"]\\s*:`),
      );
      expect(shellVisuals, `${kind} icon must be leaf-owned`).not.toMatch(
        new RegExp(`['"]${kind.replace(/\./g,'\\.')}['"]\\s*:`),
      );
    }
  });

  it('keeps the route factory leaf-free and includes only explicitly composed adapters', async () => {
    const factoryEntry = join(scratchRoot,'factory-entry.ts');
    const emptyEntry = join(scratchRoot,'empty-entry.ts');
    const mediaEntry = join(scratchRoot,'media-entry.ts');
    const coreFlowEntry = join(scratchRoot,'core-flow-entry.ts');
    writeFileSync(factoryEntry, `
import { createAutomationsRoute } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/createAutomationsRoute.ts'))};
export const factory = createAutomationsRoute;
`);
    writeFileSync(emptyEntry, `
import { createAutomationsRoute } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/createAutomationsRoute.ts'))};
import {
  emptyAutomationNodeWebComposition,
} from ${JSON.stringify(resolve(webRoot,'src/domains/automation/nodes/automationNodeWebComposition.ts'))};
export const route = createAutomationsRoute(emptyAutomationNodeWebComposition());
`);
    writeFileSync(mediaEntry, `
import { createAutomationsRoute } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/createAutomationsRoute.ts'))};
import { composeAutomationNodeWeb } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/nodes/automationNodeWebComposition.ts'))};
import { mediaCaptureSnapshotContribution } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/nodes/media/mediaCaptureSnapshotContribution.ts'))};
export const composition = composeAutomationNodeWeb(mediaCaptureSnapshotContribution);
export const route = createAutomationsRoute(composition);
`);
    writeFileSync(coreFlowEntry, `
import { createAutomationsRoute } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/createAutomationsRoute.ts'))};
import { composeAutomationNodeWeb } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/nodes/automationNodeWebComposition.ts'))};
import { coreFlowAutomationNodeContributions } from ${JSON.stringify(resolve(webRoot,'src/domains/automation/nodes/coreFlow/coreFlowAutomationNodeContributions.ts'))};
export const composition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);
export const route = createAutomationsRoute(composition);
`);
    const factory = await buildFinalModuleGraph('automation-factory',factoryEntry);
    const empty = await buildFinalModuleGraph('automation-empty',emptyEntry);
    const media = await buildFinalModuleGraph('automation-media',mediaEntry);
    const coreFlow = await buildFinalModuleGraph('automation-core-flow',coreFlowEntry);

    expect(hasFactoryModule(factory), 'factory-only graph must contain the route factory').toBe(true);
    expect(concreteNodeModules(factory), 'factory-only graph must contain no concrete leaf').toEqual([]);
    expect(hasWorkspaceModule(factory), 'factory must retain the real Automation route host').toBe(true);

    expect(hasFactoryModule(empty), 'empty graph must contain the route factory').toBe(true);
    expect(hasSeamModule(empty), 'empty graph must contain the composition seam').toBe(true);
    expect(concreteNodeModules(empty), 'empty composition must attach no concrete adapter').toEqual([]);

    expect(hasFactoryModule(media), 'Media graph must contain the route factory').toBe(true);
    expect(hasSeamModule(media), 'Media graph must contain the composition seam').toBe(true);
    expect(hasWorkspaceModule(media), 'Media graph must retain the real Automation route host').toBe(true);
    expect(concreteNodeModules(media)).toEqual([
      normalized(resolve(webRoot,'src/domains/automation/nodes/media/mediaCaptureSnapshotContribution.ts')),
    ]);

    expect(hasFactoryModule(coreFlow), 'CoreFlow graph must contain the route factory').toBe(true);
    expect(hasSeamModule(coreFlow), 'CoreFlow graph must contain the composition seam').toBe(true);
    expect(hasWorkspaceModule(coreFlow), 'CoreFlow graph must retain the real Automation route host').toBe(true);
    expect(coreFlowSourceModules(coreFlow)).toEqual(expect.arrayContaining([
      normalized(resolve(webRoot,'src/domains/automation/nodes/coreFlow/coreFlowAutomationNodeContributions.ts')),
      normalized(resolve(webRoot,'src/domains/automation/nodes/coreFlow/AutomationConditionParameters.tsx')),
      normalized(resolve(webRoot,'src/domains/automation/nodes/coreFlow/automationConditionModel.ts')),
      normalized(resolve(webRoot,'src/domains/automation/nodes/coreFlow/automation-condition.css')),
    ]));
    expect(coreFlowSourceModules(empty), 'empty composition must exclude the complete CoreFlow source leaf').toEqual([]);
    expect(coreFlowSourceModules(media), 'Media-only composition must exclude the complete CoreFlow source leaf').toEqual([]);

  },240_000);
});

async function buildFinalModuleGraph(label: string,entryModule: string) {
  const evidencePath = join(scratchRoot,label,'final-modules.json');
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

  const parsed = JSON.parse(readFileSync(evidencePath,'utf8')) as {
    inputs: Record<string,Record<string,never>>;
  };
  return Object.keys(parsed.inputs).map((id) => normalized(id.split('?')[0]!));
}

function normalized(id: string) {
  return id.replace(/\\/g,'/');
}

function concreteNodeModules(ids: readonly string[]) {
  return ids.filter((id) => (
    id.includes('/src/domains/automation/nodes/')
    && !id.includes('/nodes/automationNodeWebComposition')
  ));
}

function coreFlowSourceModules(ids: readonly string[]) {
  return ids.filter((id) => id.includes('/src/domains/automation/nodes/coreFlow/'));
}

function hasSeamModule(ids: readonly string[]) {
  return ids.some((id) => id.includes('/nodes/automationNodeWebComposition'));
}

function hasFactoryModule(ids: readonly string[]) {
  return ids.some((id) => id.includes('/createAutomationsRoute'));
}

function hasWorkspaceModule(ids: readonly string[]) {
  return ids.some((id) => id.includes('/AutomationDefinitionWorkspace'));
}
