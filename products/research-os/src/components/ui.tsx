import {t as tr} from '../i18n'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Search, type LucideIcon } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'

/* ================================================================
   ATLAS UI KIT —— 全站控件规范
   ─ 尺寸:  面板头 h-10(40px) · 控件 sm h-7(28px) · 控件 md h-8(32px)
   ─ 圆角:  控件 rounded-md(6px) · 卡片/浮条 rounded-lg(8px)
   ─ 字号:  caption 10.5 · secondary 11.5 · body 12.5 · title 13.5
   ─ 语义:  solid(黑实底) = 主操作/提醒 → 附 shine 高光 / pulse 脉冲
   ================================================================ */

/* ---------- Button: 语义化实体按钮 ---------- */
type ButtonProps = {
  variant?: 'solid' | 'outline' | 'ghost'
  size?: 'xs' | 'sm' | 'md'
  icon?: LucideIcon
  pulse?: boolean // 持续提醒脉冲环
  loading?: boolean // 运行中：脉冲点 + 循环流光
  busyAction?: boolean // 运行中仍允许停止等操作
  shine?: boolean // hover 高光扫过（solid 默认开启）
  children?: ReactNode
} & HTMLMotionProps<'button'>

export function Button({
  variant = 'ghost',
  size = 'sm',
  icon: Icon,
  pulse,
  loading,
  shine,
  busyAction = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const solid = variant === 'solid'
  return (
    <motion.button
      type="button"
      disabled={disabled || (loading && !busyAction)}
      aria-busy={loading || undefined}
      data-state={loading ? 'running' : pulse ? 'attention' : 'idle'}
      whileTap={disabled || (loading && !busyAction) ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-1.5 overflow-hidden rounded-md font-medium',
        'ui-control transition-colors duration-200',
        size === 'xs' && 'ui-control-xs',
        size === 'sm' && 'ui-control-sm',
        size === 'md' && 'ui-control-md',
        solid && 'bg-accent text-accent-fg shadow-soft hover:opacity-95',
        variant === 'outline' && 'border border-line bg-panel text-ink-2 hover:border-line-strong hover:text-ink',
        variant === 'ghost' && 'text-ink-2 hover:bg-hover hover:text-ink',
        pulse && 'attn',
        className,
      )}
      {...props}
    >
      {loading && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {Icon && !loading && <Icon size={size === 'xs' ? 10.5 : size === 'sm' ? 12 : 13} strokeWidth={2} />}
      {children}
      {(shine ?? solid) && <span className={cn('btn-shine', loading && 'loop')} aria-hidden />}
    </motion.button>
  )
}

/* ---------- IconButton: 28px 标准图标按钮 ---------- */
export function IconBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  className,
  size = 14,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
  size?: number
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      title={tr(label)}
      aria-label={tr(label)}
      onClick={onClick}
      className={cn(
        'ui-icon-control grid shrink-0 place-items-center rounded-md text-ink-3 transition-all duration-200',
        'hover:bg-hover hover:text-ink active:scale-95',
        active && 'bg-active text-ink',
        className,
      )}
    >
      <Icon size={size} strokeWidth={1.8} />
    </button>
  )
}

/* ---------- PanelHeader: 所有面板统一的 40px 头部 ---------- */
export function PanelHeader({
  title,
  status,
  actions,
  className,
}: {
  title: ReactNode
  status?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('ui-panel-header', className)}>
      <h3 className="truncate text-body font-semibold">{typeof title==='string'?tr(title):title}</h3>
      {status}
      <div className="ml-auto flex items-center gap-1">{actions}</div>
    </header>
  )
}

/* ---------- Card: 标准面板卡片 ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-line bg-panel shadow-soft transition-colors duration-300', className)}>
      {children}
    </section>
  )
}

/* ---------- Tabs: 统一 line(40px 下划线) / pill(28px 胶囊) 双形态 ---------- */
export function Tabs({
  id, tabs, active, onChange, variant = 'line', badges, className,
}: {
  id: string
  tabs: { id: string; label: string; icon?: ReactNode }[]
  active: string
  onChange: (t: string) => void
  variant?: 'line' | 'pill'
  badges?: Record<string, number>
  className?: string
}) {
  const instance = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="tablist" aria-label={id} className={cn('ui-tabs', `ui-tabs-${variant}`, className)}>
      {tabs.map((tab, index) => {
        const selected = tab.id === active
        return (
          <button key={tab.id} ref={(node) => { refs.current[index] = node }}
            type="button" role="tab" aria-label={tr(tab.label)} title={tr(tab.label)} aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="ui-tab" onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              let next = index
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
              else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = tabs.length - 1
              else return
              event.preventDefault()
              onChange(tabs[next].id)
              refs.current[next]?.focus()
              refs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }}>
            {selected && <motion.span layoutId={`${instance}-indicator`}
              className="ui-tab-indicator" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative whitespace-nowrap">{tab.icon??tr(tab.label)}</span>
            {badges?.[tab.id] !== undefined && <Badge solid={selected} className="relative">{badges[tab.id]}</Badge>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Badge: 计数徽标（active 时黑实底，承载语义） ---------- */
export function Badge({
  solid,
  className,
  children,
}: {
  solid?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded px-1 text-[10px] font-semibold leading-4 transition-colors duration-200',
        solid ? 'bg-accent text-accent-fg' : 'bg-hover text-ink-3',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ---------- SearchTrigger: 标准搜索/命令入口（h-8） ---------- */
export function SearchTrigger({
  placeholder = tr("Search…"),
  shortcut,
  onClick,
  className,
}: {
  placeholder?: string
  shortcut?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-control-md items-center gap-2 rounded-md border border-line bg-inset px-3 text-body text-ink-3',
        'transition-all duration-200 hover:border-line-strong hover:bg-hover',
        className,
      )}
    >
      <Search size={14} strokeWidth={1.8} className="shrink-0" />
      <span className="flex-1 truncate text-left">{placeholder}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}

/* ---------- SectionLabel: 侧栏分组标题 ---------- */
export function SectionLabel({ children, onAdd }: { children: ReactNode; onAdd?: () => void }) {
  return (
    <div className="group mb-1 mt-5 flex items-center justify-between px-3 first:mt-0">
      <span className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</span>
      {onAdd && (
        <button
          type="button"
          aria-label="Add item"
          onClick={onAdd}
          className="grid h-4.5 w-4.5 place-items-center rounded-sm text-ink-3 opacity-0 transition-all hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 1v10M1 6h10" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ---------- StatusDot ---------- */
export function StatusDot({ tone = 'ok', pulse = false }: { tone?: 'ok' | 'warn' | 'err' | 'idle'; pulse?: boolean }) {
  const color =
    tone === 'ok' ? 'text-ok bg-ok' : tone === 'warn' ? 'text-warn bg-warn' : tone === 'err' ? 'text-err bg-err' : 'text-ink-3 bg-ink-3'
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color, pulse && 'pulse-dot')} />
}

/* ---------- SoftBadge: 软语义标签 ---------- */
export function SoftBadge({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'neutral'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-medium',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'err' && 'bg-err-soft text-err',
        tone === 'neutral' && 'bg-hover text-ink-2',
      )}
    >
      {children}
    </span>
  )
}

/* ---------- Kbd ---------- */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center gap-0.5 rounded-md border border-line bg-inset px-1.5 font-sans text-caption font-medium text-ink-3">
      {children}
    </kbd>
  )
}
