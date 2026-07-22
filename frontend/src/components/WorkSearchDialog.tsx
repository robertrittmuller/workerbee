import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Command,
  FileOutput,
  FileText,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { searchWorkItems, type WorkSearchItem } from '@/lib/workSearch'

type Props = {
  open: boolean
  items: WorkSearchItem[]
  loading?: boolean
  onClose: () => void
  onChoose: (item: WorkSearchItem) => void
}

const GROUPS: { kind: WorkSearchItem['kind']; label: string; emptyLimit: number }[] = [
  { kind: 'thread', label: 'Recent work', emptyLimit: 4 },
  { kind: 'output', label: 'Deliverables', emptyLimit: 4 },
  { kind: 'source', label: 'Source files', emptyLimit: 4 },
  { kind: 'workflow', label: 'Start a task', emptyLimit: 6 },
]

function ResultIcon({ kind }: { kind: WorkSearchItem['kind'] }) {
  if (kind === 'thread') return <Bot size={18} />
  if (kind === 'output') return <FileOutput size={18} />
  if (kind === 'source') return <FileText size={18} />
  return <Sparkles size={18} />
}

function iconClasses(kind: WorkSearchItem['kind']): string {
  if (kind === 'thread') return 'bg-amber-50 text-amber-800'
  if (kind === 'output') return 'bg-emerald-50 text-emerald-700'
  if (kind === 'source') return 'bg-sky-50 text-sky-700'
  return 'bg-violet-50 text-violet-700'
}

export default function WorkSearchDialog({ open, items, loading = false, onClose, onChoose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef(new Map<string, HTMLButtonElement>())

  const groups = useMemo(() => {
    const matches = searchWorkItems(items, query)
    return GROUPS.map((group) => ({
      ...group,
      items: matches
        .filter((item) => item.kind === group.kind)
        .slice(0, query.trim() ? 8 : group.emptyLimit),
    })).filter((group) => group.items.length > 0)
  }, [items, query])

  const visibleItems = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = visibleItems[activeIndex]
    if (active) resultRefs.current.get(active.id)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, visibleItems])

  if (!open) return null

  const choose = (item: WorkSearchItem) => {
    onChoose(item)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-stone-950/45 px-3 pt-[8vh] backdrop-blur-sm sm:px-5 sm:pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-search-title"
        className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_30px_100px_rgba(20,18,14,0.28)]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => visibleItems.length ? (index + 1) % visibleItems.length : 0)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => visibleItems.length ? (index - 1 + visibleItems.length) % visibleItems.length : 0)
          } else if (event.key === 'Enter' && visibleItems[activeIndex]) {
            event.preventDefault()
            choose(visibleItems[activeIndex])
          }
        }}
      >
        <h2 id="work-search-title" className="sr-only">Search WorkerBee</h2>
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3.5 sm:px-5">
          <Search size={20} className="shrink-0 text-[#8b6928]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search work, source files, or start something new…"
            aria-label="Search tasks, files, deliverables, and workflows"
            aria-controls="work-search-results"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:ring-0"
          />
          {query && <button type="button" onClick={() => setQuery('')} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Clear search"><X size={16} /></button>}
          <button type="button" onClick={onClose} className="hidden rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-semibold text-stone-500 sm:block">Esc</button>
        </div>

        <div id="work-search-results" role="listbox" aria-label="Search results" className="max-h-[62vh] overflow-y-auto px-2 py-3 sm:max-h-[56vh] sm:px-3">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-stone-500"><LoaderCircle size={17} className="animate-spin" />Searching your workspace…</div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-400"><Search size={20} /></span>
              <p className="mt-4 text-sm font-semibold text-stone-800">No matching work</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">Try a filename, task name, business outcome, or workflow such as “meeting” or “report.”</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="mb-3 last:mb-0">
                <p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{group.label}</p>
                <div>
                  {group.items.map((item) => {
                    const itemIndex = visibleItems.findIndex((candidate) => candidate.id === item.id)
                    const active = itemIndex === activeIndex
                    return (
                      <button
                        key={item.id}
                        ref={(element) => {
                          if (element) resultRefs.current.set(item.id, element)
                          else resultRefs.current.delete(item.id)
                        }}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => choose(item)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-[#f3eee4]' : 'hover:bg-stone-50'}`}
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconClasses(item.kind)}`}><ResultIcon kind={item.kind} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-stone-900">{item.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-stone-500">{item.description}</span>
                        </span>
                        <span className="hidden max-w-[160px] shrink-0 truncate text-[10px] font-medium text-stone-400 sm:block">{item.meta}</span>
                        <ArrowRight size={15} className={`shrink-0 ${active ? 'text-[#8b6928]' : 'text-stone-300'}`} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-4 py-3 text-[10px] text-stone-500 sm:px-5">
          <span>{visibleItems.length} {visibleItems.length === 1 ? 'result' : 'results'} shown</span>
          <span className="hidden items-center gap-3 sm:flex"><span>↑↓ Navigate</span><span>↵ Open</span><span className="inline-flex items-center gap-1"><Command size={11} />K Search</span></span>
        </div>
      </section>
    </div>
  )
}
