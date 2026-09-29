import { useEffect,useState } from 'react';
import { ChoiceCardGroup,FormSection,FormSectionSpan } from '@xgc2/ui-react';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { ColorControl } from '../../components/controls/ColorControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { SelectControl } from '../../components/controls/SelectControl';
import type { PanelPluginOptionsEditorProps } from '../types';
import {
  LICHTBLICK_LAYOUT_MODE_OPTIONS,
  LICHTBLICK_PRESENTATION_OPTION_KEYS,
  lichtblickLayoutOptions,
  lichtblickPanelOptionsNeedRewrite,
  persistLichtblickPanelOptions,
  plotPathsFromText,
} from './lichtblickLayoutOptions';
import {
  loadLichtblickSceneResources,
  type LichtblickSceneResource,
} from './lichtblickSceneResources';
import './lichtblick-panel-options-editor.css';

export function LichtblickPanelOptionsEditor({
  panel,options,actionPresetAuthoring,onChange,
}: PanelPluginOptionsEditorProps) {
  const layout = lichtblickLayoutOptions(options);
  const [sceneResources,setSceneResources] = useState<LichtblickSceneResource[] | undefined>();
  const write = (next: Record<string,unknown>) => {
    onChange(next);
    const workflow = actionPresetAuthoring?.['workflow-parameters'];
    if (!workflow) return;
    for (const key of LICHTBLICK_PRESENTATION_OPTION_KEYS) {
      if (Object.hasOwn(next,key)) workflow.onChange(key,next[key]);
    }
  };
  const update = (patch: Record<string,unknown>) => {
    write(persistLichtblickPanelOptions(options,patch));
  };
  useEffect(() => {
    const controller = new AbortController();
    void loadLichtblickSceneResources(controller.signal)
      .then((resources) => { if (!controller.signal.aborted) setSceneResources(resources); })
      .catch(() => { if (!controller.signal.aborted) setSceneResources([]); });
    return () => controller.abort();
  },[]);
  useEffect(() => {
    if (!lichtblickPanelOptionsNeedRewrite(options)) return;
    write(persistLichtblickPanelOptions(options));
    // Opening the editor rewrites retired historyWindowSec and axesVisible:false once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const selectedScene = (sceneResources ?? []).find((resource) => resource.namespace === layout.sceneNamespace);
  const unmatchedNamespace = layout.sceneNamespace && !selectedScene ? layout.sceneNamespace : '';
  return (
    <>
      <FormSection title="Presentation" dataXgcRole="lichtblick-panel-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <FormField
            label="Initial layout"
            tooltip="How the 3D scene and camera views are arranged when the panel opens."
            dataXgcRole="lichtblick-layout-mode-field"
            dataXgcId={panel.id}
          >
            <LayoutModeControl
              value={layout.layoutMode}
              panelId={panel.id}
              onChange={(layoutMode) => update({ layoutMode })}
            />
          </FormField>
        </FormSectionSpan>
      </FormSection>
      <FormSection title="Obstacle scene" dataXgcRole="lichtblick-scene-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <FormField
            label="Obstacle scene"
            tooltip="Bind an independent scene workflow, or none. Namespace and scene-command wiring are generated; leave none for experiments without obstacles."
          >
            <SelectControl
              ariaLabel="Obstacle scene"
              value={selectedScene?.resourceId ?? unmatchedNamespace}
              placeholder="No obstacle scene"
              busy={sceneResources === undefined}
              dataXgcRole="lichtblick-scene-resource"
              dataXgcId={panel.id}
              options={[
                { value:'',label:'No obstacle scene' },
                ...(sceneResources ?? []).map((resource) => ({
                  value:resource.resourceId,
                  label:resource.name,
                })),
                ...(unmatchedNamespace ? [{ value:unmatchedNamespace,label:unmatchedNamespace }] : []),
              ]}
              onChange={(value) => {
                if (!value) {
                  update({ sceneNamespace:'' });
                  return;
                }
                const resource = (sceneResources ?? []).find((item) => item.resourceId === value);
                update({ sceneNamespace:resource?.namespace ?? value });
              }}
            />
          </FormField>
        </FormSectionSpan>
      </FormSection>
      {([
        ['uavPalette','UAV'], ['scoutPalette','Scout'], ['mecanumPalette','Mecanum'],
      ] as const).map(([key,label]) => (
        <FormSection key={key} title={`${label} history colors`} dataXgcRole="lichtblick-history-palette" dataXgcId={`${panel.id}:${key}`}>
          {layout[key].map((color,index) => (
            <LayoutColorField key={index} label={`${label} ${index + 1}`} role="lichtblick-history-color"
              panelId={`${panel.id}:${key}:${index}`} value={color}
              onChange={(value) => update({ [key]: layout[key].map((previous,i) => i === index ? value : previous) })} />
          ))}
        </FormSection>
      ))}
      <FormSection title="Grid" dataXgcRole="lichtblick-grid-options" dataXgcId={panel.id}>
        <SwitchControl label="Show grid" checked={layout.gridVisible}
          tooltip="Draw the ground grid in the 3D scene."
          onChange={(gridVisible) => update({ gridVisible })} dataXgcRole="lichtblick-grid-visible" dataXgcId={panel.id} />
        <LayoutColorField
          label="Grid color"
          role="lichtblick-grid-color"
          panelId={panel.id}
          tooltip="Color of the ground grid lines."
          value={layout.gridColor}
          onChange={(gridColor) => update({ gridColor })}
        />
        <LayoutNumberField label="Grid size" role="lichtblick-grid-size" panelId={panel.id}
          tooltip="Half-extent of the ground grid in scene units."
          value={layout.gridSize} min={0.1} max={100000} step={0.1} onChange={(gridSize) => update({ gridSize })} />
        <LayoutNumberField label="Grid divisions" role="lichtblick-grid-divisions" panelId={panel.id}
          tooltip="Number of divisions along each axis of the ground grid."
          value={layout.gridDivisions} min={1} max={10000} step={1} onChange={(gridDivisions) => update({ gridDivisions })} />
        <LayoutNumberField label="Grid line width" role="lichtblick-grid-line-width" panelId={panel.id}
          tooltip="Rendered thickness of ground grid lines."
          value={layout.gridLineWidth} min={0.1} max={100} step={0.1} onChange={(gridLineWidth) => update({ gridLineWidth })} />
      </FormSection>
      <FormSection title="Axes" dataXgcRole="lichtblick-axes-options" dataXgcId={panel.id}>
        <LayoutNumberField label="World axis size" role="lichtblick-axes-scale" panelId={panel.id}
          tooltip="Length of the world-origin XYZ gizmo in meters. Axes stay on at frame:world only; changing length does not reset the camera."
          value={layout.axesScale} min={0.01} max={100000} step={0.1} unit="m" onChange={(axesScale) => update({ axesScale })} />
      </FormSection>
      <FormSection title="Robot models" dataXgcRole="lichtblick-model-scale-options" dataXgcId={panel.id}>
        {([
          ['px4ModelScale','PX4 model scale'],
          ['scoutModelScale','Scout model scale'],
          ['mecanumModelScale','Mecanum model scale'],
        ] as const).map(([key,label]) => (
          <LayoutNumberField key={key} label={label} role="lichtblick-model-scale" panelId={`${panel.id}:${key}`}
            tooltip="Display-only uniform scale for this robot kind in the 3D view. Gazebo, collisions, camera projection, and transforms keep true dimensions. Applies on the next Run."
            value={layout[key]} min={0.1} max={20} step={0.1} unit="×"
            onChange={(value) => update({ [key]: value })} />
        ))}
      </FormSection>
      <FormSection title="World fence" dataXgcRole="lichtblick-world-boundary-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <FormField
            label="World fence display"
            tooltip="How the Experiment fence is drawn: hidden, a ground outline, or four translucent red walls showing the XYZ bounds. Applies on the next Run; hiding the layer does not change the frozen bounds."
            dataXgcRole="lichtblick-world-boundary-mode-field"
            dataXgcId={panel.id}
          >
            <SelectControl
              ariaLabel="World fence display"
              value={layout.worldBoundaryMode}
              dataXgcRole="lichtblick-world-boundary-mode"
              dataXgcId={panel.id}
              options={[
                { value:'off',label:'Hidden' },
                { value:'ground',label:'Ground outline' },
                { value:'walls',label:'Boundary walls (XYZ)' },
              ]}
              onChange={(worldBoundaryMode) => update({ worldBoundaryMode })}
            />
          </FormField>
        </FormSectionSpan>
      </FormSection>
      <FormSection title="Prediction" dataXgcRole="lichtblick-prediction-options" dataXgcId={panel.id}>
        <LayoutNumberField label="Prediction line width" role="lichtblick-prediction-line-width" panelId={panel.id}
          tooltip="Width of DMPC and other declared prediction paths, in meters. Applies on the next Run."
          value={layout.predictionLineWidth} min={0.001} max={1} step={0.001} unit="m"
          onChange={(predictionLineWidth) => update({ predictionLineWidth })} />
        <LayoutNumberField label="Prediction axis size" role="lichtblick-prediction-axis-scale" panelId={panel.id}
          tooltip="Length of the XYZ axes drawn at each prediction pose, in meters. Applies on the next Run."
          value={layout.predictionAxisScale} min={0.01} max={10} step={0.01} unit="m"
          onChange={(predictionAxisScale) => update({ predictionAxisScale })} />
      </FormSection>
      <FormSection title="UAV" dataXgcRole="lichtblick-uav-projection-options" dataXgcId={panel.id}>
        <SwitchControl label="Height projection" checked={layout.uavHeightProjection}
          tooltip="Show a vertical line and ground ring for every UAV, using its history color. Applies on the next Run."
          onChange={(uavHeightProjection) => update({ uavHeightProjection })}
          dataXgcRole="lichtblick-uav-height-projection" dataXgcId={panel.id} />
      </FormSection>
      <FormSection title="Robot labels" dataXgcRole="lichtblick-marker-options" dataXgcId={panel.id}>
        <SwitchControl label="Fixed screen size" checked={layout.labelScaleInvariant}
          tooltip="Keep labels the same screen size at every distance. Off uses perspective sizing. Applies on the next Run."
          onChange={(labelScaleInvariant) => update({ labelScaleInvariant })}
          dataXgcRole="lichtblick-label-scale-invariant" dataXgcId={panel.id} />
        <LayoutNumberField label="Font size" role="lichtblick-label-font-size" panelId={panel.id}
          tooltip="Size of all overhead labels. Meter and pixel sizes are saved separately. Applies on the next Run."
          value={layout.labelScaleInvariant ? layout.labelFontSizePixels : layout.labelFontSizeMeters}
          min={layout.labelScaleInvariant ? 1 : 0.01} max={layout.labelScaleInvariant ? 256 : 10}
          step={layout.labelScaleInvariant ? 1 : 0.01} unit={layout.labelScaleInvariant ? 'px' : 'm'}
          onChange={(value) => update({ [layout.labelScaleInvariant ? 'labelFontSizePixels' : 'labelFontSizeMeters']: value })} />
        <LayoutColorField
          label="Text color"
          role="lichtblick-marker-color"
          panelId={panel.id}
          tooltip="Color of all overhead UAV and UGV labels. Applies on the next Run."
          value={layout.markerColor}
          onChange={(markerColor) => update({ markerColor })}
        />
        <SwitchControl
          label="Show background"
          checked={layout.markerBackgroundVisible}
          tooltip="Plate behind every overhead label. Off leaves only the text. Applies on the next Run."
          onChange={(markerBackgroundVisible) => update({ markerBackgroundVisible })}
          dataXgcRole="lichtblick-marker-background-visible"
          dataXgcId={panel.id}
        />
        <LayoutColorField
          label="Background color"
          role="lichtblick-marker-background-color"
          panelId={panel.id}
          tooltip="Plate color when Show background is on. Applies on the next Run."
          value={layout.markerBackgroundColor}
          onChange={(markerBackgroundColor) => update({ markerBackgroundColor })}
        />
        <LayoutNumberField label="Opacity" role="lichtblick-marker-opacity" panelId={panel.id}
          tooltip="Opacity of the overhead text, and of the plate when background is shown. Applies on the next Run."
          value={layout.markerOpacity} min={0} max={1} step={0.05}
          onChange={(markerOpacity) => update({ markerOpacity })} />
        {([
          ['uavLabelOffset','UAV'], ['scoutLabelOffset','Scout'], ['mecanumLabelOffset','Mecanum'],
        ] as const).map(([key,label]) => (
          <LayoutNumberField key={key} label={`${label} vertical offset`} role="lichtblick-label-offset" panelId={`${panel.id}:${key}`}
            tooltip="Height above the robot pose, shared by this robot kind. Applies on the next Run."
            value={layout[key]} min={-10} max={10} step={0.01} unit="m"
            onChange={(value) => update({ [key]: value })} />
        ))}
      </FormSection>
      <FormSection title="Plot series" dataXgcRole="lichtblick-plot-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <FormField
            label="Message paths"
            tooltip="One numeric ROS message path per line, such as /topic.field. Used when the layout includes Plot. Empty is allowed."
            dataXgcRole="lichtblick-plot-paths-field"
            dataXgcId={panel.id}
          >
            <TextareaControl
              aria-label="Plot message paths"
              rows={6}
              value={layout.plotPaths.join('\n')}
              placeholder={'/topic.field'}
              data-xgc-format="monospace"
              dataXgcRole="lichtblick-plot-paths"
              dataXgcId={panel.id}
              onChange={(value) => update({ plotPaths: plotPathsFromText(value) })}
            />
          </FormField>
        </FormSectionSpan>
      </FormSection>
      <FormSection title="ROS topics" dataXgcRole="lichtblick-topic-options" dataXgcId={panel.id}>
        <FormSectionSpan>
          <p data-xgc-role="lichtblick-topic-selection-note" data-xgc-id={panel.id}>
            Camera topics are selected by the Experiment run mode. Simulation uses the XGC world camera;
            Hybrid and Physical use the USB camera image and CameraInfo topics. Plot series are authored above.
          </p>
        </FormSectionSpan>
      </FormSection>
    </>
  );
}

function LayoutNumberField({ label,role,panelId,value,min,max,step,onChange,tooltip,unit }: {
  label: string;role: string;panelId: string;value: number;min: number;max: number;step: number;tooltip?: string;unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <FormField label={label} tooltip={tooltip}>
      <InputControl type="number" aria-label={label} value={value} min={min} max={max} step={step} unit={unit} onChange={(nextValue) => onChange(Number(nextValue))} dataXgcRole={role} dataXgcId={panelId} />
    </FormField>
  );
}

/**
 * Uses FormField (not FormGroup/legend) so the label shares the same title→control
 * stack as Grid size / Show grid / Marker color neighbors in the dual-column drawer.
 * Color interaction itself is the shared ColorControl (theme swatch + presets).
 */
function LayoutColorField({
  label,
  role,
  panelId,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  role: string;
  panelId: string;
  value: string;
  tooltip?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} tooltip={tooltip}>
      <ColorControl
        value={value}
        ariaLabel={label}
        dataXgcRole={role}
        dataXgcId={panelId}
        onChange={onChange}
      />
    </FormField>
  );
}

/** Card radiogroup for initial Lichtblick arrangement (FormField-bound control leaf). */
function LayoutModeControl({
  value,
  panelId,
  onChange,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value: string;
  panelId: string;
  onChange: (layoutMode: string) => void;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}) {
  return (
    <ChoiceCardGroup
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      ariaLabel="Initial layout"
      className="lichtblick-layout-mode-picker"
      dataXgcId={panelId}
      dataXgcRole="lichtblick-layout-mode"
      id={id}
      onValueChange={onChange}
      optionClassName="lichtblick-layout-mode-card"
      optionDataXgcRole="lichtblick-layout-mode-option"
      options={LICHTBLICK_LAYOUT_MODE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        title: option.description,
        dataAttributes: { 'data-xgc-arrangement': option.arrangement },
        content: (
          <span
            className="lichtblick-layout-mode-preview"
            data-xgc-arrangement={option.arrangement}
            aria-hidden="true"
          >
            {option.panes.map((pane, index) => (
              <span
                key={`${option.value}-${pane.kind}-${index}`}
                className="lichtblick-layout-mode-pane"
                data-xgc-pane={pane.kind}
              >
                {pane.label}
              </span>
            ))}
          </span>
        ),
      }))}
      value={value}
    />
  );
}
