import type {
  AutomationTargetFile,
  AutomationTargetFileList,
  AutomationWorldPreview,
} from './automationTargetContracts';

const fileListKeys = new Set(['path','parent','entries']);
const fileKeys = new Set([
  'name','path','isDir','size','mode','user','group','uid','gid','modTime','isSymlink','linkTarget','canEdit','canDownload',
]);
const worldPreviewKeys = new Set(['worldPath','description','imageDataUrl']);

export function parseAutomationTargetFileList(value: unknown, path: string): AutomationTargetFileList {
  const list = targetObject(value, fileListKeys, path);
  if (!Array.isArray(list.entries)) throw invalidTarget(path, 'entries must be an array');
  const entries = list.entries.map((entry, index) => parseTargetFile(entry, `${path}.entries[${index}]`));
  const entryPaths = new Set<string>();
  for (const entry of entries) {
    if (entryPaths.has(entry.path)) throw invalidTarget(path, `contains duplicate entry path "${entry.path}"`);
    entryPaths.add(entry.path);
  }
  return {
    path: absoluteTargetPath(list.path, `${path}.path`),
    parent: absoluteTargetPath(list.parent, `${path}.parent`),
    entries,
  };
}

export function parseAutomationWorldPreview(value: unknown, path: string): AutomationWorldPreview {
  const preview = targetObject(value, worldPreviewKeys, path);
  return {
    worldPath: absoluteTargetPath(preview.worldPath, `${path}.worldPath`),
    ...(preview.description === undefined ? {} : {
      description: targetString(preview.description, `${path}.description`),
    }),
    ...(preview.imageDataUrl === undefined ? {} : {
      imageDataUrl: targetString(preview.imageDataUrl, `${path}.imageDataUrl`),
    }),
  };
}

function parseTargetFile(value: unknown, path: string): AutomationTargetFile {
  const file = targetObject(value, fileKeys, path);
  if (typeof file.isDir !== 'boolean') throw invalidTarget(`${path}.isDir`, 'must be a boolean');
  optionalNonNegativeInteger(file.size, `${path}.size`);
  for (const key of ['mode','user','group','uid','gid','modTime','linkTarget'] as const) {
    if (file[key] !== undefined) targetString(file[key], `${path}.${key}`);
  }
  for (const key of ['isSymlink','canEdit','canDownload'] as const) {
    if (file[key] !== undefined && typeof file[key] !== 'boolean') {
      throw invalidTarget(`${path}.${key}`, 'must be a boolean');
    }
  }
  return {
    name: targetString(file.name, `${path}.name`),
    path: absoluteTargetPath(file.path, `${path}.path`),
    isDir: file.isDir,
  };
}

function optionalNonNegativeInteger(value: unknown, path: string) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidTarget(path, 'must be a non-negative integer');
}

function targetObject(value: unknown, keys: ReadonlySet<string>, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidTarget(path, 'must be an object');
  const object = value as Record<string,unknown>;
  const unknown = Object.keys(object).find((key) => !keys.has(key));
  if (unknown) throw invalidTarget(path, `contains unknown property "${unknown}"`);
  return object;
}

function targetString(value: unknown, path: string) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw invalidTarget(path, 'must be a non-empty canonical string');
  }
  return value;
}

function absoluteTargetPath(value: unknown, path: string) {
  const result = targetString(value, path);
  if (!result.startsWith('/')) throw invalidTarget(path, 'must be an absolute execution-host path');
  return result;
}

function invalidTarget(path: string, reason: string) {
  return new Error(`Invalid Automation target response at ${path}: ${reason}.`);
}
