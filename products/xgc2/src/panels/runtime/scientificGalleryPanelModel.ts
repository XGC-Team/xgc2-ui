import type { AutomationDocument,AutomationRunDetail } from '../../domains/automation/automationPublic';
import { isRunStatusActive } from '../../shared/executionStatusVocabulary';
import type { PanelActionPortRuntime,PanelWorkflowRuntimeProjection } from '../types';

export const SCIENTIFIC_GALLERY_PANEL_ID = 'scientific-gallery';
export const SCIENTIFIC_GALLERY_ACTION_PORT = 'plot';
export const SCIENTIFIC_GALLERY_RUNTIME_PORT = 'runtime';
const PUBLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BAG_PUBLICATION_ID = /^bag\.[0-9a-f]{32}\.(0|[1-9][0-9]*)$/;
const RECORDING_DIRECTORY = /^[0-9a-f]{32}$/i;

export function experimentIdFromArtifactsPort(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const id = (value as Record<string,unknown>).experimentResourceId;
  return typeof id === 'string' ? id.trim() : '';
}

export function supportsScientificPlotAction(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const fields = (schema as { fields?:unknown }).fields;
  if (!Array.isArray(fields)) return false;
  return ['inputPath','scriptPath','publicationId'].every((name) => fields.some((field) => (
    field && typeof field === 'object' && !Array.isArray(field)
    && (field as Record<string,unknown>).name === name
    && (field as Record<string,unknown>).kind === 'string'
    && (field as Record<string,unknown>).required === true
  )));
}

const ACTIVE_PLOT_NODE = new Set(['pending','running','waiting','compensating']);
const FAILED_PLOT_NODE = new Set(['failed','canceled']);

export function scientificGalleryPlotStillWorking(
  detail: AutomationRunDetail | undefined,
  activeStatus?: string,
): boolean {
  if (isRunStatusActive(activeStatus) || isRunStatusActive(detail?.run?.status)) return true;
  if (detail?.nodeSummaries?.some((node) => (
    ACTIVE_PLOT_NODE.has(node.status) || node.activeOccurrenceCount > 0
  ))) {
    return true;
  }
  return (detail?.relations?.childRuns ?? []).some((child) => (
    isRunStatusActive(child.runStatus ?? child.observedStatus)
  ));
}

export function scientificGalleryPlotFailure(detail: AutomationRunDetail | undefined): string {
  const runError = detail?.run?.primaryError?.trim() ?? '';
  if (runError) return runError;
  const failed = detail?.nodeSummaries.find((node) => (
    FAILED_PLOT_NODE.has(node.status)
    && (node.nodeId === 'plot-results' || node.kind === 'process.run-python-script')
  ));
  return failed?.error?.trim() ?? '';
}

