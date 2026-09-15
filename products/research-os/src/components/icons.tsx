/**
 * Research OS 专属图标：手绘几何标记，24 网格、圆角端点、1.75 笔画。
 * 语义图标（导航/面板）用这套；纯几何工具图标（+-×›）仍可用 Lucide。
 * API 与 lucide-react 对齐：size / strokeWidth / className。
 */
type IconProps = { size?: number | string; strokeWidth?: number | string; className?: string }
const svg = (size: number | string, strokeWidth: number | string) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

/* 对话：气泡带一枚短尾，内留一道思考线 */
export function IconChat({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <rect x="4" y="5" width="16" height="11" rx="5.5" />
    <path d="M8.5 15.8 7 19.5 12.5 16.2" />
  </svg>
}

/* 工作流：两个节点，一条贝塞尔依赖线 */
export function IconWorkflow({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <circle cx="6" cy="6.7" r="2.4" />
    <circle cx="18" cy="17.3" r="2.4" />
    <path d="M8.4 7.7C12.7 10 11.3 14 15.6 16.3" />
  </svg>
}

/* 图谱：三星星座，实点细边 */
export function IconGraph({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <path d="M7.1 15.1 10.4 7.5M13.7 7.2 17.1 10.9M7.5 16 16.7 13.2" strokeWidth={Number(strokeWidth) * 0.8} />
    <circle cx="5.3" cy="16.7" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="5.3" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="18.7" cy="12.7" r="1.9" fill="currentColor" stroke="none" />
  </svg>
}

/* 知识库：摊开的书 */
export function IconKnowledge({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <path d="M12 6.4C10.1 4.8 7.2 4.5 4.3 5.3v12.3c2.9-.8 5.8-.5 7.7 1.1 1.9-1.6 4.8-1.9 7.7-1.1V5.3C16.8 4.5 13.9 4.8 12 6.4Z" />
    <path d="M12 6.4v12.3" />
  </svg>
}

/* 项目：文件夹内一道 git 分支（仓库载体） */
export function IconProjects({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <path d="M3.8 7.4c0-1 .8-1.8 1.8-1.8h3.3l1.8 1.8h7.5c1 0 1.8.8 1.8 1.8v7.4c0 1-.8 1.8-1.8 1.8H5.6c-1 0-1.8-.8-1.8-1.8Z" />
    <circle cx="9.6" cy="14.6" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="14.4" cy="11" r="1.25" fill="currentColor" stroke="none" />
    <path d="M9.6 13.4v-.4c0-1.5 1.4-1.9 2.8-2.1" strokeWidth={Number(strokeWidth) * 0.8} />
  </svg>
}

/* 思维白板：两个节点被一道贝塞尔牵起（正在画的连线） */
export function IconCanvas({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <circle cx="5.8" cy="16.2" r="2.1" />
    <circle cx="18.2" cy="7.8" r="2.1" />
    <path d="M7.9 16.2h3.3c2.6 0 3.2-1.4 3.9-3.5l.7-2.4" />
  </svg>
}

/* 设置：两档滑杆，旋钮错位 */
export function IconSettings({ size = 17, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>
    <path d="M4 8.3h8.3M17.3 8.3H20" />
    <circle cx="14.9" cy="8.3" r="2.4" />
    <path d="M4 15.7h2.7M11.5 15.7H20" />
    <circle cx="9.1" cy="15.7" r="2.4" />
  </svg>
}

/* 产品标：XGC2 xgc-brand-mark.svg 几何（圆角方章 + X + 十字切口），墨色版——
   方章/切口 currentColor 随 --ink，X 用 --bg-app 镂空；深浅主题自动反转。 */
export function IconMark({ size = 20, className }: Omit<IconProps, 'strokeWidth'>) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
    <rect width="32" height="32" rx="7" fill="currentColor" />
    <g transform="rotate(45 16 16)">
      <g fill="var(--bg-app)">
        <rect x="13.53" y="3.73" width="4.94" height="24.54" rx="2.47" />
        <rect x="3.73" y="13.53" width="24.54" height="4.94" rx="2.47" />
      </g>
      <g fill="currentColor">
        <rect x="14.53" y="10.33" width="2.94" height="11.34" rx="0.73" />
        <rect x="10.33" y="14.53" width="11.34" height="2.94" rx="0.73" />
      </g>
    </g>
  </svg>
}

/* 面板开关：圆角框 + 对应一侧的分栏线 */
const panelRect = <rect x="4" y="4.7" width="16" height="14.6" rx="3.3" />
export function IconPanelLeft({ size = 15, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>{panelRect}<path d="M9.6 4.7v14.6" /></svg>
}
export function IconPanelBottom({ size = 15, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>{panelRect}<path d="M4 14.4h16" /></svg>
}
export function IconPanelRight({ size = 15, strokeWidth = 1.75, className }: IconProps) {
  return <svg {...svg(size, strokeWidth)} className={className}>{panelRect}<path d="M14.4 4.7v14.6" /></svg>
}
