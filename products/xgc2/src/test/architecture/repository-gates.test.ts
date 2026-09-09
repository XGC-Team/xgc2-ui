import type * as TypeScript from 'typescript';
import { describe,expect,it } from 'vitest';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;
const ts = require('typescript') as typeof TypeScript;
const { readFileSync,existsSync,realpathSync,readdirSync,statSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
  existsSync: (path: string) => boolean;
  realpathSync: (path: string) => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean;isFile: () => boolean };
};
const { dirname,relative,resolve } = require('path') as {
  dirname: (path: string) => string;
  relative: (from: string, to: string) => string;
  resolve: (...paths: string[]) => string;
};

function findXgcRoot() {
  const candidates = [resolve(process.cwd(), '..'),resolve(process.cwd())];
  const root = candidates.find((candidate: string) => (
    existsSync(resolve(candidate, 'scripts/check-ci-fast.sh'))
    && existsSync(resolve(candidate, 'web/package.json'))
  ));
  if (!root) throw new Error(`Unable to locate xgc2 root from ${process.cwd()}`);
  return realpathSync(root);
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

function frontendProductionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...frontendProductionFiles(fullPath));
    else if (stat.isFile()
      && /\.(?:css|ts|tsx)$/.test(entry)
      && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

function resolveRelativeSourceImport(importer: string, specifier: string) {
  const base = resolve(dirname(importer),specifier);
  return [base,`${base}.ts`,`${base}.tsx`,resolve(base,'index.ts'),resolve(base,'index.tsx')]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/** True when an import declaration emits no runtime module edge. */
function isTypeOnlyImportDeclaration(node: TypeScript.ImportDeclaration) {
  const clause = node.importClause;
  if (!clause) return false; // side-effect import './x'
  if (clause.isTypeOnly) return true;
  if (clause.name) return false; // default value binding
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return false;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const elements = clause.namedBindings.elements;
    return elements.length > 0 && elements.every((element) => element.isTypeOnly);
  }
  return false;
}

/** True when an export-from declaration emits no runtime module edge. */
function isTypeOnlyExportFromDeclaration(node: TypeScript.ExportDeclaration) {
  if (!node.moduleSpecifier) return false;
  if (node.isTypeOnly) return true;
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    const elements = node.exportClause.elements;
    return elements.length > 0 && elements.every((element) => element.isTypeOnly);
  }
  return false;
}

/**
 * Static relative import edges for production modules.
 * `runtime` follows emitted module edges only (value imports, side-effect imports,
 * value export-from, dynamic import()). Type-only imports are excluded from `runtime`
 * and recorded separately for attachment analysis.
 */
function relativeProductionImportEdges(file: string, moduleSet: Set<string>) {
  const source = readFileSync(file,'utf8');
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,scriptKind);
  const runtime: string[] = [];
  const typeOnly: string[] = [];
  const resolveEdge = (specifier: string) => {
    if (!specifier.startsWith('.')) return;
    const dependency = resolveRelativeSourceImport(file,specifier);
    if (dependency && moduleSet.has(dependency)) return dependency;
  };
  const visit = (node: TypeScript.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = resolveEdge(node.moduleSpecifier.text);
      if (dependency) {
        if (isTypeOnlyImportDeclaration(node)) typeOnly.push(dependency);
        else runtime.push(dependency);
      }
    } else if (ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = resolveEdge(node.moduleSpecifier.text);
      if (dependency) {
        if (isTypeOnlyExportFromDeclaration(node)) typeOnly.push(dependency);
        else runtime.push(dependency);
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const dependency = resolveEdge(arg.text);
        if (dependency) runtime.push(dependency);
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(sourceFile);
  return { runtime,typeOnly };
}

function reachableFrom(roots: string[], edges: Map<string,string[]>) {
  const reachable = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || reachable.has(file)) continue;
    reachable.add(file);
    pending.push(...(edges.get(file) ?? []));
  }
  return reachable;
}

