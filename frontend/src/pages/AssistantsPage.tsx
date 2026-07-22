import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  FileStack,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import WorkspaceSidebar from '@/components/WorkspaceSidebar'
import {
  agentsApi,
  filesApi,
  type Agent,
  type ResourceGroup,
} from '@/lib/api'
import {
  assistantCounts,
  assistantResourceIds,
  assistantTemplateName,
  filterAssistantItems,
  sortAssistantItems,
  type AssistantFilter,
  type AssistantLibraryItem,
} from '@/lib/assistantLibrary'
import { relativeActivityTime } from '@/lib/activity'
import { platform } from '@/lib/platform'

const FILTERS: Array<{ id: AssistantFilter; label: string }> = [
  { id: 'all', label: 'All assistants' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'knowledge', label: 'With knowledge' },
]

const PRESETS = [
  {
    id: 'reporting',
    label: 'Reporting & analysis',
    name: 'Reporting partner',
    instructions:
      'Help me turn business data and source documents into clear reports. Surface trends, exceptions, assumptions, and evidence gaps. Keep calculations traceable and make recommendations reviewable.',
  },
  {
    id: 'research',
    label: 'Research & synthesis',
    name: 'Research partner',
    instructions:
      'Compare the sources I provide, preserve disagreement, distinguish evidence from inference, and produce concise decision-ready synthesis with visible uncertainty and open questions.',
  },
  {
    id: 'projects',
    label: 'Project operations',
    name: 'Project operations partner',
    instructions:
      'Help me keep projects aligned by organizing progress, risks, decisions, actions, owners, and dates from the evidence I provide. Never invent missing commitments or status.',
  },
  {
    id: 'writing',
    label: 'Proposals & writing',
    name: 'Business writing partner',
    instructions:
      'Help me draft persuasive, audience-aware business documents grounded in approved source material. Flag unsupported claims, unconfirmed terms, and anything that requires human review.',
  },
] as const

function agentInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('') || 'WB'
}

interface CreateAssistantDialogProps {
  groups: ResourceGroup[]
  isSubmitting: boolean
  errorMessage: string | null
  onClose: () => void
  onCreate: (data: { name: string; instructions: string; groupIds: string[] }) => void
}

