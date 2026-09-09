export type AutomationPathKind = 'file' | 'directory';

/** Generic host path browser vs Gazebo world browser (catalog + scene preview). */
export type AutomationPathPickerVariant = 'path' | 'world';

/**
 * Starting folder for the generic file/directory browser.
 * Does not special-case Gazebo world layout — that belongs to the world picker only.
 */
export function initialAutomationPickerPath(
  targetId: string,
  kind: AutomationPathKind,
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return defaultAutomationPickerRoot(targetId);
  if (kind === 'directory') return trimmed;
  return parentDirectoryPath(trimmed);
}

/**
 * Starting folder for the Gazebo world picker: prefer the flat catalog under
 * gazebo_sim_worlds/worlds when the current value lives in that tree.
 */
export function initialGazeboWorldPickerPath(targetId: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return defaultAutomationPickerRoot(targetId);
  const normalized = trimmed.replace(/\/+$/, '');
  if (matchesAutomationFileExtensions(normalized, ['.world'])) {
    const marker = '/gazebo_sim_worlds/worlds/';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) return `${normalized.slice(0, markerIndex)}${marker}catalog`;
  }
  return parentDirectoryPath(normalized);
}

export function matchesAutomationFileExtensions(name: string, fileExtensions?: readonly string[]) {
  if (!fileExtensions?.length) return true;
  const normalizedName = name.toLowerCase();
  return fileExtensions.some((extension) => normalizedName.endsWith(extension.toLowerCase()));
}

/** Normalized extension list for UI copy, e.g. ['.rviz'] → ['.rviz']. */
export function normalizeAutomationFileExtensions(fileExtensions?: readonly string[]) {
  if (!fileExtensions?.length) return [];
  return fileExtensions.map((extension) => extension.toLowerCase());
}

/**
 * Compact filter label shown inside the path picker dialog only.
 * Never render this under FormField inputs — drawer layout forbids helper text below controls.
 */
export function automationPathFileExtensionPickerHint(fileExtensions?: readonly string[]) {
  const extensions = normalizeAutomationFileExtensions(fileExtensions);
  if (extensions.length === 0) return undefined;
  if (extensions.length === 1) return `Showing ${extensions[0]} files`;
  if (extensions.length === 2) return `Showing ${extensions[0]} or ${extensions[1]} files`;
  return `Showing ${extensions.slice(0, -1).join(', ')}, or ${extensions[extensions.length - 1]} files`;
}

/**
 * Only Gazebo world parameters use the world picker (catalog + scene preview).
 * Other path fields — even those that accept .world — use the generic browser.
 */
export function isGazeboWorldPathField(
  name: string,
  kind: AutomationPathKind,
  fileExtensions?: readonly string[],
) {
  if (kind !== 'file') return false;
  if (name !== 'world' && name !== 'gazeboWorld') return false;
  if (fileExtensions?.length && !fileExtensions.some((extension) => extension.toLowerCase() === '.world')) {
    return false;
  }
  return true;
}

/** The ROS bag player alone may select an archived bag before browsing the host. */
export function isROSBagPlayPathField(
  name: string,
  kind: AutomationPathKind,
  fileExtensions?: readonly string[],
) {
  if (name !== 'bagPath' || kind !== 'file' || !fileExtensions?.length) return false;
  const supported = new Set(['.bag','.mcap','.db3']);
  return fileExtensions.some((extension) => supported.has(extension.toLowerCase()));
}

export function automationPickerHostLabel(targetId: string) {
  const normalized = targetId.trim() || 'local';
  if (normalized !== 'local' && !normalized.startsWith('core:')) return `execution target ${normalized}`;
  if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) return 'desktop host';
  return normalized.startsWith('core:') ? 'selected Core host' : 'Core host';
}

function defaultAutomationPickerRoot(targetId: string) {
  return targetId.trim() && targetId.trim() !== 'local' && !targetId.startsWith('core:') ? '/managed' : '/';
}

function parentDirectoryPath(path: string) {
  const normalized = path.replace(/\/+$/, '');
  const separator = normalized.lastIndexOf('/');
  return separator <= 0 ? '/' : normalized.slice(0, separator);
}
