// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationParameterField } from './automationDefinitionContracts';
import { AutomationParameterSchemaForm } from './AutomationParameterSchemaForm';
import {
  isRenderableAutomationParameterField,
  unsupportedAutomationParameterFields,
} from './automationParameterSchemaFormModel';

const fields = [
  { name: 'host',label: 'Host',kind: 'string',required: true,string: { default: 'localhost' } },
  { name: 'port',label: 'Port',kind: 'integer',required: true,integer: { default: 3884,minimum: 1,maximum: 65535 } },
  { name: 'enabled',label: 'Enabled',kind: 'boolean',boolean: { default: true } },
] as unknown as AutomationParameterField[];

describe('AutomationParameterSchemaForm', () => {
  it('renders a declared schema as one control per field and reports edits by field', () => {
    const onChange = vi.fn();
    const { container } = render(<AutomationParameterSchemaForm
      roleId="node-1"
      fields={fields}
      values={{ host: 'localhost',port: 3884,enabled: true }}
      executionTargetId="local"
      onChange={onChange}
      onError={vi.fn()}
    />);

    const host = container.querySelector('[data-xgc-id="node-1:host"] input');
    expect(host).toHaveValue('localhost');
    fireEvent.change(host!, { target: { value: 'rig-2.lab' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'host' }),
      'rig-2.lab',
    );

    const port = container.querySelector('[data-xgc-id="node-1:port"] input');
    fireEvent.change(port!, { target: { value: '3883' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'port' }), 3883);
  });

  // fail loud: a schema this build has no control for must stay visible and say
  // so, because a dropped field is a binding silently committed without it.
  it('shows a field kind it cannot edit as read-only raw JSON instead of hiding it', () => {
    const exotic = { name: 'exotic',label: 'Exotic',kind: 'geometry' } as unknown as AutomationParameterField;
    expect(isRenderableAutomationParameterField(exotic)).toBe(false);
    expect(unsupportedAutomationParameterFields([...fields,exotic])).toEqual([exotic]);

    const { container } = render(<AutomationParameterSchemaForm
      roleId="node-1"
      fields={[...fields,exotic]}
      values={{ exotic: { corners: 4 } }}
      executionTargetId="local"
      onChange={vi.fn()}
      onError={vi.fn()}
    />);

    const unsupported = container.querySelector(
      '[data-xgc-role="automation-parameter-unsupported"][data-xgc-id="node-1:exotic"]',
    );
    expect(unsupported).not.toBeNull();
    const raw = unsupported!.querySelector('textarea');
    expect(raw).toHaveAttribute('readonly');
    expect(raw).toHaveValue(JSON.stringify({ corners: 4 }, null, 2));
    expect(unsupported!.textContent).toContain('geometry');
    // The renderable fields beside it are unaffected.
    expect(container.querySelectorAll('[data-xgc-role="automation-node-parameter"]').length)
      .toBeGreaterThan(0);
  });
});
