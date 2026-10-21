import { useState } from 'react'
import { encode } from 'uqr'
import { Check, Copy, QrCode } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Mono } from '@/components/bits'

// What the server says about reaching it from elsewhere: the URL with this computer's network
// address and the project's key, or why there is none.
type Share = { url: string | null; local: string; lan: boolean; address: string; port: number }

// The code as one SVG path, dark on white whatever the theme: cameras read that best.
function Qr({ text }: { text: string }) {
  const { data, size } = encode(text, { ecc: 'M', border: 3 })
  let d = ''
  data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z` }))
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code of the address below" className="block size-full rounded-xl bg-white">
      <path d={d} fill="#000" />
    </svg>
  )
}

// Copying needs a secure context: this computer's 127.0.0.1, not a phone on http://192.168…
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  if (!window.isSecureContext || !navigator.clipboard) return null
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => {})
  }
  return (
    <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium hover:bg-accent">
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function Body({ share }: { share: Share }) {
  if (share.url) {
    return (
      <>
        <div className="mx-auto aspect-square w-full max-w-[22rem]"><Qr text={share.url} /></div>
        <div className="flex items-start gap-2">
          <Mono className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 text-[12px] break-all select-all">{share.url}</Mono>
          <CopyButton text={share.url} />
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-muted-foreground">
          <li>Scan it with the camera of a phone or tablet on the same Wi-Fi as this computer, or on its Tailscale network.</li>
          <li>The address carries this project's key: whoever has it can read the dashboard. The page keeps the key, so later visits need only <Mono>http://{share.address}:{share.port}/</Mono>.</li>
          <li>The address follows the network: after moving to another one, open this again.</li>
        </ul>
      </>
    )
  }
  if (!share.lan) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This dashboard listens on this computer only (<Mono>CREW_DASHBOARD_LAN=0</Mono>). Without that setting, and after
        <Mono> .crew/bin/crew dashboard restart</Mono>, phones and tablets on the same network can open it.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
      <p>This computer has no address on a local network or a Tailscale network, so other devices cannot reach it directly.</p>
      <p>
        On a remote server, open it from your computer through an SSH tunnel: <Mono className="break-all">ssh -N -L {share.port}:127.0.0.1:{share.port} &lt;server&gt;</Mono>,
        then <Mono>http://127.0.0.1:{share.port}/</Mono>.
      </p>
    </div>
  )
}

export function ShareButton() {
  const [share, setShare] = useState<Share | null>(null)
  const [failed, setFailed] = useState(false)
  // Asked each time it opens: the address changes with the network.
  const load = (open: boolean) => {
    if (!open) return
    setFailed(false)
    fetch('api/share').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setShare, () => setFailed(true))
  }
  return (
    <Dialog onOpenChange={load}>
      <DialogTrigger asChild>
        <button
          title="Open on a phone or tablet"
          aria-label="Open on a phone or tablet"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-8"
        >
          <QrCode className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open on another device</DialogTitle>
          <DialogDescription className="sr-only">A QR code with this dashboard's address on the network.</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-[13px] text-muted-foreground">The server did not answer. Is it still running?</p>
        ) : share ? (
          <Body share={share} />
        ) : (
          <div className="mx-auto aspect-square w-full max-w-[22rem] animate-pulse rounded-xl bg-muted" />
        )}
      </DialogContent>
    </Dialog>
  )
}
