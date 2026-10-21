// A newer Crew: a notice in the header when the server's daily check (or "Check now") finds one,
// and the version beside the project's name. Both open the same panel: what's new, and how to
// update.

import { useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowUpCircle, RefreshCw } from 'lucide-react'
import type { UpdateInfo } from '@/lib/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Mono } from '@/components/bits'
import { CopyButton } from './Share'
import { span } from '@/lib/format'
import { cn } from '@/lib/utils'

function Notes({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { gfm: true, async: false }) as string
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(raw), 'text/html')
    doc.querySelectorAll('a[href]').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer') })
    return doc.body.innerHTML
  }, [text])
  return <div className="prose-crew prose-tight" dangerouslySetInnerHTML={{ __html: html }} />
}

function Heading({ children }: { children: string }) {
  return <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h4>
}

function checkedText(u: UpdateInfo): string {
  if (!u.checkedAt) return 'Not checked yet'
  const secs = Date.now() / 1000 - u.checkedAt
  const ago = secs < 60 ? 'just now' : `${span(secs)} ago`
  return u.error ? `Last check failed (${ago}): ${u.error}` : `Checked ${ago}`
}

function UpdatePanel({ u }: { u: UpdateInfo }) {
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = asking || u.checking
  const check = () => {
    setAsking(true)
    setFailed(false)
    fetch('api/update/check', { method: 'POST', headers: { 'X-Crew': '1' } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)) })
      .catch(() => setFailed(true))
      .finally(() => setAsking(false))
  }
  const next = u.releases[0]
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="text-[14px] font-semibold">{next ? `Crew ${next.version} is available` : u.current ? `Crew ${u.current} is up to date` : 'Crew'}</div>
        <div className="text-[12px] text-muted-foreground">
          This project runs {u.current ? `Crew ${u.current}` : 'a version of Crew without release notes'}.
          {u.simulated && ' Simulated: the latest release counts as new.'}
        </div>
      </div>

      {next && (
        <>
          <section>
            <Heading>What's new</Heading>
            <div className="flex max-h-[38vh] flex-col gap-3 overflow-y-auto pr-1">
              {u.releases.map((r) => (
                <div key={r.version}>
                  <div className="text-[12.5px] font-semibold">{r.version} <span className="font-normal text-muted-foreground">· {r.date}</span></div>
                  <Notes text={r.body} />
                </div>
              ))}
            </div>
          </section>
          <section>
            <Heading>How to update</Heading>
            <ol className="flex list-decimal flex-col gap-2 pl-4 text-[12.5px]">
              <li>
                Update the skill, the way you installed it:
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {u.how.map((h) => (
                    <div key={h.via} className="flex items-center gap-2">
                      <Mono className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-[12px] select-all">{h.command}</Mono>
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">{h.via}</span>
                      <CopyButton text={h.command} />
                    </div>
                  ))}
                </div>
              </li>
              <li>In Claude Code, run <Mono>/crew setup</Mono> in each project that uses Crew. This dashboard then restarts by itself on the new version.</li>
              <li>Restart Claude Code if setup says the hooks changed.</li>
            </ol>
          </section>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-2.5 text-[11.5px] text-muted-foreground">
        <span className="min-w-0">
          {busy ? 'Checking…' : !u.enabled && !u.checkedAt ? 'The daily check is off (CREW_UPDATE_CHECK=0)' : checkedText(u)}
          {failed && ' · the dashboard did not answer'}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <a href={u.notes} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">All releases</a>
          <button
            onClick={check}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
            Check now
          </button>
        </div>
      </div>
    </div>
  )
}

const PANEL = 'w-[min(27rem,calc(100vw-1rem))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto'

// In the header, only when a newer release is out.
export function UpdateNotice({ u }: { u: UpdateInfo | undefined }) {
  if (!u?.available) return null
  const v = u.releases[0].version
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title={`Crew ${v} is available${u.simulated ? ' (simulated)' : ''}`}
          className="mr-0.5 inline-flex h-7 items-center gap-1 rounded-lg bg-st-progress/14 px-1.5 text-[12px] font-medium text-st-progress ring-1 ring-st-progress/30 ring-inset transition-colors hover:bg-st-progress/22 sm:mr-1 sm:h-8 sm:px-2"
        >
          <ArrowUpCircle className="size-4" />
          <span className="hidden sm:inline">Update</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={PANEL} onOpenAutoFocus={(e) => e.preventDefault()}><UpdatePanel u={u} /></PopoverContent>
    </Popover>
  )
}

// Beside the project's name: "crew 0.2.0", which opens the same panel (to check by hand).
export function VersionButton({ u }: { u: UpdateInfo | undefined }) {
  if (!u) return <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">crew</span>
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Crew's version, and updates"
          className="hidden rounded text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:inline"
        >
          crew{u.current ? ` ${u.current}` : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={PANEL} onOpenAutoFocus={(e) => e.preventDefault()}><UpdatePanel u={u} /></PopoverContent>
    </Popover>
  )
}
