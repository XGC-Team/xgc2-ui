import { randomBytes } from 'node:crypto';
import { mkdirSync,renameSync,unlinkSync,writeFileSync } from 'node:fs';
import { basename,dirname,extname,isAbsolute,join } from 'node:path';
import type { Plugin } from 'vite';

type FinalModuleBundle = Record<string,{ type:string;modules?:Record<string,unknown> }>;

/**
 * Parse XGC_WEB_METAFILE. Unset/blank disables provenance (returns null).
 * When set, the path must be absolute and end with extension exactly `.json`.
 */
export function parseXgcWebMetafilePath(configured = process.env.XGC_WEB_METAFILE): string | null {
  const selected = configured?.trim();
  if (!selected) return null;
  if (!isAbsolute(selected)) {
    throw new Error('XGC_WEB_METAFILE must be an absolute path ending in .json');
  }
  if (extname(selected) !== '.json') {
    throw new Error('XGC_WEB_METAFILE must be an absolute path ending in .json');
  }
  return selected;
}

/** Build deterministic evidence JSON: `{ "inputs": { "<id>": {}, ... } }` + trailing newline. */
export function formatFinalModuleEvidence(moduleIds: Iterable<string>): string {
  const sorted = [...new Set(moduleIds)].sort((a,b) => (a < b ? -1 : a > b ? 1 : 0));
  const inputs = Object.create(null) as Record<string,Record<string,never>>;
  for (const id of sorted) {
    inputs[id] = {};
  }
  return `${JSON.stringify({ inputs })}\n`;
}

/** Union raw keys of every final OutputChunk.modules entry across a Rollup bundle. */
export function collectFinalModuleIds(bundle: FinalModuleBundle): string[] {
  const ids = new Set<string>();
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk' || !item.modules) continue;
    for (const moduleId of Object.keys(item.modules)) {
      ids.add(moduleId);
    }
  }
  return [...ids];
}

function unlinkIfPresent(path: string) {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function unlinkBestEffort(path: string) {
  try {
    unlinkIfPresent(path);
  } catch {
    // A build failure is already being propagated. Cleanup must not mask it.
  }
}

function writeEvidenceAtomic(targetPath: string,body: string,tempPath: string) {
  writeFileSync(tempPath, body, { encoding: 'utf8',flag: 'wx' });
  renameSync(tempPath, targetPath);
}

/**
 * Vite/Rollup plugin: emit final-module provenance evidence for xgc-profilecheck.
 * Source of truth is final OutputChunk.modules only (generateBundle).
 * Writes even when build.write is false (generateBundle still runs).
 */
export function finalModuleProvenancePlugin(targetPath: string): Plugin {
  const moduleIds = new Set<string>();
  let runTempPath: string | null = null;
  let buildFailed = false;

  const allocateTempPath = () => {
    const token = randomBytes(8).toString('hex');
    return join(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${token}.tmp`);
  };

  const cleanTargetAndTempBestEffort = () => {
    unlinkBestEffort(targetPath);
    if (runTempPath) unlinkBestEffort(runTempPath);
  };

  return {
    name: 'xgc-final-module-provenance',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      buildFailed = false;
      moduleIds.clear();
      if (runTempPath) unlinkIfPresent(runTempPath);
      runTempPath = null;
      mkdirSync(dirname(targetPath), { recursive: true });
      // Fail-closed: drop any prior evidence so a failed rebuild cannot leave stale data.
      // Only ENOENT is acceptable: an unreadable or malformed stale target must fail the build.
      unlinkIfPresent(targetPath);
      runTempPath = allocateTempPath();
    },
    generateBundle(_options,bundle) {
      for (const id of collectFinalModuleIds(bundle)) {
        moduleIds.add(id);
      }
    },
    closeBundle: {
      order: 'post',
      handler() {
        if (buildFailed) return;
        if (moduleIds.size === 0) {
          cleanTargetAndTempBestEffort();
          runTempPath = null;
          throw new Error('xgc final-module provenance: final OutputChunk.modules graph is empty');
        }
        if (!runTempPath) {
          cleanTargetAndTempBestEffort();
          throw new Error('xgc final-module provenance: missing run temp path');
        }
        const body = formatFinalModuleEvidence(moduleIds);
        const tempPath = runTempPath;
        try {
          writeEvidenceAtomic(targetPath, body, tempPath);
        } catch (error) {
          cleanTargetAndTempBestEffort();
          throw error;
        } finally {
          // rename removes the temp on success; failures must not leave a partial artifact.
          unlinkBestEffort(tempPath);
          runTempPath = null;
        }
      },
    },
    buildEnd(error) {
      if (error) {
        buildFailed = true;
        cleanTargetAndTempBestEffort();
        runTempPath = null;
      }
    },
    renderError() {
      buildFailed = true;
      cleanTargetAndTempBestEffort();
      runTempPath = null;
    },
  };
}
