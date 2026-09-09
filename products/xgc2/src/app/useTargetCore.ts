import { useEffect } from 'react';
import { useCoreNodes } from '../domains/core/corePublic';
import {
  resolveSurfacePolicy,
  useProductWebComposition,
  type ProductPermissionSurface,
} from '../shared/productWebComposition';
import { useNavigation } from './navigationContext';
import { isLocalCore,targetSurfaceDisabledReason } from './targetCorePolicy';

export function useTargetCore(surface?: ProductPermissionSurface) {
  const nav = useNavigation();
  const composition = useProductWebComposition();
  const coreNodes = useCoreNodes();
  const { targetCoreId, setTargetCoreId } = nav;
  const selectedTargetCore = coreNodes.find((core) => core.id === targetCoreId) ?? coreNodes[0];
  const routedTargetCoreId = selectedTargetCore && !isLocalCore(selectedTargetCore) ? selectedTargetCore.id : undefined;
  const policy = surface ? resolveSurfacePolicy(composition, surface) : undefined;
  const disabledReason = policy ? targetSurfaceDisabledReason(policy, selectedTargetCore) : undefined;

  useEffect(() => {
    if (coreNodes.length && (!targetCoreId || !coreNodes.some((core) => core.id === targetCoreId))) {
      setTargetCoreId((coreNodes.find(isLocalCore) ?? coreNodes[0]).id);
    }
  }, [coreNodes, setTargetCoreId, targetCoreId]);

  return {
    coreNodes,
    selectedTargetCore,
    routedTargetCoreId,
    disabledReason,
  };
}
