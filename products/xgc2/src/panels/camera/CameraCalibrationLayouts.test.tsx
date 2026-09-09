// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import {
  CameraCalibrationRuntimeLayout,CameraIntrinsicCalibrationWorkspaceLayout,
} from './CameraCalibrationLayouts';

const variants = [
  {
    kind: 'intrinsic',runtimeRole: 'camera-intrinsic-runtime',
    controlsRole: 'camera-intrinsic-controls',layoutClass: 'panels-camera-intrinsic-layout',
  },
  {
    kind: 'extrinsic',runtimeRole: 'camera-extrinsic-runtime',
    controlsRole: 'camera-calibration-controls',layoutClass: 'panels-camera-extrinsic-layout',
  },
] as const;

describe('camera calibration layouts', () => {
  it('uses the intrinsic workspace contract', () => {
    const { container } = render(<CameraIntrinsicCalibrationWorkspaceLayout
      panelId="panel-1" view="workflow"
      camera={<span>camera</span>} workflow={<span>workflow</span>} />);

    expect(container.querySelector('[data-xgc-role="camera-intrinsic-workspace"]'))
      .toHaveClass('panels-camera-calibration-workspace');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-workflow-view"]'))
      .toHaveClass('panels-camera-calibration-workflow-view');
    expect(container.querySelector('.panels-camera-calibration-runtime')).toBeNull();
  });

  it.each(variants)('uses the shared runtime skeleton with a deliberate $kind variant', (variant) => {
    const { container } = render(<CameraCalibrationRuntimeLayout kind={variant.kind}
      processInstanceId="process-1" stage={<span>stage</span>} frameMetadata={<span>frame</span>}>
      <span>controls</span>
    </CameraCalibrationRuntimeLayout>);

    expect(container.querySelector(`[data-xgc-role="${variant.runtimeRole}"]`))
      .toHaveClass('panels-camera-calibration-runtime', variant.layoutClass);
    expect(container.querySelector('.panels-camera-calibration-stage-shell')).toBeInTheDocument();
    expect(container.querySelector('.panels-camera-calibration-stage-shell > .panels-camera-calibration-frame-meta'))
      .toBeInTheDocument();
    expect(container.querySelector(`[data-xgc-role="${variant.controlsRole}"]`))
      .toHaveClass('panels-camera-calibration-inspector');
  });
});
