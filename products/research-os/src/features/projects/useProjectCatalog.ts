import {useCallback, useEffect, useState} from 'react'
import {collection, listWorkspaces} from '../../lib/api'
import {projectCatalog, type CatalogRecord, type CatalogProject, type CatalogWorkspace} from './project-catalog'

export function useProjectCatalog() {
  const [projects, setProjects] = useState<CatalogProject[]>([])
  const [unregistered, setUnregistered] = useState<CatalogWorkspace[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true); setError('')
    void Promise.all([collection<CatalogRecord>('/research/projects', abort.signal), listWorkspaces(abort.signal)])
      .then(([records, workspaces]) => {
        if (abort.signal.aborted) return
        const catalog = projectCatalog(records, workspaces)
        setProjects(catalog.projects); setUnregistered(catalog.unregistered)
      }).catch(reason => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
      }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [revision])
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  return {projects, unregistered, loading, error, refresh}
}
