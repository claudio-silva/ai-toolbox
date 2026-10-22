// A toast for every new journal line (an agent started or finished, a lead action, a system
// note), under the header for 10 seconds; several stack downwards, newest first. Lines
// already in the journal when the page loads are not toasted. A lead waiting for the founder
// gets one that stays (WaitingToasts).

import { useEffect, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { Pause, X } from 'lucide-react'
import type { JournalEntry, LeadInfo, State } from '@/lib/types'
import type { Tab } from '@/lib/persist'
import { JournalRow } from './JournalRow'

const SHOWN = 10000
const AT_ONCE = 6

function EventToast({ e, onOpen }: { e: JournalEntry; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      title="Open the journal"
      className="w-[min(calc(100vw-24px),400px)] rounded-xl border bg-popover/95 px-3 py-1 text-left text-popover-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-accent"
    >
      <JournalRow e={e} compact />
    </button>
  )
}

// A short notice in the same place (the result of a page action).
export function notify(text: string, error = false) {
  toast.custom(() => (
    <div className={`w-[min(calc(100vw-24px),400px)] rounded-xl border bg-popover/95 px-3 py-2 text-[12.5px] shadow-lg backdrop-blur-md ${error ? 'border-st-rework/50 text-st-rework' : 'text-popover-foreground'}`}>
      {text}
    </div>
  ), { duration: error ? 10000 : 5000 })
}

function WaitingToast({ l, many, onOpen, onClose }: { l: LeadInfo; many: boolean; onOpen: () => void; onClose: () => void }) {
  const where = many ? l.setTitle || l.label : null
  return (
    <div className="relative w-[min(calc(100vw-24px),400px)] rounded-xl border border-st-progress/40 bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-md">
      <button onClick={onOpen} className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 pr-11 text-left transition-colors hover:bg-accent">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-st-progress/15 text-st-progress">
          <Pause className="size-3" strokeWidth={2.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">The lead is waiting for you</span>
          <span className="block text-[11.5px] text-muted-foreground">
            {[where, l.state.since && `since ${l.state.since}`, 'open its conversation'].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

const CLOSED_KEY = 'crew-dashboard:waiting-closed'

// A toast for each lead waiting for the founder, until they close it, open the lead's
// conversation from it, or the lead stops waiting. A closed one comes back only when that lead
// waits again (a new `since`); the page remembers it across reloads.
export function WaitingToasts({ state, onLead }: { state: State | null; onLead: (session: string) => void }) {
  const shown = useRef(new Set<string>())
  const closed = useRef<Set<string> | null>(null)
  const open = useRef(onLead)
  open.current = onLead

  useEffect(() => {
    if (!state) return
    if (!closed.current) {
      try { closed.current = new Set(JSON.parse(sessionStorage.getItem(CLOSED_KEY) || '[]')) } catch { closed.current = new Set() }
    }
    const done = closed.current
    const save = () => { try { sessionStorage.setItem(CLOSED_KEY, JSON.stringify([...done])) } catch { /* private mode */ } }
    const leads = state.roster.leads
    const now = new Set<string>()
    for (const l of leads) {
      if (l.state.state !== 'waiting') continue
      const id = `waiting:${l.session}:${l.state.sinceEpoch ?? ''}`
      now.add(id)
      if (shown.current.has(id) || done.has(id)) continue
      shown.current.add(id)
      const close = () => toast.dismiss(id)
      toast.custom(() => <WaitingToast l={l} many={leads.length > 1} onOpen={() => { close(); open.current(l.session) }} onClose={close} />, {
        id,
        duration: Infinity,
        // Closed, swiped away, opened, or no longer waiting: not again for this wait.
        onDismiss: () => { shown.current.delete(id); done.add(id); save() },
      })
    }
    for (const id of [...shown.current]) if (!now.has(id)) toast.dismiss(id)
    for (const id of [...done]) if (!now.has(id)) done.delete(id)
    save()
  }, [state])

  return null
}

export function EventToasts({ state, dark, goTab }: { state: State | null; dark: boolean; goTab: (t: Tab) => void }) {
  const seen = useRef<number | null>(null)
  const go = useRef(goTab)
  go.current = goTab

  useEffect(() => {
    if (!state) return
    const total = state.journal.total
    const prev = seen.current
    seen.current = total
    if (prev == null || total <= prev) return
    const fresh = state.journal.entries.slice(-(total - prev))
    const shown = fresh.slice(-AT_ONCE)
    for (const e of shown) {
      toast.custom((id) => <EventToast e={e} onOpen={() => { go.current('journal'); toast.dismiss(id) }} />, { duration: SHOWN })
    }
    const more = fresh.length - shown.length
    if (more > 0) {
      toast.custom((id) => (
        <button
          onClick={() => { go.current('journal'); toast.dismiss(id) }}
          className="w-[min(calc(100vw-24px),400px)] rounded-xl border bg-popover/95 px-3 py-2 text-left text-[12.5px] text-muted-foreground shadow-lg backdrop-blur-md hover:bg-accent"
        >
          {more} earlier line{more === 1 ? '' : 's'} in the journal
        </button>
      ), { duration: SHOWN })
    }
  }, [state])

  return (
    <Toaster
      position="top-center"
      expand
      visibleToasts={AT_ONCE + 1}
      theme={dark ? 'dark' : 'light'}
      // Just under the header, so the tabs and the set switcher stay in reach.
      offset={{ top: 'calc(var(--header-h, 0px) + 8px)' }}
      mobileOffset={{ top: 'calc(var(--header-h, 0px) + 8px)', left: 12, right: 12 }}
      gap={6}
      toastOptions={{ unstyled: true, className: 'flex justify-center w-full' }}
    />
  )
}
