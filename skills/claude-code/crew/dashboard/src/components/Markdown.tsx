// A Markdown file from the project (a task spec, an index, the handoff), fetched when shown,
// rendered with marked and sanitised with DOMPurify. Relative links and images resolve against
// the file's own directory, through the server's /files route.

import { useEffect, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { LoaderCircle } from 'lucide-react'

export function fileUrl(p: string): string {
  return `files?p=${encodeURIComponent(p)}`
}

function dirOf(p: string) {
  return p.replace(/\/[^/]*$/, '')
}

function resolve(base: string, rel: string): string {
  const parts = `${base}/${rel}`.split('/')
  const out: string[] = []
  for (const s of parts) {
    if (s === '..') out.pop()
    else if (s !== '.' && s !== '') out.push(s)
  }
  return `/${out.join('/')}`
}

export function Markdown({ path, version }: { path: string; version?: number }) {
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setErr(null)
    fetch(fileUrl(path))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((text) => {
        if (!live) return
        const raw = marked.parse(text, { gfm: true, async: false }) as string
        const doc = new DOMParser().parseFromString(DOMPurify.sanitize(raw), 'text/html')
        const base = dirOf(path)
        doc.querySelectorAll('img[src]').forEach((img) => {
          const src = img.getAttribute('src') || ''
          if (!/^[a-z]+:|^\//i.test(src)) img.setAttribute('src', fileUrl(resolve(base, decodeURI(src))))
        })
        doc.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href') || ''
          if (/^[a-z]+:/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer') }
          else if (!href.startsWith('#')) { a.setAttribute('href', fileUrl(resolve(base, decodeURI(href.split('#')[0])))); a.setAttribute('target', '_blank') }
        })
        setHtml(doc.body.innerHTML)
      })
      .catch((e: Error) => live && setErr(e.message))
    return () => { live = false }
  }, [path, version])

  if (err) return <p className="text-sm text-muted-foreground">Could not read {path.split('/').pop()}: {err}</p>
  if (html == null) return <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
  return <div className="prose-crew" dangerouslySetInnerHTML={{ __html: html }} />
}