export function publicationIdFromRunParameters(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const parameters = value as Record<string,unknown>;
  const direct = canonicalPublicationId(parameters.publicationId);
  if (direct) return direct;
  if (typeof parameters.inputOverridesJson !== 'string') return '';
  try {
    const parsed:unknown = JSON.parse(parameters.inputOverridesJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    return canonicalPublicationId((parsed as Record<string,unknown>).publicationId);
  } catch {
    return '';
  }
}

function canonicalPublicationId(value: unknown) {
  return typeof value === 'string' && (PUBLICATION_ID.test(value) || BAG_PUBLICATION_ID.test(value)) ? value : '';
}

export type ScientificGalleryBagNode<T extends { name: string }> = {
  id: string;
  title: string;
  bags: T[];
  folders: ScientificGalleryBagNode<T>[];
};

type ScientificGalleryBagItem = {
  name: string;
  createdAt?: string;
  startedAt?: string;
};

/** Archive-relative path → nested folders, same shape as Home recording folders. */
export function scientificGalleryBagTree<T extends ScientificGalleryBagItem>(
  items: readonly T[],
): ScientificGalleryBagNode<T>[] {
  type Node = { bags: T[]; children: Map<string, Node> };
  const root: Node = { bags: [], children: new Map() };
  for (const bag of items) {
    const parts = galleryBagPathParts(bag.name);
    if (parts.length === 0) continue;
    let node = root;
    for (const segment of parts.slice(0, -1)) {
      let child = node.children.get(segment);
      if (!child) {
        child = { bags: [], children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.bags.push(bag);
  }
  const walk = (node: Node, prefix: string): ScientificGalleryBagNode<T>[] => (
    sortGalleryFolders([...node.children.entries()].map(([segment, child]) => {
      const id = prefix ? `${prefix}/${segment}` : segment;
      const folder: ScientificGalleryBagNode<T> = {
        id,
        title: segment,
        bags: sortGalleryBags(child.bags),
        folders: walk(child, id),
      };
      folder.title = scientificGalleryFolderTitle(segment, folder);
      return folder;
    }))
  );
  const nested = walk(root, '');
  const bags = sortGalleryBags(root.bags);
  if (bags.length === 0) return nested;
  return sortGalleryFolders([
    ...nested,
    { id:'data', title:'Data files', bags, folders:[] },
  ]);
}

/** Archive-relative path segments. Recording-id directories stay in the tree. */
export function galleryBagPathParts(name: string): string[] {
  return name.replace(/\\/g, '/').split('/').filter(Boolean);
}

export function scientificGalleryFolderTitle<T extends ScientificGalleryBagItem>(
  segment: string,
  folder: ScientificGalleryBagNode<T>,
): string {
  if (!RECORDING_DIRECTORY.test(segment)) return segment;
  const newest = newestGalleryBag(folder);
  if (!newest) return segment;
  return scientificGalleryBagFileName(newest.name).replace(/\.bag$/i, '');
}

function galleryAcquisitionMs<T extends ScientificGalleryBagItem>(bag: T): number {
  const ms = Date.parse(bag.startedAt ?? '');
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function sortGalleryBags<T extends ScientificGalleryBagItem>(bags: T[]): T[] {
  return [...bags].sort((left, right) => {
    const newer = galleryAcquisitionMs(right) - galleryAcquisitionMs(left);
    if (newer !== 0) return newer;
    return left.name.localeCompare(right.name);
  });
}

function newestGalleryBag<T extends ScientificGalleryBagItem>(
  folder: ScientificGalleryBagNode<T>,
): T | undefined {
  let newest: T | undefined = folder.bags[0];
  for (const child of folder.folders) {
    const candidate = newestGalleryBag(child);
    if (!newest) {
      newest = candidate;
      continue;
    }
    if (!candidate) continue;
    if (galleryAcquisitionMs(candidate) > galleryAcquisitionMs(newest)) newest = candidate;
  }
  return newest;
}

function galleryFolderNewestMs<T extends ScientificGalleryBagItem>(
  folder: ScientificGalleryBagNode<T>,
): number {
  const fromBags = folder.bags.reduce((best, bag) => Math.max(best, galleryAcquisitionMs(bag)), Number.NEGATIVE_INFINITY);
  return folder.folders.reduce((best, child) => (
    Math.max(best, galleryFolderNewestMs(child))
  ), fromBags);
}

function sortGalleryFolders<T extends ScientificGalleryBagItem>(
  folders: ScientificGalleryBagNode<T>[],
): ScientificGalleryBagNode<T>[] {
  return [...folders].sort((left, right) => {
    const newer = galleryFolderNewestMs(right) - galleryFolderNewestMs(left);
    if (Number.isFinite(newer) && newer !== 0) return newer;
    return left.title.localeCompare(right.title);
  });
}

export function scientificGalleryBagFileName(name: string) {
  const parts = name.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

export function scientificGalleryBagCount<T extends { name: string }>(
  folder: ScientificGalleryBagNode<T>,
): number {
  return folder.bags.length + folder.folders.reduce((sum, child) => sum + scientificGalleryBagCount(child), 0);
}

export function scientificGalleryWorkflowRuntime(value: unknown): PanelWorkflowRuntimeProjection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PanelWorkflowRuntimeProjection>;
  if (!Array.isArray(candidate.documents) || !Array.isArray(candidate.catalog)) return undefined;
  return candidate as PanelWorkflowRuntimeProjection;
}

export function scientificGalleryWorkflowDocument(
  runtime: PanelWorkflowRuntimeProjection | undefined,
  port: PanelActionPortRuntime | undefined,
): AutomationDocument | undefined {
  const resourceId = port?.trace.automationResourceId;
  if (!runtime || !resourceId) return undefined;
  const candidates = runtime.documents.filter((document) => document.head.resourceId === resourceId);
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function scientificGalleryWorkflowDetail(
  runtime: PanelWorkflowRuntimeProjection | undefined,
  port: PanelActionPortRuntime | undefined,
  runId: string,
): AutomationRunDetail | undefined {
  if (runId) {
    const current = port?.execution?.runDetail(runId) ?? runtime?.runDetailsById[runId];
    if (current) return current;
  }
  const latestId = port?.latestInvocation?.id ?? '';
  return latestId ? port?.execution?.runDetail(latestId) ?? runtime?.runDetailsById[latestId] : undefined;
}
