import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const srcRootFiles = new Set([
  'App.tsx',
  'ansi-to-html.d.ts',
  'main.tsx',
  'theme.ts',
  'types.ts',
  'vite-env.d.ts',
]);

const srcTopLevelDirs = new Set([
  'api',
  'app',
  'components',
  'config',
  'devtools',
  'domains',
  'features',
  'hooks',
  'panels',
  'shared',
  'styles',
  'test',
  'types',
]);

const importNodeTypes = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
];

function filename(context) {
  const file = toPosix(context.filename ?? context.getFilename());
  const srcIndex = file.lastIndexOf('/src/');
  if (srcIndex >= 0) return file.slice(srcIndex + 1);
  return file.replace(/^.*\/web\//, '');
}

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

function srcRelativePath(file) {
  return file.startsWith('src/') ? file.slice(4) : null;
}

function dirname(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function resolveImport(fromFile, source) {
  if (!source || !source.startsWith('.')) return null;
  const resolved = normalizePath(`${dirname(fromFile)}/${source}`);
  return resolved.startsWith('src/') ? resolved : `src/${resolved}`;
}

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function topLevel(path) {
  return srcRelativePath(path)?.split('/')[0] ?? null;
}

function domainName(path) {
  const match = /^src\/domains\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

function isDomainPublicPath(path) {
  const file = basename(path);
  return (
    /^src\/domains\/[^/]+\/[^/]+(?:\.tsx?)?$/.test(path)
    && (/^(?:index|public)(?:\.tsx?)?$/.test(file) || /Public(?:\.tsx?)?$/.test(file))
  );
}

function isDomainRouteOrPagePath(path) {
  return /^src\/domains\/[^/]+\/(?:.*\/)?[^/]*(?:Route|Page)(?:\.tsx?)?$/.test(path);
}

function isDomainRoutePath(path) {
  return /^src\/domains\/[^/]+\/(?:.*\/)?[^/]*Route(?:\.tsx?)?$/.test(path);
}

function isDomainAppSurfacePath(path) {
  return /^src\/domains\/[^/]+\/[^/]*(?:Route|Page|Model|Navigation)(?:\.tsx?)?$/.test(path);
}

function isAllowedDomainAppImport(from, to) {
  return isDomainRoutePath(from) && (to === 'src/app/navigationContext' || to === 'src/app/useTargetCore');
}

function isDomainInternalPath(path) {
  return /^src\/domains\/[^/]+\//.test(path) && !isDomainPublicPath(path);
}

function isAppShellPath(path) {
  return path === 'src/App.tsx' || path === 'src/main.tsx' || path.startsWith('src/app/');
}

function isComponentSurfacePath(path) {
  return path.startsWith('src/components/') || path.startsWith('src/panels/');
}

function isPureComponentPath(path) {
  return path.startsWith('src/components/');
}

function isServiceOrTransportPath(path) {
  return (
    path.startsWith('src/api/')
    || path === 'src/devtools/mark-prompt/markPromptCommandService.ts'
    || /\.test\.tsx?$/.test(path)
    || /^src\/domains\/.*Service(?:Public)?\.ts$/.test(path)
    || /^src\/features\/.*Service\.ts$/.test(path)
    || /^src\/features\/.*Transport\.ts$/.test(path)
  );
}

function isAllowedWebSocketPath(path) {
  return path === 'src/api/ws.ts';
}

function isAllowedIntervalPath(path) {
  return path === 'src/features/terminal/terminalTransport.ts';
}

function isAllowedTimeoutPath(path) {
  return [
    'src/api/http.ts',
    'src/hooks/usePolling.ts',
    'src/hooks/useDelayedHover.ts',
    'src/hooks/useDelayedTask.ts',
    'src/hooks/useTooltipOpen.ts',
    'src/shared/eventCoalescer.ts',
    'src/devtools/mark-prompt/MarkPromptDock.tsx',
  ].includes(path);
}

function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  if (node.computed) {
    return typeof node.property?.value === 'string' ? node.property.value : null;
  }
  return node.property?.name ?? null;
}

function objectName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  return null;
}

function isGlobalMember(node, name) {
  if (!node || node.type !== 'MemberExpression') return false;
  return ['window', 'globalThis'].includes(objectName(node.object)) && memberName(node) === name;
}

function isDangerousTransportReference(node) {
  if (!node) return null;
  if (node.type === 'Identifier' && ['fetch', 'EventSource', 'WebSocket'].includes(node.name)) return node.name;
  if (node.type === 'MemberExpression') {
    for (const name of ['fetch', 'EventSource', 'WebSocket']) {
      if (isGlobalMember(node, name)) return name;
    }
  }
  return null;
}

function isEmptyStringJoin(node) {
  return Boolean(
    node?.callee?.type === 'MemberExpression'
    && memberName(node.callee) === 'join'
    && node.arguments.length === 1
    && node.arguments[0]?.type === 'Literal'
    && node.arguments[0].value === ''
  );
}

function isLiteralStringArrayJoin(node) {
  return Boolean(
    isEmptyStringJoin(node)
    && node.callee.object?.type === 'ArrayExpression'
    && node.callee.object.elements.every((element) => element?.type === 'Literal' && typeof element.value === 'string')
  );
}

function isDynamicGlobalMember(node) {
  return Boolean(
    node?.type === 'MemberExpression'
    && node.computed
    && ['window', 'globalThis'].includes(objectName(node.object))
    && typeof node.property?.value !== 'string'
  );
}

function report(context, node, message) {
  context.report({ node, message });
}

function visitImports(context, visitor) {
  const check = (node) => {
    if (!node.source?.value || typeof node.source.value !== 'string') return;
    visitor(node, node.source.value);
  };

  return Object.fromEntries(importNodeTypes.map((type) => [type, check]));
}

function isTypeOnlyImport(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  if (!node.specifiers?.length) return false;
  return node.specifiers.every((specifier) => specifier.importKind === 'type' || specifier.exportKind === 'type');
}

const architecturePlugin = {
  rules: {
    'known-src-top-level': {
      meta: { type: 'problem' },
      create(context) {
        return {
          Program(node) {
            const rel = srcRelativePath(filename(context));
            if (!rel) return;
            const [first, second] = rel.split('/');
            if (!second) {
              if (!srcRootFiles.has(first)) {
                report(context, node, `Unknown src root file "${first}". Add it to an approved domain/layer or update the ESLint architecture policy.`);
              }
              return;
            }
            if (!srcTopLevelDirs.has(first)) {
              report(context, node, `Unknown src top-level directory "${first}". New source must live in an approved domain/layer.`);
            }
          },
        };
      },
    },
    'domain-first-imports': {
      meta: { type: 'problem' },
      create(context) {
        const from = filename(context);
        return visitImports(context, (node, source) => {
          const to = resolveImport(from, source);
          if (!to) return;

          if (to === 'src/hooks/usePolling'
            && (from.startsWith('src/domains/automation/') || from.startsWith('src/panels/camera/'))) {
            report(context, node, 'Automation and camera calibration runtimes must reconcile from execution events, exact mutation responses, and media streams; fixed polling is forbidden.');
          }

          const fromDomain = domainName(from);
          const toDomain = domainName(to);
          if (fromDomain && toDomain && fromDomain !== toDomain && !isDomainPublicPath(to)) {
            report(context, node, `Cross-domain imports must target a public domain entry point, not "${source}".`);
          }

          if (from.startsWith('src/shared/') && ['api', 'app', 'components', 'domains', 'features', 'panels'].includes(topLevel(to))) {
            report(context, node, `Shared modules must not import upward into "${topLevel(to)}".`);
          }

          if (isAppShellPath(from) && isDomainInternalPath(to) && !isDomainAppSurfacePath(to)) {
            report(context, node, `App/root modules must not import domain internals from "${source}".`);
          }

          if (isAppShellPath(from) && to.startsWith('src/api/')) {
            report(context, node, `App/root modules must not import transport API modules from "${source}".`);
          }

          if (from.startsWith('src/domains/') && to.startsWith('src/app/') && !isAllowedDomainAppImport(from, to)) {
            report(context, node, `Domain modules must not import app modules from "${source}".`);
          }

          if (from.startsWith('src/features/') && to.startsWith('src/domains/')) {
            report(context, node, `Feature modules must not import domain modules from "${source}". Use dependency injection or move domain-specific code into the domain.`);
          }

          if (from.startsWith('src/panels/') && to.startsWith('src/domains/') && isDomainInternalPath(to) && !isDomainPublicPath(to)) {
            report(context, node, `Panels must import domain public entry points, not "${source}".`);
          }

          if (isComponentSurfacePath(from) && to.startsWith('src/api/')) {
            report(context, node, `Components, pages, and panels must not import transport API modules from "${source}".`);
          }

          if (isPureComponentPath(from) && ['domains', 'features'].includes(topLevel(to))) {
            report(context, node, `Pure components must not import business modules from "${source}". Move business views to domains/features/panels.`);
          }

          if (to.startsWith('src/api/') && !isServiceOrTransportPath(from) && !isTypeOnlyImport(node)) {
            report(context, node, `Only service/transport modules may import transport API modules from "${source}".`);
          }

          if (isComponentSurfacePath(from) && isDomainInternalPath(to) && !isDomainPublicPath(to)) {
            report(context, node, `Components, pages, and panels must use public domain entry points, not "${source}".`);
          }
        });
      },
    },
    'dangerous-transport': {
      meta: { type: 'problem' },
      create(context) {
        const file = filename(context);
        const dangerousAliases = new Map();
        const dangerousGlobalKeyAliases = new Map();
        const allowedFetch = file === 'src/api/http.ts';
        const allowedEventSource = file === 'src/api/streams.ts';
        const allowedWebSocket = isAllowedWebSocketPath(file);
        const isTestFile = /\.test\.tsx?$/.test(file);
        const allowedGlobalTransportFile = allowedFetch || allowedEventSource || allowedWebSocket || isTestFile;
        const reportTransport = (node, name, action = '') => {
          const suffix = action ? ` ${action}` : '';
          if (name === 'fetch' && !allowedFetch) report(context, node, `fetch${suffix} is only allowed in src/api/http.ts.`);
          if (name === 'EventSource' && !allowedEventSource) report(context, node, `EventSource${suffix} is only allowed in src/api/streams.ts.`);
          if (name === 'WebSocket' && !allowedWebSocket) report(context, node, `WebSocket${suffix} is only allowed in approved transport adapters.`);
        };
        const dynamicGlobalMessage = 'Dynamic window/globalThis property access is not allowed outside approved transport adapters.';
        const dangerousReference = (node) => {
          const direct = isDangerousTransportReference(node);
          if (direct) return direct;
          if (
            node?.type === 'MemberExpression'
            && node.computed
            && ['window', 'globalThis'].includes(objectName(node.object))
            && node.property?.type === 'Identifier'
          ) {
            return dangerousGlobalKeyAliases.get(node.property.name) ?? null;
          }
          return null;
        };
        return {
          VariableDeclarator(node) {
            if (node.id?.type !== 'Identifier') return;
            if (
              node.init?.type === 'Literal'
              && ['fetch', 'EventSource', 'WebSocket'].includes(node.init.value)
              && !allowedGlobalTransportFile
            ) {
              dangerousGlobalKeyAliases.set(node.id.name, node.init.value);
            }
            const dangerous = dangerousReference(node.init);
            if (!dangerous || allowedGlobalTransportFile) return;
            dangerousAliases.set(node.id.name, dangerous);
            report(context, node, `${dangerous} aliases are not allowed outside approved transport adapters.`);
          },
          AssignmentExpression(node) {
            const dangerous = dangerousReference(node.right);
            if (!dangerous || allowedGlobalTransportFile) return;
            report(context, node, `${dangerous} aliases are not allowed outside approved transport adapters.`);
          },
          TSAsExpression(node) {
            if (!isTestFile && node.typeAnnotation?.type === 'TSNeverKeyword') {
              report(context, node, 'Do not use "as never" in production code.');
            }
          },
          CallExpression(node) {
            const callee = node.callee;
            if (!isTestFile && isLiteralStringArrayJoin(node)) {
              report(context, node, 'Do not obfuscate capability, permission, or route strings with join("").');
            }
            if (isDynamicGlobalMember(callee) && !allowedGlobalTransportFile) {
              report(context, node, dynamicGlobalMessage);
            }
            const direct = dangerousReference(callee);
            const alias = callee?.type === 'Identifier' ? dangerousAliases.get(callee.name) : null;

            if (direct) reportTransport(node, direct);
            if (alias) reportTransport(node, alias, 'alias use');
            if ((callee?.name === 'setInterval' || isGlobalMember(callee, 'setInterval')) && !isAllowedIntervalPath(file)) {
              report(context, node, 'setInterval polling is only allowed in approved transport adapters.');
            }
            if ((callee?.name === 'setTimeout' || isGlobalMember(callee, 'setTimeout')) && !isAllowedTimeoutPath(file)) {
              report(context, node, 'setTimeout is only allowed in approved polling, transport, or UI timer modules.');
            }
          },
          NewExpression(node) {
            const callee = node.callee;
            if (isDynamicGlobalMember(callee) && !allowedGlobalTransportFile) {
              report(context, node, dynamicGlobalMessage);
            }
            const direct = dangerousReference(callee);
            const alias = callee?.type === 'Identifier' ? dangerousAliases.get(callee.name) : null;

            if (direct) reportTransport(node, direct, direct === 'WebSocket' ? 'construction' : '');
            if (alias) reportTransport(node, alias, 'alias construction');
          },
          MemberExpression(node) {
            if (isDynamicGlobalMember(node) && !allowedGlobalTransportFile) {
              report(context, node, dynamicGlobalMessage);
            }
            const dangerous = dangerousReference(node);
            if (dangerous && allowedGlobalTransportFile) return;
            if (dangerous) reportTransport(node, dangerous, 'access');
            if (node.object?.name === 'WebSocket' && !allowedGlobalTransportFile) {
              report(context, node, 'WebSocket state constants are only allowed in approved transport adapters.');
            }
          },
          Literal(node) {
            if (typeof node.value !== 'string' || file === 'src/config/urls.ts') return;
            if (/^(?:https?:\/\/|wss?:\/\/)(?:localhost|127\.0\.0\.1)\b/.test(node.value)) {
              report(context, node, 'Local HTTP/WebSocket URLs must be centralized in src/config/urls.ts.');
            }
          },
          TemplateElement(node) {
            if (file === 'src/config/urls.ts') return;
            if (/^(?:https?:\/\/|wss?:\/\/)(?:localhost|127\.0\.0\.1)\b/.test(node.value.raw)) {
              report(context, node, 'Local HTTP/WebSocket URLs must be centralized in src/config/urls.ts.');
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      boundaries,
      xgc2: architecturePlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      'boundaries/elements': [
        { type: 'api', pattern: 'src/api/**' },
        { type: 'app', pattern: 'src/app/**' },
        { type: 'component', pattern: 'src/components/**' },
        { type: 'config', pattern: 'src/config/**' },
        { type: 'devtools', pattern: 'src/devtools/**' },
        { type: 'domain', pattern: 'src/domains/*/**', capture: ['domain'] },
        { type: 'feature', pattern: 'src/features/**' },
        { type: 'hook', pattern: 'src/hooks/**' },
        { type: 'panel', pattern: 'src/panels/**' },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'style', pattern: 'src/styles/**' },
        { type: 'test', pattern: 'src/test/**' },
        { type: 'shared', pattern: 'src/types/**' },
        { type: 'root', pattern: 'src/*.{ts,tsx}', mode: 'file' },
      ],
    },
    rules: {
      'xgc2/known-src-top-level': 'error',
      'xgc2/domain-first-imports': 'error',
      'xgc2/dangerous-transport': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown': 'off',
      'boundaries/dependencies': ['error', {
        default: 'allow',
        rules: [
          {
            from: { type: 'shared' },
            disallow: { to: { type: ['api', 'app', 'component', 'domain', 'feature', 'panel'] } },
          },
          {
            from: { type: 'api' },
            disallow: { to: { type: ['app', 'component', 'domain', 'feature', 'hook', 'panel'] } },
          },
          {
            from: { type: 'app' },
            disallow: { to: { type: 'api' } },
          },
          {
            from: { type: ['component', 'panel'] },
            disallow: { to: { type: 'api' } },
          },
        ],
      }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },
);
