import type * as TypeScript from 'typescript';
import { describe,expect,it } from 'vitest';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;
const ts = require('typescript') as typeof TypeScript;

const { readdirSync,readFileSync,statSync } = require('fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean;isFile: () => boolean };
};
const { relative,resolve } = require('path') as {
  relative: (from: string, to: string) => string;
  resolve: (...paths: string[]) => string;
};

const SRC = resolve(process.cwd(), 'src');
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE = /([^{}]+)\{([^{}]+)\}/g;
const OPENING_TAG = /<([A-Za-z][\w.]*)([^>]*(?:data-xgc-role|dataXgcRole)[^>]*)>/g;
const DECORATIVE_SVG_TAGS = new Set([
  'svg','path','line','circle','rect','text','polyline','polygon','use','ellipse',
]);

function listFiles(root: string, suffix: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...listFiles(fullPath, suffix));
    else if (stat.isFile() && suffix.test(entry)) files.push(fullPath);
  }
  return files;
}

function productionFiles(suffix: RegExp): string[] {
  return listFiles(SRC, suffix).filter((path) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path));
}

function cssRules(css: string): { selector: string; body: string }[] {
  const stripped = css.replace(CSS_COMMENT, ' ');
  const rules: { selector: string; body: string }[] = [];
  for (const match of stripped.matchAll(RULE)) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    rules.push({ selector, body: match[2] });
  }
  return rules;
}