function CreateAssistantDialog({
  groups,
  isSubmitting,
  errorMessage,
  onClose,
  onCreate,
}: CreateAssistantDialogProps) {
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])

  const choosePreset = (preset: (typeof PRESETS)[number]) => {
    setName(preset.name)
    setInstructions(preset.instructions)
  }

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    )
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !instructions.trim()) return
    onCreate({ name: name.trim(), instructions: instructions.trim(), groupIds: selectedGroupIds })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#fbfaf8] shadow-2xl sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="create-assistant-title">
        <div className="flex items-start justify-between border-b border-stone-200 px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a711a]">Reusable specialist</p>
            <h2 id="create-assistant-title" className="mt-1 text-2xl font-bold tracking-[-0.03em] text-stone-900">Create an assistant</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">Describe the role in normal business language. You can refine advanced settings later.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700" aria-label="Close assistant setup"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-5 py-6 sm:px-7">
          <fieldset>
            <legend className="text-sm font-semibold text-stone-900">Start from a role</legend>
            <p className="mt-1 text-xs text-stone-500">Choose a starting point or write your own.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => choosePreset(preset)} className={`rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${name === preset.name ? 'border-[#c9a343] bg-[#fbf2dc] text-[#765719]' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'}`}>
                  {preset.label}
                  {name === preset.name && <Check size={15} className="ml-2 inline" />}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="assistant-name" className="text-sm font-semibold text-stone-900">Assistant name</label>
            <input id="assistant-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Revenue reporting partner" className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#b58a25] focus:ring-2 focus:ring-[#eadcb8]" />
          </div>

          <div>
            <label htmlFor="assistant-instructions" className="text-sm font-semibold text-stone-900">What should this assistant be great at?</label>
            <textarea id="assistant-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={5} placeholder="Describe the work, audience, standards, and boundaries that should stay consistent…" className="mt-2 w-full resize-y rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-[#b58a25] focus:ring-2 focus:ring-[#eadcb8]" />
            <p className="mt-2 text-xs text-stone-500">Keep consequential decisions, external actions, and final approval with the user.</p>
          </div>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-stone-900"><BookOpen size={16} /> Optional knowledge collections</legend>
            <p className="mt-1 text-xs text-stone-500">Connect files this assistant should be able to reuse. You still choose what each task sends.</p>
            {groups.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {groups.map((group) => (
                  <label key={group.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition ${selectedGroupIds.includes(group.id) ? 'border-[#c9a343] bg-[#fbf2dc]' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-stone-800">{group.name}</span><span className="mt-0.5 block text-xs text-stone-500">{group.file_count} {group.file_count === 1 ? 'file' : 'files'}</span></span>
                    <input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} className="h-4 w-4 rounded border-stone-300 text-[#9a711a] focus:ring-[#d8bc76]" />
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-4 text-sm text-stone-500">No collections yet. You can connect files later from the advanced workspace.</div>
            )}
          </fieldset>

          {errorMessage && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{errorMessage}</div>}

          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
            <button type="submit" disabled={!name.trim() || !instructions.trim() || isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#293438] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#162024] disabled:opacity-50">
              {isSubmitting ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isSubmitting ? 'Creating…' : 'Create assistant'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function AssistantsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [filter, setFilter] = useState<AssistantFilter>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const token = localStorage.getItem('access_token')

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await agentsApi.list({ limit: 1000 })).data,
    enabled: Boolean(token),
  })
  const groupsQuery = useQuery({
    queryKey: ['resource-groups'],
    queryFn: async () => (await filesApi.listResourceGroups()).data,
    enabled: Boolean(token),
  })

  const items = useMemo<AssistantLibraryItem[]>(
    () =>
      sortAssistantItems(
        (agentsQuery.data ?? []).map((agent) => ({ agent, templateName: assistantTemplateName(agent) }))
      ),
    [agentsQuery.data]
  )
  const counts = useMemo(() => assistantCounts(items), [items])
  const visibleItems = useMemo(
    () => filterAssistantItems(items, filter, search),
    [filter, items, search]
  )

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; instructions: string; groupIds: string[] }) => {
      const filesByGroup = await Promise.all(
        data.groupIds.map(async (groupId) => (await filesApi.listFilesByResourceGroup(groupId)).data)
      )
      const resourceIds = Array.from(new Set(filesByGroup.flatMap((files) => files.map((file) => file.id))))
      return (
        await agentsApi.createFromTemplate({
          template_id: 'blank-template',
          name: data.name,
          description: data.instructions,
          resource_ids: resourceIds,
        })
      ).data
    },
    onSuccess: async (agent) => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
      setCreateOpen(false)
      setCreateError(null)
      setSuccessMessage(`${agent.name} is ready to use.`)
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : 'The assistant could not be created.')
    },
  })

  const toggleAgent = async (agent: Agent) => {
    setUpdatingId(agent.id)
    setSuccessMessage(null)
    setActionError(null)
    try {
      await agentsApi.update(agent.id, { is_active: !agent.is_active })
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
      setSuccessMessage(`${agent.name} is now ${agent.is_active ? 'paused' : 'active'}.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The assistant status could not be changed.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f] lg:grid lg:grid-cols-[252px_1fr]">
      <WorkspaceSidebar active="assistants" mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#e5e2dc]/90 bg-[#f6f5f2]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-700 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
            <button type="button" onClick={() => navigate('/dashboard')} className="hidden items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900 sm:flex"><ArrowLeft size={16} /> Back to work</button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500"><span className="hidden sm:inline">{platform.isDesktop ? 'Local specialists' : 'Workspace specialists'}</span><span className="h-2 w-2 rounded-full bg-emerald-500" /></div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a711a]">Reusable specialists</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-stone-900 sm:text-4xl">Assistants</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">Create a consistent partner for recurring work, without rebuilding the instructions every time.</p>
            </div>
            <button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162024]"><Plus size={17} /> Create assistant</button>
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Assistant summary">
            {[
              { label: 'Active assistants', value: counts.active, icon: Bot, tone: 'bg-[#eaf2ef] text-[#316756]' },
              { label: 'Knowledge-connected', value: counts.knowledge, icon: FileStack, tone: 'bg-[#f0ece3] text-[#765719]' },
              { label: 'Paused', value: counts.paused, icon: Pause, tone: 'bg-[#eeeaf3] text-[#66557b]' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_28px_rgba(54,48,38,0.04)]"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div><div><p className="text-2xl font-bold tracking-tight text-stone-900">{value}</p><p className="text-xs font-medium text-stone-500">{label}</p></div></div>
            ))}
          </section>

          {successMessage && <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status"><span className="flex items-center gap-2"><Check size={16} />{successMessage}</span><button type="button" onClick={() => setSuccessMessage(null)} aria-label="Dismiss message"><X size={16} /></button></div>}
          {actionError && <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}

          <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_14px_40px_rgba(54,48,38,0.05)]">
            <div className="border-b border-stone-200 p-4 lg:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#f2f0eb] p-1">
                  {FILTERS.map(({ id, label }) => <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{label}<span className="ml-1.5 text-[10px] opacity-60">{counts[id]}</span></button>)}
                </div>
                <div className="relative w-full lg:w-80"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names, roles, or specialties" className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#b58a25] focus:ring-2 focus:ring-[#eadcb8]" /></div>
              </div>
            </div>

            {agentsQuery.isLoading ? (
              <div className="flex min-h-72 items-center justify-center text-sm text-stone-500"><LoaderCircle size={22} className="mr-2 animate-spin" />Loading assistants…</div>
            ) : agentsQuery.isError ? (
              <div className="px-6 py-16 text-center"><Bot size={28} className="mx-auto text-rose-500" /><h2 className="mt-4 text-base font-semibold text-stone-900">Assistants could not be loaded</h2><p className="mt-2 text-sm text-stone-500">Check the workspace connection and try again.</p><button type="button" onClick={() => void agentsQuery.refetch()} className="mt-5 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white">Try again</button></div>
            ) : visibleItems.length === 0 ? (
              <div className="px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0ece3] text-[#765719]"><BrainCircuit size={23} /></div><h2 className="mt-4 text-base font-semibold text-stone-900">{items.length ? 'No matching assistants' : 'Create a partner for work that repeats'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">{items.length ? 'Try a different search or filter.' : 'Common tasks work without setup. Create an assistant when you want the same role, standards, and knowledge available again and again.'}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => items.length ? (setFilter('all'), setSearch('')) : setCreateOpen(true)} className="rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white">{items.length ? 'Clear filters' : 'Create assistant'}</button>{!items.length && <button type="button" onClick={() => navigate('/dashboard')} className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700">Use a common task</button>}</div></div>
            ) : (
              <div className="grid md:grid-cols-2">
                {visibleItems.map(({ agent, templateName }) => {
                  const resourceCount = assistantResourceIds(agent).length
                  return (
                    <article key={agent.id} className="flex min-w-0 flex-col border-b border-stone-200 bg-white p-5 transition hover:bg-[#fbfaf7] md:odd:border-r lg:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${agent.is_active ? 'bg-[#eaf2ef] text-[#316756]' : 'bg-stone-100 text-stone-500'}`}>{agentInitials(agent.name)}</div><div className="min-w-0"><h2 className="truncate text-base font-semibold text-stone-900">{agent.name}</h2><div className="mt-1 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${agent.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-stone-100 text-stone-500'}`}>{agent.is_active ? 'Active' : 'Paused'}</span>{templateName && <span className="truncate text-xs text-stone-400">{templateName}</span>}</div></div></div>
                        <button type="button" onClick={() => void toggleAgent(agent)} disabled={updatingId === agent.id} className="rounded-lg border border-stone-200 bg-white p-2 text-stone-500 transition hover:border-stone-300 hover:text-stone-800 disabled:opacity-50" aria-label={agent.is_active ? `Pause ${agent.name}` : `Activate ${agent.name}`}>{updatingId === agent.id ? <LoaderCircle size={16} className="animate-spin" /> : agent.is_active ? <Pause size={16} /> : <Play size={16} />}</button>
                      </div>
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-600">{agent.description || 'A reusable WorkerBee specialist ready for your instructions.'}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400"><span className="flex items-center gap-1.5"><FileStack size={14} />{resourceCount} connected {resourceCount === 1 ? 'file' : 'files'}</span><span>Updated {relativeActivityTime(agent.updated_at)}</span></div>
                      <div className="mt-auto flex items-center gap-2 pt-5"><button type="button" onClick={() => navigate(`/dashboard?assistant=${encodeURIComponent(agent.id)}`)} disabled={!agent.is_active} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#162024] disabled:cursor-not-allowed disabled:opacity-40">Use assistant <ChevronRight size={15} /></button></div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <button type="button" onClick={() => navigate('/manage')} className="mx-auto mt-5 flex items-center gap-2 text-xs font-semibold text-stone-500 transition hover:text-stone-800">Open advanced assistant settings <ArrowUpRight size={14} /></button>
        </main>
      </div>

      {createOpen && <CreateAssistantDialog groups={groupsQuery.data ?? []} isSubmitting={createMutation.isPending} errorMessage={createError} onClose={() => { if (!createMutation.isPending) setCreateOpen(false) }} onCreate={(data) => createMutation.mutate(data)} />}
    </div>
  )
}
