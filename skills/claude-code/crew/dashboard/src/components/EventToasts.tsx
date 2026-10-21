// A toast for every new journal line (an agent started or finished, a lead action, a system
// note), at the top of the page for 10 seconds; several stack downwards, newest first. Lines
// already in the journal when the page loads are not toasted.

import { useEffect, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import type { JournalEntry, State } from '@/lib/types'
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
      offset={{ top: 10 }}
      mobileOffset={{ top: 10, left: 12, right: 12 }}
      gap={6}
      toastOptions={{ unstyled: true, className: 'flex justify-center w-full' }}
    />
  )
}
