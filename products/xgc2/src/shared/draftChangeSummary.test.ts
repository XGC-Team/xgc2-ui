import { describe,expect,it } from 'vitest';
import { listLabeledFieldChanges,listObjectFieldChanges } from './draftChangeSummary';

describe('listObjectFieldChanges', () => {
  it('lists nested primitive diffs', () => {
    expect(listObjectFieldChanges(
      { autoStartRviz: false,nested: { count: 1 } },
      { autoStartRviz: true,nested: { count: 2 } },
    )).toEqual([
      'Auto Start Rviz: false → true',
      'Nested · Count: 1 → 2',
    ]);
  });
});

describe('listLabeledFieldChanges', () => {
  it('uses provided labels for shallow string maps', () => {
    expect(listLabeledFieldChanges(
      { name: 'A',description: '' },
      { name: 'B',description: 'Note' },
      { name: 'Name',description: 'Description' },
    )).toEqual([
      'Description: "" → Note',
      'Name: A → B',
    ]);
  });
});
