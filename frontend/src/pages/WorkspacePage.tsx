import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileOutput,
  FileSearch,
  FileSignature,
  FileSpreadsheet,
  FolderOpen,
  LoaderCircle,
  ListFilter,
  LineChart,
  Menu,
  MessageSquareText,
  NotebookPen,
  Paperclip,
  Plus,
  Presentation,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  Execution,
  RecentOutputFile,
  TaskThread,
  agentsApi,
  authApi,
  executionsApi,
  filesApi,
  getAgentResourceIds,
  outputsApi,
  taskThreadsApi,
} from '@/lib/api'
import { deliverFile } from '@/lib/fileDelivery'
import {
  FIRST_TASK_OUTCOMES,
  getFirstTaskOutcome,
  type FirstTaskOutcomeId,
} from '@/lib/firstTaskGuide'
import { platform } from '@/lib/platform'
import {
  MAX_LIBRARY_TASK_SOURCES,
  attachedSourceCount,
  librarySourceSearch,
  taskResourceIds,
  uniqueLibrarySourceIds,
} from '@/lib/libraryHandoff'
import {
  loadDataControls,
  saveDataControls,
  shouldReviewBeforeSending,
  type DataControls,
} from '@/lib/dataControls'
import WorkPackDialog from '@/components/WorkPackDialog'
import DataSharingReviewDialog from '@/components/DataSharingReviewDialog'
import WorkSearchDialog from '@/components/WorkSearchDialog'
import WorkspaceSidebar from '@/components/WorkspaceSidebar'
import { buildWorkSearchItems, type WorkSearchItem } from '@/lib/workSearch'
import {
  DEFAULT_WORK_PACK,
  WORK_PACKS,
  buildWorkPackPrompt,
  getWorkPack,
  validateWorkPack,
  workPackAnswerSummary,
  type WorkPackAnswers,
  type WorkPackDefinition,
} from '@/lib/workPacks'

const PACK_ICONS = {
  summary: FileSearch,
  table: FileSpreadsheet,
  cleanup: ListFilter,
  reporting: LineChart,
  project: ClipboardList,
  research: FileSearch,
  proposal: FileSignature,
  dashboard: BarChart3,
  presentation: Presentation,
  meeting: CalendarCheck2,
  followup: ClipboardCheck,
  memo: NotebookPen,
  request: WandSparkles,
}

const FIRST_TASK_ICONS = {
  understand: FileSearch,
  data: BarChart3,
  'move-work': ClipboardList,
  decide: FileSignature,
}

const WORK_PACK_GROUPS = [
  {
    title: 'Data & reporting',
    description: 'Structure, clean, and explain business data.',
    ids: ['data-extractor-csv', 'spreadsheet-cleanup', 'recurring-reporting', 'html5-dashboard-generator'],
    grid: 'lg:grid-cols-2 xl:grid-cols-4',
  },
  {
    title: 'Briefs & decisions',
    description: 'Turn evidence into concise work people can review and share.',
    ids: ['document-summarization', 'proposal-creation', 'presentation-creation', 'decision-memo'],
    grid: 'lg:grid-cols-2 xl:grid-cols-4',
  },
  {
    title: 'Research & analysis',
    description: 'Compare evidence, preserve disagreement, and make uncertainty visible.',
    ids: ['research-synthesis'],
    grid: 'lg:grid-cols-2',
  },
  {
    title: 'Projects & operations',
    description: 'Keep delivery, risks, decisions, and accountability aligned.',
    ids: ['project-status-reporting'],
    grid: 'lg:grid-cols-2',
  },
  {
    title: 'Meetings',
    description: 'Prepare the room and turn the conversation into accountable follow-through.',
    ids: ['meeting-preparation', 'meeting-follow-up'],
    grid: 'lg:grid-cols-2',
  },
] as const

function executionTime(execution: Execution): number {
  const timestamp = execution.started_at ?? execution.completed_at
  return timestamp ? Date.parse(timestamp) || 0 : 0
}

function relativeTime(timestamp: string | null): string {
  if (!timestamp) return 'Recently'
  const milliseconds = Date.now() - Date.parse(timestamp)
  if (!Number.isFinite(milliseconds)) return 'Recently'
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function statusLabel(status: Execution['status']): string {
  if (status === 'completed') return 'Ready'
  if (status === 'running') return 'Working'
  if (status === 'pending') return 'Starting'
  if (status === 'cancelled') return 'Stopped'
  return 'Needs attention'
}

function statusClasses(status: Execution['status']): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'running' || status === 'pending') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-200'
  return 'bg-stone-100 text-stone-600 border-stone-200'
}

function makeAgentName(task: WorkPackDefinition, prompt: string): string {
  const cleanPrompt = prompt.replace(/\s+/g, ' ').trim()
  const shortPrompt = cleanPrompt.length > 46 ? `${cleanPrompt.slice(0, 46).trim()}…` : cleanPrompt
  return shortPrompt || `${task.title} · ${new Date().toLocaleDateString()}`
}

