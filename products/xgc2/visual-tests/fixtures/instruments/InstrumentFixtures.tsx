// Developer fixture surface for the plan-7 instrument visual review.
// Renders the REAL instrument component tree (RobotInstrumentProjection /
// RobotListProjection inside the real card shell and grid) with simulated
// telemetry. The page is clearly marked as a fixture; values are not live
// robot data. Served only inside the review driver's Playwright context via a
// document-level route interception; the product app never routes here.

import { useMemo,type CSSProperties } from 'react';
import { useSkin } from '@xgc2/ui-react';
import { RobotInstrumentProjection } from '../../../src/panels/robot/RobotInstrumentProjection';
import { RobotListProjection } from '../../../src/panels/robot/RobotListProjection';
import type { RobotPanelItem } from '../../../src/panels/robot/robotProjectionModel';
import type { RobotProjectionChannels } from '../../../src/panels/robot/useRobotProjectionChannels';
import '../../../src/styles/robot.css';
import './instrument-fixtures.css';
import {
  fixtureProjection,
  fixtureRobot,
  fixtureRobotIds,
  fixtureRobotName,
  type InstrumentFixtureBattery,
  type InstrumentFixtureKind,
} from './instrumentFixtureData';

type FixturePresentation = 'single' | 'double' | 'list';

type FixtureScenario = {
  presentation: FixturePresentation;
  kind: InstrumentFixtureKind;
  battery: InstrumentFixtureBattery | 'mixed';
  selected: boolean;
  chassisHold: boolean;
  density: 'comfortable' | 'compact' | 'dense';
  label: string;
};

const wall4MixedBatteries: readonly InstrumentFixtureBattery[] = ['healthy96','low6','healthy96','full100'];

export function InstrumentFixtures() {
  const scenario = useMemo(readScenario, []);
  useSkin({
    defaultSkin: readSkin(),
    storageKey: 'xgc.instrument-fixtures.skin',
  });
  const robots = useMemo(() => buildRobots(scenario), [scenario]);
  const instrument = scenario.presentation !== 'list';
  const boardHeight = Math.max(220, window.innerHeight - 96);
  return (
    <main className="xgc-instrument-fixtures" data-xgc-role="instrument-fixtures">
      <header className="xgc-instrument-fixtures-banner" data-xgc-role="instrument-fixture-banner">
        <strong>FIXTURE</strong>
        <span>Simulated instrument telemetry — not live robot data. 模拟遥测,非真实机器人数据。</span>
        <code data-xgc-role="instrument-fixture-scenario">{scenario.label}</code>
      </header>
      <div
        className="robot-instruments-panel"
        data-xgc-role="run-robot-instruments"
        data-xgc-id="instrument-fixtures"
        data-xgc-mode={scenario.presentation}
      >
        <div
          className="robot-instrument-grid"
          data-xgc-layout={scenario.presentation}
          data-xgc-density={scenario.presentation === 'list' ? scenario.density : undefined}
          style={scenario.presentation === 'list' ? undefined : {
            '--robot-instrument-board-height': `${boardHeight}px`,
          } as CSSProperties}
          aria-label="Robot instruments"
        >
          {robots.map(({ robot,projection },index) => (
            <article
              key={robot.id}
              className="robot-instrument-card robot-selectable-robot"
              data-xgc-role="run-robot-card"
              data-xgc-id={robot.id}
              data-xgc-health="healthy"
              data-xgc-status={projection.status.status}
              data-xgc-presentation={instrument ? 'instrument' : 'list'}
              data-xgc-platform={projection.flight ? 'flight' : 'ground'}
              data-xgc-chassis-hold={scenario.chassisHold ? 'true' : undefined}
              data-xgc-fixture-battery={batteryOf(scenario,index)}
              role="button"
              aria-pressed={scenario.selected && index === 0}
              tabIndex={0}
            >
              {instrument
                ? <RobotInstrumentProjection robot={robot} projection={projection} healthTone="healthy" />
                : <RobotListProjection robot={robot} projection={projection} healthTone="healthy" />}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function batteryOf(scenario: FixtureScenario, index: number): InstrumentFixtureBattery {
  return scenario.battery === 'mixed'
    ? wall4MixedBatteries[index % wall4MixedBatteries.length]!
    : scenario.battery;
}

function buildRobots(scenario: FixtureScenario): ReadonlyArray<{ robot: RobotPanelItem; projection: RobotProjectionChannels }> {
  const ids = fixtureRobotIds(scenario.kind);
  const leafKind = scenario.kind === 'wall4' ? 'scout' : scenario.kind;
  return ids.map((id, index) => {
    const robot = fixtureRobot(leafKind, id, fixtureRobotName(leafKind, id));
    return { robot, projection: fixtureProjection(leafKind, batteryOf(scenario, index)) };
  });
}

function readScenario(): FixtureScenario {
  const params = new URLSearchParams(window.location.search);
  const presentation = parseEnum<FixturePresentation>(params.get('presentation'), ['single','double','list'], 'double');
  const kind = parseEnum<InstrumentFixtureKind>(params.get('kind'), ['scout','mecanum','fs150','wall4'], 'scout');
  const battery = parseEnum<InstrumentFixtureBattery | 'mixed'>(
    params.get('battery'),
    ['healthy96','low6','full100','missing','mixed'],
    kind === 'wall4' ? 'mixed' : 'healthy96',
  );
  const density = parseEnum<'comfortable' | 'compact' | 'dense'>(params.get('density'), ['comfortable','compact','dense'], 'comfortable');
  const selected = params.get('selected') === '1';
  const chassisHold = params.get('chassisHold') === '1';
  return {
    presentation,
    kind,
    battery,
    selected,
    chassisHold,
    density,
    label: [
      `presentation=${presentation}`,
      `kind=${kind}`,
      `battery=${battery}`,
      `density=${density}`,
      selected ? 'selected' : null,
      chassisHold ? 'chassisHold' : null,
    ].filter(Boolean).join(' '),
  };
}

function readSkin(): 'dark' | 'light' {
  return new URLSearchParams(window.location.search).get('skin') === 'light' ? 'light' : 'dark';
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
