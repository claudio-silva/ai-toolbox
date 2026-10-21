// Markdown from a string (release notes, an agent's messages), rendered with marked and
// sanitised with DOMPurify; links open in a new tab.

import { memo, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

export const MdText = memo(function MdText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { gfm: true, breaks: false, async: false }) as string
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(raw), 'text/html')
    doc.querySelectorAll('a[href]').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer') })
    return doc.body.innerHTML
  }, [text])
  return <div className={cn('prose-crew prose-tight', className)} dangerouslySetInnerHTML={{ __html: html }} />
})
