import { useState } from 'react'
import { Check, Play, Plus, Square, SunMoon } from 'lucide-react'
import { Badge, Button, Card, IconBtn, PanelHeader, SearchTrigger, SoftBadge, Tabs } from './index'

const items = [{ id: 'overview', label: 'Overview' }, { id: 'activity', label: 'Activity' }, { id: 'sources', label: 'Sources' }]

export default function Preview() {
  const [tab, setTab] = useState('overview')
  const [running, setRunning] = useState(false)
  const [attention, setAttention] = useState(true)
  return <main className="h-screen overflow-y-auto bg-app p-6 text-body">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Research OS · Interface foundations</h1><p className="mt-1 text-secondary text-ink-2">Atlas visual language · components, hierarchy and state</p></div>
        <IconBtn icon={SunMoon} label="Toggle theme" onClick={() => document.documentElement.classList.toggle('dark')} />
      </header>
      <Card><PanelHeader title="Actions" /><div className="flex flex-wrap items-center gap-3 p-4">
        <Button variant="solid" icon={Play}>Primary action</Button>
        <Button variant="outline" icon={Plus}>Secondary</Button>
        <Button>Quiet action</Button><Button variant="solid" disabled>Unavailable</Button>
        <Button size="xs" variant="outline">24px</Button><Button size="sm" variant="outline">28px</Button><Button size="md" variant="outline">32px</Button>
      </div></Card>
      <Card><PanelHeader title="State and motion" /><div className="flex flex-wrap items-center gap-3 p-4">
        <Button variant="solid" loading={running} busyAction icon={running ? Square : Play} onClick={() => setRunning(!running)}>{running ? 'Stop run' : 'Run task'}</Button>
        <Button variant="solid" pulse={attention} icon={attention ? undefined : Check} onClick={() => setAttention(!attention)}>{attention ? 'Review required' : 'Reviewed'}</Button>
        <Button variant="solid" loading>Processing</Button>
        <SoftBadge tone="ok">Completed</SoftBadge><SoftBadge tone="warn">Needs review</SoftBadge><SoftBadge tone="err">Failed</SoftBadge>
      </div></Card>
      <Card><PanelHeader title="Navigation" /><div className="space-y-4 p-4">
        <Tabs id="Preview line tabs" tabs={items} active={tab} onChange={setTab} />
        <Tabs id="Preview pill tabs" variant="pill" tabs={items} active={tab} onChange={setTab} badges={{sources:12}} />
        <div role="tabpanel" className="rounded-md bg-inset p-4">{items.find(item => item.id === tab)?.label}</div>
        <div className="ui-inverse rounded-md bg-[#0c0c0e] p-2"><Tabs id="Preview inverse tabs" variant="pill" tabs={items} active={tab} onChange={setTab} /></div>
      </div></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><PanelHeader title="Type hierarchy" status={<Badge>4 roles</Badge>} /><div className="space-y-3 p-4">
          <p className="text-title font-semibold">Title · 13.5px</p><p className="text-body">Body · 12.5px</p><p className="text-secondary text-ink-2">Secondary · 11.5px</p><p className="text-caption text-ink-3">Caption · 10.5px</p>
        </div></Card>
        <Card><PanelHeader title="Panel geometry" actions={<IconBtn icon={Plus} label="Add" />} /><div className="space-y-3 p-4">
          <SearchTrigger placeholder="Search components…" className="w-full" />
          <p className="text-secondary text-ink-2">40px panel header · 12px panel spacing · 6px controls · 8px cards</p>
        </div></Card>
      </div>
    </div>
  </main>
}
