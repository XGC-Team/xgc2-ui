import { FormSection } from '@xgc2/ui-react';
import { SwitchControl } from '../../components/FormPrimitives';
import { useRobotText } from '../../domains/robot/robotPublic';
import type { PanelPluginOptionsEditorProps } from '../types';
import {
  robotRemoteSpringReturn,
  withRobotRemoteSpringReturn,
} from './robotRemoteControlOptions';

export function RobotControlPanelOptionsEditor({
  panel,options,onChange,
}: PanelPluginOptionsEditorProps) {
  const t = useRobotText();
  const springReturn = robotRemoteSpringReturn(options);
  return (
    <FormSection title={t('Remote control')} dataXgcRole="robot-control-panel-options" dataXgcId={panel.id}>
      <SwitchControl
        label={t('Spring return')}
        checked={springReturn}
        tooltip={t('Hold a direction button or key to move. Off latches on click.')}
        onChange={(value) => onChange(withRobotRemoteSpringReturn(options, value))}
        dataXgcRole="robot-remote-spring-return"
        dataXgcId={panel.id}
      />
    </FormSection>
  );
}
