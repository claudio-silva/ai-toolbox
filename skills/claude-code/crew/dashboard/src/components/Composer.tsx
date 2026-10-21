// The box for writing to the lead: attach files (+), the lead's model and reasoning level (shown,
// not editable here), how full its context is before the next compaction, and send.

import { useRef, useState } from 'react'
import { ArrowUp, Brain, LoaderCircle, Paperclip, Plus, Sparkles, X } from 'lucide-react'
import type { LeadInfo } from '@/lib/types'
import { attachFile, modelName, sendToLead, VIA_LABEL } from '@/lib/lead'
import { capital, kTokens } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// How full the context is, against where it compacts.
export function ContextRing({ used, lead }: { used: number | null; lead: LeadInfo }) {
  const at = lead.compactAt
  const f = used != null && at > 0 ? Math.min(1, used / at) : 0
  const r = 7
  const c = 2 * Math.PI * r
  const tone = f >= 0.9 ? 'text-st-rework' : f >= 0.75 ? 'text-st-progress' : 'text-primary'
  const text = used == null
    ? 'Context size not known yet (it shows after the lead\'s next request).'
    : at
      ? `Context ${kTokens(used)} of about ${kTokens(at)}: it compacts about 33K below the ${kTokens(lead.window)} window.`
      : `Context ${kTokens(used)}.`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] text-muted-foreground tabular">
          <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90">
            <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.2" className="opacity-20" />
            <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              strokeDasharray={`${f * c} ${c}`} className={cn(tone, 'transition-[stroke-dasharray] duration-500')} />
          </svg>
          {used != null && at > 0 ? `${Math.round(f * 100)}%` : ''}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  )
}

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export function Composer({ lead, used, why }: { lead: LeadInfo; used: number | null; why: string | null }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ name: string; path: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const off = Boolean(why)
  const uploading = files.some((f) => !f.path)
  const canSend = !off && !busy && !uploading && (text.trim() !== '' || files.length > 0)

  const grow = () => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }

  const attach = (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      const item = { name: f.name, path: null as string | null }
      setFiles((fs) => [...fs, item])
      attachFile(f)
        .then((p) => setFiles((fs) => fs.map((x) => (x === item ? { ...x, path: p } : x))))
        .catch((e: Error) => {
          setFiles((fs) => fs.filter((x) => x !== item))
          setNote({ text: `Could not attach ${f.name}: ${e.message}`, error: true })
        })
    }
  }

  const send = async () => {
    if (!canSend) return
    setBusy(true)
    setNote(null)
    try {
      const r = await sendToLead(text.trim(), files.map((f) => f.path!))
      setText('')
      setFiles([])
      requestAnimationFrame(grow)
      setNote({ text: `Sent ${VIA_LABEL[r.via]}.` })
      setTimeout(() => setNote((n) => (n && !n.error ? null : n)), 4000)
    } catch (e) {
      setNote({ text: (e as Error).message, error: true })
    } finally {
      setBusy(false)
      area.current?.focus()
    }
  }

  return (
    <div className="px-3 pt-1 pb-3 sm:px-5">
      <div
        className={cn('rounded-2xl border bg-card shadow-xs transition-colors focus-within:border-ring/60', off && 'opacity-70')}
        onDragOver={(e) => { if (!off) e.preventDefault() }}
        onDrop={(e) => { if (off) return; e.preventDefault(); attach(e.dataTransfer.files) }}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex max-w-56 items-center gap-1 rounded-lg border bg-muted/50 py-0.5 pr-1 pl-2 text-[11.5px]">
                {f.path ? <Paperclip className="size-3 shrink-0" /> : <LoaderCircle className="size-3 shrink-0 animate-spin" />}
                <span className="truncate">{f.name}</span>
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          disabled={off}
          onChange={(e) => { setText(e.target.value); grow(); if (note?.error) setNote(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
          }}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); attach(e.clipboardData.files) } }}
          placeholder={off ? '' : 'Message the lead'}
          className="block max-h-60 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13.5px] outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={picker} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = '' }} />
          <button
            onClick={() => picker.current?.click()}
            disabled={off}
            title="Attach files"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none"
          >
            <Plus className="size-4.5" />
          </button>
          <span title="The lead's model (set where the session runs)" className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted-foreground">
            <Sparkles className="size-3.5" />{modelName(lead.model)}
          </span>
          {lead.effort && (
            <span title="The lead's reasoning level (set where the session runs)" className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted-foreground">
              <Brain className="size-3.5" />{capital(lead.effort)}
            </span>
          )}
          <span className="ml-auto" />
          <ContextRing used={used} lead={lead} />
          <button
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:opacity-35"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
      {(why || note) && (
        <p className={cn('mt-1.5 px-1 text-[11.5px]', note?.error ? 'text-st-rework' : 'text-muted-foreground')}>{note?.text ?? why}</p>
      )}
    </div>
  )
}
