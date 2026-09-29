// @vitest-environment jsdom
/**
 * Experiment Robot assets roster under Experiment-runtime changes, for 8 / 32
 * / 100 robots. The Panel reads the Experiment runtime port (Session, Runs),
 * so a lifecycle or unowned Run change hands it a new runtime value; only
 * robot cards whose own data changed should re-render. Counts rendered
 * components (React DevTools' did-render rule) and robot card renders
 * (ExperimentRobotPortrait, one per card) per runtime change, plus CPU.
 *
 *   npm run perf:dashboard-renders -- robot-assets-roster
 */
import './reactCommitCounter';
import { writeFileSync } from 'node:fs';
import { act,cleanup,render } from '@testing-library/react';
import { afterAll,describe,expect,it,vi } from 'vitest';
import type * as ExperimentService from '../src/domains/experiment/experimentService';
import type { ExperimentDocument } from '../src/domains/experiment/experimentModel';
import type { PanelPluginContext } from '../src/panels/types';
import { ExperimentRobotAssetsPanel } from '../src/panels/robot/ExperimentRobotAssetsPanel';
import { EXPERIMENT_ROBOT_ASSETS_PANEL_ID } from '../src/panels/robot/experimentRobotAssetsPanelManifest';
import { cpuTimeMs } from './cpuTime';
import { startCommitSample,stopCommitSample,totalRenders } from './reactCommitCounter';
import { fleetAssets,fleetExperiment,fleetRobots } from './robotFleetFixture';

const experiments = vi.hoisted(() => new Map<string,unknown>());

vi.mock('../src/domains/experiment/experimentService',async (importOriginal) => ({
  ...await importOriginal<typeof ExperimentService>(),
  // The running Session's frozen roster (the Panel labels each robot's source from it).
  getExperimentAtCommit:vi.fn(async (resourceId:string) => experiments.get(resourceId)),
  listScenes:vi.fn(async () => []),
}));

const FLEET_SIZES = [8,32,100] as const;
const WARMUP_CHANGES = 5;
const MEASURED_CHANGES = 20;
/**
 * Components rendered per runtime change that concerns no robot: the roster
 * shell, its coordinate scene and group headers (23 today), independent of
 * the fleet size. Re-rendering every card costs ~14 components per robot.
 */
const ROSTER_RENDERS_PER_CHANGE = 40;

type RosterResult = {
  robots:number;
  cards:number;
  rendersPerChange:number;
  cardRendersPerChange:number;
  cpuMsPerChange:number;
  byComponent:Record<string,number>;
};

const results:RosterResult[] = [];

