// A lead's session controls: Stop or Resume, and Setup. Each one is a message to that lead, as
// if the founder typed the command where its session runs. Stop and Resume share a place: only
// the one that applies shows.

import { useState } from 'react'
import { LoaderCircle, RotateCcw, Square, Wrench } from 'lucide-react'
import type { LeadInfo } from '@/lib/types'
import { leadBlocker, sendToLead, VIA_LABEL } from '@/lib/lead'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { notify } from './EventToasts'

const SESSION_ACTIONS = {
  stop: {
    cmd: '/crew stop', label: 'Stop', title: 'Stop this lead', icon: Square,
    body: "Its running agents finish the edit or command in hand and report; nothing new starts. The lead records where each task stands in its set's handoff, and the computer may sleep again (once no other lead keeps it awake). Resume continues from there.",
  },
  resume: {
    cmd: '/crew resume', label: 'Resume', title: 'Resume this lead', icon: RotateCcw,
    body: 'The lead checks that nothing changed since the stop, then carries on with the work in flight: agents that stopped cleanly continue, the others are briefed afresh.',
  },
  setup: {
    cmd: '/crew setup', label: 'Setup', title: 'Run setup again', icon: Wrench,
    body: "Updates this project to the installed Crew: hooks, agents, the crew script and this dashboard. It merges, never overwrites, and asks only what the repository can't answer. Run it after each Crew update.",
  },
} as const
type SessionAction = (typeof SESSION_ACTIONS)[keyof typeof SESSION_ACTIONS]

// What an action does: the tooltip's text, and the confirmation's on a touch screen.
function ActionText({ a, why }: { a: SessionAction; why: string | null }) {
  return (
    <>
      <p className="font-medium">{a.title} <code className="font-mono font-normal opacity-70">{a.cmd}</code></p>
      <p className="mt-1 leading-snug opacity-85">{a.body}</p>
      <p className="mt-1.5 leading-snug opacity-60">{why ?? 'Sent to the lead as your message, like one typed in the Agents tab.'}</p>
    </>
  )
}

// With a mouse, a click sends the command and hovering explains it. A touch screen has no
// hover, so a tap shows the same text first, with Confirm and Cancel.
function SessionButton({ a, lead, why }: { a: SessionAction; lead: LeadInfo | null; why: string | null }) {
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const off = Boolean(why) || sending
  const send = () => {
    setConfirming(false)
    if (!lead) return
    setSending(true)
    sendToLead(lead.session, a.cmd)
      .then((r) => notify(`Sent ${a.cmd} to the lead ${VIA_LABEL[r.via]}.`))
      .catch((e: Error) => notify(`${a.cmd} not sent: ${e.message}`, true))
      .finally(() => setSending(false))
  }
  const click = () => {
    if (matchMedia('(hover: none)').matches) { if (!sending) setConfirming(true); return }
    if (!off) send()
  }
  const Icon = sending ? LoaderCircle : a.icon
  return (
    <>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          {/* aria-disabled, not disabled: a disabled button gets no hover, and the tooltip says why. */}
          <Button
            variant="outline"
            size="sm"
            onClick={click}
            aria-disabled={off || undefined}
            aria-label={`${a.title} (${a.cmd})`}
            className={cn('h-7 gap-1.5 px-2.5 text-[12px] has-[>svg]:px-2.5', off && 'cursor-not-allowed opacity-50 hover:bg-background')}
          >
            <Icon className={cn('size-3.5', sending && 'animate-spin')} />{a.label}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" sideOffset={6} className="max-w-80 text-left text-pretty">
          <ActionText a={a} why={why} />
        </TooltipContent>
      </Tooltip>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false} className="max-w-sm gap-5 p-5">
          <DialogTitle className="sr-only">{a.title}</DialogTitle>
          <DialogDescription asChild><div className="text-[13px] text-foreground"><ActionText a={a} why={why} /></div></DialogDescription>
          <DialogFooter className="flex-row justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">{why ? 'Close' : 'Cancel'}</Button></DialogClose>
            {!why && <Button size="sm" onClick={send}><a.icon className="size-3.5" />{a.title}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LeadActions({ lead, className }: { lead: LeadInfo | null; className?: string }) {
  const why = leadBlocker(lead)
  const stopped = lead?.state.state === 'stopped'
  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)}>
      <SessionButton a={stopped ? SESSION_ACTIONS.resume : SESSION_ACTIONS.stop} lead={lead} why={why} />
      <SessionButton a={SESSION_ACTIONS.setup} lead={lead} why={why} />
    </div>
  )
}
