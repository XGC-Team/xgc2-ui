// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MEASURED_FAILED_PROGRESS_FILL,
  MEASURED_READY_PROGRESS_FILL,
  measuredFailedProgress,
  measuredReadyProgress,
  workflowTileProgress,
} from './measuredReadyProgress';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relative: string) => readFileSync(join(srcRoot, relative), 'utf8');
const require = createRequire(import.meta.url);

describe('measuredReadyProgress', () => {
  it('is the V10 emerald token, not --color-success', () => {
    expect(MEASURED_READY_PROGRESS_FILL).toBe('var(--color-progress-measured)');
    expect(measuredReadyProgress).toEqual({
      color: MEASURED_READY_PROGRESS_FILL,
      tone: 'success',
    });
    expect(MEASURED_FAILED_PROGRESS_FILL).toBe('var(--color-progress-failed)');
    expect(measuredFailedProgress).toEqual({
      color: MEASURED_FAILED_PROGRESS_FILL,
      tone: 'danger',
    });
  });

  it('is the complete fill for ROS ready, Algorithm tiles, and coverage bars', () => {
    expect(readSource('panels/ros/RosBasicServicesControlsView.tsx')).toContain('measuredReadyProgress');
    expect(readSource('panels/automation/AutomationWorkflowPanel.tsx')).toContain('workflowTileProgress');
    expect(readSource('panels/robot/PX4RotorControlPanel.tsx')).toContain('workflowTileProgress');
    expect(readSource('panels/ros/RosBasicServicesControlsView.tsx')).toContain('measuredFailedProgress');
    expect(readSource('panels/camera/CameraIntrinsicCalibrationRuntimeView.tsx'))
      .toContain('MEASURED_READY_PROGRESS_FILL');
    expect(readSource('panels/automation/AutomationWorkflowPanel.tsx'))
      .not.toMatch(/tone:\s*'success'/);
  });

  it('is consumed from the installed shared stylesheet, not a product alias', () => {
    const shared = readFileSync(require.resolve('@xgc2/ui-react/styles.css'), 'utf8');
    expect(shared).toMatch(/--color-progress-measured:\s*#7ddc9a/);
    expect(shared).toMatch(/--color-progress-measured:\s*#19c66b/);
    expect(shared).toMatch(
      /data-xgc-layout=tile\]>\.xgc-workflow-status-card-progress\{[^}]*--xgc-progress-height:\s*var\(--size-progress-thin\)/,
    );
    expect(shared).toMatch(
      /\.xgc-progress\[data-xgc-tone=success\]\{[^}]*--xgc-progress-fill:\s*var\(--color-progress-measured\)/,
    );
    expect(shared).toMatch(/--color-progress-failed:\s*#ff8b82/);
    expect(shared).toMatch(/--color-progress-failed:\s*#e03d3d/);
    expect(shared).toMatch(
      /\.xgc-progress\[data-xgc-tone=danger\]\{[^}]*--xgc-progress-fill:\s*var\(--color-progress-failed\)/,
    );
    expect(readSource('styles/skin.css')).not.toMatch(/--color-progress-measured:/);
    expect(readSource('styles/skin.css')).not.toMatch(/--color-ros-service-ready-progress/);
  });

  it('fills a resident wait-node workflow green and a finite workflow from 0 to occupancy',() => {
    expect(workflowTileProgress({ active:true,failed:false,occupancy:{ state:'starting',ready:0,total:1 } }))
      .toMatchObject({ percent:0,value:0,max:1 });
    expect(workflowTileProgress({ active:true,failed:false,occupancy:{ state:'running',ready:1,total:1 } }))
      .toEqual({ percent:100,value:1,max:1,...measuredReadyProgress });
    expect(workflowTileProgress({
      active:false,failed:false,occupancy:{ state:'running',ready:1,total:1 },
    })).toEqual({ percent:0 });
    expect(workflowTileProgress({
      active:false,failed:true,occupancy:{ state:'degraded',ready:1,total:2 },
    })).toEqual({ percent:50,value:1,max:2,...measuredFailedProgress });
  });
});
