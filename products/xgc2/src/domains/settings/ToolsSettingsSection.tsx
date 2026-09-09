import { useState } from 'react';
import { ConfigSection } from '../../components/ConfigSection';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import {
  readMarkPromptDockVisible,
  writeMarkPromptDockVisible,
} from '../../shared/preferences/markPromptDockPreference';
import {
  readTextSelectionEnabled,
  writeTextSelectionEnabled,
} from '../../shared/preferences/textSelectionPreference';
import { settingsCopy } from './settingsCopy';

export function ToolsSettingsSection({ language }: ProductSettingsContext) {
  const [visible,setVisible] = useState(readMarkPromptDockVisible);
  const [textSelectionEnabled,setTextSelectionEnabled] = useState(readTextSelectionEnabled);
  const copy = settingsCopy[language];
  return (
    <ConfigSection
      title={copy.sectionTools}
      dataXgcRole="station-tools-settings"
      dataXgcId="tools"
    >
      <FormField label={copy.toolsTextSelection} dataXgcRole="station-text-selection-setting" dataXgcId="station-text-selection-setting">
        <SwitchControl
          ariaLabel={copy.toolsTextSelection}
          checked={textSelectionEnabled}
          description={textSelectionEnabled ? 'On' : 'Off'}
          onChange={(next) => {
            setTextSelectionEnabled(next);
            writeTextSelectionEnabled(next);
          }}
          dataXgcRole="station-text-selection" dataXgcId="station-text-selection"
        />
      </FormField>
      <FormField label={copy.toolsMarkPromptDock} dataXgcRole="station-mark-prompt-dock-setting" dataXgcId="station-mark-prompt-dock-setting">
        <SwitchControl
          ariaLabel={copy.toolsMarkPromptDock}
          checked={visible}
          description={visible ? 'On' : 'Off'}
          onChange={(next) => {
            setVisible(next);
            writeMarkPromptDockVisible(next);
          }}
          dataXgcRole="station-mark-prompt-dock" dataXgcId="station-mark-prompt-dock"
        />
      </FormField>
    </ConfigSection>
  );
}
