import { ChevronDown,ChevronUp } from 'lucide-react';
import { FormSection, FormSectionSpan } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { PanelPluginOptionsEditorProps } from '../types';
import {
  moveRosBasicServiceInOrder,
  ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS,
  ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW,
  ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW,
  rosBasicServicesButtonsPerRow,
  rosBasicServicesLayoutOptions,
  rosBasicServicesLayoutPanelOptions,
} from './rosBasicServicesPanelLayout';
import { rosBasicServices,type RosBasicServiceId } from './rosBasicServicesPanelModel';
import '../../styles/ros-panel-options.css';
import { useRosPanelText } from './rosMessages';

const byId = new Map(rosBasicServices.map((service) => [service.id,service]));
const PHYSICAL_VRPN_SERVER_HOST_PATTERN = '^(?:(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])|(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*)$';

export function RosBasicServicesPanelOptionsEditor({
  panel,options,actionPresetAuthoring,onChange,
}: PanelPluginOptionsEditorProps) {
  const t = useRosPanelText();
  const layout = rosBasicServicesLayoutOptions(options);
  const workflowParameters = actionPresetAuthoring?.['workflow-parameters'];
  const hasPhysicalVrpnServerHost = workflowParameters
    ? Object.hasOwn(workflowParameters.values,'physicalVrpnServerHost')
    : false;
  const physicalVrpnServerHost = typeof workflowParameters?.values.physicalVrpnServerHost === 'string'
    ? workflowParameters.values.physicalVrpnServerHost
    : '';
  const connectedServices = new Set(panel.portBindings.flatMap((binding) => (
    binding.kind === 'action' ? [binding.portId] : []
  )));
  const update = (patch:Record<string,unknown>) => onChange({
    ...options,...rosBasicServicesLayoutPanelOptions(layout),...patch,
  });
  const setVisibility = (id:RosBasicServiceId,shown:boolean) => {
    const service = byId.get(id)!;
    if (!shown) workflowParameters?.onChange(service.parameterKey,false);
    update({
      [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.hidden]:shown
        ? layout.hidden.filter((entry) => entry !== id) : [...layout.hidden,id],
    });
  };
  return (
    <>
      <FormSection title={t('Layout')} dataXgcRole="ros-basic-services-panel-layout" dataXgcId={panel.id}>
        <FormField label={t('Buttons per row')}>
          <InputControl
            type="number" min={ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW} max={ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW}
            step={1} value={layout.buttonsPerRow}
            onChange={(value) => update({
              [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.buttonsPerRow]:rosBasicServicesButtonsPerRow(Number(value)),
            })}
            dataXgcRole="ros-basic-services-buttons-per-row" dataXgcId={panel.id}
          />
        </FormField>
      </FormSection>
      {hasPhysicalVrpnServerHost ? (
        <FormSection title={t('VRPN')} dataXgcRole="ros-basic-services-vrpn-connection" dataXgcId={panel.id}>
          <FormField
            label={t('Physical VRPN server host')}
            description={t('Used by physical and hybrid Sessions.')}
            required
          >
            <InputControl
              value={physicalVrpnServerHost}
              required maxLength={253} pattern={PHYSICAL_VRPN_SERVER_HOST_PATTERN}
              aria-label={t('Physical VRPN server host')}
              onChange={(value) => workflowParameters?.onChange('physicalVrpnServerHost',value)}
              dataXgcRole="ros-basic-services-physical-vrpn-server-host" dataXgcId={panel.id}
            />
          </FormField>
        </FormSection>
      ) : null}
      <FormSection title={t('Services')} dataXgcRole="ros-basic-services-panel-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <div className="ros-panel-options-services">
            {layout.order.map((id,index) => {
              const service = byId.get(id)!;
              const hidden = layout.hidden.includes(id);
              const connected = connectedServices.has(id);
              const autoStart = workflowParameters?.values[service.parameterKey] === true;
              const serviceLabel = t(service.label);
              const markId = `${panel.id}:${id}`;
              return <div key={id} className="ros-panel-options-service" data-xgc-role="ros-basic-service-layout" data-xgc-id={markId} data-xgc-hidden={hidden ? 'true' : undefined}>
                <span className="ros-panel-options-service-name">{serviceLabel}</span>
                <div className="ros-panel-options-service-fields">
                  <SwitchControl
                    className="ros-panel-options-service-auto-start"
                    label={t('Auto start')} ariaLabel={t('Auto start {name}',{ name:serviceLabel })}
                    checked={autoStart}
                    disabled={!connected || hidden || !workflowParameters}
                    description={!connected
                      ? t('Not connected')
                      : !workflowParameters
                        ? t('Not configured')
                        : autoStart ? t('On') : t('Off')}
                    tooltip={t('Start {name} automatically when this Experiment runs ROS Control.',{ name:serviceLabel })}
                    onChange={(value) => workflowParameters?.onChange(service.parameterKey,value)}
                    dataXgcRole="ros-basic-service-auto-start" dataXgcId={markId}
                  />
                  <SwitchControl
                    className="ros-panel-options-service-visibility"
                    label={t('Show')} ariaLabel={t('Show {name} button',{ name:serviceLabel })}
                    checked={connected && !hidden}
                    disabled={!connected || (!hidden && layout.shown.length <= 1)}
                    description={!connected ? t('Not connected') : hidden ? t('Off') : t('On')}
                    tooltip={t('Show the {name} tile on the ROS Control grid. Hidden services cannot auto-start.',{ name:serviceLabel })}
                    onChange={(value) => setVisibility(id,value)}
                    dataXgcRole="ros-basic-service-shown" dataXgcId={markId}
                  />
                </div>
                <div className="ros-panel-options-service-reorder">
                  <ControlButton iconOnly size="compact" aria-label={t('Move {name} earlier',{ name:serviceLabel })}
                    disabled={!connected || index === 0}
                    onClick={() => update({ [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.order]:moveRosBasicServiceInOrder(layout.order,id,-1) })}
                    dataXgcRole="ros-basic-service-move-up" dataXgcId={markId}>
                    <ChevronUp size={14} />
                  </ControlButton>
                  <ControlButton iconOnly size="compact" aria-label={t('Move {name} later',{ name:serviceLabel })}
                    disabled={!connected || index === layout.order.length - 1}
                    onClick={() => update({ [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.order]:moveRosBasicServiceInOrder(layout.order,id,1) })}
                    dataXgcRole="ros-basic-service-move-down" dataXgcId={markId}>
                    <ChevronDown size={14} />
                  </ControlButton>
                </div>
              </div>;
            })}
          </div>
        </FormSectionSpan>
      </FormSection>
    </>
  );
}
