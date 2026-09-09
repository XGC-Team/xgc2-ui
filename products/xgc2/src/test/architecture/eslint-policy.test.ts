import { ESLint } from 'eslint';
import { describe,expect,it } from 'vitest';

const eslint = new ESLint({
  overrideConfigFile: 'eslint.config.js',
});

const quietEslint = new ESLint({
  overrideConfigFile: 'eslint.config.js',
  ruleFilter: ({ severity }) => severity === 2,
});

describe('frontend ESLint architecture policy', () => {
  it('blocks fetch in components', async () => {
    const messages = await lintMessages('src/components/RobotCard.tsx', [
      'export function RobotCard() {',
      "  fetch('/api/robots');",
      '  return null;',
      '}',
    ]);

    expect(messages).toContain('fetch is only allowed in src/api/http.ts.');
  });

  it('allows fetch in api/http', async () => {
    const messages = await lintMessages('src/api/http.ts', [
      'export async function request(path: string) {',
      '  return fetch(path);',
      '}',
    ]);

    expect(messages).not.toContain('fetch is only allowed in src/api/http.ts.');
  });

  it('blocks hidden api adapters from using transport primitives', async () => {
    const messages = await lintMessages('src/api/hiddenAdapter.ts', [
      'export function hiddenAdapter() {',
      "  fetch('/api/robots');",
      "  const events = new EventSource('/api/robots/events');",
      "  const socket = new WebSocket('/terminal/ws');",
      '  return [events, socket];',
      '}',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'fetch is only allowed in src/api/http.ts.',
      'EventSource is only allowed in src/api/streams.ts.',
      'WebSocket construction is only allowed in approved transport adapters.',
    ]));
  });

  it('blocks WebSocket construction in components', async () => {
    const messages = await lintMessages('src/components/TerminalPanel.tsx', [
      'export function TerminalPanel() {',
      "  const socket = new WebSocket('/terminal/ws');",
      '  return socket.url;',
      '}',
    ]);

    expect(messages).toContain('WebSocket construction is only allowed in approved transport adapters.');
  });

  it('blocks global and bracket transport access outside adapters', async () => {
    const messages = await lintMessages('src/domains/experiment/sneaky.ts', [
      "globalThis.fetch('/api/x');",
      "window['fetch']('/api/y');",
      "new globalThis['WebSocket']('/ws');",
      "new window['EventSource']('/events');",
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'fetch is only allowed in src/api/http.ts.',
      'EventSource is only allowed in src/api/streams.ts.',
      'WebSocket construction is only allowed in approved transport adapters.',
    ]));
  });

  it('blocks transport aliases outside adapters', async () => {
    const messages = await lintMessages('src/features/terminal/sneaky.ts', [
      'const f = fetch;',
      "f('/api/x');",
      'const WS = WebSocket;',
      "new WS('/ws');",
      'const Events = EventSource;',
      "new Events('/events');",
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'fetch aliases are not allowed outside approved transport adapters.',
      'fetch alias use is only allowed in src/api/http.ts.',
      'WebSocket aliases are not allowed outside approved transport adapters.',
      'WebSocket alias construction is only allowed in approved transport adapters.',
      'EventSource aliases are not allowed outside approved transport adapters.',
      'EventSource alias construction is only allowed in src/api/streams.ts.',
    ]));
  });

  it('blocks dynamic global transport property access outside adapters', async () => {
    const messages = await lintMessages('src/domains/experiment/sneaky.ts', [
      "const fetchKey = 'fetch';",
      "window[fetchKey]('/api/x');",
      "globalThis[['WebSocket'].join('')]('/ws');",
    ]);

    expect(messages).toContain('Dynamic window/globalThis property access is not allowed outside approved transport adapters.');
  });

  it('allows WebSocket construction only in api/ws', async () => {
    const allowedMessages = await lintMessages('src/api/ws.ts', [
      'export function open(url: string) {',
      '  const socket = new WebSocket(url);',
      '  return socket.readyState === WebSocket.OPEN;',
      '}',
    ]);
    const terminalMessages = await lintMessages('src/features/terminal/terminalTransport.ts', [
      'export function open(url: string) {',
      '  const socket = new WebSocket(url);',
      '  return socket.readyState === WebSocket.OPEN;',
      '}',
    ]);

    expect(allowedMessages).not.toContain('WebSocket construction is only allowed in approved transport adapters.');
    expect(allowedMessages).not.toContain('WebSocket state constants are only allowed in approved transport adapters.');
    expect(terminalMessages).toEqual(expect.arrayContaining([
      'WebSocket construction is only allowed in approved transport adapters.',
      'WebSocket state constants are only allowed in approved transport adapters.',
    ]));
  });

  it('blocks API imports from components', async () => {
    const messages = await lintMessages('src/components/RobotCard.tsx', [
      "import { request } from '../api/http';",
      'export function RobotCard() {',
      '  return request;',
      '}',
    ]);

    expect(messages).toContain('Components, pages, and panels must not import transport API modules from "../api/http".');
  });

  it('blocks business imports from pure components', async () => {
    const messages = await lintMessages('src/components/RobotCard.tsx', [
      "import { useRobotStates } from '../domains/robot/robotPublic';",
      "import { connectTerminalTransport } from '../features/terminal/terminalTransport';",
      'export function RobotCard() {',
      '  return [useRobotStates, connectTerminalTransport];',
      '}',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'Pure components must not import business modules from "../domains/robot/robotPublic". Move business views to domains/features/panels.',
      'Pure components must not import business modules from "../features/terminal/terminalTransport". Move business views to domains/features/panels.',
    ]));
  });

  it('blocks route imports of transport API modules', async () => {
    const messages = await lintMessages('src/domains/terminal/TerminalRoute.tsx', [
      "import { request } from '../../api/http';",
      'export function TerminalRoute() {',
      '  return request;',
      '}',
    ]);

    expect(messages).toContain('Only service/transport modules may import transport API modules from "../../api/http".');
  });

  it('allows service modules to import transport API modules', async () => {
    const messages = await lintMessages('src/domains/terminal/terminalService.ts', [
      "import { request } from '../../api/http';",
      'export function listTerminalHosts() {',
      "  return request('/terminal/hosts');",
      '}',
    ]);

    expect(messages).not.toContain('Only service/transport modules may import transport API modules from "../../api/http".');
  });

  it('allows a real cross-domain public service owner to import the transport API', async () => {
    const messages = await lintMessages('src/domains/usernode/usernodeCatalogServicePublic.ts', [
      "import { request } from '../../api/http';",
      'export function listUsernodes() {',
      "  return request('/usernode-assets');",
      '}',
    ]);

    expect(messages).not.toContain('Only service/transport modules may import transport API modules from "../../api/http".');
  });

  it('blocks feature modules importing domains', async () => {
    const messages = await lintMessages('src/features/terminal/terminalTransport.ts', [
      "import { getTerminalWebSocketTicket } from '../../domains/terminal/terminalService';",
      'export function connect() {',
      '  return getTerminalWebSocketTicket;',
      '}',
    ]);

    expect(messages).toContain('Feature modules must not import domain modules from "../../domains/terminal/terminalService". Use dependency injection or move domain-specific code into the domain.');
  });

  it('blocks AppRoutes imports of domain service/store internals', async () => {
    const messages = await lintMessages('src/app/AppRoutes.tsx', [
      "import { listExperiments } from '../domains/experiment/experimentService';",
      "import { useExecutionTarget } from '../domains/execution/useExecutionTarget';",
      'export function AppRoutes() {',
      '  return [listExperiments, useExecutionTarget];',
      '}',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'App/root modules must not import domain internals from "../domains/experiment/experimentService".',
      'App/root modules must not import domain internals from "../domains/execution/useExecutionTarget".',
    ]));
  });

  it('blocks domain model imports from app navigation', async () => {
    const messages = await lintMessages('src/domains/experiment/experimentModel.ts', [
      "export { defaultDashboard } from '../../app/navigation/navConfig';",
    ]);

    expect(messages).toContain('Domain modules must not import app modules from "../../app/navigation/navConfig".');
  });

  it('blocks domain dashboard components from importing app topbar', async () => {
    const messages = await lintMessages('src/domains/experiment/dashboard/ExperimentDashboardTopbar.tsx', [
      "import { DashboardTabs } from '../../../app/navigation/topbar';",
      'export function ExperimentDashboardTopbar() {',
      '  return DashboardTabs;',
      '}',
    ]);

    expect(messages).toContain('Domain modules must not import app modules from "../../../app/navigation/topbar".');
  });

  it('allows route glue to import app navigation context', async () => {
    const messages = await lintMessages('src/domains/terminal/TerminalRoute.tsx', [
      "import { useNavigation } from '../../app/navigationContext';",
      "import { useTargetCore } from '../../app/useTargetCore';",
      'export function TerminalRoute() {',
      '  return [useNavigation, useTargetCore];',
      '}',
    ]);

    expect(messages).not.toContain('Domain modules must not import app modules from "../../app/navigationContext".');
    expect(messages).not.toContain('Domain modules must not import app modules from "../../app/useTargetCore".');
  });

  it('blocks domain pages from importing app navigation config', async () => {
    const containerMessages = await lintMessages('src/domains/container/ContainerPage.tsx', [
      "import type { ContainerTab } from '../../app/navigation/navConfig';",
      'export function ContainerPage(_props: { activeTab: ContainerTab }) {',
      '  return null;',
      '}',
    ]);
    const settingsMessages = await lintMessages('src/domains/settings/SettingsPage.tsx', [
      "import { skinOptions, type SkinName } from '../../app/navigation/navConfig';",
      'export function SettingsPage(_props: { skin: SkinName }) {',
      '  return skinOptions;',
      '}',
    ]);

    expect(containerMessages).toContain('Domain modules must not import app modules from "../../app/navigation/navConfig".');
    expect(settingsMessages).toContain('Domain modules must not import app modules from "../../app/navigation/navConfig".');
  });

  it('blocks route glue from importing arbitrary app modules', async () => {
    const messages = await lintMessages('src/domains/terminal/TerminalRoute.tsx', [
      "import { terminalTabs } from '../../app/navigation/navConfig';",
      'export function TerminalRoute() {',
      '  return terminalTabs;',
      '}',
    ]);

    expect(messages).toContain('Domain modules must not import app modules from "../../app/navigation/navConfig".');
  });

  it('blocks cross-domain internal imports', async () => {
    const messages = await lintMessages('src/domains/experiment/ExperimentRoute.tsx', [
      "import { useExecutionTarget } from '../execution/useExecutionTarget';",
      'export function ExperimentRoute() {',
      '  return useExecutionTarget;',
      '}',
    ]);

    expect(messages).toContain('Cross-domain imports must target a public domain entry point, not "../execution/useExecutionTarget".');
  });

  it('blocks panels from importing domain service or store internals', async () => {
    const messages = await lintMessages('src/panels/execution/BadPanel.tsx', [
      "import { listProcessInstances } from '../../domains/execution/executionService';",
      "import { useExecutionTarget } from '../../domains/execution/useExecutionTarget';",
      'export function BadPanel() {',
      '  return [listProcessInstances, useExecutionTarget];',
      '}',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'Panels must import domain public entry points, not "../../domains/execution/executionService".',
      'Panels must import domain public entry points, not "../../domains/execution/useExecutionTarget".',
    ]));
  });

  it('blocks capability string obfuscation', async () => {
    const messages = await lintMessages('src/domains/experiment/dashboard/sneaky.ts', [
      "export const capability = ['exec', 'ution'].join('') + '.process.control';",
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'Do not obfuscate capability, permission, or route strings with join("").',
    ]));
  });

  it('blocks raw timers outside approved modules', async () => {
    const messages = await lintMessages('src/domains/experiment/routes/ExperimentRoute.tsx', [
      'export function poll() {',
      '  window.setTimeout(poll, 1000);',
      '  setInterval(poll, 1000);',
      '}',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'setTimeout is only allowed in approved polling, transport, or UI timer modules.',
      'setInterval polling is only allowed in approved transport adapters.',
    ]));
  });

  it('blocks fixed polling in Automation and camera calibration runtimes', async () => {
    const automationMessages = await lintMessages('src/domains/automation/useTerminalRun.ts', [
      "import { usePolling } from '../../hooks/usePolling';",
      'export function useTerminalRun() { return usePolling; }',
    ]);
    const cameraMessages = await lintMessages('src/panels/camera/useCalibrationState.ts', [
      "import { usePolling } from '../../hooks/usePolling';",
      'export function useCalibrationState() { return usePolling; }',
    ]);

    const message = 'Automation and camera calibration runtimes must reconcile from execution events, exact mutation responses, and media streams; fixed polling is forbidden.';
    expect(automationMessages).toContain(message);
    expect(cameraMessages).toContain(message);
  });

  it('blocks unknown top-level src directories', async () => {
    const messages = await lintMessages('src/workers/sessionWorker.ts', [
      'export const workerName = "session";',
    ]);

    expect(messages).toEqual(expect.arrayContaining([
      'Unknown src top-level directory "workers". New source must live in an approved domain/layer.',
      'File does not match any element pattern',
    ]));
  });

  it('keeps warning-only files passing under quiet lint filtering', async () => {
    const code = [
      'export function debug(value: string) {',
      '  console.log(value);',
      '}',
    ];

    const reportMessages = await lintMessages('src/shared/utils/debug.ts', code);
    const quietMessages = await lintMessages('src/shared/utils/debug.ts', code, { quiet: true });

    expect(reportMessages.some((message) => message.startsWith('Unexpected console statement.'))).toBe(true);
    expect(quietMessages).toEqual([]);
  });

  it('blocks dynamic code execution', async () => {
    const messages = await lintMessages('src/domains/automation/orchestrationPreview.ts', [
      'export function preview(value: string) {',
      '  return Function(value)();',
      '}',
    ]);

    expect(messages).toContain('The Function constructor is eval.');
  });

  it('blocks as never casts in production code', async () => {
    const messages = await lintMessages('src/domains/experiment/routes/BadRoute.tsx', [
      'type Page = "automations";',
      'export function open(navigate: (page: Page) => void) {',
      '  navigate("automations" as never);',
      '}',
    ]);

    expect(messages).toContain('Do not use "as never" in production code.');
  });
});

async function lintMessages(filePath: string, lines: string[], options: { quiet?: boolean } = {}): Promise<string[]> {
  const [result] = await (options.quiet ? quietEslint : eslint).lintText(`${lines.join('\n')}\n`, {
    filePath,
  });

  return result.messages.map((message) => message.message);
}
