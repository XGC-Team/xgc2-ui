import { describe,expect,it } from 'vitest';
import {
  dashboardIdFromExperimentHash,
  experimentDocumentHash,
  experimentListHash,
  isExperimentListHash,
  isExperimentLocationHash,
  resourceIdFromExperimentHash,
} from './experimentNavigation';

describe('experiment navigation', () => {
  it('round-trips stable resource IDs without storing a document version', () => {
    const hash = experimentDocumentHash('experiment/field test');

    expect(hash).toBe('#/experiments/experiment%2Ffield%20test');
    expect(resourceIdFromExperimentHash(hash)).toBe('experiment/field test');
  });

  it('distinguishes the experiment list from a detail location', () => {
    expect(experimentListHash()).toBe('#/experiments');
    expect(isExperimentLocationHash('#/experiments')).toBe(true);
    expect(isExperimentListHash('#/experiments')).toBe(true);
    expect(isExperimentListHash('#/experiments/exp-1')).toBe(false);
    expect(resourceIdFromExperimentHash('#/experiments')).toBe('');
  });

  it('rejects unrelated and malformed locations', () => {
    expect(isExperimentLocationHash('#/experiment/exp-1')).toBe(false);
    expect(resourceIdFromExperimentHash('#/experiments/%E0%A4%A')).toBe('');
  });

  it('round-trips a dashboard segment without dropping the Experiment resource', () => {
    const hash = experimentDocumentHash('exp-1', 'gcs');
    expect(hash).toBe('#/experiments/exp-1/gcs');
    expect(resourceIdFromExperimentHash(hash)).toBe('exp-1');
    expect(dashboardIdFromExperimentHash(hash)).toBe('gcs');
    expect(dashboardIdFromExperimentHash('#/experiments/exp-1')).toBe('');
    expect(experimentDocumentHash('exp-1', 'config')).toBe('#/experiments/exp-1');
  });
});
