import { describe,expect,it } from 'vitest';
import { robotAssetDocumentHash,robotAssetListHash } from './robotAssetNavigation';

describe('Robot asset navigation',() => {
  it('encodes exact Robot asset editor and list locations',() => {
    expect(robotAssetDocumentHash('robot/field 1')).toBe('#/assets/robots/robot%2Ffield%201');
    expect(robotAssetListHash()).toBe('#/assets/robots');
  });
});
