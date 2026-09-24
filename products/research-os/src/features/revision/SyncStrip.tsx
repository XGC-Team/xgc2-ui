import { useEffect } from 'react'
import { useWorkbench } from '../../store'
import { isOriginalPDF } from '../resources/manuscript'
import { proposalCounts, useProposals } from './proposal-store'

const short = (digest?: string) => digest ? digest.replace(/^sha256:/, '').slice(0, 8) : ''

/** One caption line that says which versions the three panes are looking at. Status only, no actions:
 * PDF (build vs original, never implying a fresh compile), canvas revision, and proposal vs applied counts. */
export function SyncStrip({ project, digest, dirty, status }: { project: string; digest: string; dirty: boolean; status: string }) {
  const { locale, resourceLayout } = useWorkbench()
  const proposals = useProposals(s => s.proposals), load = useProposals(s => s.load)
  useEffect(() => { void load(project) }, [project, load])
  const zh = locale === 'zh'
  const counts = proposalCounts(proposals, project)
  const tabs = resourceLayout.tabs.filter(tab => tab.projectId === project)
  const pdfTab = tabs.find(tab => tab.id === resourceLayout.active[project]?.secondary && (tab.kind === 'pdf' || tab.kind === 'original'))
    ?? tabs.find(tab => tab.kind === 'pdf' || tab.kind === 'original')
  let pdf = zh ? 'PDF 未打开' : 'No PDF open'
  if (pdfTab?.kind === 'pdf') pdf = isOriginalPDF(pdfTab.pdf) ? `${zh ? 'PDF 原件' : 'Original PDF'} ${pdfTab.pdf.path.split('/').pop()} @${short(pdfTab.pdf.digest)}` : `${zh ? '构建 PDF' : 'Built PDF'} ${pdfTab.pdf.buildId.slice(0, 8)} @${short(pdfTab.pdf.digest)}`
  else if (pdfTab?.kind === 'original') pdf = `${zh ? 'PDF 原件' : 'Original PDF'} ${pdfTab.path.split('/').pop()}${pdfTab.digest ? ` @${short(pdfTab.digest)}` : ''}`
  const canvas = !digest ? (zh ? '画布未建立' : 'Canvas not created')
    : `${zh ? '画布' : 'Canvas'} @${short(digest)}${dirty ? (zh ? ' · 未保存' : ' · unsaved') : status === 'saving' ? (zh ? ' · 保存中' : ' · saving') : ''}`
  const proposalText = zh ? `提议 待审 ${counts.pending} · 已应用 ${counts.applied}` : `Proposals ${counts.pending} pending · ${counts.applied} applied`
  return <p className="flex min-w-0 flex-wrap gap-x-3 border-b border-line px-3 py-1 text-caption text-ink-3" data-xgc-role="sync-strip" data-pending={counts.pending}>
    <span className="truncate" title={pdfTab && 'pdf' in pdfTab ? pdfTab.pdf.digest : undefined}>{pdf}</span>
    <span className="truncate">{canvas}</span>
    <span className={counts.pending ? 'font-medium text-ink-2' : ''}>{proposalText}</span>
  </p>
}