function promisedDeliverables(task: WorkPackDefinition): string {
  if (task.outputs?.length) return task.outputs.map((output) => output.label).join(' · ')
  return task.outputFilename || 'Reviewable deliverable'
}

export default function WorkspacePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedTaskId, setSelectedTaskId] = useState('blank-template')
  const [workPackAnswers, setWorkPackAnswers] = useState<WorkPackAnswers>({})
  const [dialogPackId, setDialogPackId] = useState<string | null>(null)
  const [draftPackAnswers, setDraftPackAnswers] = useState<WorkPackAnswers>({})
  const [request, setRequest] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [fileDeliveryNotice, setFileDeliveryNotice] = useState<{ message: string; filePath?: string } | null>(null)
  const [firstTaskOutcomeId, setFirstTaskOutcomeId] = useState<FirstTaskOutcomeId | null>(null)
  const [showAllWorkPacks, setShowAllWorkPacks] = useState(false)
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [reviewEveryTask, setReviewEveryTask] = useState(true)
  const [dataControls, setDataControls] = useState<DataControls>(() => loadDataControls())

  const token = localStorage.getItem('access_token')

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await authApi.me()).data,
    enabled: Boolean(token),
  })

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await agentsApi.list({ limit: 1000 })).data,
    enabled: Boolean(token),
  })

  const executionsQuery = useQuery({
    queryKey: ['workspace-executions'],
    queryFn: async () => (await executionsApi.list()).data,
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const data = query.state.data as Execution[] | undefined
      return data?.some((item) => item.status === 'running' || item.status === 'pending') ? 4000 : false
    },
  })

  const taskThreadsQuery = useQuery({
    queryKey: ['task-threads'],
    queryFn: async () => (await taskThreadsApi.list({ limit: 100 })).data,
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const data = query.state.data as TaskThread[] | undefined
      return data?.some((item) => item.status === 'running' || item.status === 'pending') ? 4000 : false
    },
  })

  const outputsQuery = useQuery({
    queryKey: ['recent-output-files'],
    queryFn: async () => (await outputsApi.listRecentFiles({ limit: 100 })).data,
    enabled: Boolean(token),
  })

  const sourceFilesQuery = useQuery({
    queryKey: ['library-files'],
    queryFn: async () => (await filesApi.list()).data,
    enabled: Boolean(token),
  })

  const runtimeQuery = useQuery({
    queryKey: ['desktop-runtime'],
    queryFn: () => platform.getRuntimeStatus(),
    enabled: true,
    staleTime: Infinity,
  })

  const selectedTask = getWorkPack(selectedTaskId) ?? DEFAULT_WORK_PACK
  const dialogPack = dialogPackId ? getWorkPack(dialogPackId) : null
  const searchParamsValue = searchParams.toString()
  const requestedWorkflowId = new URLSearchParams(searchParamsValue).get('workflow')?.trim() ?? ''
  const requestedLibrarySourceIds = useMemo(
    () => uniqueLibrarySourceIds(new URLSearchParams(searchParamsValue).getAll('source')),
    [searchParamsValue]
  )
  const librarySourceOverflow = requestedLibrarySourceIds.length > MAX_LIBRARY_TASK_SOURCES
  const librarySourceIds = requestedLibrarySourceIds.slice(0, MAX_LIBRARY_TASK_SOURCES)
  const librarySourceQueries = useQueries({
    queries: librarySourceIds.map((sourceId) => ({
      queryKey: ['library-source-handoff', sourceId],
      queryFn: async () => (await filesApi.get(sourceId)).data,
      enabled: Boolean(token),
      retry: false,
    })),
  })
  const selectedLibrarySources = librarySourceQueries.flatMap((query) => query.data ? [query.data] : [])
  const unavailableLibrarySourceIds = librarySourceIds.filter((_, index) => librarySourceQueries[index]?.isError)
  const librarySourcesLoading = librarySourceQueries.some((query) => query.isLoading)
  const librarySourcesError = unavailableLibrarySourceIds.length > 0
  const selectedSourceCount = attachedSourceCount(files.length, selectedLibrarySources.map((file) => file.id))

  const agentById = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent])),
    [agentsQuery.data]
  )
  const assistantId = searchParams.get('assistant')
  const selectedAssistant = assistantId ? agentById.get(assistantId) ?? null : null
  const assistantResourcesQuery = useQuery({
    queryKey: ['agent-resources', assistantId],
    queryFn: async () => (await agentsApi.listResources(assistantId!)).data,
    enabled: Boolean(token && assistantId),
  })
  const sharingReviewFiles = useMemo(() => {
    const seenResourceIds = new Set<string>()
    const storedFiles = [
      ...(assistantResourcesQuery.data ?? []),
      ...selectedLibrarySources,
    ].filter((file) => {
      if (seenResourceIds.has(file.id)) return false
      seenResourceIds.add(file.id)
      return true
    })
    return [
      ...storedFiles.map((file) => ({ name: file.original_filename, size: file.file_size })),
      ...files,
    ]
  }, [assistantResourcesQuery.data, files, selectedLibrarySources])

  const recentWork = useMemo(() => {
    const latestByAgent = new Map<string, Execution>()
    const sorted = [...(executionsQuery.data ?? [])].sort((a, b) => executionTime(b) - executionTime(a))
    for (const execution of sorted) {
      if (execution.agent_id && !latestByAgent.has(execution.agent_id)) {
        latestByAgent.set(execution.agent_id, execution)
      }
    }
    return Array.from(latestByAgent.values()).slice(0, 4)
  }, [executionsQuery.data])

  const recentItems = useMemo(() => {
    const threads = taskThreadsQuery.data ?? []
    if (threads.length) {
      return threads.slice(0, 4).map((thread) => ({
        id: thread.id,
        executionId: thread.latest_execution_id,
        title: thread.title,
        description: thread.original_prompt,
        timestamp: thread.updated_at,
        status: thread.status,
        versionCount: thread.attempt_count,
      }))
    }
    return recentWork.map((execution) => {
      const agent = execution.agent_id ? agentById.get(execution.agent_id) : undefined
      return {
        id: execution.id,
        executionId: execution.id,
        title: agent?.name || 'WorkerBee task',
        description: agent?.description || 'Open the task to review its progress and outputs.',
        timestamp: execution.started_at ?? execution.completed_at,
        status: execution.status,
        versionCount: 0,
      }
    })
  }, [agentById, recentWork, taskThreadsQuery.data])

  const workSearchItems = useMemo(
    () => buildWorkSearchItems(
      taskThreadsQuery.data ?? [],
      outputsQuery.data ?? [],
      sourceFilesQuery.data ?? []
    ),
    [outputsQuery.data, sourceFilesQuery.data, taskThreadsQuery.data]
  )

  const activeCount = (executionsQuery.data ?? []).filter(
    (execution) => execution.status === 'running' || execution.status === 'pending'
  ).length

  const workspaceHistoryLoading =
    taskThreadsQuery.isLoading || executionsQuery.isLoading || outputsQuery.isLoading
  const isNewWorkspace =
    !workspaceHistoryLoading &&
    !taskThreadsQuery.isError &&
    !executionsQuery.isError &&
    !outputsQuery.isError &&
    (taskThreadsQuery.data?.length ?? 0) === 0 &&
    (executionsQuery.data?.length ?? 0) === 0 &&
    (outputsQuery.data?.length ?? 0) === 0
  const selectedFirstTaskOutcome = getFirstTaskOutcome(firstTaskOutcomeId)
  const showWorkPackCatalog = !workspaceHistoryLoading && (!isNewWorkspace || showAllWorkPacks)

  const firstName = meQuery.data?.full_name?.trim().split(/\s+/)[0] || 'there'

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [navigate, token])

  useEffect(() => {
    const refresh = () => setDataControls(loadDataControls())
    window.addEventListener('workerbee:data-controls-changed', refresh)
    return () => window.removeEventListener('workerbee:data-controls-changed', refresh)
  }, [])

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])

  useEffect(() => {
    if (!token || !requestedWorkflowId) return
    const requestedPack = WORK_PACKS.find((pack) => pack.id === requestedWorkflowId && pack.guided)
    if (!requestedPack) {
      const nextParams = new URLSearchParams(searchParamsValue)
      nextParams.delete('workflow')
      setSearchParams(nextParams, { replace: true })
      setErrorMessage('That guided task is no longer available. Choose another task below.')
      return
    }
    if (librarySourceIds.length > 0 && librarySourcesLoading) return

    const nextParams = new URLSearchParams(searchParamsValue)
    nextParams.delete('workflow')
    nextParams.delete('assistant')
    setSearchParams(nextParams, { replace: true })
    setDialogPackId(requestedPack.id)
    setDraftPackAnswers({ ...requestedPack.defaultAnswers })
    setErrorMessage(null)
  }, [
    librarySourceIds.length,
    librarySourcesLoading,
    requestedWorkflowId,
    searchParamsValue,
    setSearchParams,
    token,
  ])

  if (!token) return null

  const addFiles = (incoming: File[]) => {
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
      const unique = incoming.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`))
      return [...current, ...unique]
    })
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const clearAssistantSelection = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('assistant')
    setSearchParams(nextParams, { replace: true })
  }

  const chooseTask = (task: WorkPackDefinition) => {
    if (assistantId) clearAssistantSelection()
    if (task.guided) {
      setDialogPackId(task.id)
      setDraftPackAnswers(
        task.id === selectedTaskId && Object.keys(workPackAnswers).length
          ? { ...workPackAnswers }
          : { ...task.defaultAnswers }
      )
      setErrorMessage(null)
      return
    }
    setSelectedTaskId(task.id)
    setWorkPackAnswers({})
    if (!request.trim() || getWorkPack(selectedTaskId).guided) setRequest(task.placeholder)
  }

  const applyWorkPackSetup = () => {
    if (!dialogPack) return
    const validationErrors = validateWorkPack(dialogPack, draftPackAnswers, selectedSourceCount)
    if (validationErrors.length) return
    setSelectedTaskId(dialogPack.id)
    setWorkPackAnswers({ ...draftPackAnswers })
    setRequest(buildWorkPackPrompt(dialogPack, draftPackAnswers))
    setDialogPackId(null)
    setErrorMessage(null)
  }

  const chooseSearchItem = (item: WorkSearchItem) => {
    if (item.kind === 'workflow' && item.workPackId) {
      chooseTask(getWorkPack(item.workPackId))
      return
    }
    if (item.kind === 'source' && item.fileId) {
      navigate(`/library?preview=${encodeURIComponent(item.fileId)}`)
      return
    }
    if (item.executionId) navigate(`/work/${item.executionId}`)
  }

  const executeTask = async (prompt: string) => {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const uploadedResources = await Promise.all(
        files.map(async (file) => (await filesApi.upload(file)).data)
      )
      const taskName = makeAgentName(selectedTask, prompt)
      const uploadedResourceIds = uploadedResources.map((file) => file.id)
      const existingResourceIds = selectedAssistant ? getAgentResourceIds(selectedAssistant) : []
      const resourceIds = taskResourceIds(
        existingResourceIds,
        selectedLibrarySources.map((file) => file.id),
        uploadedResourceIds
      )
      const agent = selectedAssistant ?? (
        await agentsApi.createFromTemplate({
          template_id: selectedTask.id,
          name: taskName,
          description: `${selectedTask.title}: ${prompt}`,
          resource_ids: resourceIds,
          work_pack: selectedTask.guided
            ? { id: selectedTask.id, answers: workPackAnswers }
            : undefined,
        })
      ).data
      const execution = (
        await agentsApi.run(agent.id, {
          task_prompt: prompt,
          resource_ids: resourceIds,
          thread_title: taskName,
        })
      ).data

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['task-threads'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-executions'] }),
      ])

      navigate(`/work/${execution.id}`, {
        state: {
          prompt,
          taskTitle: selectedTask.title,
          agentId: agent.id,
          workPack: selectedTask.guided
            ? {
                id: selectedTask.id,
                title: selectedTask.title,
                outputFilename: selectedTask.outputFilename,
                outputType: selectedTask.outputType,
                outputs: selectedTask.outputs,
                qualityChecks: selectedTask.qualityChecks,
              }
            : null,
        },
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'WorkerBee could not start this task.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const prompt = request.trim()
    if (!prompt) {
      setErrorMessage('Tell WorkerBee what you would like to get done.')
      return
    }
    if (librarySourceOverflow) {
      setErrorMessage(`Choose no more than ${MAX_LIBRARY_TASK_SOURCES} library files for one task.`)
      return
    }
    if (librarySourcesError) {
      setErrorMessage('Remove the unavailable library files or return to Files & outputs and choose them again.')
      return
    }
    if (selectedAssistant && !selectedAssistant.is_active) {
      setErrorMessage('Activate this assistant before starting a task.')
      return
    }
    if (selectedTask.guided) {
      const validationErrors = validateWorkPack(selectedTask, workPackAnswers, selectedSourceCount)
      if (validationErrors.length) {
        setDraftPackAnswers(
          Object.keys(workPackAnswers).length ? { ...workPackAnswers } : { ...selectedTask.defaultAnswers }
        )
        setDialogPackId(selectedTask.id)
        setErrorMessage('Finish the guided setup before starting this task.')
        return
      }
    }
    if (shouldReviewBeforeSending(dataControls)) {
      setReviewEveryTask(dataControls.reviewBeforeSending)
      setIsReviewOpen(true)
      return
    }
    void executeTask(prompt)
  }

  const confirmAndStart = () => {
    const nextDataControls = saveDataControls({
      reviewBeforeSending: reviewEveryTask,
      externalProcessingAcknowledgedAt: new Date().toISOString(),
    })
    setDataControls(nextDataControls)
    setIsReviewOpen(false)
    void executeTask(request.trim())
  }

  const handleDownload = async (output: RecentOutputFile) => {
    setDownloadingId(output.id)
    setErrorMessage(null)
    setFileDeliveryNotice(null)
    try {
      const response = await outputsApi.downloadRecentFile(output.id)
      const result = await deliverFile(response.data as Blob, output.filename)
      if (result.method !== 'cancelled') {
        setFileDeliveryNotice({
          message: result.method === 'saved'
            ? `Saved “${output.filename}” to this computer.`
            : `Download started for “${output.filename}”.`,
          filePath: result.filePath,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : platform.isDesktop ? 'The file could not be saved.' : 'The file could not be downloaded.')
    } finally {
      setDownloadingId(null)
    }
  }

  const setLibrarySourceIds = (sourceIds: readonly string[]) => {
    setSearchParams(new URLSearchParams(librarySourceSearch(searchParamsValue, sourceIds)), { replace: true })
  }

  const removeLibrarySource = (sourceId: string) => {
    setLibrarySourceIds(requestedLibrarySourceIds.filter((id) => id !== sourceId))
  }

  const removeUnavailableLibrarySources = () => {
    setLibrarySourceIds(requestedLibrarySourceIds.filter((id) => !unavailableLibrarySourceIds.includes(id)))
  }

  const keepBoundedLibrarySources = () => {
    setLibrarySourceIds(requestedLibrarySourceIds.slice(0, MAX_LIBRARY_TASK_SOURCES))
  }

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f] lg:grid lg:grid-cols-[252px_1fr]">
      <WorkspaceSidebar
        active="home"
        mobileOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#e5e2dc]/90 bg-[#f6f5f2]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="rounded-xl border border-stone-200 bg-white p-2 text-stone-700 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="hidden items-center gap-2 rounded-xl border border-[#e3e0da] bg-white px-3 py-2 text-sm text-stone-500 shadow-sm transition hover:border-stone-300 hover:text-stone-700 sm:flex sm:w-64 xl:w-80"
              aria-label="Search tasks, files, deliverables, and workflows"
            >
              <Search size={16} />
              <span>Search your work</span>
              <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">⌘ K</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 sm:hidden"
              aria-label="Search tasks, files, deliverables, and workflows"
            >
              <Search size={17} />
            </button>
            {platform.isDesktop && (
              <span className="hidden items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:flex">
                <ShieldCheck size={13} />
                {runtimeQuery.data?.mode === 'local' ? 'Local workspace' : 'Desktop app'}
              </span>
            )}
            {activeCount > 0 && (
              <span className="hidden items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 sm:flex">
                <LoaderCircle size={13} className="animate-spin" />
                {activeCount} working
              </span>
            )}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#2f5c4a] text-sm font-semibold text-white"
              title={meQuery.data?.full_name || 'Your account'}
            >
              {(meQuery.data?.full_name || 'W').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-9 sm:px-8 lg:px-10 lg:pt-12">
          <section>
            <p className="text-sm font-medium text-stone-500">Welcome back, {firstName}</p>
            <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#25231f] sm:text-4xl">
                  {selectedAssistant ? `What should ${selectedAssistant.name} help you get done?` : 'What would you like to get done?'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                  {selectedAssistant
                    ? 'Describe the result you need. Connected knowledge and any files you add will be reviewed before the task starts.'
                    : 'Describe the result you need and add any source files. WorkerBee will organize the work.'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 size={15} />
                Ready to work
              </div>
            </div>

            {selectedAssistant && (
              <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#ded4be] bg-[#f8f4eb] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#765719] shadow-sm"><Bot size={19} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">Working with {selectedAssistant.name}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-stone-600">{selectedAssistant.description || 'Reusable specialist'} · {getAgentResourceIds(selectedAssistant).length} connected {getAgentResourceIds(selectedAssistant).length === 1 ? 'file' : 'files'}</p>
                  </div>
                </div>
                <button type="button" onClick={clearAssistantSelection} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#ded4be] bg-white px-3 py-2 text-xs font-semibold text-[#765719] hover:bg-[#fffdf9]">Change assistant <X size={13} /></button>
              </div>
            )}

            <form onSubmit={handleSubmit} className={selectedAssistant ? 'mt-4' : 'mt-7'}>
              <div
                className={`rounded-[22px] border bg-white p-3 shadow-[0_16px_45px_rgba(54,48,38,0.09)] transition sm:p-4 ${
                  isDragging ? 'border-amber-400 ring-4 ring-amber-100' : 'border-[#dedad2]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                {selectedTask.guided && Object.keys(workPackAnswers).length > 0 && (
                  <div className="mb-2 flex flex-col gap-3 rounded-2xl bg-[#f8f4eb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#765719]">
                        <SlidersHorizontal size={14} />
                        Guided setup ready
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {workPackAnswerSummary(selectedTask, workPackAnswers).map((summary) => (
                          <span key={summary} className="max-w-[220px] truncate rounded-lg bg-white px-2 py-1 text-[11px] text-stone-600 shadow-sm">
                            {summary}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => chooseTask(selectedTask)}
                      className="shrink-0 rounded-xl border border-[#ded4be] bg-white px-3 py-2 text-xs font-semibold text-[#765719] hover:bg-[#fffdf9]"
                    >
                      Edit setup
                    </button>
                  </div>
                )}
                <textarea
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder={selectedTask.placeholder}
                  className="min-h-[108px] w-full resize-none border-0 bg-transparent px-2 py-2 text-base leading-7 text-stone-900 placeholder:text-stone-400 focus:ring-0 sm:text-lg"
                  aria-label="Describe the result you need"
                />

                {(files.length > 0 || requestedLibrarySourceIds.length > 0) && (
                  <div className="mb-3 flex flex-wrap gap-2 px-1">
                    {librarySourcesLoading && (
                      <span className="inline-flex items-center gap-2 rounded-lg border border-[#dfd6c2] bg-[#faf7f0] px-2.5 py-1.5 text-xs text-stone-600">
                        <LoaderCircle size={13} className="animate-spin text-[#9a711a]" /> Attaching {librarySourceIds.length} library {librarySourceIds.length === 1 ? 'file' : 'files'}…
                      </span>
                    )}
                    {librarySourcesError && (
                      <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                        <Paperclip size={13} /> {unavailableLibrarySourceIds.length} library {unavailableLibrarySourceIds.length === 1 ? 'file is' : 'files are'} unavailable
                        <button type="button" onClick={removeUnavailableLibrarySources} className="rounded p-0.5 hover:bg-rose-100" aria-label="Remove unavailable library files"><X size={12} /></button>
                      </span>
                    )}
                    {librarySourceOverflow && (
                      <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                        <Paperclip size={13} /> The task limit is {MAX_LIBRARY_TASK_SOURCES} library files
                        <button type="button" onClick={keepBoundedLibrarySources} className="font-semibold underline underline-offset-2">Keep first {MAX_LIBRARY_TASK_SOURCES}</button>
                      </span>
                    )}
                    {selectedLibrarySources.map((source) => (
                      <span key={source.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[#dfd6c2] bg-[#faf7f0] px-2.5 py-1.5 text-xs text-stone-700">
                        <Paperclip size={13} className="shrink-0 text-[#9a711a]" />
                        <span className="max-w-[220px] truncate">{source.original_filename}</span>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#765719]">Library</span>
                        <span className="text-stone-400">{formatFileSize(source.file_size)}</span>
                        <button type="button" onClick={() => removeLibrarySource(source.id)} className="rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`Remove ${source.original_filename}`}><X size={12} /></button>
                      </span>
                    ))}
                    {files.map((file, index) => (
                      <span
                        key={`${file.name}-${file.lastModified}`}
                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700"
                      >
                        <Paperclip size={13} className="shrink-0 text-stone-400" />
                        <span className="max-w-[220px] truncate">{file.name}</span>
                        <span className="text-stone-400">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-stone-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
                    >
                      <Paperclip size={17} />
                      Add files
                    </button>
                    <span className="hidden h-5 w-px bg-stone-200 sm:block" />
                    <span className="rounded-lg bg-[#f4efe5] px-2.5 py-1.5 text-xs font-semibold text-[#765719]">
                      {selectedAssistant?.name || selectedTask.title}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || librarySourcesLoading || librarySourceOverflow}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}
                    {isSubmitting ? 'Preparing your workspace…' : 'Start task'}
                    {!isSubmitting && <ArrowRight size={16} />}
                  </button>
                </div>
              </div>
              {errorMessage && (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-stone-500">
                <span>
                  Your request{assistantResourcesQuery.data?.length ? `, ${assistantResourcesQuery.data.length} connected ${assistantResourcesQuery.data.length === 1 ? 'file' : 'files'}` : ''}{selectedSourceCount ? `, and ${selectedSourceCount} attached ${selectedSourceCount === 1 ? 'file' : 'files'}` : ''} will be processed by{' '}
                  <strong className="font-semibold text-stone-700">{runtimeQuery.data?.modelService || 'the selected model service'}</strong>.
                </span>
                <button type="button" onClick={() => navigate('/settings')} className="font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4">
                  Data controls
                </button>
              </div>
            </form>
          </section>

          {isNewWorkspace && (
            <section className="mt-10 overflow-hidden rounded-[28px] bg-[#263438] text-white shadow-[0_22px_60px_rgba(30,42,45,0.18)]" aria-labelledby="first-result-heading">
              <div className="border-b border-white/10 px-5 py-5 sm:px-7 lg:px-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f1cf77]">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f1cf77]/15"><Sparkles size={14} /></span>
                      Your first useful result
                    </div>
                    <h2 id="first-result-heading" className="mt-4 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">What kind of work is waiting?</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">Choose the outcome. WorkerBee will recommend a guided starting point and show exactly what it creates.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-white/55" aria-label="First task steps">
                    <span className="rounded-full bg-white px-3 py-1.5 text-[#263438]">1 · Choose</span>
                    <ArrowRight size={13} />
                    <span className="rounded-full border border-white/15 px-3 py-1.5">2 · Add files</span>
                    <ArrowRight size={13} />
                    <span className="rounded-full border border-white/15 px-3 py-1.5">3 · Review</span>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-7 lg:p-8">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {FIRST_TASK_OUTCOMES.map((outcome) => {
                    const Icon = FIRST_TASK_ICONS[outcome.id]
                    const selected = outcome.id === firstTaskOutcomeId
                    return (
                      <button
                        key={outcome.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setFirstTaskOutcomeId(outcome.id)}
                        className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-[#f1cf77] bg-[#f1cf77] text-[#263438] shadow-lg' : 'border-white/10 bg-white/[0.06] text-white hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1]'}`}
                      >
                        <span className={`grid h-9 w-9 place-items-center rounded-xl ${selected ? 'bg-white/65 text-[#765719]' : 'bg-white/10 text-[#f1cf77]'}`}><Icon size={17} /></span>
                        <span className="mt-4 block text-sm font-semibold">{outcome.label}</span>
                        <span className={`mt-1.5 block text-xs leading-5 ${selected ? 'text-[#4d493f]' : 'text-white/55'}`}>{outcome.description}</span>
                      </button>
                    )
                  })}
                </div>

                {selectedFirstTaskOutcome ? (
                  <div className="mt-6 rounded-2xl bg-[#f7f5ef] p-4 text-[#25231f] sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a711a]">Recommended starting points</p>
                        <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em]">{selectedFirstTaskOutcome.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-stone-500">{selectedFirstTaskOutcome.reassurance}</p>
                      </div>
                      <button type="button" onClick={() => setFirstTaskOutcomeId(null)} className="self-start text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4 sm:self-auto">Choose a different outcome</button>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      {selectedFirstTaskOutcome.workPackIds.map((taskId, index) => {
                        const task = getWorkPack(taskId)
                        const Icon = PACK_ICONS[task.icon]
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => chooseTask(task)}
                            className={`group rounded-2xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#c7a85e] hover:shadow-md ${index === 0 ? 'border-[#d4b365] ring-2 ring-[#ead9ae]' : 'border-stone-200'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className={`grid h-9 w-9 place-items-center rounded-xl ${task.accent}`}><Icon size={17} /></span>
                              {index === 0 && <span className="rounded-full bg-[#f4ead1] px-2.5 py-1 text-[10px] font-bold text-[#765719]">Best first step</span>}
                            </div>
                            <h4 className="mt-4 text-sm font-semibold">{task.title}</h4>
                            <p className="mt-1.5 text-xs leading-5 text-stone-500">{task.description}</p>
                            <div className="mt-4 border-t border-stone-100 pt-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-stone-400">Creates</p>
                              <p className="mt-1 text-[11px] leading-4 text-stone-600">{promisedDeliverables(task)}</p>
                              <p className="mt-2 text-[11px] font-semibold text-[#765719]">Set up in {task.setupTime.replace('About ', '').toLowerCase()} <ArrowRight size={12} className="ml-1 inline" /></p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-white/60">
                    <ShieldCheck size={17} className="shrink-0 text-[#f1cf77]" />
                    Every recommended workflow shows its required files, promised deliverables, and review checks before work starts.
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-white/50">Already know what you need? The request box above remains the fastest path.</p>
                  <button type="button" onClick={() => setShowAllWorkPacks((current) => !current)} className="inline-flex items-center gap-2 self-start rounded-xl border border-white/15 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:self-auto">
                    {showAllWorkPacks ? 'Hide full task catalog' : 'Browse all 12 guided tasks'}
                    <ChevronRight size={14} className={showAllWorkPacks ? 'rotate-90' : ''} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {showWorkPackCatalog && <section className="mt-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em]">Start with a common task</h2>
                <p className="mt-1 text-sm text-stone-500">Strong defaults, ready for your files and instructions.</p>
              </div>
            </div>
            <div className="mt-5 space-y-7">
              {WORK_PACK_GROUPS.map((group) => (
                <section key={group.title}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-600">{group.title}</h3>
                    <p className="text-xs text-stone-400">{group.description}</p>
                  </div>
                  <div className={`mt-3 grid gap-3 sm:grid-cols-2 ${group.grid}`}>
                    {group.ids.map((taskId) => getWorkPack(taskId)).map((task) => {
                      const Icon = PACK_ICONS[task.icon]
                      const selected = task.id === selectedTaskId
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => chooseTask(task)}
                          className={`group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md ${
                            selected ? 'border-[#b88a32] ring-2 ring-[#e8d6aa]' : 'border-[#e3e0da]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className={`grid h-10 w-10 place-items-center rounded-xl ${task.accent}`}>
                              <Icon size={19} />
                            </span>
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-500">Guided</span>
                          </div>
                          <h4 className="mt-5 text-sm font-semibold text-stone-900">{task.title}</h4>
                          <p className="mt-2 text-xs leading-5 text-stone-500">{task.description}</p>
                          <p className="mt-4 text-[11px] font-medium text-stone-400">{task.setupTime}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>}

          <div className="mt-11 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <section>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">Recent work</h2>
                  <p className="mt-1 text-sm text-stone-500">Pick up where you left off.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/manage')}
                  className="text-sm font-semibold text-[#765719] hover:text-[#4c370f]"
                >
                  View assistants
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-[#e3e0da] bg-white shadow-sm">
                {(taskThreadsQuery.isLoading || (taskThreadsQuery.data?.length === 0 && executionsQuery.isLoading)) && (
                  <div className="flex items-center gap-3 px-5 py-8 text-sm text-stone-500">
                    <LoaderCircle size={17} className="animate-spin" />
                    Loading your work…
                  </div>
                )}
                {!taskThreadsQuery.isLoading && !executionsQuery.isLoading && recentItems.length === 0 && (
                  <div className="px-6 py-10 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                      <MessageSquareText size={22} />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold">Your first task will appear here</h3>
                    <p className="mt-1 text-sm text-stone-500">Choose a task above or write your own request.</p>
                  </div>
                )}
                {recentItems.map((item, index) => {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.executionId && navigate(`/work/${item.executionId}`)}
                      disabled={!item.executionId}
                      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-stone-50 ${
                        index > 0 ? 'border-t border-stone-100' : ''
                      }`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4efe5] text-[#765719]">
                        <Bot size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-900">
                          {item.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-stone-500">
                          {item.description}
                        </span>
                      </span>
                      {item.versionCount > 1 && (
                        <span className="hidden rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-500 md:block">
                          {item.versionCount} versions
                        </span>
                      )}
                      <span className="hidden text-xs text-stone-400 sm:block">
                        {relativeTime(item.timestamp)}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      <ChevronRight size={17} className="shrink-0 text-stone-300" />
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">Latest outputs</h2>
                  <p className="mt-1 text-sm text-stone-500">Deliverables ready to use.</p>
                </div>
              </div>
              {fileDeliveryNotice && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 sm:flex-row sm:items-center sm:justify-between" role="status">
                  <span>{fileDeliveryNotice.message}</span>
                  {fileDeliveryNotice.filePath && (
                    <button type="button" onClick={() => void platform.revealLocalFile(fileDeliveryNotice.filePath!)} className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-semibold sm:self-auto">
                      <FolderOpen size={14} /> Show in folder
                    </button>
                  )}
                </div>
              )}
              <div className="mt-4 rounded-2xl border border-[#e3e0da] bg-white p-2 shadow-sm">
                {outputsQuery.isLoading && (
                  <div className="flex items-center gap-3 px-4 py-7 text-sm text-stone-500">
                    <LoaderCircle size={17} className="animate-spin" />
                    Finding outputs…
                  </div>
                )}
                {!outputsQuery.isLoading && (outputsQuery.data ?? []).length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <FileOutput size={24} className="mx-auto text-stone-300" />
                    <p className="mt-3 text-sm font-medium text-stone-700">No outputs yet</p>
                    <p className="mt-1 text-xs text-stone-500">Completed files will collect here.</p>
                  </div>
                )}
                {(outputsQuery.data ?? []).slice(0, 5).map((output) => (
                  <div key={output.id} className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-stone-50">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                      <FileOutput size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-stone-800">{output.filename}</p>
                      <p className="mt-1 truncate text-[11px] text-stone-400">
                        {output.agent_name || 'WorkerBee'}
                        {output.attempt_number ? ` · Version ${output.attempt_number}` : ''}
                        {' · '}{formatFileSize(output.file_size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownload(output)}
                      className="rounded-lg p-2 text-stone-400 opacity-70 transition hover:bg-white hover:text-stone-800 group-hover:opacity-100"
                      aria-label={`${platform.isDesktop ? 'Save a copy of' : 'Download'} ${output.filename}`}
                    >
                      {downloadingId === output.id ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-10 flex flex-col gap-4 rounded-2xl border border-[#dfd8ca] bg-[#eee8dd] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#765719] shadow-sm">
                <Plus size={20} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Need a reusable specialist?</h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  Save a role, standards, and knowledge for work you do repeatedly.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/assistants')}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#cfc4b0] bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm hover:border-[#b9aa90]"
            >
              View assistants
              <ArrowRight size={15} />
            </button>
          </section>
        </main>
      </div>

      {dialogPack?.guided && (
        <WorkPackDialog
          key={dialogPack.id}
          pack={dialogPack}
          answers={draftPackAnswers}
          files={files}
          libraryFiles={selectedLibrarySources.map((source) => ({ id: source.id, name: source.original_filename, size: source.file_size }))}
          onAnswersChange={setDraftPackAnswers}
          onChooseFiles={() => fileInputRef.current?.click()}
          onRemoveFile={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          onRemoveLibraryFile={(sourceId) => removeLibrarySource(sourceId)}
          onCancel={() => setDialogPackId(null)}
          onApply={applyWorkPackSetup}
        />
      )}

      <WorkSearchDialog
        open={isSearchOpen}
        items={workSearchItems}
        loading={taskThreadsQuery.isLoading || outputsQuery.isLoading || sourceFilesQuery.isLoading}
        onClose={() => setIsSearchOpen(false)}
        onChoose={chooseSearchItem}
      />

      {isReviewOpen && (
        <DataSharingReviewDialog
          request={request.trim()}
          files={sharingReviewFiles}
          destination={runtimeQuery.data?.modelService || 'Selected model service'}
          model={runtimeQuery.data?.model}
          reviewEveryTask={reviewEveryTask}
          onReviewEveryTaskChange={setReviewEveryTask}
          onClose={() => setIsReviewOpen(false)}
          onConfirm={confirmAndStart}
        />
      )}
    </div>
  )
}
