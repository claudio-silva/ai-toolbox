import { ExternalLink, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Markdown, fileUrl } from './Markdown'

export type Doc = { path: string; title: string; sub?: string }

// A project Markdown file (a task index, the handoff) in a side sheet.
export function DocSheet({ doc, version, onClose }: { doc: Doc | null; version?: number; onClose: () => void }) {
  return (
    <Sheet open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {doc && (
          <>
            <SheetHeader className="sticky top-0 z-10 border-b bg-background/90 px-5 pt-5 pb-4 backdrop-blur">
              <SheetClose className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="size-4" /><span className="sr-only">Close</span>
              </SheetClose>
              <SheetTitle className="pr-8 text-base leading-snug">{doc.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 font-mono text-[11.5px]">
                <span className="truncate">{doc.sub ?? doc.path.split('/').slice(-3).join('/')}</span>
                <a href={fileUrl(doc.path)} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Open the raw file">
                  <ExternalLink className="size-3.5" />
                </a>
              </SheetDescription>
            </SheetHeader>
            <div className="px-5 py-5">
              <Markdown path={doc.path} version={version} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
