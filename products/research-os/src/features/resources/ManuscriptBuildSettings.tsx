import { useEffect, useState } from 'react'
import { Input } from '../../components/forms'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { setManuscriptSourceRoot } from './manuscript-build-config'

export function ManuscriptBuildSettings({ workspace, entryPoint, sourceRoot, disabled = false }: { workspace: string; entryPoint: string; sourceRoot: string; disabled?: boolean }) {
  const zh = useWorkbench(state => state.locale === 'zh')
  const [value, setValue] = useState(sourceRoot), [error, setError] = useState('')
  useEffect(() => { setValue(sourceRoot); setError('') }, [workspace, entryPoint, sourceRoot])
  return <details className="relative text-caption" data-manuscript-build-settings>
    <summary className="cursor-pointer rounded px-2 py-1 text-ink-2 hover:bg-hover">{zh ? '构建范围' : 'Build sources'} · {sourceRoot}</summary>
    <form className="absolute right-0 top-full z-50 mt-1 w-72 space-y-2 rounded-lg border border-line bg-panel p-3 shadow-pop" onSubmit={event => { event.preventDefault(); try { setManuscriptSourceRoot(workspace, entryPoint, value); setError('') } catch (error) { setError(String((error as Error).message || error)) } }}>
      <label className="block text-ink-2">{zh ? '源码目录（相对工作区）' : 'Source directory (relative to workspace)'}<Input className="mt-1" value={value} disabled={disabled} onChange={event => setValue(event.target.value)} aria-label={zh ? '构建源码目录' : 'Build source directory'}/></label>
      <p className="text-ink-3">{zh ? '该目录及子目录进入编译快照。初值为主稿所在目录；跨目录引用请选择共同父目录，. 表示整个工作区。' : 'This directory and its descendants form the build snapshot. The initial value is the manuscript directory. Choose a common parent for references across directories; . means the whole workspace.'}</p>
      <Button type="submit" size="xs" disabled={disabled || value === sourceRoot}>{zh ? '保存构建范围' : 'Save build scope'}</Button>
      {error && <p role="alert" className="ui-error">{error}</p>}
    </form>
  </details>
}
