// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationRunParameterDialog } from './AutomationRunParameterDialog';
import { AutomationRunParameterSchemaEditor } from './AutomationRunParameterSchemaEditor';
import { AUTHORABLE_AUTOMATION_PARAMETER_KINDS } from './automationRunParameterAuthoring';
import { newAutomationSpec,normalizeAutomationSpec } from './automationSpecModel';
import { automationParameterSchemaError } from './automationValidation';
import type {
  AutomationDocument,
  AutomationParameterSchema,
  AutomationSpec,
} from './automationDefinitionContracts';

const parameterStyles = readFileSync(resolve(process.cwd(), 'src/styles/automation-run-parameters.css'), 'utf8');

/**
 * The user-visible closing of the workflow loop: a workflow authored from
 * scratch declares run parameters in the editor, and the generic Automation
 * panel's run dialog asks for exactly those parameters.
 */
describe('run parameter authoring reaches the run dialog', () => {
  it('declares a parameter in the editor and renders it in the run dialog', () => {
    let spec = newAutomationSpec('Survey');
    expect(spec.actions[0]!.inputSchema.fields).toEqual([]);

    const { rerender,unmount } = render(<AutomationRunParameterSchemaEditor
      resourceId="automation-a"
      actionId="run"
      actionLabel="Run"
      schema={spec.actions[0]!.inputSchema}
      readOnly={false}
      disabled={false}
      onChange={(next) => { spec = withActionInputSchema(spec, next); }}
    />);
    const apply = () => rerender(<AutomationRunParameterSchemaEditor
      resourceId="automation-a"
      actionId="run"
      actionLabel="Run"
      schema={spec.actions[0]!.inputSchema}
      readOnly={false}
      disabled={false}
      onChange={(next) => { spec = withActionInputSchema(spec, next); }}
    />);

    const summary = document.querySelector('[data-xgc-role="automation-action-inputs-summary"]');
    expect(summary).toHaveTextContent('Action inputs');
    expect(summary).toHaveAttribute(
      'title',
      'Action inputs for Run',
    );
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveAttribute('aria-haspopup', 'dialog');
    (summary as HTMLElement).focus();
    expect(summary).toHaveFocus();
    fireEvent.click(summary!);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Define the typed inputs accepted by Action Run.'))
      .not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Action inputs for Run' })).toBeInTheDocument();
    const fields = document.querySelector('[data-xgc-role="automation-action-inputs-fields"]');
    expect(fields).toHaveAttribute('role','dialog');
    expect(fields).toHaveClass('config-drawer', 'config-drawer-wide', 'automation-run-parameters-drawer');
    expect(fields).toHaveAttribute('data-width','wide');
    expect(fields?.parentElement).toHaveClass('config-drawer-backdrop');
    expect(fields?.querySelector('.config-drawer-body')).toHaveClass('automation-run-parameters-drawer-body');

    fireEvent.click(screen.getByRole('button', { name: 'Add action input' }));
    apply();
    expect(spec.actions[0]!.inputSchema.fields).toEqual([{ name: 'parameter',kind: 'string' }]);
    const fieldSection = document.querySelector('[data-xgc-role="automation-run-parameter"]');
    expect(fieldSection?.tagName).toBe('SECTION');
    expect(fieldSection).toHaveClass('xgc-form-section', 'automation-run-parameters-row');
    expect(fieldSection).toHaveAttribute('data-columns','2');
    expect(fieldSection?.querySelector('.automation-run-parameters-row-fields')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Run parameter name'), { target: { value: 'site' } });
    apply();
    fireEvent.change(screen.getByLabelText('Run parameter label'), { target: { value: 'Survey site' } });
    apply();
    fireEvent.click(screen.getByRole('switch', { name: 'Required' }));
    apply();

    expect(spec.actions[0]!.inputSchema.fields).toEqual([
      { name: 'site',label: 'Survey site',kind: 'string',required: true },
    ]);
    expect(automationParameterSchemaError(spec.actions[0]!.inputSchema)).toBe('');
    fireEvent.click(document.querySelector('[data-xgc-role="automation-action-inputs-close"]')!);
    expect(document.querySelector('[data-xgc-role="automation-action-inputs-fields"]')).not.toBeInTheDocument();
    expect(summary).toHaveAttribute('aria-expanded','false');
    expect(summary).toHaveFocus();
    unmount();

    render(<AutomationRunParameterDialog
      document={documentOf(spec)}
      onClose={vi.fn()}
      onRun={vi.fn(async () => undefined)}
    />);
    expect(screen.getByRole('dialog', { name: 'Run parameters for Survey' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Survey site/)).toBeInTheDocument();
  });

  // Operators type a parameter name one character at a time, and each character
  // is a new schema pushed back into the editor. The row must survive that: if
  // it is rebuilt per keystroke the name box loses focus and the name cannot be
  // typed at all, which is the whole authoring path.
  it('keeps the name box mounted and focused across per-character name edits', () => {
    let schema: AutomationParameterSchema = { fields: [{ name: 'parameter',kind: 'string' }] };
    const editor = () => <AutomationRunParameterSchemaEditor
      resourceId="automation-a"
      actionId="run"
      actionLabel="Run"
      schema={schema}
      readOnly={false}
      disabled={false}
      onChange={(next) => { schema = next; }}
    />;
    const { rerender } = render(editor());
    fireEvent.click(document.querySelector('[data-xgc-role="automation-action-inputs-summary"]')!);

    const name = screen.getByLabelText('Run parameter name') as HTMLInputElement;
    name.focus();
    for (const typed of ['s', 'si', 'sit', 'site']) {
      fireEvent.change(screen.getByLabelText('Run parameter name'), { target: { value: typed } });
      rerender(editor());
      expect(screen.getByLabelText('Run parameter name')).toBe(name);
      expect(document.activeElement).toBe(name);
    }

    expect(schema.fields).toEqual([{ name: 'site',kind: 'string' }]);
    expect(name.value).toBe('site');
  });

  it('surfaces a mirrored schema rejection instead of waiting for the commit', () => {
    const schema: AutomationParameterSchema = { fields: [
      { name: 'site',kind: 'string' },
      { name: 'site',kind: 'string' },
    ] };
    render(<AutomationRunParameterSchemaEditor
      resourceId="automation-a"
      actionId="run"
      actionLabel="Run"
      schema={schema}
      readOnly={false}
      disabled={false}
      onChange={vi.fn()}
    />);
    fireEvent.click(document.querySelector('[data-xgc-role="automation-action-inputs-summary"]')!);

    expect(screen.getByText('Run parameter "site" must be unique.')).toBeInTheDocument();
  });

  it('opens system workflow inputs for inspection without exposing mutations', () => {
    const onChange = vi.fn();
    render(<AutomationRunParameterSchemaEditor
      resourceId="system-automation"
      actionId="run"
      actionLabel="Run"
      schema={{ fields: [
        { name: 'bindingIds',label: 'Workflow binding IDs',description:'Frozen workflow bindings selected for this Run.',kind: 'array' },
        { name: 'runMode',label: 'Run mode',kind: 'string',required: true },
      ] }}
      readOnly
      disabled={false}
      onChange={onChange}
    />);

    const summary = document.querySelector(
      '[data-xgc-role="automation-action-inputs-summary"][data-xgc-id="system-automation:run"]',
    );
    expect(summary).toHaveTextContent('Action inputs');
    fireEvent.click(summary!);

    const fields = document.querySelector(
      '[data-xgc-role="automation-action-inputs-fields"][data-xgc-id="system-automation:run"]',
    );
    expect(fields).toHaveAttribute('role','dialog');
    expect(fields?.querySelector(
      '[data-xgc-role="automation-action-inputs-field-list"][data-xgc-id="system-automation:run"]',
    )).toHaveAttribute('data-xgc-readonly', 'true');
    const nested = document.querySelector(
      '[data-xgc-role="automation-run-parameter"][data-xgc-id="system-automation:bindingIds"]',
    );
    expect(nested).toBeInTheDocument();
    expect(nested).toHaveAttribute('data-xgc-authorable','false');
    expect(nested?.querySelector(
      '[data-xgc-role="automation-run-parameter-description"][data-xgc-id="system-automation:bindingIds"]',
    )).toHaveTextContent('Frozen workflow bindings selected for this Run.');
    expect(nested).not.toHaveTextContent('This parameter kind is declared by the workflow and is not editable here.');
    expect(document.querySelector('[data-xgc-role="automation-run-parameter"][data-xgc-id="system-automation:runMode"]'))
      .toBeInTheDocument();
    expect(screen.getAllByLabelText('Run parameter name').every((control) => control.hasAttribute('disabled'))).toBe(true);
    expect(document.querySelector('[data-xgc-role="automation-run-parameters-add"]')).not.toBeInTheDocument();
    expect(AUTHORABLE_AUTOMATION_PARAMETER_KINDS).toEqual(['string','boolean','integer','number']);
    expect(document.querySelector('[data-xgc-role="automation-run-parameter-remove"]')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lays out parameter sections in two responsive columns with a narrow single-column fallback', () => {
    expect(parameterStyles).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(parameterStyles).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.automation-run-parameters-row-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it('keeps the Action-input drawer close target square with a legible X',() => {
    expect(parameterStyles).toMatch(
      /\.automation-run-parameters-drawer \[data-xgc-role="automation-action-inputs-close"\]\s*\{[^}]*width:\s*var\(--size-control-default\);[^}]*min-width:\s*var\(--size-control-default\);[^}]*height:\s*var\(--size-control-default\);[^}]*min-height:\s*var\(--size-control-default\);[^}]*font-size:\s*var\(--font-xl\);/s,
    );
  });

  it('seeds a workflow with a declared schema instead of a fixed empty one', () => {
    const seeded = newAutomationSpec('Seeded', 'local', { fields: [{ name: 'site',kind: 'string' }] });
    expect(seeded.actions[0]!.inputSchema.fields).toEqual([{ name: 'site',kind: 'string' }]);
  });
});

function withActionInputSchema(spec: AutomationSpec, inputSchema: AutomationParameterSchema): AutomationSpec {
  return { ...spec,actions: spec.actions.map((action, index) => index === 0 ? { ...action,inputSchema } : action) };
}

function documentOf(spec: AutomationSpec): AutomationDocument {
  const timestamp = '2026-07-15T09:00:00Z';
  return {
    head: {
      domain: 'automation',resourceId: 'automation-a',name: spec.metadata.name,description: '',tags: [],
      mainCommitId: 'commit-1',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId: 'automation-a',name: 'candidate',headCommitId: 'commit-1',
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec: normalizeAutomationSpec(spec),
  };
}
