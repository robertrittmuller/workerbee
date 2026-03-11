import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { WorkerBeeBrand } from '@/components/WorkerBeeBrand'
import {
  Agent,
  Execution,
  FileResource,
  RecentOutputFile,
  agentsApi,
  executionsApi,
  outputsApi,
} from '@/lib/api'

type ActivityType = 'tool' | 'llm' | 'resource' | 'execution' | 'error' | 'system'
type ActivitySource = 'status' | 'transcript'
type ActivityRole = 'system' | 'user' | 'assistant' | 'tool' | 'other'

type AgentActivityLog = {
  id: string
  executionId: string
  executionStatus: string
  timestamp: string
  level: string
  message: string
  source: ActivitySource
  role?: ActivityRole
  data?: Record<string, unknown> | null
}

type QueuedCommand = {
  id: string
  prompt: string
  queuedAt: string
}

function getExecutionTimestamp(execution: Execution): number {
  const timestamp = execution.started_at ?? execution.completed_at
  if (!timestamp) {
    return 0
  }
  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? 0 : parsed
}

function isExecutionActive(status: Execution['status']): boolean {
  return status === 'pending' || status === 'running'
}

function isViewableOutput(output: RecentOutputFile): boolean {
  const filename = output.filename.toLowerCase()
  const contentType = output.content_type.toLowerCase()
  const outputType = output.output_type?.toLowerCase() ?? ''

  if (['markdown', 'text', 'json', 'csv'].includes(outputType)) {
    return true
  }

  if (contentType.startsWith('text/')) {
    return true
  }

  if (
    contentType === 'application/json' ||
    contentType.endsWith('+json') ||
    contentType === 'application/xml' ||
    contentType.endsWith('+xml') ||
    contentType === 'application/yaml' ||
    contentType === 'application/x-yaml'
  ) {
    return true
  }

  return (
    filename.endsWith('.md') ||
    filename.endsWith('.markdown') ||
    filename.endsWith('.txt') ||
    filename.endsWith('.json') ||
    filename.endsWith('.csv') ||
    filename.endsWith('.log') ||
    filename.endsWith('.yaml') ||
    filename.endsWith('.yml') ||
    filename.endsWith('.xml')
  )
}

