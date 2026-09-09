import { describe,expect,it } from 'vitest';
import { automationParameterGroups } from './automationParameterGroupModel';

describe('Automation parameter group model', () => {
  it('decodes ordered typed groups and defaults them to collapsed', () => {
    expect(automationParameterGroups({
		properties: { host: {},port: {},timeout: {} },
      'x-xgc-parameter-groups': [
        { id: 'network',label: 'Network',parameters: ['host','port'] },
        { id: 'runtime',label: 'Runtime',collapsed: false,parameters: ['timeout'] },
      ],
    })).toEqual([
      { id: 'network',label: 'Network',collapsed: true,parameters: ['host','port'] },
      { id: 'runtime',label: 'Runtime',collapsed: false,parameters: ['timeout'] },
    ]);
  });

  it('fails closed on duplicate group or parameter ownership', () => {
    expect(automationParameterGroups({
		properties: { host: {},port: {} },
      'x-xgc-parameter-groups': [
        { id: 'network',label: 'Network',parameters: ['port'] },
        { id: 'network',label: 'Duplicate',parameters: ['host'] },
        { id: 'runtime',label: 'Runtime',parameters: ['port'] },
      ],
    })).toEqual([{ id: 'network',label: 'Network',collapsed: true,parameters: ['port'] }]);
  });

	it('rejects malformed stable IDs and references to undeclared parameters', () => {
		expect(automationParameterGroups({
			properties: { host: {} },
			'x-xgc-parameter-groups': [
				{ id: 'bad:id',label: 'Bad ID',parameters: ['host'] },
				{ id: 'network',label: 'Network',parameters: ['missing'] },
			],
		})).toEqual([]);
	});
});
