import { useEffect,useState } from 'react';
import { getGroundStationNativeCapabilities,type GroundStationNativeCapabilities } from './groundStationAgentService';

export function useGroundStationWorkspaceCapabilities(experimentId?:string) {
  const [capabilities,setCapabilities]=useState<GroundStationNativeCapabilities>();
  const [error,setError]=useState('');
  useEffect(() => {
    if (!experimentId) return;
    const controller=new AbortController();
    void getGroundStationNativeCapabilities(experimentId,controller.signal).then(value => {
      if (!controller.signal.aborted) setCapabilities(value);
    }).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));});
    return () => controller.abort();
  },[experimentId]);
  return {capabilities,error};
}
