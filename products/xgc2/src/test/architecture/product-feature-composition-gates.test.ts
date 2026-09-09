import { describe,expect,it } from 'vitest';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;

const { existsSync,readFileSync,readdirSync,statSync } = require('fs') as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string,encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean;isFile: () => boolean };
};
const { relative,resolve } = require('path') as {
  relative: (from: string,to: string) => string;
  resolve: (...paths: string[]) => string;
};

const genericProductionRoots = [
  'src/app',
  'src/shared',
  'src/components',
  'src/hooks',
  'src/styles',
  'src/devtools',
  'src/domains/settings',
] as const;

const forbiddenGenericRuntimeResidue = [
  /\bcontainerTab\b/,
  /\bsetContainerTab\b/,
  /xgc\.nav\.container/i,
  /Product\.(?:Docker|AppStore)/,
  /product\.(?:containers|app-store)/,
  /domains\/(?:container|appstore)/,
  /app-store-settings/i,
  /\.app-store-/,
  /['"]appStore['"]/,
  /['"]containers['"]/,
];

describe('Docker and AppStore static composition repository gates', () => {
  it('keeps exactly one canonical positive test/build root', () => {
    const webRoot = resolve(process.cwd());
    const featureRoots = [
      ...productionFiles(resolve(webRoot,'profiles')),
      ...productionFiles(resolve(webRoot,'test-fixtures')),
    ].filter((file) => /(?:appStore|docker)ProductContribution/.test(readFileSync(file,'utf8')))
      .map((file) => relative(webRoot,file).replace(/\\/g,'/'))
      .sort();

    expect(existsSync(resolve(webRoot,'test-fixtures/core-with-docker-appstore.tsx'))).toBe(true);
    expect(existsSync(resolve(webRoot,'profiles/core-with-docker-appstore.tsx'))).toBe(false);
    expect(featureRoots).toEqual(['test-fixtures/core-with-docker-appstore.tsx']);
  });

  it('keeps generic production hosts free of Docker/AppStore runtime residue', () => {
    const webRoot = resolve(process.cwd());
    const violations: string[] = [];

    for (const root of genericProductionRoots) {
      for (const file of productionFiles(resolve(webRoot,root))) {
        let source = readFileSync(file,'utf8');
        if (file === resolve(webRoot,'src/shared/productWebComposition.ts')) {
          source = source
            .replace(/\|\s*'appStore'/g,'')
            .replace(/\|\s*'containers'/g,'');
        }
        for (const pattern of forbiddenGenericRuntimeResidue) {
          if (pattern.test(source)) {
            violations.push(`${relative(webRoot,file).replace(/\\/g,'/')}: ${pattern.source}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps both false roots free of direct feature-owner imports', () => {
    const webRoot = resolve(process.cwd());
    for (const profile of ['profiles/core-dev.tsx','profiles/core-release.tsx']) {
      const source = readFileSync(resolve(webRoot,profile),'utf8');
      expect(source).not.toMatch(/domains\/(?:container|appstore)/);
    }
  });
});

function productionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root,entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...productionFiles(path));
    } else if (stat.isFile()
      && /\.(?:css|ts|tsx)$/.test(entry)
      && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
