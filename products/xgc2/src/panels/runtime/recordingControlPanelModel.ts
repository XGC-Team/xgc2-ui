type RecordingActionDefaults = { parameters?: Record<string,unknown> };

/**
 * The Experiment workflow slot this panel drives. It matches the binding ID the
 * default-Experiment provisioner writes; nothing else about the recorder is
 * compiled into the frontend.
 */
export const ROSBAG_RECORDING_WORKFLOW_SLOT = 'rosbag-recording';

export const RECORDING_CONTROL_PANEL_ID = 'recording-control';

/** How many archived bags the panel lists at once. */
export const RECORDING_ARTIFACT_DEFAULT_LIMIT = 20;
const RECORDING_ARTIFACT_MINIMUM_LIMIT = 1;
const RECORDING_ARTIFACT_MAXIMUM_LIMIT = 500;

/**
 * The recorder's selection, as the bound workflow's Run parameters carry it.
 *
 * Only the two topic lists are editable here. Split sizes, compression and the
 * rest of the recorder's parameters are left exactly as the binding holds them
 * — this panel is a topic and lifecycle surface, and silently rewriting a
 * storage bound an operator set elsewhere would be a change nobody asked for.
 */
export type RecordingTopicSelection = {
  robotTopics: string[];
  globalTopics: string[];
};

export type RecordingTopicScope = keyof RecordingTopicSelection;

/**
 * Relative topics are recorded below every robot namespace; global topics are
 * recorded once and must therefore be absolute. These are the recorder's own
 * two shapes, checked here so an operator sees the refusal while typing rather
 * than as a rejected commit.
 */
const RELATIVE_TOPIC = /^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/;
const ABSOLUTE_TOPIC = /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/;

export function recordingTopicRefusal(scope: RecordingTopicScope, topic: string) {
  const value = topic.trim();
  if (!value) return 'Enter a topic name.';
  if (value.length > 1024) return 'A topic name is at most 1024 characters.';
  if (scope === 'globalTopics') {
    return ABSOLUTE_TOPIC.test(value)
      ? ''
      : 'A global topic must be an absolute ROS graph name, for example /clock.';
  }
  return RELATIVE_TOPIC.test(value)
    ? ''
    : 'A robot topic is relative to each robot namespace, for example mavros/state.';
}

/**
 * Reads the editable half of the binding's parameters.
 *
 * A binding whose parameters are missing or malformed reads as an empty
 * selection rather than as defaults: this panel must never show an operator a
 * topic list the recorder would not actually record.
 */
export function recordingTopicSelection(binding?: RecordingActionDefaults): RecordingTopicSelection {
  const parameters = binding?.parameters;
  return {
    robotTopics: topicList(parameters, 'robotTopics'),
    globalTopics: topicList(parameters, 'globalTopics'),
  };
}

function topicList(parameters: unknown, key: string): string[] {
  if (!parameters || typeof parameters !== 'object') return [];
  const value = (parameters as Record<string,unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Produces the whole parameter document to commit for one topic edit.
 *
 * Every other parameter is carried through untouched, so an edit here cannot
 * quietly reset a recorder setting this panel does not show.
 */
export function recordingParametersWithTopics(
  binding: RecordingActionDefaults | undefined,
  selection: RecordingTopicSelection,
): Record<string,unknown> {
  const parameters = binding?.parameters;
  const base = parameters && typeof parameters === 'object' && !Array.isArray(parameters)
    ? { ...(parameters as Record<string,unknown>) }
    : {};
  return { ...base,robotTopics: [...selection.robotTopics],globalTopics: [...selection.globalTopics] };
}

export function recordingSelectionWithTopic(
  selection: RecordingTopicSelection,
  scope: RecordingTopicScope,
  topic: string,
): RecordingTopicSelection {
  const value = topic.trim();
  if (selection[scope].includes(value)) return selection;
  return { ...selection,[scope]: [...selection[scope],value] };
}

export function recordingSelectionWithoutTopic(
  selection: RecordingTopicSelection,
  scope: RecordingTopicScope,
  topic: string,
): RecordingTopicSelection {
  return { ...selection,[scope]: selection[scope].filter((entry) => entry !== topic) };
}

export function normalizeRecordingArtifactLimit(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return RECORDING_ARTIFACT_DEFAULT_LIMIT;
  return Math.max(
    RECORDING_ARTIFACT_MINIMUM_LIMIT,
    Math.min(RECORDING_ARTIFACT_MAXIMUM_LIMIT, Math.floor(parsed)),
  );
}

/** Human-readable bag size. Bags are large, so this never renders raw bytes. */
export function formatRecordingSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B','KiB','MiB','GiB','TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
