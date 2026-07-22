import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileOutput,
  LoaderCircle,
  Menu,
  Play,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import WorkspaceSidebar from '@/components/WorkspaceSidebar'
import { agentsApi, taskThreadsApi, type TaskThread } from '@/lib/api'
import {
  activityCounts,
  activityDateGroup,
  activityFilterForStatus,
  filterActivityItems,
  relativeActivityTime,
  type ActivityFilter,
  type ActivityItem,
} from '@/lib/activity'
import { WORK_PACKS } from '@/lib/workPacks'
import { platform } from '@/lib/platform'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All activity' },
  { id: 'active', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'stopped', label: 'Stopped' },
]

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']

function threadWorkflowName(thread: TaskThread): string | null {
  const id = thread.work_pack && typeof thread.work_pack.id === 'string' ? thread.work_pack.id : null
  if (!id) return null
  return WORK_PACKS.find((pack) => pack.id === id)?.title ?? null
}

function statusPresentation(thread: TaskThread) {
  if (thread.status === 'running') {
    return {
      label: 'Working',
      detail: 'WorkerBee is building your result now.',
      icon: LoaderCircle,
      iconClass: 'animate-spin',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (thread.status === 'pending') {
    return {
      label: 'Starting',
      detail: 'Your task is queued and preparing to run.',
      icon: Clock3,
      iconClass: '',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (thread.status === 'completed') {
    return {
      label: 'Ready',
      detail:
        thread.artifact_count > 0
          ? `${thread.artifact_count} ${thread.artifact_count === 1 ? 'deliverable' : 'deliverables'} ready to review.`
          : 'The task finished without a downloadable file.',
      icon: CheckCircle2,
      iconClass: '',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  if (thread.status === 'failed') {
    return {
      label: 'Needs attention',
      detail: 'Open the task to see what happened and try again.',
      icon: AlertTriangle,
      iconClass: '',
      tone: 'border-rose-200 bg-rose-50 text-rose-700',
    }
  }
  return {
    label: 'Stopped',
    detail: 'This task was stopped before it finished.',
    icon: Ban,
    iconClass: '',
    tone: 'border-stone-200 bg-stone-100 text-stone-600',
  }
}

export default function ActivityPage() {
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [search, setSearch] = useState('')
  const token = localStorage.getItem('access_token')

  const threadsQuery = useQuery({
    queryKey: ['task-threads'],
    queryFn: async () => (await taskThreadsApi.list({ limit: 100 })).data,
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const threads = query.state.data as TaskThread[] | undefined
      return threads?.some((thread) => thread.status === 'pending' || thread.status === 'running')
        ? 4000
        : false
    },
  })
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await agentsApi.list({ limit: 1000 })).data,
    enabled: Boolean(token),
  })

  const agentById = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent.name])),
    [agentsQuery.data]
  )
  const items = useMemo<ActivityItem[]>(
    () =>
      (threadsQuery.data ?? []).map((thread) => ({
        thread,
        agentName: thread.agent_id ? agentById.get(thread.agent_id) : null,
        workflowName: threadWorkflowName(thread),
      })),
    [agentById, threadsQuery.data]
  )
  const counts = useMemo(() => activityCounts(items), [items])
  const visibleItems = useMemo(
    () => filterActivityItems(items, filter, search),
    [filter, items, search]
  )
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ActivityItem[]>()
    for (const item of visibleItems) {
      const label = activityDateGroup(item.thread.updated_at)
      groups.set(label, [...(groups.get(label) ?? []), item])
    }
    return GROUP_ORDER.flatMap((label) => {
      const groupItems = groups.get(label)
      return groupItems?.length ? [{ label, items: groupItems }] : []
    })
  }, [visibleItems])
  const totalDeliverables = items.reduce((total, item) => total + item.thread.artifact_count, 0)

  const openThread = (thread: TaskThread) => {
    if (thread.latest_execution_id) navigate(`/work/${thread.latest_execution_id}`)
  }

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f] lg:grid lg:grid-cols-[252px_1fr]">
      <WorkspaceSidebar active="activity" mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#e5e2dc]/90 bg-[#f6f5f2]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-700 lg:hidden" aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <button type="button" onClick={() => navigate('/dashboard')} className="hidden items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900 sm:flex">
              <ArrowLeft size={16} /> Back to work
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <span className="hidden sm:inline">{platform.isDesktop ? 'Live local activity' : 'Workspace activity'}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a711a]">Work history</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-stone-900 sm:text-4xl">Activity</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">See what is running, review finished work, and recover anything that needs attention.</p>
            </div>
            <button type="button" onClick={() => void threadsQuery.refetch()} disabled={threadsQuery.isFetching} className="inline-flex w-fit items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 disabled:opacity-60">
              <RefreshCw size={16} className={threadsQuery.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Activity summary">
            {[
              { label: 'In progress', value: counts.active, icon: Play, tone: 'bg-amber-50 text-amber-700' },
              { label: 'Ready to review', value: counts.ready, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
              { label: 'Needs attention', value: counts.attention, icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700' },
              { label: 'Deliverables created', value: totalDeliverables, icon: FileOutput, tone: 'bg-[#eeeaf3] text-[#66557b]' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_28px_rgba(54,48,38,0.04)]">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div>
                <div><p className="text-2xl font-bold tracking-tight text-stone-900">{value}</p><p className="text-xs font-medium text-stone-500">{label}</p></div>
              </div>
            ))}
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_14px_40px_rgba(54,48,38,0.05)]">
            <div className="border-b border-stone-200 p-4 lg:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#f2f0eb] p-1">
                  {FILTERS.map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                      {label}<span className="ml-1.5 text-[10px] opacity-60">{counts[id]}</span>
                    </button>
                  ))}
                </div>
                <div className="relative w-full lg:w-80">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, requests, or assistants" className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#b58a25] focus:ring-2 focus:ring-[#eadcb8]" />
                </div>
              </div>
            </div>

            {threadsQuery.isLoading ? (
              <div className="flex min-h-72 items-center justify-center text-sm text-stone-500"><LoaderCircle size={22} className="mr-2 animate-spin" />Loading activity…</div>
            ) : threadsQuery.isError ? (
              <div className="px-6 py-16 text-center">
                <AlertTriangle size={28} className="mx-auto text-rose-500" />
                <h2 className="mt-4 text-base font-semibold text-stone-900">Activity could not be loaded</h2>
                <p className="mt-2 text-sm text-stone-500">Check the workspace connection and try again.</p>
                <button type="button" onClick={() => void threadsQuery.refetch()} className="mt-5 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
              </div>
            ) : groupedItems.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0ece3] text-[#765719]"><Sparkles size={22} /></div>
                <h2 className="mt-4 text-base font-semibold text-stone-900">{items.length ? 'No matching activity' : 'Your work history starts here'}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">{items.length ? 'Try a different search or status filter.' : 'Start a task and WorkerBee will keep its progress, results, and versions together.'}</p>
                <button type="button" onClick={() => items.length ? (setFilter('all'), setSearch('')) : navigate('/dashboard')} className="mt-5 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white">{items.length ? 'Clear filters' : 'Start new work'}</button>
              </div>
            ) : (
              <div className="divide-y-8 divide-[#f6f5f2]">
                {groupedItems.map((group) => (
                  <section key={group.label}>
                    <div className="flex items-center justify-between px-5 py-3 lg:px-6"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{group.label}</h2><span className="text-xs text-stone-400">{group.items.length}</span></div>
                    <div className="divide-y divide-stone-200 border-t border-stone-200">
                      {group.items.map(({ thread, agentName, workflowName }) => {
                        const status = statusPresentation(thread)
                        const StatusIcon = status.icon
                        const bucket = activityFilterForStatus(thread.status)
                        return (
                          <article key={thread.id} className="group grid gap-4 px-5 py-5 transition hover:bg-[#fbfaf7] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center lg:px-6">
                            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${status.tone}`}><StatusIcon size={19} className={status.iconClass} /></div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="max-w-full truncate text-sm font-semibold text-stone-900">{thread.title}</h3>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>{status.label}</span>
                              </div>
                              <p className="mt-1 line-clamp-1 text-sm text-stone-500">{thread.original_prompt}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
                                {workflowName && <><span>{workflowName}</span><span aria-hidden="true">·</span></>}
                                {agentName && <><span>{agentName}</span><span aria-hidden="true">·</span></>}
                                <span>{relativeActivityTime(thread.updated_at)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{thread.attempt_count} {thread.attempt_count === 1 ? 'version' : 'versions'}</span>
                              </div>
                              <p className={`mt-2 text-xs font-medium ${bucket === 'attention' ? 'text-rose-600' : 'text-stone-500'}`}>{status.detail}</p>
                            </div>
                            <button type="button" onClick={() => openThread(thread)} disabled={!thread.latest_execution_id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 transition hover:border-stone-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 sm:justify-center">
                              {bucket === 'ready' ? 'Review' : bucket === 'attention' || bucket === 'stopped' ? 'Open & recover' : 'Follow progress'}
                              <ChevronRight size={15} />
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <button type="button" onClick={() => navigate('/manage')} className="mx-auto mt-5 flex items-center gap-2 text-xs font-semibold text-stone-500 transition hover:text-stone-800">
            Open advanced execution details <ArrowUpRight size={14} />
          </button>
        </main>
      </div>
    </div>
  )
}
