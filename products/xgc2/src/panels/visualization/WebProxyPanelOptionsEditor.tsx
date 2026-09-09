import { FormSection,FormSectionSpan } from '@xgc2/ui-react';
import { InputControl } from '../../components/controls/TextControls';
import { FormField } from '../../components/FormPrimitives';
import type { PanelPluginOptionsEditorProps } from '../types';

export function WebProxyPanelOptionsEditor({ panel,options,onChange }: PanelPluginOptionsEditorProps) {
  const url = typeof options.url === 'string' ? options.url : '';
  return (
    <FormSection title="Origin" dataXgcRole="web-proxy-panel-options" dataXgcId={panel.id}>
      <FormSectionSpan>
        <FormField
          label="Panel URL"
          tooltip="http(s) origin of the onboard Web UI. Core reverse-proxies it same-origin so the iframe can load field-panel."
        >
          <InputControl
            type="url"
            aria-label="Panel URL"
            placeholder="http://172.30.251.20:8099/"
            value={url}
            dataXgcRole="web-proxy-url"
            dataXgcId={panel.id}
            onChange={(next) => onChange({ ...options, url: next })}
          />
        </FormField>
      </FormSectionSpan>
    </FormSection>
  );
}
