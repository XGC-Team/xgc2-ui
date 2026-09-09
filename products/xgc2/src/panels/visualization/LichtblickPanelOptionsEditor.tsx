import { ChoiceCardGroup,FormSection,FormSectionSpan } from '@xgc2/ui-react';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { ColorControl } from '../../components/controls/ColorControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { PanelPluginOptionsEditorProps } from '../types';
import {
  LICHTBLICK_LAYOUT_MODE_OPTIONS,
  lichtblickLayoutOptions,
  plotPathsFromText,
} from './lichtblickLayoutOptions';
import './lichtblick-panel-options-editor.css';

export function LichtblickPanelOptionsEditor({
  panel,options,actionPresetAuthoring,onChange,
}: PanelPluginOptionsEditorProps) {
  const layout = lichtblickLayoutOptions(options);
  const update = (patch: Record<string,unknown>) => {
    const next = {
      ...(typeof options.dashboard === 'string' ? { dashboard:options.dashboard } : {}),
      ...(typeof options.gridColumns === 'number' ? { gridColumns:options.gridColumns } : {}),
      ...layout,
      ...patch,
    };
    onChange(next);
    if (Object.hasOwn(patch,'plotPaths')) {
      actionPresetAuthoring?.['workflow-parameters']?.onChange('plotPaths',patch.plotPaths);
    }
  };
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
        {/*
          World-origin axes only (not every robot TF). Dual-column: switch | size.
        */}
        <SwitchControl label="Show world axes" checked={layout.axesVisible}
          tooltip="Draw colored XYZ axes only at the scene origin (world / field). Robot TF frames stay hidden."
          onChange={(axesVisible) => update({ axesVisible })} dataXgcRole="lichtblick-axes-visible" dataXgcId={panel.id} />
        <LayoutNumberField label="World axis size" role="lichtblick-axes-scale" panelId={panel.id}
          tooltip="Length of the world-origin XYZ gizmo in scene units."
          value={layout.axesScale} min={0.01} max={100000} step={0.1} onChange={(axesScale) => update({ axesScale })} />
      </FormSection>
      <FormSection title="Markers" dataXgcRole="lichtblick-marker-options" dataXgcId={panel.id}>
        <LayoutColorField
          label="Marker color"
          role="lichtblick-marker-color"
          panelId={panel.id}
          tooltip="Default color for scene markers when a marker message does not set one."
          value={layout.markerColor}
          onChange={(markerColor) => update({ markerColor })}
        />
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
            Camera topics are selected by the Experiment run mode. Simulation and Hybrid use the XGC world camera;
            Physical uses the USB camera image and CameraInfo topics. Plot series are authored above.
          </p>
        </FormSectionSpan>
      </FormSection>
    </>
  );
}

function LayoutNumberField({ label,role,panelId,value,min,max,step,onChange,tooltip }: {
  label: string;role: string;panelId: string;value: number;min: number;max: number;step: number;tooltip?: string;
  onChange: (value: number) => void;
}) {
  return (
    <FormField label={label} tooltip={tooltip}>
      <InputControl type="number" aria-label={label} value={value} min={min} max={max} step={step} onChange={(nextValue) => onChange(Number(nextValue))} dataXgcRole={role} dataXgcId={panelId} />
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
