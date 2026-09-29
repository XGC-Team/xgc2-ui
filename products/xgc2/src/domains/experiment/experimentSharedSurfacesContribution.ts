import { lazy } from 'react';
import { defineProductOwnerIdentity, type ProductOwnerContribution } from '../../shared/productWebComposition';

/** Experiment.Workspace's protocol views. Grants select one existing compiled leaf. */
export const experimentSharedSurfacesContribution = {
  owner: defineProductOwnerIdentity('Experiment.Workspace.SharedSurfaces'),
  sharedSurfaces: [
    {
      moduleId: 'experiment.camera',
      viewContractVersion: 1,
      component: lazy(() => import('../../panels/camera/SharedCameraSurface').then((module) => ({ default: module.SharedCameraSurface }))),
    },
    {
      moduleId: 'experiment.remote-control',
      viewContractVersion: 1,
      component: lazy(() => import('../../panels/robot/SharedRobotRemoteControlSurface').then((module) => ({ default: module.SharedRobotRemoteControlSurface }))),
    },
    {
      moduleId: 'experiment.calibration-readonly',
      viewContractVersion: 1,
      component: lazy(() => import('../../panels/camera/SharedCalibrationSurface').then((module) => ({ default: module.SharedCalibrationSurface }))),
    },
  ],
} as const satisfies ProductOwnerContribution;
