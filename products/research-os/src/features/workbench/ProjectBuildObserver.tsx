import {useEffect,useSyncExternalStore} from 'react'
import {listBuildRecords} from '../resources/manuscript'
import {preferredManuscriptEntry,setPreferredManuscriptEntry,subscribeManuscriptBuildSettings} from '../resources/manuscript-build-config'
import {useManuscriptBuild} from '../resources/useManuscriptBuild'
import {subscribeProjectReviewBuilds} from './review-build-followup'

/** Keep the existing build coordinator attached while a project moves between views. */
export function ProjectBuildObserver({workspace}:{workspace:string}) {
  const entryPoint=useSyncExternalStore(subscribeManuscriptBuildSettings,()=>preferredManuscriptEntry(workspace),()=>'')
  useEffect(()=>{
    if(entryPoint)return
    const abort=new AbortController()
    void listBuildRecords(workspace,abort.signal).then(records=>{
      const entries=[...new Set(records.map(r=>r.task.entryPoint))]
      // An actual build receipt records a prior explicit choice. Never infer main from an include save.
      if(!abort.signal.aborted&&!preferredManuscriptEntry(workspace)&&entries.length===1)setPreferredManuscriptEntry(workspace,entries[0])
    }).catch(()=>{})
    return()=>abort.abort()
  },[workspace,entryPoint])
  const build=useManuscriptBuild(entryPoint?{workspace,entryPoint}:null)
  useEffect(()=>subscribeProjectReviewBuilds(workspace),[workspace])
  useEffect(()=>{
    if(build.phase==='succeeded'&&build.freshness==='saved-snapshot')window.dispatchEvent(new CustomEvent('research-manuscript-built',{detail:{workspace}}))
  },[workspace,build.phase,build.freshness,build.pdf?.buildId])
  return null
}
