import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button, RightMore } from '../../components/ui'
import { useWorkbench } from '../../store'
import { request } from '../../lib/api'
import { MarkdownView } from '../resources/Reader'
import { useRendererObservation } from '../artifacts/renderer-gate'
import type { Capabilities } from '../chat/environment-status'
import { DEFAULT_SEED_PATHS, FIGURE_STYLE_PACK as PACK, FIGURE_STYLE_REF, seedDrift, type SeedPaths } from './figure-style'
import { figureStyleContextItem, useFigureStyleSeed, type FigureStyleSeed, type SeedFile } from './useFigureStyleSeed'

/* 图件风格（Figure style）：论文图件的栈、尺寸、色彩与出图核对项，作为可读、可附加到对话的产品数据。
   论文侧的政策原文（figure-inventory §5）与 figstyle.py 只读呈现；缺失就如实说缺失。这里不渲染、不检查任何图。 */

export function FigureStylePage({ project }: { project: string }) {
  const { locale, addContextItem, contextItems } = useWorkbench(), zh = locale === 'zh'
  const { paths, setPaths, seed, reload } = useFigureStyleSeed(project)
  const [note, setNote] = useState('')
  const ready = seed && seed !== 'loading' && !('error' in seed) ? seed : null
  const attached = contextItems.some(i => i.project === project && i.ref === FIGURE_STYLE_REF)
  const attach = () => { addContextItem(figureStyleContextItem(project, ready)); setNote(zh ? '已加入对话上下文（未发送）。' : 'Added to chat context (not sent).') }
  const drift = useMemo(() => ready ? seedDrift(PACK, { figstyle: ready.figstyle.status === 'ready' ? ready.figstyle.value : null, colors: ready.colors.status === 'ready' ? ready.colors.value : null }) : [], [ready])

  return <div className="flex h-full min-h-0 flex-col" data-xgc-role="figure-style" data-xgc-id={project || 'global'}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
      <span className="font-display text-[15px] tracking-tight">{zh ? '图件风格' : 'Figure style'}</span>
      <span className="min-w-0 truncate text-caption text-ink-3">v{PACK.version} · {zh ? `作者拍板 ${PACK.decided}` : `decided ${PACK.decided}`}</span>
      <span className="flex-1"/>
      {project && <Button size="xs" icon={MessageSquarePlus} disabled={attached} data-xgc-role="figure-style-to-context" onClick={attach}>{attached ? (zh ? '已在对话中' : 'In chat') : (zh ? '加入对话' : 'Add to chat')}</Button>}
      {project && <SeedMenu paths={paths} onPaths={setPaths} onReload={reload} zh={zh}/>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto max-w-[680px] space-y-8 px-6 py-6 text-secondary text-ink-2">
        {note && <p role="status" className="text-caption text-ink-3">{note}</p>}
        <p className="font-display text-[17px] leading-relaxed tracking-tight text-ink">{zh ? '论文图件只走两条路：示意与拼版用 TikZ，数据用 matplotlib 与 figstyle。其余皆已退役。' : 'Manuscript figures take two roads only: TikZ for schematics and collages, matplotlib with figstyle for data. Everything else is retired.'}</p>

        <Part title={zh ? '允许的栈' : 'Allowed stack'}>
          {PACK.stack.map(s => <div key={s.id} className="mb-3" data-stack={s.id}>
            <p className="text-ink">{s.name} <span className="text-ink-3">— {s.scope}</span></p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">{s.source}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{s.rules.map(r => <li key={r}>{r}</li>)}</ul>
          </div>)}
        </Part>

        <Part title={zh ? '已退役 · 禁止' : 'Retired · not allowed'}>
          <ul className="space-y-1" data-xgc-role="figure-style-bans">{PACK.bans.map(b => <li key={b.id} data-ban={b.id}><span className="text-ink line-through decoration-ink-3">{b.name}</span><span className="text-ink-3"> — {b.detail}</span></li>)}</ul>
        </Part>

        <Part title={zh ? '尺寸与字号' : 'Size and type'}>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
            {[[zh ? '单栏' : 'Single column', `${PACK.layout.columnIn} in  (\\columnwidth)`], [zh ? '双栏' : 'Double column', `${PACK.layout.textIn} in  (\\textwidth)`], [zh ? '并排子图' : '2-up subfigure', `${PACK.layout.subfigIn} in  (0.485 \\textwidth)`],
              [zh ? '正文字号' : 'Body', `${PACK.layout.bodyPt} pt`], [zh ? '刻度 · 图例' : 'Ticks · legend', `${PACK.layout.smallPt} pt`], [zh ? '线宽' : 'Strokes', `axes ${PACK.layout.axesLinePt} · lines ${PACK.layout.linePt} · grid ${PACK.layout.gridLinePt} pt`]]
              .map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="font-mono text-[12px] text-ink">{v}</dd></div>)}
          </dl>
        </Part>

        <Part title={zh ? '色彩 token' : 'Colour tokens'}>
          <p className="mb-2 text-ink-3">{zh ? '示意图墨色取自手稿自己的 mit* 定义；数据系列取 figstyle 的 Okabe-Ito，同一方法在所有图中同色。不另立第三套调色板。' : 'Schematic ink is the manuscript\'s own mit* set; data series use figstyle\'s Okabe-Ito, one colour per method across figures. No third palette.'}</p>
          <Swatches label={zh ? '墨色（TikZ）' : 'Ink (TikZ)'} items={PACK.ink.map(c => ({ name: c.name, hex: c.hex }))}/>
          <Swatches label={zh ? '数据系列（matplotlib）' : 'Series (matplotlib)'} items={PACK.series.map((hex, i) => ({ name: `C${i}`, hex }))}/>
        </Part>

        <Part title={zh ? '出图前核对' : 'Before a figure goes in'}>
          <ol className="list-decimal space-y-1 pl-4" data-xgc-role="figure-style-checklist">{PACK.checklist.map(c => <li key={c.id}>{c.text}{c.how && <span className="ml-1 font-mono text-[11px] text-ink-3">{c.how}</span>}</li>)}</ol>
        </Part>

        <RenderGate zh={zh}/>

        {project
          ? <Seed seed={seed} project={project} zh={zh} onReload={reload}/>
          : <Part title={zh ? '论文政策原文' : 'Paper policy'}><p className="text-ink-3">{zh ? '选择论文项目后，这里只读显示它的 figure-inventory §5 与 figstyle.py。' : 'Select a paper project to read its figure-inventory §5 and figstyle.py here, read-only.'}</p></Part>}
        {drift.length > 0 && <Part title={zh ? '与论文文件的差异' : 'Differences from the paper\'s files'}>
          <p className="mb-1 text-ink-3">{zh ? '以论文为准；此处只报告。' : 'The paper\'s files win; this only reports.'}</p>
          <ul className="space-y-0.5 font-mono text-[11px]" data-xgc-role="figure-style-drift">{drift.map(d => <li key={d.token}>{d.token}: pack {d.pack} · paper {d.seed}{d.line ? ` (line ${d.line})` : ''}</li>)}</ul>
        </Part>}

        <Part title={zh ? '不在这里做' : 'Not done here'}>
          <ul className="list-disc space-y-0.5 pl-4 text-ink-3">{PACK.deferred.map(d => <li key={d}>{d}</li>)}</ul>
        </Part>
      </article>
    </div>
  </div>
}

