import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, TriangleAlert, WifiOff } from 'lucide-react'
import { useLive } from '@/lib/live'
import { useTab, useTheme, type Tab } from '@/lib/persist'
import { Header } from '@/components/Header'
import { TaskSheet } from '@/components/TaskSheet'
import { DocSheet, type Doc } from '@/components/DocSheet'
import { EventToasts } from '@/components/EventToasts'
import { ClockBase } from '@/lib/clock'
import { capital } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Overview } from '@/tabs/Overview'
import { Agents } from '@/tabs/Agents'
import { Tasks } from '@/tabs/Tasks'
import { Timing } from '@/tabs/Timing'
import { Queue } from '@/tabs/Queue'
import { Defects } from '@/tabs/Defects'
import { Compactions } from '@/tabs/Compactions'
import { Journal } from '@/tabs/Journal'
import { Sets } from '@/tabs/Sets'

// The sticky header's height, for things that stick just under it.
function useHeaderHeight() {
  useEffect(() => {
    const el = document.querySelector('header')
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
}

const AGENT_KEY = 'crew-dashboard:agent'

export default function App() {
  const { state, conn, problem, changedAt } = useLive()
  const [theme, setTheme, dark] = useTheme()
  const [tab, setTab] = useTab(Boolean(state))
  const [taskId, setTaskId] = useState<string | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  useHeaderHeight()

  // The agent shown in the Agents tab ('lead' or a subagent id), kept across reloads.
  const [agent, setAgent] = useState<string>(() => {
    try { return sessionStorage.getItem(AGENT_KEY) || 'lead' } catch { return 'lead' }
  })
  const pickAgent = useCallback((id: string) => {
    setAgent(id)
    try { sessionStorage.setItem(AGENT_KEY, id) } catch { /* private mode */ }
  }, [])
  const openAgent = useCallback((id: string) => { pickAgent(id); setTab('agents') }, [pickAgent, setTab])

  useEffect(() => {
    if (!state) return
    const cur = state.current
    const done = cur ? `${cur.accepted}/${cur.total}` : ''
    document.title = `${done ? `${done} · ` : ''}${capital(state.repo.name)} · Crew`
  }, [state])

  const badges = useMemo(() => {
    const b: Partial<Record<Tab, { n: number | string; tone?: 'warn' | 'muted' }>> = {}
    if (!state) return b
    if (state.agents.length) b.agents = { n: state.agents.length }
    if (state.current) b.tasks = { n: `${state.current.accepted}/${state.current.total}` }
    const q = state.queue.counts
    if (q.openQuestions) b.queue = { n: q.openQuestions, tone: 'warn' }
    else if (q.queued + q.scheduled) b.queue = { n: q.queued + q.scheduled }
    const d = state.defects.summary
    if (d.deferred + d.scheduled) b.defects = { n: d.deferred + d.scheduled, tone: d.deferredMedium ? 'warn' : undefined }
    const c = state.compactions?.summary
    if (c && c.lead.count + c.sub.count) b.compactions = { n: c.lead.count + c.sub.count }
    if (state.sets.length > 1) b.sets = { n: state.sets.length }
    return b
  }, [state])

  return (
    <ClockBase.Provider value={state?.generatedAt ?? Math.floor(Date.now() / 1000)}>
      <div className="min-h-dvh">
        <Header state={state} conn={conn} changedAt={changedAt} theme={theme} setTheme={setTheme} tab={tab} setTab={setTab} badges={badges} onLead={() => openAgent('lead')} />

        <main className={cn('mx-auto max-w-5xl px-3 pt-4 sm:px-5', tab === 'agents' ? 'pb-3' : 'pb-10')}>
          {problem && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-st-rework/40 bg-st-rework/8 px-3.5 py-2.5 text-[12.5px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-st-rework" />
              <div><span className="font-medium">The server could not read the crew's state.</span> <span className="text-muted-foreground">{problem}</span></div>
            </div>
          )}
          {conn === 'offline' && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border bg-muted/50 px-3.5 py-2.5 text-[12.5px]">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-medium">The dashboard server is not answering.</span>{' '}
                <span className="text-muted-foreground">Showing the last state received. Run <code className="font-mono">.crew/bin/crew dashboard start</code> to start it; this page reconnects by itself.</span>
              </div>
            </div>
          )}

          {!state ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              Connecting to the crew…
            </div>
          ) : (
            <div key={tab} className="animate-in fade-in-0 duration-200">
              {tab === 'overview' && <Overview state={state} goTab={setTab} onTask={setTaskId} onDoc={setDoc} onAgent={openAgent} />}
              {tab === 'agents' && <Agents state={state} sel={agent} pick={pickAgent} onTask={setTaskId} />}
              {tab === 'tasks' && <Tasks state={state} onTask={setTaskId} onDoc={setDoc} />}
              {tab === 'timing' && <Timing state={state} dark={dark} onTask={setTaskId} goTab={setTab} />}
              {tab === 'queue' && <Queue state={state} />}
              {tab === 'defects' && <Defects state={state} onTask={setTaskId} />}
              {tab === 'compactions' && <Compactions state={state} dark={dark} />}
              {tab === 'journal' && <Journal state={state} />}
              {tab === 'sets' && <Sets state={state} onDoc={setDoc} />}
            </div>
          )}
        </main>

        {state && <TaskSheet state={state} taskId={taskId} onClose={() => setTaskId(null)} />}
        <DocSheet doc={doc} version={state?.generatedAt} onClose={() => setDoc(null)} />
        <EventToasts state={state} dark={dark} goTab={setTab} />
      </div>
    </ClockBase.Provider>
  )
}