function generatedProductProfileRoots(xgcRoot: string, moduleSet: Set<string>) {
  const generator = readFileSync(
    resolve(xgcRoot,'core-xgc/internal/profilecontract/product_roots.go'),
    'utf8',
  );
  const roots = [...generator.matchAll(/"(domains\/host\/systemLeaves\/[^"\s]+)"/g)]
    .map((match) => resolveRelativeSourceImport(
      resolve(xgcRoot,'web/src/generated-profile-root.ts'),
      `./${match[1]}`,
    ))
    .filter((file): file is string => Boolean(file && moduleSet.has(file)));
  return [...new Set(roots)];
}

function volatilePanelEffectDependencies(xgcRoot: string) {
  const volatileContextMembers = new Set([
    'automation',
    'execution',
    'telemetry',
    'experimentSessionActions',
  ]);
  return sourceFiles(resolve(xgcRoot,'web/src/panels'))
    .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
    .flatMap((file) => {
      const source = readFileSync(file,'utf8');
      const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,scriptKind);
      const volatileAliases = new Set<string>();
      const visitAliases = (node: TypeScript.Node) => {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          if (ts.isIdentifier(node.name)
            && ts.isPropertyAccessExpression(node.initializer)
            && ts.isIdentifier(node.initializer.expression)
            && node.initializer.expression.text === 'context'
            && volatileContextMembers.has(node.initializer.name.text)) {
            volatileAliases.add(node.name.text);
          }
          if (ts.isObjectBindingPattern(node.name)
            && ts.isIdentifier(node.initializer)
            && node.initializer.text === 'context') {
            for (const element of node.name.elements) {
              const sourceName = element.propertyName && ts.isIdentifier(element.propertyName)
                ? element.propertyName.text
                : ts.isIdentifier(element.name) ? element.name.text : '';
              if (sourceName && volatileContextMembers.has(sourceName) && ts.isIdentifier(element.name)) {
                volatileAliases.add(element.name.text);
              }
            }
          }
        }
        ts.forEachChild(node,visitAliases);
      };
      visitAliases(sourceFile);

      const violations: string[] = [];
      const visitEffects = (node: TypeScript.Node) => {
        if (ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && (node.expression.text === 'useEffect' || node.expression.text === 'useLayoutEffect')
          && node.arguments.length > 1
          && ts.isArrayLiteralExpression(node.arguments[1])) {
          for (const dependency of node.arguments[1].elements) {
            const directContext = ts.isIdentifier(dependency) && dependency.text === 'context';
            const aliasedContextMember = ts.isIdentifier(dependency)
              && volatileAliases.has(dependency.text);
            const directContextMember = ts.isPropertyAccessExpression(dependency)
              && ts.isIdentifier(dependency.expression)
              && dependency.expression.text === 'context'
              && volatileContextMembers.has(dependency.name.text);
            if (directContext || aliasedContextMember || directContextMember) {
              const line = sourceFile.getLineAndCharacterOfPosition(
                dependency.getStart(sourceFile),
              ).line + 1;
              violations.push(
                `${relative(xgcRoot,file).replace(/\\/g,'/')}:${line}: ${dependency.getText(sourceFile)}`,
              );
            }
          }
        }
        ts.forEachChild(node,visitEffects);
      };
      visitEffects(sourceFile);
      return violations;
    });
}