const Part = ({ title, children }: { title: string; children: ReactNode }) => <section><h3 className="mb-2 text-caption uppercase tracking-[0.08em] text-ink-3">{title}</h3>{children}</section>

function Swatches({ label, items }: { label: string; items: { name: string; hex: string }[] }) {
  return <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="w-full text-caption text-ink-3">{label}</span>
    {items.map(c => <span key={c.name} className="flex items-center gap-1.5 font-mono text-[11px]" title={c.hex}><span aria-hidden className="h-3 w-3 rounded-sm border border-line" style={{ background: c.hex }}/>{c.name}<span className="text-ink-3">{c.hex}</span></span>)}
  </div>
}

/** What the host actually reported. Nothing here is rendered, so nothing here claims a render. */
function RenderGate({ zh }: { zh: boolean }) {
  const renderer = useRendererObservation()
  const [latex, setLatex] = useState<'unknown' | 'on' | 'off'>('unknown')
  useEffect(() => { const c = new AbortController(); request<Capabilities>('/capabilities', { signal: c.signal }).then(r => setLatex(r.latex ? (r.latex.available ? 'on' : 'off') : 'unknown'), () => { if (!c.signal.aborted) setLatex('unknown') }); return () => c.abort() }, [])
  const tex = { on: zh ? 'LaTeX 可构建（服务端报告）' : 'LaTeX builds on (reported by the service)', off: zh ? 'LaTeX 构建关闭（服务端报告）' : 'LaTeX builds off (reported by the service)', unknown: zh ? 'LaTeX 状态未知' : 'LaTeX status unknown' }[latex]
  const art = renderer.state === 'unavailable' ? (zh ? `制品渲染器不可用（观察于 ${renderer.at}）` : `Artifact renderer unavailable (observed ${renderer.at})`) : renderer.state === 'rendered' ? (zh ? `制品渲染器有应答（${renderer.at}）` : `Artifact renderer answered (${renderer.at})`) : (zh ? '制品渲染器未观察' : 'Artifact renderer not observed')
  return <Part title={zh ? '渲染与检查' : 'Render and checks'}>
    <p data-xgc-role="figure-style-gate" data-latex={latex}>{tex} · {art}</p>
    <p className="mt-1 text-ink-3">{zh ? '本页不编译、不出图、不跑 pdffonts。核对结果只在真正运行过之后记录。' : 'This page compiles nothing, draws nothing and runs no pdffonts. Check results are recorded only after they actually ran.'}</p>
  </Part>
}