function lastCompoundClasses(selector: string): string[] {
  return selector.split(',').flatMap((part) => {
    const subject = part.trim().split(/\s+/).at(-1) ?? '';
    return [...subject.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
  });
}

function jsxAttribute(attrs: string, name: string): string | undefined {
  const quoted = attrs.match(new RegExp(`${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
  if (quoted) return quoted[1];
  const expression = attrs.match(new RegExp(`${name}\\s*=\\s*\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\}`));
  return expression?.[1];
}

function hasJsxAttribute(element: TypeScript.JsxOpeningLikeElement, name: string): boolean {
  return element.attributes.properties.some((property) => (
    ts.isJsxAttribute(property) && property.name.getText() === name
  ));
}

function hasRoleAttribute(element: TypeScript.JsxOpeningLikeElement): boolean {
  return hasJsxAttribute(element, 'data-xgc-role') || hasJsxAttribute(element, 'dataXgcRole');
}

function hasJsxSpread(element: TypeScript.JsxOpeningLikeElement): boolean {
  return element.attributes.properties.some((property) => ts.isJsxSpreadAttribute(property));
}

function collectRoleHostClasses(): Set<string> {
  const roleClasses = new Set<string>();
  for (const file of productionFiles(/\.(?:ts|tsx)$/)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(OPENING_TAG)) {
      const className = jsxAttribute(match[2], 'className');
      className?.split(/\s+/).filter(Boolean).forEach((name) => roleClasses.add(name));
    }
  }
  return roleClasses;
}

function elementLocation(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${relative(SRC, sourceFile.fileName)}:${line + 1}`;
}

describe('markable host contract', () => {
  it('does not flatten role hosts with display:contents', () => {
    const roleClasses = collectRoleHostClasses();
    const violations: string[] = [];
    for (const file of productionFiles(/\.css$/)) {
      const rel = relative(SRC, file);
      for (const rule of cssRules(readFileSync(file, 'utf8'))) {
        if (!/display\s*:\s*contents/.test(rule.body)) continue;
        if (/\[data-xgc-role/.test(rule.selector)) {
          violations.push(`${rel}: ${rule.selector.trim()} sets display:contents on a [data-xgc-role] selector`);
        }
        if (/(?:frequency|status)-list\s*>\s*span/.test(rule.selector)) {
          violations.push(`${rel}: ${rule.selector.trim()} flattens HUD slot hosts`);
        }
        for (const className of lastCompoundClasses(rule.selector)) {
          if (roleClasses.has(className)) {
            violations.push(`${rel}: ${rule.selector.trim()} flattens .${className} which carries data-xgc-role`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not put data-xgc-role on decorative SVG primitives', () => {
    const violations: string[] = [];
    for (const file of productionFiles(/\.tsx$/)) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText();
          if (DECORATIVE_SVG_TAGS.has(tag) && hasRoleAttribute(node)) {
            violations.push(`${relative(SRC, file)}: <${tag}> carries data-xgc-role; use a chrome host or SVG g`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('requires InstrumentStatus slots to declare role and robotId', () => {
    const violations: string[] = [];
    for (const file of productionFiles(/\.tsx$/)) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (node.tagName.getText() !== 'InstrumentStatus') {
            ts.forEachChild(node, visit);
            return;
          }
          if (!hasJsxAttribute(node, 'role') || !hasJsxAttribute(node, 'robotId')) {
            violations.push(
              `${relative(SRC, file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}: InstrumentStatus missing role or robotId`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('requires HUD role hosts to carry data-xgc-id', () => {
    const hudFiles = [
      resolve(SRC, 'panels/robot/FlightRobotInstrument.tsx'),
      resolve(SRC, 'panels/robot/GroundRobotInstrument.tsx'),
    ];
    const violations: string[] = [];
    for (const file of hudFiles) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (hasRoleAttribute(node) && !hasJsxAttribute(node, 'data-xgc-id') && !hasJsxAttribute(node, 'dataXgcId')) {
            violations.push(
              `${relative(SRC, file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.tagName.getText()} has data-xgc-role without data-xgc-id`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('re-enables painted pitch-mark descendants under a none ladder', () => {
    const css = readFileSync(resolve(SRC, 'styles/robot-flight.css'), 'utf8');
    const ladder = css.match(/\.robot-flight-pitch-ladder \{[^}]*\}/s)?.[0] ?? '';
    expect(ladder).toContain('pointer-events: none');
    expect(css).toMatch(/\.robot-flight-pitch-mark text,\s*\.robot-flight-pitch-mark line,\s*\.robot-flight-pitch-mark-hit \{[^}]*pointer-events:\s*auto/s);
  });

  it('requires every production JSX role host to declare data-xgc-id on the same element', () => {
    const violations: string[] = [];
    for (const file of productionFiles(/\.tsx$/)) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          // Spreads may carry role at runtime. Skip only when this tag has a
          // spread and does not itself write data-xgc-role / dataXgcRole.
          if (hasJsxSpread(node) && !hasRoleAttribute(node)) {
            ts.forEachChild(node, visit);
            return;
          }
          if (hasRoleAttribute(node) && !hasJsxAttribute(node, 'data-xgc-id') && !hasJsxAttribute(node, 'dataXgcId')) {
            violations.push(
              `${elementLocation(sourceFile, node)}: ${node.tagName.getText()} has data-xgc-role without data-xgc-id`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('requires every production ControlButton to declare markable identity', () => {
    const violations: string[] = [];
    for (const file of productionFiles(/\.tsx$/)) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (node.tagName.getText() !== 'ControlButton') {
            ts.forEachChild(node, visit);
            return;
          }
          // A spread could carry role at runtime; when the element has a
          // spread AND no explicit role, the caller may still stamp identity.
          if (hasJsxSpread(node) && !hasRoleAttribute(node)) {
            ts.forEachChild(node, visit);
            return;
          }
          if (!hasRoleAttribute(node)) {
            violations.push(
              `${elementLocation(sourceFile, node)}: <ControlButton> without data-xgc-role is not markable (V13)`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('does not set pointer-events:none on markable role hosts', () => {
    const roleClasses = collectRoleHostClasses();
    const hoverRevealClasses = new Set([
      // Visible only after panel hover; must not intercept clicks while hidden.
      'xgc-panel-workflow-open',
    ]);
    const violations: string[] = [];
    for (const file of productionFiles(/\.css$/)) {
      const rel = relative(SRC, file);
      for (const rule of cssRules(readFileSync(file, 'utf8'))) {
        if (!/pointer-events\s*:\s*none/.test(rule.body)) continue;
        if (/pointer-events\s*:\s*auto/.test(rule.body)) continue;
        if (/\[data-xgc-role[^\]]*\]/.test(rule.selector)) {
          // Status overlay (role="status" + aria-busy) is a decorated cover
          // layer, not an operator control; it must never intercept the embed
          // beneath it. Marker has no honest box to select here.
          if (/\[data-xgc-role="lichtblick-embed-busy"\]/.test(rule.selector)) continue;
          violations.push(`${rel}: ${rule.selector.trim()} sets pointer-events:none on a [data-xgc-role] selector`);
        }
        for (const part of rule.selector.split(',')) {
          const subject = part.trim().split(/\s+/).at(-1) ?? '';
          if (/:{1,2}(?:before|after)\b/i.test(subject)) continue;
          for (const match of subject.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
            if (hoverRevealClasses.has(match[1])) continue;
            if (roleClasses.has(match[1])) {
              violations.push(
                `${rel}: ${rule.selector.trim()} sets pointer-events:none on .${match[1]} which carries data-xgc-role`,
              );
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