describe('repository invariants', () => {
  it('keeps extracted foundation controls owned by the shared UI package', () => {
    const xgcRoot = findXgcRoot();
    const sourceRoot = resolve(xgcRoot,'web/src');
    const forbiddenFiles = [
      'components/ConfigFormSection.tsx',
      'components/controls/Vector3Control.tsx',
      'components/TextPromptDialog.tsx',
      'hooks/useTextPromptDialog.tsx',
    ];
    for (const file of forbiddenFiles) {
      expect(existsSync(resolve(sourceRoot,file)), `shared control was recreated locally: ${file}`).toBe(false);
    }

    const production = frontendProductionFiles(sourceRoot)
      .map((file) => readFileSync(file,'utf8'))
      .join('\n');
    expect(production).not.toMatch(/xgc-config-form-section/);
    expect(production).not.toMatch(/(?:function|const)\s+(?:ConfigFormSection|InputActionControl|Vector3Control|TextPromptDialog)\b/);
    expect(production).not.toMatch(/from\s+['"][^'"]*(?:ConfigFormSection|Vector3Control|TextPromptDialog)['"]/);
    expect(production).not.toMatch(/\.(?:xgc-form-section|xgc-input-action|xgc-vector3)[\w-]*/);
  });

  it('keeps workflow node surfaces and their theme owned by the shared package', () => {
    const xgcRoot = findXgcRoot();
    const nodeSource = readFileSync(
      resolve(xgcRoot,'web/src/domains/automation/AutomationGraphNode.tsx'),
      'utf8',
    );
    const graphCss = readFileSync(resolve(xgcRoot,'web/src/styles/automation-graph.css'),'utf8');
    const skinCss = readFileSync(resolve(xgcRoot,'web/src/styles/skin.css'),'utf8');
    const tileRule = graphCss.match(/\.automation-node-tile\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(nodeSource).toMatch(/import\s*\{[^}]*WorkflowNodeSurface[^}]*\}\s*from\s*['"]@xgc2\/ui-workflow['"]/);
    expect(nodeSource).toContain('<WorkflowNodeSurface');
    expect(nodeSource).not.toContain('<div className="automation-node-tile"');
    expect(tileRule).not.toMatch(/(?:background|border|box-shadow|color|transition)\s*:/);
    expect(skinCss).not.toMatch(/--color-(?:automation|workflow)-/);
    expect(skinCss).not.toMatch(/--(?:color-selection-|shadow-selection-highlight-halo)/);
  });

  it('keeps architecture baseline entries attached to existing files', () => {
    const xgcRoot = findXgcRoot();
    const baseline = readFileSync(resolve(xgcRoot, 'contracts/architecture-baseline.yml'), 'utf8');
    const files = [...baseline.matchAll(/^\s+file:\s+(.+)$/gm)].map((match) => match[1].trim());

    expect(baseline).toMatch(/^violations:/m);
    for (const file of files) {
      expect(existsSync(resolve(xgcRoot, file)), `architecture-baseline missing file: ${file}`).toBe(true);
    }
  });

  it('keeps every production stylesheet attached to an explicit owner import', () => {
    const xgcRoot = findXgcRoot();
    const files = frontendProductionFiles(resolve(xgcRoot,'web/src'));
    const referencedStyles = new Set<string>();
    const importPattern = /(?:from\s*|import\s*)['"]([^'"]+\.css)['"]|@import\s+(?:url\()?['"]([^'"]+\.css)['"]/g;
    for (const file of files) {
      for (const match of readFileSync(file,'utf8').matchAll(importPattern)) {
        const imported = match[1] ?? match[2];
        if (imported?.startsWith('.')) referencedStyles.add(resolve(dirname(file),imported));
      }
    }
    const orphaned = files
      .filter((file) => file.endsWith('.css') && !referencedStyles.has(file))
      .map((file) => relative(xgcRoot,file).replace(/\\/g,'/'));

    expect(orphaned).toEqual([]);
  });

  it('keeps production modules reachable from product web composition roots', () => {
    const xgcRoot = findXgcRoot();
    const sourceRoot = resolve(xgcRoot,'web/src');
    const profilesRoot = resolve(xgcRoot,'web/profiles');
    const modules = [...sourceFiles(sourceRoot),...sourceFiles(profilesRoot)]
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file) && !file.endsWith('.d.ts'));
    const moduleSet = new Set(modules);
    // Emitted/runtime edges only. Type-only imports do not create runtime reachability.
    const runtimeEdges = new Map<string,string[]>();
    for (const file of modules) {
      runtimeEdges.set(file,relativeProductionImportEdges(file,moduleSet).runtime);
    }

    // The virtual alias resolves to exactly one edition at build time. Model each
    // build independently instead of pretending both profiles share one runtime.
    const mainRoot = resolve(sourceRoot,'main.tsx');
    const editions = [
      { name: 'core-dev',root: resolve(profilesRoot,'core-dev.tsx') },
      { name: 'core-release',root: resolve(profilesRoot,'core-release.tsx') },
    ];
    for (const root of [mainRoot,...editions.map((edition) => edition.root)]) {
      expect(moduleSet.has(root),`missing composition root: ${relative(xgcRoot,root).replace(/\\/g,'/')}`).toBe(true);
    }
    expect(readFileSync(mainRoot,'utf8')).toContain("from '#xgc-profile'");

    const reachableByEdition = editions.map((edition) => ({
      ...edition,
      reachable: reachableFrom([mainRoot,edition.root],runtimeEdges),
    }));
    // Product roots generated from AgentEffective statically import optional
    // Host leaves which the two checked-in reference editions intentionally
    // deny. Follow the generator's real module paths so these owners remain
    // covered without pretending they ship in either reference edition.
    const generatedReachable = reachableFrom(
      generatedProductProfileRoots(xgcRoot,moduleSet),runtimeEdges,
    );
    const reachable = new Set(
      [...reachableByEdition.flatMap((edition) => [...edition.reachable]),...generatedReachable],
    );

    const isIntentionallyCutOwnerTree = (file: string) => {
      const rel = relative(xgcRoot,file).replace(/\\/g,'/');
      return rel.startsWith('web/src/domains/appstore/')
        || rel.startsWith('web/src/domains/container/');
    };

    // Declaration modules used only via import type are not runtime-reachable; they must
    // still hang off composition. Walk type-only edges from the runtime frontier only.
    const typeOnlyEdges = new Map<string,string[]>();
    for (const file of modules) {
      typeOnlyEdges.set(file,relativeProductionImportEdges(file,moduleSet).typeOnly);
    }
    const attached = new Set(reachable);
    const typePending = [...reachable];
    while (typePending.length > 0) {
      const file = typePending.pop();
      if (!file) continue;
      for (const dependency of typeOnlyEdges.get(file) ?? []) {
        if (attached.has(dependency)) continue;
        attached.add(dependency);
        typePending.push(dependency);
      }
    }

    const orphaned = modules
      .filter((file) => !attached.has(file))
      .filter((file) => !isIntentionallyCutOwnerTree(file))
      .filter((file) => !/[\\/]test[\\/]/.test(file))
      .filter((file) => !/(?:TestFixtures?|TestSupport|TestUtils)\.(?:ts|tsx)$/.test(file))
      .map((file) => relative(xgcRoot,file).replace(/\\/g,'/'));

    expect(orphaned).toEqual([]);

    for (const edition of reachableByEdition) {
      const leakedCutOwners = modules
        .filter((file) => isIntentionallyCutOwnerTree(file))
        .filter((file) => edition.reachable.has(file))
        .map((file) => relative(xgcRoot,file).replace(/\\/g,'/'));

      expect(leakedCutOwners,`${edition.name} must not package cut feature owners`).toEqual([]);
    }
  });

  it('forbids visible Loading page/app chrome theater', () => {
    const xgcRoot = findXgcRoot();
    const forbidden = /Loading (?:page|application|app|experiments|system overview)|Loading the Experiment catalog/i;
    const violations = frontendProductionFiles(resolve(xgcRoot,'web/src'))
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .flatMap((file) => {
        const source = readFileSync(file,'utf8');
        if (!forbidden.test(source)) return [];
        return [`${relative(xgcRoot,file).replace(/\\/g,'/')}: visible Loading page/app theater`];
      });

    expect(violations).toEqual([]);
  });

  it('rejects browser-native modal escape hatches in production UI', () => {
    const xgcRoot = findXgcRoot();
    const violations = frontendProductionFiles(resolve(xgcRoot,'web/src'))
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .filter((file) => /(?:window|globalThis)\.(?:confirm|prompt|alert)\s*\(/.test(
        readFileSync(file,'utf8'),
      ))
      .map((file) => relative(xgcRoot,file).replace(/\\/g,'/'));

    expect(violations).toEqual([]);
  });

  it('keeps volatile panel services out of effect dependency arrays', () => {
    expect(volatilePanelEffectDependencies(findXgcRoot())).toEqual([]);
  });

  it('keeps hooks independent of concrete component prop contracts', () => {
    const xgcRoot = findXgcRoot();
    const violations = sourceFiles(resolve(xgcRoot,'web/src'))
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .filter((file) => /[/\\]use[A-Z][^/\\]*\.(?:ts|tsx)$/.test(file))
      .filter((file) => readFileSync(file,'utf8').includes('ComponentProps<typeof'))
      .map((file) => relative(xgcRoot,file).replace(/\\/g,'/'));

    expect(violations).toEqual([]);
  });
});
