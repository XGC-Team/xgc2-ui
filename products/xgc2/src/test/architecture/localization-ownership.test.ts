import type * as TypeScript from 'typescript';
import { describe,expect,it } from 'vitest';
import { navigationZhMessages } from '../../app/navigation/navigationMessages';
import { automationAuthoringZhMessages } from '../../domains/automation/automationAuthoringMessages';
import { automationCanvasZhMessages } from '../../domains/automation/automationCanvasMessages';
import { automationExecutionZhMessages } from '../../domains/automation/automationExecutionMessages';
import { automationSharedZhMessages } from '../../domains/automation/automationSharedMessages';
import { automationTriggerZhMessages } from '../../domains/automation/automationTriggerMessages';
import { assetsZhMessages } from '../../domains/assets/assetsMessages';
import { executionZhMessages } from '../../domains/execution/executionMessages';
import { experimentZhMessages } from '../../domains/experiment/experimentMessages';
import { experimentAgentZhMessages } from '../../domains/groundStationInteraction/experimentAgentMessages';
import { groundStationZhMessages } from '../../domains/groundStationInteraction/groundStationMessages';
import { hostZhMessages } from '../../domains/host/hostMessages';
import { robotZhMessages } from '../../domains/robot/robotMessages';
import { terminalZhMessages } from '../../domains/terminal/terminalMessages';
import { commonZhMessages } from '../../shared/localization/commonMessages';
import { cameraZhMessages } from '../../panels/camera/cameraMessages';
import { rosPanelZhMessages } from '../../panels/ros/rosMessages';
import { runtimePanelZhMessages } from '../../panels/runtime/runtimeMessages';
import { formatLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;
const ts = require('typescript') as typeof TypeScript;
const { readFileSync,readdirSync,statSync } = require('fs') as {
  readFileSync: (path: string,encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean;isFile: () => boolean };
};
const { relative,resolve } = require('path') as {
  relative: (from: string,to: string) => string;
  resolve: (...paths: string[]) => string;
};

const catalogs: ReadonlyArray<{ owner: string; messages: MessageCatalog }> = [
  { owner: 'shared',messages: commonZhMessages },
  { owner: 'navigation',messages: navigationZhMessages },
  { owner: 'automation-shared',messages: automationSharedZhMessages },
  { owner: 'automation-authoring',messages: automationAuthoringZhMessages },
  { owner: 'automation-canvas',messages: automationCanvasZhMessages },
  { owner: 'automation-trigger',messages: automationTriggerZhMessages },
  { owner: 'automation-execution',messages: automationExecutionZhMessages },
  { owner: 'experiment',messages: experimentZhMessages },
  { owner: 'execution',messages: executionZhMessages },
  { owner: 'ground-station',messages: groundStationZhMessages },
  { owner: 'experiment-agent',messages: experimentAgentZhMessages },
  { owner: 'robot',messages: robotZhMessages },
  { owner: 'terminal',messages: terminalZhMessages },
  { owner: 'assets',messages: assetsZhMessages },
  { owner: 'host',messages: hostZhMessages },
  { owner: 'camera-panel',messages: cameraZhMessages },
  { owner: 'ros-panel',messages: rosPanelZhMessages },
  { owner: 'runtime-panel',messages: runtimePanelZhMessages },
];

describe('localized message ownership', () => {
  it('assigns every translated source phrase to exactly one owner', () => {
    const ownerByPhrase = new Map<string,string>();
    const conflicts: string[] = [];
    for (const catalog of catalogs) {
      for (const phrase of Object.keys(catalog.messages)) {
        const previousOwner = ownerByPhrase.get(phrase);
        if (previousOwner) conflicts.push(`${phrase}: ${previousOwner}, ${catalog.owner}`);
        ownerByPhrase.set(phrase, catalog.owner);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('resolves shared and domain copy without a global aggregate catalog', () => {
    expect(formatLocalizedText('zh-CN', automationAuthoringZhMessages, 'Run {name}', { name: '巡检' })).toBe('运行 巡检');
    expect(formatLocalizedText('zh-CN', experimentZhMessages, 'Select Robot asset')).toBe('选择机器人资产');
    expect(formatLocalizedText('zh-CN', executionZhMessages, 'Kill all')).toBe('全部强制终止');
    expect(formatLocalizedText('zh-CN', executionZhMessages, 'Kill')).toBe('强制终止');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Kill')).toBe('Kill');
    expect(formatLocalizedText('zh-CN', groundStationZhMessages, 'Confirmation wait expired')).toBe('等待确认已超时');
    expect(formatLocalizedText('zh-CN', navigationZhMessages, 'Collapse navigation')).toBe('收起导航');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Simulation experiment')).toBe('仿真实验');
    expect(formatLocalizedText('en-US', robotZhMessages, 'Simulation experiment')).toBe('Simulation experiment');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Chassis')).toBe('底盘');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Firmware / vendor')).toBe('飞控 / 品牌');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Multirotor')).toBe('多旋翼');
    expect(formatLocalizedText('zh-CN', robotZhMessages, 'Unicycle')).toBe('独轮车');
    expect(formatLocalizedText('zh-CN', terminalZhMessages, 'Search hosts')).toBe('搜索主机');
    expect(formatLocalizedText('zh-CN', terminalZhMessages, 'All groups')).toBe('全部分组');
    expect(formatLocalizedText('zh-CN', terminalZhMessages, 'Default')).toBe('默认');
    expect(formatLocalizedText('zh-CN', terminalZhMessages, 'Ungrouped')).toBe('未分组');
    expect(formatLocalizedText('zh-CN', assetsZhMessages, 'Ungrouped')).toBe('未分组');
    expect(formatLocalizedText('zh-CN', experimentZhMessages, 'Select an Experiment run mode.')).toBe('请选择实验运行模式。');
    expect(formatLocalizedText('zh-CN', cameraZhMessages, 'Select an Experiment run mode.')).toBe('请选择实验运行模式。');
    expect(formatLocalizedText('zh-CN', assetsZhMessages, 'User assets')).toBe('用户资产');
    expect(formatLocalizedText('zh-CN', assetsZhMessages, 'System scripts')).toBe('系统脚本');
    expect(formatLocalizedText('zh-CN', assetsZhMessages, 'User scripts')).toBe('用户脚本');
    expect(formatLocalizedText('zh-CN', hostZhMessages, 'Search PID, user, process')).toBe('搜索 PID、用户、进程');
    expect(formatLocalizedText('zh-CN', hostZhMessages, 'No files')).toBe('没有文件');
    expect(formatLocalizedText('en-US', hostZhMessages, 'No files')).toBe('No files');
  });

  it('catalogs every literal key used through the audited localization hooks', () => {
    const webRoot = process.cwd();
    const shared = [commonZhMessages];
    const scopes: StaticCatalogScope[] = [
      {root: resolve(webRoot,'src/domains/groundStationInteraction'),hook:'useExperimentAgentText',messages:[experimentAgentZhMessages,...shared]},
      {
        root: resolve(webRoot,'src/domains/automation'),hook: 'useAutomationAuthoringText',
        messages: [automationAuthoringZhMessages,automationSharedZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/automation'),hook: 'useAutomationCanvasText',
        messages: [automationCanvasZhMessages,automationSharedZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/automation'),hook: 'useAutomationExecutionText',
        messages: [automationExecutionZhMessages,automationSharedZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/automation'),hook: 'useAutomationTriggerText',
        messages: [automationTriggerZhMessages,automationSharedZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/experiment'),hook: 'useExperimentText',
        messages: [experimentZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/execution'),hook: 'useExecutionText',
        messages: [executionZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/host'),hook: 'useHostText',
        messages: [hostZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/domains/robot'),hook: 'useRobotText',
        messages: [robotZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/panels/robot'),hook: 'useRobotText',
        messages: [robotZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/panels/automation'),hook: 'useAutomationExecutionText',
        messages: [automationExecutionZhMessages,automationSharedZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/panels/camera'),hook: 'useCameraText',
        messages: [cameraZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/panels/ros'),hook: 'useRosPanelText',
        messages: [rosPanelZhMessages,...shared],
      },
      {
        root: resolve(webRoot,'src/panels/runtime'),hook: 'useRuntimePanelText',
        messages: [runtimePanelZhMessages,...shared],
      },
    ];
    const violations = scopes.flatMap((scope) => auditStaticKeys(webRoot,scope));
    violations.push(...auditLocalizedFile(
      webRoot,
      resolve(webRoot,'src/components/DashboardTabs.tsx'),
      new Set(['t']),
      [experimentZhMessages,...shared],
    ));
    expect(violations).toEqual([]);
  });
});

type StaticCatalogScope = {
  root: string;
  hook: string;
  messages: ReadonlyArray<MessageCatalog>;
};

function auditStaticKeys(webRoot: string,scope: StaticCatalogScope) {
  return productionTypeScriptFiles(scope.root).flatMap((file) => {
    const source = readFileSync(file,'utf8');
    if (!source.includes(`${scope.hook}()`)) return [];
    const sourceFile = parseSourceFile(file,source);
    const aliases = new Set<string>();
    const findAliases = (node: TypeScript.Node) => {
      if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression)
        && node.initializer.expression.text === scope.hook) aliases.add(node.name.text);
      ts.forEachChild(node,findAliases);
    };
    findAliases(sourceFile);
    return auditLocalizedSourceFile(webRoot,file,sourceFile,aliases,scope.messages);
  });
}

function auditLocalizedFile(
  webRoot: string,
  file: string,
  aliases: ReadonlySet<string>,
  messages: ReadonlyArray<MessageCatalog>,
) {
  return auditLocalizedSourceFile(
    webRoot,file,parseSourceFile(file,readFileSync(file,'utf8')),aliases,messages,
  );
}

function auditLocalizedSourceFile(
  webRoot: string,
  file: string,
  sourceFile: TypeScript.SourceFile,
  aliases: ReadonlySet<string>,
  messages: ReadonlyArray<MessageCatalog>,
) {
  const available = new Set(messages.flatMap((catalog) => Object.keys(catalog)));
  const violations: string[] = [];
  const locationFor = (node: TypeScript.Node) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    return `${relative(webRoot,file).replace(/\\/g,'/')}:${line}`;
  };
  const visit = (node: TypeScript.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && aliases.has(node.expression.text)
      && node.arguments[0]) {
      const location = locationFor(node);
      if (ts.isTemplateExpression(node.arguments[0])) {
        violations.push(`${location}: interpolate values after selecting a literal catalog key`);
      }
      for (const key of localizedLiteralKeys(node.arguments[0])) {
        if (!available.has(key)) violations.push(`${location}: missing ${JSON.stringify(key)}`);
      }
    }
    if (ts.isJsxAttribute(node)
      && ts.isIdentifier(node.name)
      && auditedLocalizedJSXAttributes.has(node.name.text)) {
      const literal = jsxAttributeLiteral(node.initializer);
      if (literal && containsOperatorCopy(literal)) {
        violations.push(`${locationFor(node)}: localize ${node.name.text}=${JSON.stringify(literal)}`);
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(sourceFile);
  return violations;
}

const auditedLocalizedJSXAttributes = new Set([
  'title','aria-label','aria-description','ariaLabel','ariaDescription',
]);

function jsxAttributeLiteral(initializer: TypeScript.JsxAttributeValue | undefined): string {
  if (!initializer) return '';
  if (ts.isStringLiteral(initializer)) return initializer.text.trim();
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return '';
  const expression = initializer.expression;
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text.trim()
    : '';
}

function containsOperatorCopy(value: string): boolean {
  if (!/[A-Za-z]{2}/.test(value)) return false;
  // Stable machine identifiers and example endpoints are values, not prose.
  return !/^(?:https?:\/\/|\/|[A-Za-z0-9_.:-]+)$/.test(value);
}

function localizedLiteralKeys(node: TypeScript.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return localizedLiteralKeys(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...localizedLiteralKeys(node.whenTrue),...localizedLiteralKeys(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node)) {
    return [...localizedLiteralKeys(node.left),...localizedLiteralKeys(node.right)];
  }
  return [];
}

function parseSourceFile(file: string,source: string) {
  return ts.createSourceFile(
    file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root,entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...productionTypeScriptFiles(path));
    else if (stat.isFile()
      && /\.(?:ts|tsx)$/.test(entry)
      && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}
