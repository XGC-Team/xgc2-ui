// @vitest-environment jsdom

import type * as LichtblickSceneResourcesModule from './lichtblickSceneResources';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { LichtblickPanelOptionsEditor } from './LichtblickPanelOptionsEditor';
import {
  LICHTBLICK_LAYOUT_DEFAULTS,
  validateLichtblickLayoutOptions,
} from './lichtblickLayoutOptions';

vi.mock('./lichtblickSceneResources',async (importOriginal) => {
  const original=await importOriginal<typeof LichtblickSceneResourcesModule>();
  return {
    ...original,
    loadLichtblickSceneResources:vi.fn(async () => [
      { resourceId:'scene-paper',name:'Paper Leader Scene',namespace:'/xgc/scene' },
    ]),
  };
});

beforeEach(() => {
  const style = document.createElement('style');
  style.dataset.xgcRole = 'lichtblick-layout-test-css';
  style.textContent = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'lichtblick-panel-options-editor.css'),
    'utf8',
  );
  document.head.append(style);
});

describe('LichtblickPanelOptionsEditor layout cards', () => {
  it('selects 3D above augmented as the missing-options default', () => {
    const { container } = renderEditor({});
    const group = container.querySelector('[data-xgc-role="lichtblick-layout-mode"]');
    expect(group).toHaveAttribute('data-value', '3d-above-camera-ar');
    const selected = selectedOption(container);
    expect(selected).toHaveAttribute('data-value', '3d-above-camera-ar');
    expect(selected).toHaveAttribute('data-xgc-arrangement', 'column');
    expect(paneKinds(selected)).toEqual(['3d','camera']);
  });

  it('keeps a saved row arrangement instead of migrating it', () => {
    const { container } = renderEditor({ layoutMode: '3d-camera-ar' });
    const selected = selectedOption(container);
    expect(selected).toHaveAttribute('data-value', '3d-camera-ar');
    expect(selected).toHaveAttribute('data-xgc-arrangement', 'row');
    expect(paneKinds(selected)).toEqual(['3d','camera']);
  });

  it('stacks the default preview as grid rows with overflow clipped', () => {
    const { container } = renderEditor({});
    const preview = selectedOption(container).querySelector('[data-xgc-arrangement="column"]') as HTMLElement;
    expect(preview).not.toBeNull();
    const style = getComputedStyle(preview);
    expect(style.display).toBe('grid');
    expect(style.overflow).toBe('hidden');
    expect(style.gridTemplateRows).toMatch(/repeat\(2,\s*minmax\(0,\s*1fr\)\)|minmax\(0px,\s*1fr\)\s+minmax\(0px,\s*1fr\)/);
    expect(style.gridTemplateColumns).toMatch(/minmax\(0,\s*1fr\)|minmax\(0px,\s*1fr\)/);
  });

  it('wraps layout cards on a narrow panel without overflowing the picker', () => {
    const { container } = renderEditor({});
    const picker = container.querySelector('[data-xgc-role="lichtblick-layout-mode"]') as HTMLElement;
    picker.style.width = '5rem';
    const style = getComputedStyle(picker);
    expect(style.display).toBe('grid');
    expect(style.gridTemplateColumns).toMatch(/auto-fill|minmax/);
    expect(picker.querySelectorAll('[data-xgc-role="lichtblick-layout-mode-option"]').length).toBe(6);
    expect(picker.scrollWidth).toBeLessThanOrEqual(picker.clientWidth + 1);
  });

  it('shows run-mode topic ownership without editable or persisted topic overrides', () => {
    const onChange = vi.fn();
    const { container } = renderEditor({
      dashboard:'gcs',
      cameraImageTopic:'/usb_cam/video',
      cameraInfoTopic:'/usb_cam/camera_info',
    }, onChange);
    expect(screen.getByText(/Camera topics are selected by the Experiment run mode/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name:/Camera .* topic override/ })).toBeNull();

    fireEvent.click(container.querySelector(
      '[data-xgc-role="lichtblick-layout-mode-option"][data-value="3d"]',
    )!);
    const saved = onChange.mock.calls[0]![0] as Record<string,unknown>;
    expect(saved.dashboard).toBe('gcs');
    expect(saved.layoutMode).toBe('3d');
    expect(saved).not.toHaveProperty('cameraImageTopic');
    expect(saved).not.toHaveProperty('cameraInfoTopic');
  });

  it('does not expose a history window and keeps world axes on while authoring length', () => {
    const workflowChange = vi.fn();
    const onChange = vi.fn();
    const { container } = render(<LichtblickPanelOptionsEditor panel={panelFixture()}
      executionTargetId="" dashboardPanels={[]} options={{ axesVisible:false,historyWindowSec:60 }}
      actionPresetAuthoring={{ 'workflow-parameters':{ values:{},onChange:workflowChange } }} onChange={onChange} />);
    expect(screen.queryByRole('spinbutton',{ name:'History window' })).toBeNull();
    expect(screen.queryByRole('switch',{ name:'Show world axes' })).toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="lichtblick-history-palette"]')).toHaveLength(3);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ axesVisible:true }));
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty('historyWindowSec');
    fireEvent.change(screen.getByRole('spinbutton',{ name:'World axis size' }),{ target:{ value:'2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ axesScale:2,axesVisible:true }));
    expect(workflowChange).toHaveBeenCalledWith('axesVisible',true);
    expect(workflowChange).toHaveBeenCalledWith('axesScale',2);
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Prediction line width' }),{ target:{ value:'0.03' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ predictionLineWidth:0.03 }));
    expect(workflowChange).toHaveBeenCalledWith('predictionLineWidth',0.03);
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Prediction axis size' }),{ target:{ value:'0.25' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ predictionAxisScale:0.25 }));
    expect(workflowChange).toHaveBeenCalledWith('predictionAxisScale',0.25);
  });

  it('keeps meter and pixel sizes across toggles and writes label controls to the Run preset', () => {
    const workflowChange = vi.fn();
    let saved: Record<string,unknown> = {};
    function StatefulEditor() {
      const [options,setOptions] = useState<Record<string,unknown>>({ markerColor:'#ffbf00' });
      return <LichtblickPanelOptionsEditor panel={panelFixture()} executionTargetId="" dashboardPanels={[]}
        options={options} actionPresetAuthoring={{ 'workflow-parameters':{ values:{},onChange:workflowChange } }}
        onChange={(next) => { saved = next; setOptions(next); }} />;
    }
    const mounted = render(<StatefulEditor />);
    const size = () => screen.getByRole('spinbutton',{ name:'Font size' });
    const fixed = () => screen.getByRole('switch',{ name:'Fixed screen size' });
    expect(size()).toHaveValue(0.24);
    fireEvent.change(size(),{ target:{ value:'0.4' } });
    fireEvent.click(fixed());
    expect(size()).toHaveValue(16);
    fireEvent.change(size(),{ target:{ value:'28' } });
    fireEvent.click(fixed());
    expect(size()).toHaveValue(0.4);
    fireEvent.click(fixed());
    expect(size()).toHaveValue(28);
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Opacity' }),{ target:{ value:'0' } });
    fireEvent.change(screen.getByRole('spinbutton',{ name:'UAV vertical offset' }),{ target:{ value:'1.2' } });
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Scout vertical offset' }),{ target:{ value:'0' } });
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Mecanum vertical offset' }),{ target:{ value:'-0.4' } });
    fireEvent.change(screen.getByRole('textbox',{ name:'Text color hex' }),{ target:{ value:'#123456' } });
    fireEvent.blur(screen.getByRole('textbox',{ name:'Text color hex' }));
    fireEvent.change(screen.getByRole('textbox',{ name:'Background color hex' }),{ target:{ value:'#1a2b3c' } });
    fireEvent.blur(screen.getByRole('textbox',{ name:'Background color hex' }));
    fireEvent.click(screen.getByRole('switch',{ name:'Show background' }));
    expect(saved).toMatchObject({ labelScaleInvariant:true,labelFontSizeMeters:0.4,labelFontSizePixels:28,
      markerOpacity:0,uavLabelOffset:1.2,scoutLabelOffset:0,mecanumLabelOffset:-0.4,markerColor:'#123456',
      markerBackgroundColor:'#1a2b3c',markerBackgroundVisible:true });
    for (const key of ['labelScaleInvariant','labelFontSizeMeters','labelFontSizePixels','markerOpacity','uavLabelOffset','scoutLabelOffset','mecanumLabelOffset','markerColor','markerBackgroundColor','markerBackgroundVisible']) {
      expect(workflowChange).toHaveBeenCalledWith(key,saved[key]);
    }
    mounted.unmount();
    renderEditor(saved);
    expect(size()).toHaveValue(28);
    expect(fixed()).toBeChecked();
    expect(screen.getByRole('switch',{ name:'Show background' })).toBeChecked();
  });

  it('reads height projection from panel options, not the Run preset', () => {
    const workflowChange = vi.fn();
    const onChange = vi.fn();
    const { container } = render(<LichtblickPanelOptionsEditor panel={panelFixture()}
      executionTargetId="" dashboardPanels={[]} options={{ uavHeightProjection:true }}
      actionPresetAuthoring={{ 'workflow-parameters':{ values:{ uavHeightProjection:false },onChange:workflowChange } }}
      onChange={onChange} />);
    expect(screen.getByRole('switch',{ name:'Height projection' })).toBeChecked();
    const section = container.querySelector('[data-xgc-role="lichtblick-uav-projection-options"]')!;
    expect(section.querySelectorAll('[role="switch"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch',{ name:'Height projection' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ uavHeightProjection:false }));
    expect(workflowChange).toHaveBeenCalledWith('uavHeightProjection',false);
  });

  it('defaults the world fence to boundary walls and writes the mode to the Run preset', async () => {
    const workflowChange = vi.fn();
    const onChange = vi.fn();
    render(<LichtblickPanelOptionsEditor panel={panelFixture()}
      executionTargetId="" dashboardPanels={[]} options={{}}
      actionPresetAuthoring={{ 'workflow-parameters':{ values:{},onChange:workflowChange } }}
      onChange={onChange} />);
    const trigger = await screen.findByRole('button',{ name:'World fence display' });
    expect(trigger).toHaveTextContent('Boundary walls (XYZ)');
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option',{ name:'Ground outline' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ worldBoundaryMode:'ground' }));
    expect(workflowChange).toHaveBeenCalledWith('worldBoundaryMode','ground');
    fireEvent.click(screen.getByRole('button',{ name:'World fence display' }));
    fireEvent.click(await screen.findByRole('option',{ name:'Hidden' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ worldBoundaryMode:'off' }));
    expect(workflowChange).toHaveBeenCalledWith('worldBoundaryMode','off');
  });

  it('binds a scene resource namespace and treats no scene as legal', async () => {
    const onChange = vi.fn();
    const workflowChange = vi.fn();
    render(<LichtblickPanelOptionsEditor panel={panelFixture()}
      executionTargetId="" dashboardPanels={[]} options={{}}
      actionPresetAuthoring={{ 'workflow-parameters':{ values:{},onChange:workflowChange } }}
      onChange={onChange} />);
    expect(screen.queryByRole('textbox',{ name:'Scene namespace' })).toBeNull();
    const trigger = await screen.findByRole('button',{ name:'Obstacle scene' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option',{ name:'Paper Leader Scene' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sceneNamespace:'/xgc/scene' }));
    expect(workflowChange).toHaveBeenCalledWith('sceneNamespace','/xgc/scene');
    fireEvent.click(screen.getByRole('button',{ name:'Obstacle scene' }));
    fireEvent.click(await screen.findByRole('option',{ name:'No obstacle scene' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sceneNamespace:'' }));
  });

  it('authors Plot series as message paths without inventing topics', () => {
    const onChange = vi.fn();
    const workflowChange = vi.fn();
    render(
      <LichtblickPanelOptionsEditor
        panel={panelFixture()}
        executionTargetId=""
        dashboardPanels={[]}
        options={{ plotPaths:['/sce1_central_controller/average_dynamic_regret.data[0]'] }}
        actionPresetAuthoring={{
          'workflow-parameters':{ values:{},onChange:workflowChange },
        }}
        onChange={onChange}
      />,
    );
    const field = screen.getByRole('textbox',{ name:'Plot message paths' });
    fireEvent.change(field,{ target:{ value:'/topic.field\n/other.value[1]\n' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      plotPaths:['/topic.field','/other.value[1]'],
    }));
    expect(workflowChange).toHaveBeenCalledWith('plotPaths',['/topic.field','/other.value[1]']);
  });

  it('saves Scout history colors by filling the AR11 default text color', () => {
    const onChange = vi.fn();
    renderEditor({ dashboard: 'gcs' }, onChange);
    fireEvent.change(screen.getByRole('textbox', { name: 'Scout 1 hex' }), { target: { value: '#123456' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Scout 1 hex' }));
    const saved = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(saved.scoutPalette).toEqual(['#123456', ...LICHTBLICK_LAYOUT_DEFAULTS.scoutPalette.slice(1)]);
    expect(saved.markerColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerColor);
    expect(saved.markerBackgroundColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundColor);
    expect(saved.markerBackgroundVisible).toBe(false);
    expect(validateLichtblickLayoutOptions(saved)).toBe('');
  });
});

function renderEditor(options: Record<string, unknown>,onChange = vi.fn()) {
  return render(
    <LichtblickPanelOptionsEditor
      panel={panelFixture()}
      executionTargetId=""
      dashboardPanels={[]}
      options={options}
      onChange={onChange}
    />,
  );
}

function selectedOption(container: HTMLElement) {
  const selected = container.querySelector(
    '[data-xgc-role="lichtblick-layout-mode-option"][data-xgc-selected]',
  );
  if (!(selected instanceof HTMLElement)) throw new Error('missing selected layout card');
  return selected;
}

function paneKinds(root: Element) {
  return [...root.querySelectorAll('[data-xgc-pane]')].map((node) => node.getAttribute('data-xgc-pane'));
}

function panelFixture(): PanelInstance {
  return {
    id: 'lichtblick',
    pluginId: 'xgc2-lichtblick',
    title: 'Lichtblick',
    gridPos: { x: 0,y: 0,w: 8,h: 6 },
    query: {},
    options: {},
    fieldConfig: {},
    portBindings: [],
  };
}