function median(values:readonly number[]) {
  const sorted = [...values].sort((a,b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function runtimeValue(experiment:ExperimentDocument,revision:number,shared:{ sessionViews:unknown[];activeRuns:unknown[] }) {
  return {
    targetId:'local',activeRuns:shared.activeRuns,processInstances:[],documents:[],catalog:[],
    // A Run the roster does not own advances (e.g. a System workflow).
    runSummaries:[{ id:'system-run',status:'running',revision }],runDetailsById:{},loading:false,error:'',
    selectedRunMode:'simulation',sessionViews:shared.sessionViews,
    experimentResourceId:experiment.head.resourceId,
  };
}

async function measureRoster(size:number):Promise<RosterResult> {
  const robots = fleetRobots(size);
  const experiment = fleetExperiment(robots);
  experiments.set(experiment.head.resourceId,experiment);
  const assets = fleetAssets(robots);
  const commit = vi.fn(async () => experiment);
  const shared = {
    activeRuns:[],
    sessionViews:[{
      session:{
        id:'session-1',targetId:'local',experimentResourceId:experiment.head.resourceId,
        experimentCommitId:experiment.branch.headCommitId,experimentDigest:experiment.head.digest,
        state:'active',mode:'full',runMode:'simulation',revision:1,
      },
      members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'panel-robot-instruments',kind:'workflow_run',
        ownerId:'robot-runtime-run',status:'running',revision:1,
      }],
    }],
  };
  const authoring = (id:string,target:string,value:unknown) => ({
    id,label:id,connected:true,disabledReason:'',value,commit,trace:{ target },
  });
  // The dashboard host hands the plugin a structurally stable context: only
  // the runtime port value is new on a runtime change.
  const context = (revision:number):PanelPluginContext<readonly ['experiment','automation']> => ({
    editing:false,executionTargetId:'local',
    ports:{
      actions:{},
      data:{
        robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:true,value:experiment,trace:{} },
        'robot-assets':{
          id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
          value:assetCatalog,trace:{},
        },
        'robot-runtime':{
          id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
          value:runtimeValue(experiment,revision,shared),trace:{ projection:'experiment.runtime.v1' },
        },
      },
      authoring:authoringPorts,
      interactions:{},
    },
  }) as unknown as PanelPluginContext<readonly ['experiment','automation']>;
  const assetCatalog = { assets,loading:false,error:'' };
  const authoringPorts = {
    'robots-editor':authoring('robots-editor','experiment.robots',experiment.spec.robots),
    'world-origin-offset-editor':authoring('world-origin-offset-editor','experiment.localizationOffset',experiment.spec.localizationOffset),
    'scene-editor':authoring('scene-editor','experiment.scene',experiment.spec.scene),
  };
  const panel = {
    id:'robot-assets',pluginId:EXPERIMENT_ROBOT_ASSETS_PANEL_ID,title:'Robot assets',gridPos:{ x:0,y:0,w:30,h:16 },
    query:{},options:{ dashboard:'config',gridColumns:30 },fieldConfig:{},portBindings:[],
  };
  const view = render(<ExperimentRobotAssetsPanel panel={panel} context={context(1)} />);
  // Let the frozen-roster read settle so source labels are final.
  await act(async () => { await Promise.resolve();await Promise.resolve(); });
  const cards = view.container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]').length;
  let revision = 1;
  const change = async () => {
    revision += 1;
    const next = context(revision);
    const started = cpuTimeMs();
    await act(async () => { view.rerender(<ExperimentRobotAssetsPanel panel={panel} context={next} />); });
    return cpuTimeMs() - started;
  };
  for (let index = 0; index < WARMUP_CHANGES; index += 1) await change();
  startCommitSample();
  const times:number[] = [];
  for (let index = 0; index < MEASURED_CHANGES; index += 1) times.push(await change());
  const sample = stopCommitSample();
  view.unmount();
  cleanup();
  return {
    robots:size,
    cards,
    rendersPerChange:Number((totalRenders(sample) / MEASURED_CHANGES).toFixed(1)),
    cardRendersPerChange:Number((totalRenders(sample,['ExperimentRobotPortrait']) / MEASURED_CHANGES).toFixed(1)),
    cpuMsPerChange:Number(median(times).toFixed(2)),
    byComponent:Object.fromEntries([...sample.renders.entries()].sort((a,b) => b[1] - a[1])),
  };
}

describe('Robot assets roster under Experiment-runtime changes',() => {
  afterAll(() => {
    process.stdout.write(`\n${results.map((result) => [
      `${String(result.robots).padStart(3)} robots cards=${result.cards}`,
      `renders=${result.rendersPerChange}/change`,
      `card renders=${result.cardRendersPerChange}/change`,
      `cpu=${result.cpuMsPerChange.toFixed(2)}ms/change`,
    ].join(' ')).join('\n')}\n\n`);
    if (process.env.XGC_PERF_DEBUG) {
      results.forEach((result) => process.stdout.write(`${result.robots} ${JSON.stringify(result.byComponent)}\n`));
    }
    const out = process.env.XGC_PERF_OUT;
    if (out) writeFileSync(out,`${JSON.stringify(results.map((result) => ({ ...result,byComponent:undefined })),null,1)}\n`);
  });

  it('warms up the roster',async () => {
    await measureRoster(32);
  },120_000);

  it.each(FLEET_SIZES)('%i robots',async (size) => {
    const result = await measureRoster(size);
    results.push(result);
    expect(result.cards).toBe(size);
    // No card's own data changed, so no card re-renders.
    expect(result.cardRendersPerChange).toBe(0);
    expect(result.rendersPerChange).toBeLessThanOrEqual(ROSTER_RENDERS_PER_CHANGE);
  },120_000);
});
