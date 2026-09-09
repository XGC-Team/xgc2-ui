// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type {
  AutomationDocument,
  AutomationParameterField,
} from './automationDefinitionContracts';
import { serializeParameters } from './automationParameterModel';
import { newAutomationSpec } from './automationSpecModel';
import { AutomationRunParameterDialog } from './AutomationRunParameterDialog';

describe('AutomationRunParameterDialog', () => {
  it('serializes the trusted typed parameter contract and enforces bounds', () => {
    const fields: AutomationParameterField[] = [
      { name: 'mission',label: 'Mission',kind: 'string',required: true },
      { name: 'attempts',kind: 'integer',integer: { minimum: 1,maximum: 3 } },
      { name: 'dryRun',kind: 'boolean' },
      { name: 'robot',kind: 'object',required: true,object: { fields: [{ name: 'id',kind: 'string',required: true }] } },
      { name: 'waypoints',kind: 'array',array: { minItems: 0,maxItems: 2,items: { kind: 'number' } } },
    ];
    expect(serializeParameters(fields, { mission: 'survey',attempts: '2',dryRun: true,robot: '{"id":"px4-01"}',waypoints: '[1,2]' })).toEqual({
      mission: 'survey',attempts: 2,dryRun: true,robot: { id: 'px4-01' },waypoints: [1,2],
    });
    expect(() => serializeParameters(fields, { mission: '',attempts: '2' })).toThrow('Mission is required');
    expect(() => serializeParameters(fields, { mission: 'survey',attempts: '4' })).toThrow('exceeds 3');
    expect(() => serializeParameters(fields, { mission: 'survey',robot: '[]' })).toThrow('must be a JSON object');
  });

  it('submits parameters against the current Automation and exposes stable identities', async () => {
    const document = fixture();
    const onRun = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { container } = render(<AutomationRunParameterDialog document={document} onRun={onRun} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'automation-run-parameter-dialog');
    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-id', 'automation-a');
    expect(screen.getByRole('dialog')).toHaveClass('config-drawer', 'automation-run-parameter-dialog');
    expect(container).not.toHaveTextContent('Configure inputs for Run.');
    fireEvent.change(container.querySelector('[data-xgc-id="altitude"] input')!, { target: { value: '12.5' } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-submit"]')!);

    expect(container.querySelector('[data-xgc-role="automation-run-execution-context"]')).toBeNull();
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({ altitude: 12.5,arm: false }));
    expect(onClose).toHaveBeenCalled();
  });

  it('starts from a non-empty array default as JSON text and submits the parsed array', async () => {
    const document = fixture();
    document.spec.actions[0]!.inputSchema.fields = [{
      name: 'robotIds',
      label: 'Robot IDs',
      kind: 'array',
      required: true,
      array: { minItems: 0,maxItems: 8,items: { kind: 'string' },default: ['scout-01','mecanum-02'] },
    }];
    const onRun = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AutomationRunParameterDialog document={document} onRun={onRun} onClose={vi.fn()} />,
    );
    const textarea = container.querySelector('textarea');
    expect(textarea).toHaveValue(JSON.stringify(['scout-01','mecanum-02'], null, 2));
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-submit"]')!);
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({ robotIds: ['scout-01','mecanum-02'] }));
  });
});

function fixture(): AutomationDocument {
  const timestamp = '2026-07-14T00:00:00Z';
  const spec = newAutomationSpec('Mission');
  spec.actions[0]!.inputSchema.fields = [
    { name: 'altitude',kind: 'number',required: true,number: { minimum: 0 } },
    { name: 'arm',kind: 'boolean' },
  ];
  return {
    head: {
      domain: 'automation',resourceId: 'automation-a',name: 'Mission',description: '',tags: [],
      mainCommitId: 'commit-1',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId: 'automation-a',name: 'candidate',headCommitId: 'commit-1',
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