function formatTime(timestamp: string): string {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return timestamp
  }
  return new Date(parsed).toLocaleString()
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const kib = bytes / 1024
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`
  }
  const mib = kib / 1024
  if (mib < 1024) {
    return `${mib.toFixed(1)} MB`
  }
  return `${(mib / 1024).toFixed(1)} GB`
}

function inferActivityType(activity: AgentActivityLog): ActivityType {
  if (activity.source === 'transcript') {
    if (activity.role === 'assistant') {
      return 'llm'
    }
    if (activity.role === 'tool') {
      return 'tool'
    }
    if (activity.role === 'user') {
      return 'execution'
    }
    if (activity.role === 'system') {
      return 'system'
    }
  }

  const payload = `${activity.message} ${JSON.stringify(activity.data ?? {})}`.toLowerCase()
  const level = activity.level.toLowerCase()

  if (level === 'error' || payload.includes('error') || payload.includes('fail')) {
    return 'error'
  }
  if (payload.includes('tool')) {
    return 'tool'
  }
  if (
    payload.includes('llm') ||
    payload.includes('model') ||
    payload.includes('prompt') ||
    payload.includes('completion')
  ) {
    return 'llm'
  }
  if (
    payload.includes('file') ||
    payload.includes('resource') ||
    payload.includes('upload') ||
    payload.includes('document') ||
    payload.includes('artifact')
  ) {
    return 'resource'
  }
  if (
    payload.includes('execution') ||
    payload.includes('run') ||
    payload.includes('queued') ||
    payload.includes('status')
  ) {
    return 'execution'
  }
  return 'system'
}

function getActivityBadgeClasses(type: ActivityType): string {
  const classes: Record<ActivityType, string> = {
    tool: 'text-sky-300 border border-sky-500/40 bg-sky-500/10',
    llm: 'text-amber-300 border border-amber-500/40 bg-amber-500/10',
    resource: 'text-emerald-300 border border-emerald-500/40 bg-emerald-500/10',
    execution: 'text-primary border border-primary/40 bg-primary/10',
    error: 'text-signal-red border border-signal-red/40 bg-signal-red/10',
    system: 'text-accent-tan border border-interface-border/70 bg-interface-border/20',
  }
  return classes[type]
}

function getStatusBadgeClasses(status: Execution['status']): string {
  if (status === 'completed') {
    return 'text-emerald-300 border border-emerald-500/40 bg-emerald-500/10'
  }
  if (status === 'running') {
    return 'text-sky-300 border border-sky-500/40 bg-sky-500/10'
  }
  if (status === 'failed') {
    return 'text-signal-red border border-signal-red/40 bg-signal-red/10'
  }
  if (status === 'cancelled') {
    return 'text-accent-tan border border-interface-border/70 bg-interface-border/20'
  }
  return 'text-amber-300 border border-amber-500/40 bg-amber-500/10'
}

function readErrorDetail(data?: Record<string, unknown> | null): string | null {
  const detail = data?.error
  if (typeof detail !== 'string') {
    return null
  }
  const trimmed = detail.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatQueuePreview(prompt: string): string {
  const trimmed = prompt.trim()
  if (trimmed.length <= 60) {
    return trimmed
  }
  return `${trimmed.slice(0, 57)}...`
}

function formatCollapsedPreview(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (compact.length <= 140) {
    return compact
  }
  return `${compact.slice(0, 137)}...`
}

function getActivityLabel(activity: AgentActivityLog, type: ActivityType): string {
  if (activity.source === 'transcript') {
    if (activity.role === 'assistant') {
      return 'assistant'
    }
    if (activity.role === 'user') {
      return 'user'
    }
    if (activity.role === 'system') {
      return 'system'
    }
    if (activity.role === 'tool') {
      return 'tool'
    }
    return 'message'
  }
  return type
}

export default function AgentRunPage() {
  const navigate = useNavigate()
  const { agentId } = useParams<{ agentId: string }>()
  const queryClient = useQueryClient()

  const [commandInput, setCommandInput] = useState('')
  const [queuedCommands, setQueuedCommands] = useState<QueuedCommand[]>([])
  const [isDispatchingQueuedCommand, setIsDispatchingQueuedCommand] = useState(false)
  const [isAwaitingExecutionRefresh, setIsAwaitingExecutionRefresh] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamLogs, setStreamLogs] = useState<AgentActivityLog[]>([])
  const [activityExpansionOverrides, setActivityExpansionOverrides] = useState<
    Record<string, boolean>
  >({})
  const [downloadingOutputId, setDownloadingOutputId] = useState<string | null>(null)
  const [viewerOutputFile, setViewerOutputFile] = useState<RecentOutputFile | null>(null)
  const [viewerOutputContent, setViewerOutputContent] = useState('')
  const [viewerOutputError, setViewerOutputError] = useState<string | null>(null)
  const [isViewerOutputLoading, setIsViewerOutputLoading] = useState(false)
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)

  const token = localStorage.getItem('access_token')
  const streamSourceRef = useRef<EventSource | null>(null)
  const streamExecutionIdRef = useRef<string | null>(null)
  const activityScrollRef = useRef<HTMLDivElement | null>(null)
  const runDispatchBufferTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    if (!agentId) {
      navigate('/dashboard')
    }
  }, [agentId, navigate, token])

  useEffect(() => {
    return () => {
      if (streamSourceRef.current) {
        streamSourceRef.current.close()
        streamSourceRef.current = null
      }
      if (runDispatchBufferTimerRef.current !== null) {
        window.clearTimeout(runDispatchBufferTimerRef.current)
        runDispatchBufferTimerRef.current = null
      }
      streamExecutionIdRef.current = null
    }
  }, [])

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => (await agentsApi.get(agentId!)).data,
    enabled: Boolean(token && agentId),
  })

  const resourcesQuery = useQuery({
    queryKey: ['agent-resources', agentId],
    queryFn: async () => (await agentsApi.listResources(agentId!)).data,
    enabled: Boolean(token && agentId),
    refetchOnWindowFocus: false,
  })

  const runAgentMutation = useMutation({
    mutationFn: async (prompt: string) => {
      if (!agentId) {
        throw new Error('Missing agent id')
      }
      return (await agentsApi.run(agentId, { task_prompt: prompt || undefined })).data
    },
  })

  const executionsQuery = useQuery({
    queryKey: ['executions', agentId],
    queryFn: async () => (await executionsApi.list({ agent_id: agentId ?? undefined })).data,
    enabled: Boolean(agentId),
    refetchInterval: (query) => {
      const executions = query.state.data as Execution[] | undefined
      if (!executions) {
        return 5000
      }
      return executions.some((execution) => isExecutionActive(execution.status)) ? 2000 : 5000
    },
    refetchOnWindowFocus: false,
  })

  const recentExecutions = useMemo(() => {
    const executions = executionsQuery.data ?? []
    return [...executions]
      .sort((a, b) => getExecutionTimestamp(b) - getExecutionTimestamp(a))
      .slice(0, 8)
  }, [executionsQuery.data])

  const activeExecution = useMemo(() => {
    return recentExecutions.find((execution) => isExecutionActive(execution.status)) ?? null
  }, [recentExecutions])

  const activeRecentExecutions = useMemo(
    () => recentExecutions.filter((execution) => isExecutionActive(execution.status)),
    [recentExecutions]
  )

  const activityLogsQuery = useQuery({
    queryKey: ['agent-run-activity', agentId, recentExecutions.map((item) => item.id).join(',')],
    queryFn: async (): Promise<AgentActivityLog[]> => {
      // Fetch logs for active executions plus the most recent completed execution for context
      const executionsToFetch = [
        ...activeRecentExecutions,
        ...recentExecutions.filter((e) => !isExecutionActive(e.status)).slice(0, 1),
      ]

      const logSets = await Promise.all(
        executionsToFetch.map(async (execution) => {
          try {
            const response = await executionsApi.getLogs(execution.id)
            return response.data.map((log) => ({
              id: log.id,
              executionId: execution.id,
              executionStatus: execution.status,
              timestamp: log.timestamp,
              level: log.level,
              message: log.message,
              source: 'status' as const,
              data: log.data ?? null,
            }))
          } catch {
            return []
          }
        })
      )

      return logSets
        .flat()
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        .slice(-200)
    },
    enabled: Boolean(agentId && recentExecutions.length > 0),
    refetchInterval: activeExecution ? 2000 : 5000,
    refetchOnWindowFocus: false,
  })

  const outputsQuery = useQuery({
    queryKey: ['recent-output-files', agentId],
    queryFn: async () => (await outputsApi.listRecentFiles({ limit: 80, agent_id: agentId })).data,
    enabled: Boolean(token && agentId),
    refetchInterval: activeExecution ? 2000 : 5000,
    refetchOnWindowFocus: false,
  })

  const mergedActivity = useMemo(() => {
    const merged = new Map<string, AgentActivityLog>()

    for (const activity of activityLogsQuery.data ?? []) {
      merged.set(activity.id, activity)
    }
    for (const streamLog of streamLogs) {
      merged.set(streamLog.id, streamLog)
    }

    return [...merged.values()]
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-250)
  }, [activityLogsQuery.data, streamLogs])

  useEffect(() => {
    setActivityExpansionOverrides((current) => {
      const keys = Object.keys(current)
      if (keys.length === 0) {
        return current
      }
      const activeActivityIds = new Set(mergedActivity.map((activity) => activity.id))
      let changed = false
      const next: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(current)) {
        if (activeActivityIds.has(key)) {
          next[key] = value
        } else {
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [mergedActivity])

  const isActivityExpanded = useCallback(
    (activity: AgentActivityLog): boolean => {
      const override = activityExpansionOverrides[activity.id]
      if (typeof override === 'boolean') {
        return override
      }
      return true
    },
    [activityExpansionOverrides]
  )

  const toggleActivityExpanded = useCallback(
    (activity: AgentActivityLog) => {
      setActivityExpansionOverrides((current) => {
        const currentValue =
          typeof current[activity.id] === 'boolean'
            ? current[activity.id]
            : true
        return {
          ...current,
          [activity.id]: !currentValue,
        }
      })
    },
    []
  )

  const isBusy =
    Boolean(activeExecution) ||
    runAgentMutation.isPending ||
    isDispatchingQueuedCommand ||
    isAwaitingExecutionRefresh

  const submitCommand = useCallback(
    async (prompt: string): Promise<boolean> => {
      try {
        await runAgentMutation.mutateAsync(prompt)
        setErrorMessage(null)
        setSuccessMessage('Command submitted to the agent.')
        setIsAwaitingExecutionRefresh(true)
        if (runDispatchBufferTimerRef.current !== null) {
          window.clearTimeout(runDispatchBufferTimerRef.current)
        }
        runDispatchBufferTimerRef.current = window.setTimeout(() => {
          setIsAwaitingExecutionRefresh(false)
          runDispatchBufferTimerRef.current = null
        }, 3500)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['executions', agentId] }),
          queryClient.invalidateQueries({ queryKey: ['agent-run-activity', agentId] }),
          queryClient.invalidateQueries({ queryKey: ['recent-output-files', agentId] }),
        ])
        return true
      } catch (error) {
        setSuccessMessage(null)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to submit command')
        return false
      }
    },
    [agentId, queryClient, runAgentMutation]
  )

  useEffect(() => {
    if (!isAwaitingExecutionRefresh) {
      return
    }
    if (!activeExecution) {
      return
    }
    setIsAwaitingExecutionRefresh(false)
    if (runDispatchBufferTimerRef.current !== null) {
      window.clearTimeout(runDispatchBufferTimerRef.current)
      runDispatchBufferTimerRef.current = null
    }
  }, [activeExecution, isAwaitingExecutionRefresh])

  useEffect(() => {
    if (!activeExecution?.id) {
      if (streamSourceRef.current) {
        streamSourceRef.current.close()
        streamSourceRef.current = null
      }
      streamExecutionIdRef.current = null
      return
    }

    if (streamExecutionIdRef.current === activeExecution.id) {
      return
    }

    if (streamSourceRef.current) {
      streamSourceRef.current.close()
      streamSourceRef.current = null
    }

    setStreamError(null)

    const source = executionsApi.stream(activeExecution.id)
    streamSourceRef.current = source
    streamExecutionIdRef.current = activeExecution.id

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string
          id?: string
          timestamp?: string
          level?: string
          message?: string
          data?: Record<string, unknown> | null
          status?: string
        }

        if (payload.type === 'log' && payload.id && payload.timestamp) {
          const liveLog: AgentActivityLog = {
            id: payload.id,
            executionId: activeExecution.id,
            executionStatus: activeExecution.status,
            timestamp: payload.timestamp,
            level: payload.level ?? 'info',
            message: payload.message ?? '',
            source: 'status',
            data: payload.data ?? null,
          }

          setStreamLogs((current) => {
            const withoutExisting = current.filter((log) => log.id !== liveLog.id)
            const next = [...withoutExisting, liveLog]
            return next.length > 250 ? next.slice(next.length - 250) : next
          })
          return
        }

        if (payload.type === 'complete') {
          const syntheticLog: AgentActivityLog = {
            id: `complete-${activeExecution.id}-${Date.now()}`,
            executionId: activeExecution.id,
            executionStatus: typeof payload.status === 'string' ? payload.status : 'completed',
            timestamp: new Date().toISOString(),
            level: payload.status === 'failed' ? 'error' : 'info',
            message:
              payload.status === 'failed'
                ? 'Execution completed with failure.'
                : 'Execution completed.',
            source: 'status',
            data: null,
          }

          setStreamLogs((current) => {
            const next = [...current, syntheticLog]
            return next.length > 250 ? next.slice(next.length - 250) : next
          })

          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ['executions', agentId] }),
            queryClient.invalidateQueries({ queryKey: ['agent-run-activity', agentId] }),
            queryClient.invalidateQueries({ queryKey: ['recent-output-files', agentId] }),
          ])

          source.close()
          if (streamSourceRef.current === source) {
            streamSourceRef.current = null
          }
          if (streamExecutionIdRef.current === activeExecution.id) {
            streamExecutionIdRef.current = null
          }
        }
      } catch {
        setStreamError('Received an unreadable live event from the server.')
      }
    }

    source.onerror = () => {
      setStreamError('Live stream disconnected. Falling back to polling until the next reconnect.')
      source.close()
      if (streamSourceRef.current === source) {
        streamSourceRef.current = null
      }
      if (streamExecutionIdRef.current === activeExecution.id) {
        streamExecutionIdRef.current = null
      }
    }

    return () => {
      source.close()
      if (streamSourceRef.current === source) {
        streamSourceRef.current = null
      }
      if (streamExecutionIdRef.current === activeExecution.id) {
        streamExecutionIdRef.current = null
      }
    }
  }, [activeExecution?.id, activeExecution?.status, agentId, queryClient])

  useEffect(() => {
    if (isBusy || queuedCommands.length === 0) {
      return
    }

    const nextCommand = queuedCommands[0]
    setIsDispatchingQueuedCommand(true)

    void (async () => {
      const submitted = await submitCommand(nextCommand.prompt)

      setQueuedCommands((current) => current.slice(1))
      if (submitted) {
        setSuccessMessage(`Queued command submitted: ${formatQueuePreview(nextCommand.prompt)}`)
      } else {
        setErrorMessage(
          `Failed to submit queued command: ${formatQueuePreview(nextCommand.prompt)}`
        )
      }
      setIsDispatchingQueuedCommand(false)
    })()
  }, [isBusy, queuedCommands, submitCommand])

  useEffect(() => {
    const viewport = activityScrollRef.current
    if (!viewport) {
      return
    }
    viewport.scrollTop = viewport.scrollHeight
  }, [mergedActivity.length])

  const handleSubmitCommand = (event: FormEvent) => {
    event.preventDefault()

    const prompt = commandInput.trim()
    if (!prompt) {
      return
    }

    setCommandInput('')

    if (isBusy) {
      const queuedCommand: QueuedCommand = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt,
        queuedAt: new Date().toISOString(),
      }
      setQueuedCommands((current) => [...current, queuedCommand])
      setErrorMessage(null)
      setSuccessMessage('Agent is currently running. Command added to queue.')
      return
    }

    void submitCommand(prompt)
  }

  const removeQueuedCommand = (commandId: string) => {
    setQueuedCommands((current) => current.filter((command) => command.id !== commandId))
  }

  const handleDownloadOutput = async (output: RecentOutputFile) => {
    setDownloadingOutputId(output.id)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await outputsApi.downloadRecentFile(output.id)
      const blob = response.data as Blob
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = output.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download output file')
    } finally {
      setDownloadingOutputId(null)
    }
  }

  const closeOutputViewer = () => {
    setViewerOutputFile(null)
    setViewerOutputContent('')
    setViewerOutputError(null)
    setIsViewerOutputLoading(false)
  }

  const handleViewOutput = async (output: RecentOutputFile) => {
    setViewerOutputFile(output)
    setViewerOutputContent('')
    setViewerOutputError(null)
    setIsViewerOutputLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await outputsApi.downloadRecentFile(output.id)
      const text = await (response.data as Blob).text()
      setViewerOutputContent(text)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to load output file'
      setViewerOutputError(detail)
      setErrorMessage(detail)
    } finally {
      setIsViewerOutputLoading(false)
    }
  }

  const handleDownloadViewedOutput = () => {
    if (!viewerOutputFile || !viewerOutputContent) {
      return
    }

    const blob = new Blob([viewerOutputContent], {
      type: viewerOutputFile.content_type || 'text/plain;charset=utf-8',
    })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = viewerOutputFile.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  const renderResource = (resource: FileResource) => {
    return (
      <div
        key={resource.id}
        className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-1"
      >
        <p className="text-xs font-mono text-white break-words">{resource.original_filename}</p>
        <p className="text-[10px] font-mono text-accent-tan/80">
          {formatFileSize(resource.file_size)} · {resource.file_type}
        </p>
      </div>
    )
  }

  const renderOutput = (output: RecentOutputFile) => {
    return (
      <div
        key={output.id}
        className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 text-emerald-300 border border-emerald-500/40 bg-emerald-500/10">
            {output.output_type ?? 'output'}
          </span>
          <span className="text-[10px] font-mono text-accent-tan/90">{formatTime(output.created_at)}</span>
        </div>
        <p className="text-xs font-mono text-white break-words">{output.filename}</p>
        <p className="text-[10px] font-mono text-accent-tan/80">{formatFileSize(output.file_size)}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadOutput(output)}
            disabled={downloadingOutputId === output.id}
            className={isViewableOutput(output) ? 'flex-1' : 'w-full'}
          >
            <span className="material-symbols-outlined text-sm">download</span>
            {downloadingOutputId === output.id ? 'Downloading...' : 'Download'}
          </Button>
          {isViewableOutput(output) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleViewOutput(output)}
              className="flex-1"
            >
              <span className="material-symbols-outlined text-sm">visibility</span>
              View
            </Button>
          )}
        </div>
      </div>
    )
  }

  const agent = agentQuery.data as Agent | undefined
  const desktopGridColumns = useMemo(() => {
    const left = isLeftSidebarCollapsed ? '56px' : '280px'
    const right = isRightSidebarCollapsed ? '56px' : '320px'
    return `${left} minmax(0,1fr) ${right}`
  }, [isLeftSidebarCollapsed, isRightSidebarCollapsed])
  const appGridStyle = useMemo(
    () => ({ '--agent-grid-columns': desktopGridColumns }) as CSSProperties,
    [desktopGridColumns]
  )

  return (
    <div className="h-screen max-h-screen bg-bg-dark text-white flex flex-col overflow-hidden">
      <nav className="z-20 h-16 shrink-0 bg-bg-sidebar border-b border-interface-border flex items-center px-6 lg:px-12 justify-between">
        <WorkerBeeBrand code="[RUN-CONSOLE]" to="/dashboard" />
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Dashboard
        </Button>
      </nav>

      <main className="flex-1 min-h-0 px-4 py-4 lg:px-8 lg:py-6 flex flex-col gap-4 overflow-hidden">
        <div className="wireframe-box bg-bg-sidebar p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="font-mono font-bold text-base text-white">
              {agent ? agent.name : agentQuery.isLoading ? 'Loading agent...' : 'Agent not found'}
            </h1>
            <p className="text-[11px] font-mono text-accent-tan mt-1">
              {agent?.description || 'Live interaction console for this agent.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeExecution ? (
              <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-1 text-sky-300 border border-sky-500/40 bg-sky-500/10">
                Running
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-1 text-emerald-300 border border-emerald-500/40 bg-emerald-500/10">
                Idle
              </span>
            )}
            {queuedCommands.length > 0 && (
              <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-1 text-amber-300 border border-amber-500/40 bg-amber-500/10">
                Queue {queuedCommands.length}
              </span>
            )}
          </div>
        </div>

        <div
          className="grid grid-cols-1 gap-4 min-h-0 flex-1 lg:grid-cols-[var(--agent-grid-columns)]"
          style={appGridStyle}
        >
          <aside
            className={`wireframe-box bg-bg-sidebar h-full flex flex-col min-h-0 transition-all duration-200 ${
              isLeftSidebarCollapsed ? 'px-2 py-3' : 'p-4'
            }`}
          >
            <div
              className={`flex items-center gap-2 mb-3 ${
                isLeftSidebarCollapsed ? 'justify-center' : 'justify-between'
              }`}
            >
              {!isLeftSidebarCollapsed && (
                <>
                  <h2 className="font-mono font-bold text-sm">Attached Resources</h2>
                  <span className="text-[11px] font-mono text-accent-tan">
                    {(resourcesQuery.data ?? []).length}
                  </span>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => setIsLeftSidebarCollapsed((current) => !current)}
                aria-label={isLeftSidebarCollapsed ? 'Expand resources sidebar' : 'Collapse resources sidebar'}
                title={isLeftSidebarCollapsed ? 'Expand resources sidebar' : 'Collapse resources sidebar'}
              >
                <span className="material-symbols-outlined text-base">
                  {isLeftSidebarCollapsed
                    ? 'keyboard_double_arrow_right'
                    : 'keyboard_double_arrow_left'}
                </span>
              </Button>
            </div>

            {isLeftSidebarCollapsed ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="material-symbols-outlined text-accent-tan/70">description</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {resourcesQuery.isLoading && (
                  <p className="text-xs font-mono text-accent-tan">Loading resources...</p>
                )}
                {!resourcesQuery.isLoading && (resourcesQuery.data ?? []).length === 0 && (
                  <p className="text-xs font-mono text-accent-tan">No resources attached to this agent.</p>
                )}
                {(resourcesQuery.data ?? []).map((resource) => renderResource(resource))}
              </div>
            )}
          </aside>

          <section className="wireframe-box bg-bg-sidebar p-4 h-full flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-mono font-bold text-sm">Live Agent Activity</h2>
                <p className="text-[11px] font-mono text-accent-tan mt-1">
                  {activeExecution
                    ? 'Showing one real-time activity stream while the agent runs.'
                    : 'Showing recent execution activity logs.'}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void Promise.all([
                    executionsQuery.refetch(),
                    activityLogsQuery.refetch(),
                    outputsQuery.refetch(),
                  ])
                }}
                className="text-[11px]"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Refresh
              </Button>
            </div>

            <div className="mb-3 overflow-x-auto">
              <div className="flex items-center gap-2 pb-1">
                {recentExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="min-w-[165px] bg-white/5 border border-interface-border rounded px-2 py-2 space-y-1"
                  >
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 inline-flex ${getStatusBadgeClasses(execution.status)}`}
                    >
                      {execution.status}
                    </span>
                    <p className="text-[10px] font-mono text-accent-tan/90 truncate">{execution.id}</p>
                    <p className="text-[10px] font-mono text-accent-tan/90">
                      {formatTime(execution.started_at ?? execution.completed_at ?? 'No timestamp')}
                    </p>
                  </div>
                ))}
                {!executionsQuery.isLoading && recentExecutions.length === 0 && (
                  <p className="text-xs font-mono text-accent-tan">No runs recorded for this agent yet.</p>
                )}
              </div>
            </div>

            {streamError && (
              <div className="mb-3 text-xs font-mono text-signal-red bg-signal-red/10 border border-signal-red/30 rounded px-3 py-2">
                {streamError}
              </div>
            )}

            <div
              ref={activityScrollRef}
              className="flex-1 min-h-0 overflow-y-auto border border-interface-border rounded p-3 space-y-2"
            >
              {activityLogsQuery.isLoading && mergedActivity.length === 0 && (
                <p className="text-xs font-mono text-accent-tan">Loading activity...</p>
              )}

              {mergedActivity.map((activity) => {
                const activityType = inferActivityType(activity)
                const activityLabel = getActivityLabel(activity, activityType)
                const detail = readErrorDetail(activity.data)
                const expanded = isActivityExpanded(activity)
                const canToggleExpansion =
                  activity.message.trim().length > 140 || activity.message.includes('\n')

                return (
                  <div
                    key={`${activity.executionId}-${activity.id}`}
                    className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 ${getActivityBadgeClasses(activityType)}`}
                        >
                          {activityLabel}
                        </span>
                        {canToggleExpansion && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-[10px] px-2 py-0.5 h-6"
                            onClick={() => toggleActivityExpanded(activity)}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {expanded ? 'expand_less' : 'expand_more'}
                            </span>
                            {expanded ? 'Collapse' : 'Expand'}
                          </Button>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-accent-tan/90">{formatTime(activity.timestamp)}</span>
                    </div>
                    {expanded ? (
                      <>
                        <p className="text-xs font-mono text-white break-words whitespace-pre-wrap">
                          {activity.message}
                        </p>
                        {activity.level.toLowerCase() === 'error' && detail && (
                          <p className="text-xs font-mono text-signal-red break-words">Detail: {detail}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-mono text-accent-tan/90 break-words">
                        {formatCollapsedPreview(activity.message)}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-accent-tan/80">
                      {activity.executionStatus.toUpperCase()} · {activity.executionId} · {activity.source}
                    </p>
                  </div>
                )
              })}

              {!activityLogsQuery.isLoading && mergedActivity.length === 0 && (
                <p className="text-xs font-mono text-accent-tan">No activity logs yet.</p>
              )}
            </div>

            {queuedCommands.length > 0 && (
              <div className="mt-3 border border-interface-border rounded p-2 space-y-2 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-mono uppercase tracking-wider text-accent-tan">
                  Pending Commands
                </p>
                {queuedCommands.map((command) => (
                  <div
                    key={command.id}
                    className="flex items-center justify-between gap-2 bg-white/5 border border-interface-border rounded px-2 py-1"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-white truncate">{command.prompt}</p>
                      <p className="text-[10px] font-mono text-accent-tan/80">
                        queued {formatTime(command.queuedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[10px] px-2 py-1"
                      onClick={() => removeQueuedCommand(command.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmitCommand} className="mt-3 border-t border-interface-border/70 pt-3 space-y-2">
              <textarea
                value={commandInput}
                onChange={(event) => setCommandInput(event.target.value)}
                className="w-full min-h-24 bg-white/5 border border-interface-border rounded px-3 py-2 text-sm font-mono"
                placeholder="Type a command for the agent"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-mono text-accent-tan/80">
                  {activeExecution
                    ? 'Agent is active. Submit to queue this command for the next run.'
                    : 'Agent is idle. Submit to run now.'}
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!commandInput.trim()}
                >
                  <span className="material-symbols-outlined text-sm">terminal</span>
                  {activeExecution ? 'Queue Command' : runAgentMutation.isPending ? 'Submitting...' : 'Run Command'}
                </Button>
              </div>
            </form>
          </section>

          <aside
            className={`wireframe-box bg-bg-sidebar h-full flex flex-col min-h-0 transition-all duration-200 ${
              isRightSidebarCollapsed ? 'px-2 py-3' : 'p-4'
            }`}
          >
            <div
              className={`flex items-center gap-2 mb-3 ${
                isRightSidebarCollapsed ? 'justify-center' : 'justify-between'
              }`}
            >
              {!isRightSidebarCollapsed && (
                <>
                  <h2 className="font-mono font-bold text-sm">Outputs</h2>
                  <span className="text-[11px] font-mono text-accent-tan">
                    {(outputsQuery.data ?? []).length}
                  </span>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => setIsRightSidebarCollapsed((current) => !current)}
                aria-label={isRightSidebarCollapsed ? 'Expand outputs sidebar' : 'Collapse outputs sidebar'}
                title={isRightSidebarCollapsed ? 'Expand outputs sidebar' : 'Collapse outputs sidebar'}
              >
                <span className="material-symbols-outlined text-base">
                  {isRightSidebarCollapsed
                    ? 'keyboard_double_arrow_left'
                    : 'keyboard_double_arrow_right'}
                </span>
              </Button>
            </div>

            {isRightSidebarCollapsed ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="material-symbols-outlined text-accent-tan/70">draft</span>
              </div>
            ) : (
              <>
                <p className="text-[11px] font-mono text-accent-tan/80 mb-3">
                  {activeExecution ? 'Live output updates are active.' : 'Polling for latest output files.'}
                </p>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {outputsQuery.isLoading && (
                    <p className="text-xs font-mono text-accent-tan">Loading outputs...</p>
                  )}
                  {!outputsQuery.isLoading && (outputsQuery.data ?? []).length === 0 && (
                    <p className="text-xs font-mono text-accent-tan">No output files generated yet.</p>
                  )}
                  {(outputsQuery.data ?? []).map((output) => renderOutput(output))}
                </div>
              </>
            )}
          </aside>
        </div>

        {errorMessage && (
          <div className="text-xs font-mono text-signal-red bg-signal-red/10 border border-signal-red/30 rounded px-3 py-2 shrink-0">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="text-xs font-mono text-primary bg-primary/10 border border-primary/30 rounded px-3 py-2 shrink-0">
            {successMessage}
          </div>
        )}
      </main>

      {viewerOutputFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-sm"
            onClick={closeOutputViewer}
            aria-label="Close file viewer"
          />
          <div className="relative w-full max-w-4xl max-h-[85vh] wireframe-box bg-bg-sidebar p-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-mono font-bold text-sm uppercase tracking-wide">
                  Output Viewer
                </h3>
                <p className="text-xs font-mono text-accent-tan mt-1 break-all">
                  {viewerOutputFile.filename}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadViewedOutput}
                  disabled={isViewerOutputLoading}
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={closeOutputViewer}>
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto border border-interface-border rounded bg-bg-deep/40 p-4">
              {isViewerOutputLoading && (
                <p className="text-xs font-mono text-accent-tan">Loading file...</p>
              )}
              {!isViewerOutputLoading && viewerOutputError && (
                <p className="text-xs font-mono text-signal-red break-words">
                  {viewerOutputError}
                </p>
              )}
              {!isViewerOutputLoading && !viewerOutputError && (
                <MarkdownContent content={viewerOutputContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
