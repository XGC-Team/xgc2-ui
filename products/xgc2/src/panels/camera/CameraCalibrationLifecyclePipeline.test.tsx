// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { CameraCalibrationLifecyclePipeline } from './CameraCalibrationLifecyclePipeline';
import { projectIntrinsicLifecyclePipeline } from './cameraIntrinsicWorkspaceModel';

describe('CameraCalibrationLifecyclePipeline',() => {
  it('keeps four fixed stages with configured source facts',() => {
    const stopped = projectIntrinsicLifecyclePipeline({
      phase:'stopped',runActive:false,sourceId:'usb_cam',edgeUrl:'https://media.example.test',
    });
    const { rerender } = render(
      <CameraCalibrationLifecyclePipeline panelId="intrinsic" {...stopped} />,
    );
    expect(document.querySelector('[data-xgc-role="camera-calibration-lifecycle"][data-xgc-id="intrinsic"]'))
      .toHaveAttribute('data-state','stopped');
    expect(screen.getByText('No run')).toBeInTheDocument();
    expect(screen.getByText('usb_cam')).toBeInTheDocument();
    expect(screen.getByText('media.example.test')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(document.querySelector('[data-sample="media.example.test · starting"]')).not.toBeNull();
    expect(document.querySelector('[data-sample="usb_cam · starting"]')).not.toBeNull();
    expect(screen.queryByText('Calibration workflow')).toBeNull();
    expect(document.querySelectorAll('[data-xgc-role="camera-calibration-lifecycle-stage"]')).toHaveLength(4);

    const starting = projectIntrinsicLifecyclePipeline({
      phase:'starting',runActive:true,sourceId:'usb_cam',edgeUrl:'https://media.example.test',
    });
    rerender(<CameraCalibrationLifecyclePipeline panelId="intrinsic" {...starting} />);
    expect(document.querySelector('[data-xgc-role="camera-calibration-lifecycle"]'))
      .toHaveAttribute('data-state','starting');
    expect(screen.getByText('Admitted')).toBeInTheDocument();
    expect(document.querySelector('.workflow-startup-pipeline-bars')).toBeNull();
    expect(document.querySelector('.workflow-startup-pipeline-row')).toBeNull();
  });
});
