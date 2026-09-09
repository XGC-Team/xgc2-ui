// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { LichtblickPanelOptionsEditor } from './LichtblickPanelOptionsEditor';

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
