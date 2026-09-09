import { describe,expect,it } from 'vitest';
import {
  formatRecordingSize,
  normalizeRecordingArtifactLimit,
  RECORDING_ARTIFACT_DEFAULT_LIMIT,
  recordingParametersWithTopics,
  recordingSelectionWithTopic,
  recordingSelectionWithoutTopic,
  recordingTopicRefusal,
  recordingTopicSelection,
} from './recordingControlPanelModel';

function binding(parameters: unknown): { parameters:Record<string,unknown> | undefined } {
  return { parameters: parameters as Record<string,unknown> | undefined };
}

describe('recording control panel model', () => {
  it('reads only string topics and never invents a default selection', () => {
    expect(recordingTopicSelection(binding({
      robotTopics: ['mavros/state',7,'mavros/imu/data'],
      globalTopics: ['/clock'],
    }))).toEqual({ robotTopics: ['mavros/state','mavros/imu/data'],globalTopics: ['/clock'] });
    // A binding with no readable parameters records nothing until an operator
    // says otherwise. Showing a plausible default here would be showing a topic
    // list the recorder would not actually subscribe to.
    expect(recordingTopicSelection(binding(undefined)))
      .toEqual({ robotTopics: [],globalTopics: [] });
    expect(recordingTopicSelection(binding({ robotTopics: 'mavros/state' })))
      .toEqual({ robotTopics: [],globalTopics: [] });
    expect(recordingTopicSelection(undefined)).toEqual({ robotTopics: [],globalTopics: [] });
  });

  it('refuses topics in the wrong scope shape before they reach a commit', () => {
    expect(recordingTopicRefusal('robotTopics','mavros/state')).toBe('');
    expect(recordingTopicRefusal('robotTopics','/mavros/state')).not.toBe('');
    expect(recordingTopicRefusal('globalTopics','/clock')).toBe('');
    expect(recordingTopicRefusal('globalTopics','clock')).not.toBe('');
    expect(recordingTopicRefusal('globalTopics','')).not.toBe('');
    expect(recordingTopicRefusal('robotTopics','mavros/state:=alias')).not.toBe('');
  });

  it('carries every parameter it does not own through an edit untouched', () => {
    const parameters = recordingParametersWithTopics(
      binding({
        robotTopics: ['mavros/state'],globalTopics: ['/clock'],
        splitSizeMiB: 2048,compression: 'bz2',includeMotionCapture: true,
      }),
      { robotTopics: ['mavros/state','mavros/imu/data'],globalTopics: ['/tf'] },
    );
    expect(parameters).toEqual({
      robotTopics: ['mavros/state','mavros/imu/data'],
      globalTopics: ['/tf'],
      splitSizeMiB: 2048,
      compression: 'bz2',
      includeMotionCapture: true,
    });
  });

  it('adds and removes topics without duplicating or mutating the selection', () => {
    const selection = { robotTopics: ['mavros/state'],globalTopics: ['/clock'] };
    expect(recordingSelectionWithTopic(selection,'robotTopics','mavros/state')).toBe(selection);
    expect(recordingSelectionWithTopic(selection,'robotTopics','mavros/imu/data').robotTopics)
      .toEqual(['mavros/state','mavros/imu/data']);
    expect(recordingSelectionWithoutTopic(selection,'globalTopics','/clock').globalTopics).toEqual([]);
    expect(selection).toEqual({ robotTopics: ['mavros/state'],globalTopics: ['/clock'] });
  });

  it('keeps the artifact window inside the API bounds it will be sent to', () => {
    expect(normalizeRecordingArtifactLimit(undefined)).toBe(RECORDING_ARTIFACT_DEFAULT_LIMIT);
    expect(normalizeRecordingArtifactLimit('not a number')).toBe(RECORDING_ARTIFACT_DEFAULT_LIMIT);
    expect(normalizeRecordingArtifactLimit(0)).toBe(1);
    expect(normalizeRecordingArtifactLimit(9000)).toBe(500);
    expect(normalizeRecordingArtifactLimit(37.9)).toBe(37);
  });

  it('reports bag sizes in units an operator can read', () => {
    expect(formatRecordingSize(512)).toBe('512 B');
    expect(formatRecordingSize(1024 * 1024 * 3)).toBe('3.0 MiB');
    expect(formatRecordingSize(-1)).toBe('—');
  });
});
