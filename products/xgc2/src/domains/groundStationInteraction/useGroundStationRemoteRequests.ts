import {useCallback,useMemo} from 'react';
import {useGroundStationInteractionScope} from './GroundStationInteractionContext';
import type {GroundStationContextInteraction} from './groundStationInteractionTypes';
const empty:GroundStationContextInteraction[]=[];
export function useGroundStationRemoteRequests(targetId:string,experimentId:string) {
  const scope=useGroundStationInteractionScope(targetId);
  const inventory=scope?.interactions.inventory;
  const requests=useMemo(()=>inventory?.filter((item):item is GroundStationContextInteraction=>item.kind==='context'
    && item.origin.experimentId===experimentId && Boolean(item.payload.context.remoteController)) ?? empty,[experimentId,inventory]);
  const dismiss=scope?.interactions.dismiss;
  const closeRequest=useCallback(async(id:string)=>{
    const item=requests.find(item=>item.id===id);
    if(item?.status==='open' && dismiss) await dismiss(item);
  },[dismiss,requests]);
  return {requests,closeRequest};
}