function SeedState<T>({ file, zh, children }: { file: SeedFile<T>; zh: boolean; children: (value: T) => ReactNode }) {
  if (file.status === 'missing') return <p className="text-ink-3" data-seed-missing={file.path}>{zh ? '还没有找到：' : 'Not found yet: '}<code className="break-all font-mono text-[11px]">{file.path}</code></p>
  if (file.status === 'error') return <p role="alert" className="text-ink-2">{file.path}: {file.message}</p>
  return <>{children(file.value)}</>
}

function Seed({ seed, project, zh, onReload }: { seed: FigureStyleSeed | 'loading' | { error: string } | null; project: string; zh: boolean; onReload: () => void }) {
  if (!seed || seed === 'loading') return <p role="status" className="text-ink-3">{zh ? '正在读取论文的图件政策…' : 'Reading the paper\'s figure policy…'}</p>
  if ('error' in seed) return <p role="alert">{seed.error} <Button size="xs" onClick={onReload}>{zh ? '重新读取' : 'Reload'}</Button></p>
  return <>
    <Part title={zh ? '论文政策原文（只读）' : 'Paper policy, verbatim (read-only)'}>
      <SeedState file={seed.policy} zh={zh}>{section => section
        ? <div data-xgc-role="figure-style-policy"><p className="mb-2 text-caption text-ink-3">{project}/{seed.policy.path}:{section.line} · § {section.heading}{seed.policy.status === 'ready' && seed.policy.digest ? ` · ${seed.policy.digest.slice(0, 12)}` : ''}</p>
            <div className="research-document break-words leading-relaxed"><MarkdownView content={section.body}/></div></div>
        : <p className="text-ink-3" data-seed-missing="§5">{zh ? `文件在，但没有「## 5.」一节：${seed.policy.path}` : `The file is there but has no "## 5." section: ${seed.policy.path}`}</p>}</SeedState>
    </Part>
    <Part title={zh ? 'figstyle.py 参数（只读参考）' : 'figstyle.py parameters (read-only reference)'}>
      <SeedState file={seed.figstyle} zh={zh}>{fs => fs.constants.length + fs.rc.length
        ? <table className="w-full font-mono text-[11px]" data-xgc-role="figure-style-figstyle"><tbody>{[...fs.constants, ...fs.rc].map(p => <tr key={`${p.name}:${p.line}`} className="border-b border-line/60 align-top"><td className="py-0.5 pr-3 text-ink">{p.name}</td><td className="break-all py-0.5 text-ink-2">{p.value}</td><td className="py-0.5 pl-2 text-right text-ink-3">{p.line}</td></tr>)}</tbody></table>
        : <p className="text-ink-3">{zh ? '文件在，但没有可读的常量或 rcParams。' : 'The file is there but has no readable constants or rcParams.'}</p>}</SeedState>
    </Part>
    <Part title={zh ? '手稿色彩定义（只读）' : 'Manuscript colour definitions (read-only)'}>
      <SeedState file={seed.colors} zh={zh}>{colors => colors.length
        ? <Swatches label={seed.colors.path} items={colors.map(c => ({ name: c.name, hex: c.hex ?? `{${c.model}}{${c.spec}}` }))}/>
        : <p className="text-ink-3">{zh ? '文件里没有 \\definecolor。' : 'No \\definecolor in the file.'}</p>}</SeedState>
    </Part>
  </>
}

function SeedMenu({ paths, onPaths, onReload, zh }: { paths: SeedPaths; onPaths: (p: SeedPaths) => void; onReload: () => void; zh: boolean }) {
  const [draft, setDraft] = useState(paths)
  useEffect(() => setDraft(paths), [paths])
  const field = (key: keyof SeedPaths, label: string) => <label key={key} className="block text-caption text-ink-3">{label}
    <input className="ui-input mt-1 h-7 w-full font-mono text-[11px]" value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') onPaths(draft) }}/></label>
  return <RightMore label={zh ? '论文来源' : 'Paper sources'}>
    {field('policy', zh ? '图件政策（含 §5）' : 'Figure policy (with §5)')}
    {field('figstyle', 'figstyle.py')}
    {field('preamble', zh ? '手稿色彩定义' : 'Manuscript colour definitions')}
    <div className="flex flex-wrap gap-1">
      <Button size="xs" variant="outline" onClick={() => onPaths(draft)}>{zh ? '读取' : 'Read'}</Button>
      <Button size="xs" onClick={onReload}>{zh ? '重新读取' : 'Reload'}</Button>
      <Button size="xs" onClick={() => onPaths({ ...DEFAULT_SEED_PATHS })}>{zh ? '恢复默认' : 'Defaults'}</Button>
    </div>
    <p className="text-caption text-ink-3">{zh ? '项目相对路径，只读。缺失的文件如实显示为缺失。' : 'Project-relative, read-only. A missing file is shown as missing.'}</p>
  </RightMore>
}
