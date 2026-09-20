import {describe, expect, it} from 'vitest'
import {projectCatalog, readRecentProjects, recentProjects, rememberProject} from '../src/features/projects/project-catalog'

describe('project entry projection', () => {
  it('uses all registered research domains, not a paper name convention', () => {
    const result = projectCatalog([{projectId:'simulation', title:'Simulation'}, {projectId:'paper-a',title:'Paper'}, {projectId:'reading',title:'Reading'}], [{workspaceId:'simulation'}, {workspaceId:'paper-a'}, {workspaceId:'new-workspace'}])
    expect(result.projects.map(project => [project.id, project.accessible])).toEqual([['simulation',true],['paper-a',true],['reading',false]])
    expect(result.unregistered).toEqual([{workspaceId:'new-workspace'}])
  })
  it('rejects aliases and duplicate identities rather than inventing projects', () => {
    expect(() => projectCatalog([{id:'a',title:'A'} as never], [])).toThrow()
    expect(() => projectCatalog([{projectId:'a',title:'A'}, {projectId:'a',title:'Again'}], [])).toThrow()
  })
  it('orders recent projects without capping or losing catalog entries', () => {
    const projects = Array.from({length:60}, (_, index) => ({id:String(index)}))
    const result = recentProjects(projects, ['50','unavailable','2'])
    expect(result.slice(0,2)).toEqual([{id:'50'},{id:'2'}])
    expect(result).toHaveLength(60)
    expect(projects[0].id).toBe('0')
  })
  it('stores only deduplicated view preferences and rejects damaged preferences', () => {
    expect(rememberProject(['b','a'], 'a')).toEqual(['a','b'])
    expect(readRecentProjects('["a","a","b"]')).toEqual(['a','b'])
    expect(readRecentProjects('{"projectId":"a"}')).toEqual([])
    expect(readRecentProjects('[3]')).toEqual([])
    expect(readRecentProjects('broken')).toEqual([])
  })
})
