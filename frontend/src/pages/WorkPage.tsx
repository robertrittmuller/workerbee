import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileOutput,
  FileSignature,
  FileText,
  Files,
  FolderOpen,
  History,
  LoaderCircle,
  LineChart,
  Mail,
  NotebookPen,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  Square,
  Table2,
} from 'lucide-react'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import DataSharingReviewDialog from '@/components/DataSharingReviewDialog'
import CalendarDraftReviewDialog from '@/components/CalendarDraftReviewDialog'
import EmailDraftReviewDialog from '@/components/EmailDraftReviewDialog'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'
import {
  agentsApi,
  executionsApi,
  filesApi,
  outputsApi,
  taskThreadsApi,
  type Execution,
  type RecentOutputFile,
} from '@/lib/api'
import { getWorkPack } from '@/lib/workPacks'
import { loadDataControls, saveDataControls, shouldReviewBeforeSending } from '@/lib/dataControls'
import { platform } from '@/lib/platform'
import { canonicalEmailDraft, parseEmailDraft, type EmailDraft } from '@/lib/emailDraft'
import {
  canonicalCalendarDraft,
  parseMeetingCalendarDraft,
  type CalendarDraft,
} from '@/lib/calendarDraft'
import { deliverFile } from '@/lib/fileDelivery'

type WorkPackMetadata = {
  id: string
  answers?: Record<string, string | string[] | boolean>
  title?: string
  outputFilename?: string
  outputType?: 'markdown' | 'csv' | 'html' | string
  outputs?: {
    filename?: string
    type?: string
    label?: string
    extension?: string
    preview?: boolean
  }[]
  qualityChecks?: string[]
  output?: {
    filename?: string
    type?: string
    extension?: string
  }
  quality_checks?: string[]
}

type OutputValidation = {
  valid?: boolean
  expected_extension?: string
  expected_filename?: string
  expected_filenames?: string[]
  expected_outputs?: {
    filename: string
    type?: string
    label?: string
    extension?: string
    valid: boolean
    matching_artifacts?: string[]
    same_type_artifacts?: string[]
  }[]
  missing_filenames?: string[]
  matching_artifacts?: string[]
  same_type_artifacts?: string[]
  artifact_count?: number
}

const EMAIL_MESSAGE_FILENAMES = new Set([
  'follow-up-message.md',
  'status-update-message.md',
])

const CALENDAR_SOURCE_FILENAMES = new Set(['meeting-follow-up.md'])

function isEmailMessageArtifact(filename: string): boolean {
  return EMAIL_MESSAGE_FILENAMES.has(filename.toLowerCase())
}

function isCalendarSourceArtifact(filename: string): boolean {
  return CALENDAR_SOURCE_FILENAMES.has(filename.toLowerCase())
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function parseCsvPreview(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < content.length && rows.length < 11; index += 1) {
    const character = content[index]
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if ((field || row.length) && rows.length < 11) {
    row.push(field)
    if (row.some((value) => value.trim())) rows.push(row)
  }
  return rows.map((values) => values.slice(0, 12))
}

function isolatedDashboardHtml(content: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:;">`
  if (/<head[^>]*>/i.test(content)) return content.replace(/<head([^>]*)>/i, `<head$1>${policy}`)
  return `<!doctype html><html><head>${policy}</head><body>${content}</body></html>`
}

function ArtifactPreview({ output, content, outputType, workPackId }: { output: RecentOutputFile; content: string; outputType?: string; workPackId?: string }) {
  const inferredType = outputType || (output.filename.toLowerCase().endsWith('.csv') ? 'csv' : output.filename.toLowerCase().endsWith('.html') ? 'html' : 'markdown')

  if (inferredType === 'csv') {
    const rows = parseCsvPreview(content)
    const header = rows[0] ?? []
    const body = rows.slice(1)
    return (
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Table2 size={17} className="text-emerald-600" />
            {workPackId === 'spreadsheet-cleanup' ? 'Cleaned data preview' : 'Data preview'}
          </div>
          <span className="text-xs text-stone-500">{header.length} columns · first {body.length} rows</span>
        </div>
        {rows.length ? (
          <div className="max-h-[460px] overflow-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#25231f] text-white">
                <tr>{header.map((cell, index) => <th key={`${cell}-${index}`} className="whitespace-nowrap border-r border-white/10 px-3 py-2.5 font-semibold">{cell || `Column ${index + 1}`}</th>)}</tr>
              </thead>
              <tbody>
                {body.map((values, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-stone-100 even:bg-stone-50/70">
                    {header.map((_, columnIndex) => <td key={columnIndex} className="max-w-[260px] truncate whitespace-nowrap border-r border-stone-100 px-3 py-2.5 text-stone-700">{values[columnIndex] || <span className="text-stone-300">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-stone-500">This CSV does not contain previewable rows.</p>
        )}
      </div>
    )
  }

  if (inferredType === 'html') {
    return (
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><FileText size={17} className="text-sky-600" /> Isolated dashboard preview</div>
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-500"><ShieldCheck size={13} /> Network access blocked</span>
        </div>
        <iframe
          title={`Preview of ${output.filename}`}
          sandbox="allow-scripts"
          srcDoc={isolatedDashboardHtml(content)}
          className="h-[560px] w-full bg-white"
        />
      </div>
    )
  }

  const specializedPreview = workPackId === 'meeting-preparation'
    ? { title: 'Meeting brief preview', detail: 'Review the decisions, questions, and talking points before the room.', icon: CalendarCheck2 }
    : workPackId === 'decision-memo'
      ? { title: 'Decision memo preview', detail: 'Review the recommendation, evidence, and tradeoffs before sharing.', icon: NotebookPen }
      : workPackId === 'presentation-creation'
        ? { title: 'Presentation outline', detail: 'Review the slide story, key messages, sources, and speaker notes before presenting.', icon: FileOutput }
      : workPackId === 'meeting-follow-up'
        ? { title: 'Meeting follow-up preview', detail: 'Confirm every decision, owner, date, action, and open question before sharing the draft.', icon: ClipboardCheck }
      : workPackId === 'recurring-reporting'
        ? { title: 'Performance report preview', detail: 'Verify KPI definitions, calculations, comparisons, sources, and caveats before sharing.', icon: LineChart }
      : workPackId === 'research-synthesis'
        ? { title: 'Research synthesis preview', detail: 'Review claim classifications, source support, disagreements, inference, and evidence gaps before deciding.', icon: FileText }
      : workPackId === 'proposal-creation'
        ? { title: 'Proposal draft preview', detail: 'Verify requirements, claims, scope, pricing, legal terms, placeholders, and commitments before sharing or submitting.', icon: FileSignature }
      : workPackId === 'project-status-reporting'
        ? { title: 'Project status preview', detail: 'Confirm health, progress, milestones, risks, issues, owners, dates, decisions, and source coverage before sharing.', icon: ClipboardList }
      : null

  const PreviewIcon = specializedPreview?.icon
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-[#25231f]">
      {specializedPreview && PreviewIcon && (
        <div className="flex items-start gap-3 border-b border-white/10 bg-[#32302c] px-5 py-4 text-white sm:px-7">
          <PreviewIcon size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold">{specializedPreview.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-stone-300">{specializedPreview.detail}</p>
          </div>
        </div>
      )}
      <div className="p-5 sm:p-7">
        <MarkdownContent content={content} />
      </div>
    </div>
  )
}

function isActive(execution?: Execution): boolean {
  return execution?.status === 'pending' || execution?.status === 'running'
}

function errorMessage(execution?: Execution): string {
  const raw = execution?.error_message || ''
  if (/provider|api key|model|credentials|unauthorized/i.test(raw)) {
    return 'WorkerBee could not connect to its model service. Check your internet connection and try again.'
  }
  return raw || 'WorkerBee could not finish this task. Your request and files are still available.'
}

function progressStep(status: Execution['status'] | undefined): number {
  if (status === 'completed') return 4
  if (status === 'failed' || status === 'cancelled') return 2
  if (status === 'running') return 2
  return 1
}

function statusLabel(status: Execution['status']): string {
  if (status === 'completed') return 'Ready'
  if (status === 'running') return 'Working'
  if (status === 'pending') return 'Starting'
  if (status === 'cancelled') return 'Stopped'
  return 'Needs attention'
}

function statusClasses(status: Execution['status']): string {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'running' || status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-stone-200 bg-stone-100 text-stone-600'
}

export default function WorkPage() {
  const { executionId } = useParams<{ executionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [showDetails, setShowDetails] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [showRevision, setShowRevision] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [revisionForReview, setRevisionForReview] = useState<string | null>(null)
  const [showRepeat, setShowRepeat] = useState(false)
  const [repeatPeriod, setRepeatPeriod] = useState('')
  const [repeatFiles, setRepeatFiles] = useState<File[]>([])
  const [repeatError, setRepeatError] = useState<string | null>(null)
  const [repeatForReview, setRepeatForReview] = useState(false)
  const [reviewEveryTask, setReviewEveryTask] = useState(
    () => loadDataControls().reviewBeforeSending
  )
  const [emailReview, setEmailReview] = useState<{
    artifact: RecentOutputFile
    draft: EmailDraft
  } | null>(null)
  const [emailActionBusy, setEmailActionBusy] = useState(false)
  const [emailActionError, setEmailActionError] = useState<string | null>(null)
  const [emailActionNotice, setEmailActionNotice] = useState<string | null>(null)
  const [calendarReview, setCalendarReview] = useState<{
    artifact: RecentOutputFile
    draft: CalendarDraft
  } | null>(null)
  const [calendarActionBusy, setCalendarActionBusy] = useState(false)
  const [calendarActionError, setCalendarActionError] = useState<string | null>(null)
  const [calendarActionNotice, setCalendarActionNotice] = useState<string | null>(null)
  const [fileDeliveryNotice, setFileDeliveryNotice] = useState<{
    message: string
    filePath?: string
    error?: boolean
  } | null>(null)

  const routeState = location.state as
    | { prompt?: string; taskTitle?: string; agentId?: string; workPack?: WorkPackMetadata | null }
    | null

  const executionQuery = useQuery({
    queryKey: ['work-execution', executionId],
    queryFn: async () => (await executionsApi.get(executionId!)).data,
    enabled: Boolean(executionId),
    refetchInterval: (query) => {
      const execution = query.state.data as Execution | undefined
      return isActive(execution) ? 1500 : false
    },
  })

  const execution = executionQuery.data
  const persistedThreadId =
    typeof execution?.result?.thread_id === 'string' ? execution.result.thread_id : null

  const threadQuery = useQuery({
    queryKey: ['task-thread', persistedThreadId || executionId],
    queryFn: async () => (
      persistedThreadId
        ? (await taskThreadsApi.get(persistedThreadId)).data
        : (await taskThreadsApi.getByExecution(executionId!)).data
    ),
    enabled: Boolean(executionId && execution),
    retry: false,
    refetchInterval: isActive(execution) ? 1500 : false,
  })
  const thread = threadQuery.data
  const currentAttemptNumber =
    typeof execution?.result?.attempt_number === 'number'
      ? execution.result.attempt_number
      : thread?.attempts?.find((attempt) => attempt.execution.id === executionId)?.attempt_number
  const agentId = execution?.agent_id || routeState?.agentId || null
  const prompt =
    routeState?.prompt ||
    (typeof execution?.result?.task_prompt === 'string' ? execution.result.task_prompt : '')
  const persistedWorkPack = execution?.result?.work_pack
  const workPack = (
    persistedWorkPack && typeof persistedWorkPack === 'object'
      ? persistedWorkPack
      : routeState?.workPack
  ) as WorkPackMetadata | null | undefined
  const workPackDefinition = workPack?.id ? getWorkPack(workPack.id) : null
  const workPackOutputType = workPack?.output?.type || workPack?.outputType || workPackDefinition?.outputType
  const workPackOutputFilename = workPack?.output?.filename || workPack?.outputFilename || workPackDefinition?.outputFilename
  const workPackOutputs = workPack?.outputs || workPackDefinition?.outputs || (
    workPackOutputFilename
      ? [{ filename: workPackOutputFilename, type: workPackOutputType, label: 'Deliverable' }]
      : []
  )
  const previewContract = workPackOutputs.find((output) => output.preview) || workPackOutputs[0]
  const previewFilename = previewContract?.filename || workPackOutputFilename
  const previewOutputType = previewContract?.type || workPackOutputType
  const workPackQualityChecks = workPack?.quality_checks || workPack?.qualityChecks || workPackDefinition?.qualityChecks || []
  const outputValidation = (
    execution?.result?.output_validation && typeof execution.result.output_validation === 'object'
      ? execution.result.output_validation
      : null
  ) as OutputValidation | null

  useEffect(() => {
    if (!execution || isActive(execution)) return
    void queryClient.invalidateQueries({ queryKey: ['task-threads'] })
    void queryClient.invalidateQueries({ queryKey: ['recent-output-files'] })
  }, [execution, queryClient])

  const logsQuery = useQuery({
    queryKey: ['work-logs', executionId],
    queryFn: async () => (await executionsApi.getLogs(executionId!)).data,
    enabled: Boolean(executionId),
    refetchInterval: isActive(execution) ? 1500 : false,
  })

  const outputsQuery = useQuery({
    queryKey: ['work-outputs', agentId],
    queryFn: async () => (await outputsApi.listRecentFiles({ limit: 20, agent_id: agentId! })).data,
    enabled: Boolean(agentId && execution?.status === 'completed'),
  })

  const agentResourcesQuery = useQuery({
    queryKey: ['work-agent-resources', agentId],
    queryFn: async () => (await agentsApi.listResources(agentId!)).data,
    enabled: Boolean(agentId && thread),
  })

  const runtimeQuery = useQuery({
    queryKey: ['desktop-runtime'],
    queryFn: () => platform.getRuntimeStatus(),
    staleTime: Infinity,
  })

  const outputs = useMemo(
    () => (outputsQuery.data ?? []).filter((output) => output.execution_id === executionId),
    [executionId, outputsQuery.data]
  )
  const expectedExtension = previewFilename?.includes('.')
    ? `.${previewFilename.split('.').pop()?.toLowerCase()}`
    : null
  const previewOutput =
    (previewFilename
      ? outputs.find((output) => output.filename.toLowerCase() === previewFilename.toLowerCase())
      : null) ??
    (expectedExtension
      ? outputs.find((output) => output.filename.toLowerCase().endsWith(expectedExtension))
      : null) ??
    outputs.find(
      (output) =>
        output.content_type.startsWith('text/') &&
        !output.filename.startsWith(`${executionId}_output`)
    ) ?? outputs.find((output) => output.content_type.startsWith('text/')) ?? null

  const previewQuery = useQuery({
    queryKey: ['work-output-preview', previewOutput?.id],
    queryFn: async () => {
      const response = await outputsApi.downloadRecentFile(previewOutput!.id)
      return (response.data as Blob).text()
    },
    enabled: Boolean(previewOutput),
  })

  const cancelMutation = useMutation({
    mutationFn: async () => (await executionsApi.cancel(executionId!)).data,
    onSuccess: (cancelled) => {
      queryClient.setQueryData(['work-execution', executionId], cancelled)
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (requestedRevision?: string) => {
      if (!agentId) throw new Error('This task no longer has an assistant.')
      return (await agentsApi.run(agentId, {
        task_prompt: requestedRevision ? undefined : prompt || undefined,
        thread_id: thread?.id || persistedThreadId || undefined,
        revision_note: requestedRevision || undefined,
        base_execution_id: requestedRevision ? executionId : undefined,
      })).data
    },
    onSuccess: (nextExecution, requestedRevision) => {
      const nextPrompt = requestedRevision
        ? `${thread?.original_prompt || prompt}\n\nRevision request:\n${requestedRevision}`
        : prompt
      setShowRevision(false)
      setRevisionNote('')
      void queryClient.invalidateQueries({ queryKey: ['task-threads'] })
      navigate(`/work/${nextExecution.id}`, {
        replace: true,
        // The server persists this metadata, but route state keeps the tailored review
        // available immediately while the replacement execution is being created.
        state: { prompt: nextPrompt, taskTitle: thread?.title || routeState?.taskTitle, agentId, workPack },
      })
    },
  })

  const isProjectStatus = workPack?.id === 'project-status-reporting'
  const repeatPeriodField = isProjectStatus ? 'status_period' : 'reporting_period'
  const repeatPrompt = (period: string) => isProjectStatus
    ? [
        `Create the next project status update for ${period}.`,
        'Use the newly attached files as the authoritative current-period sources for this run.',
        'Preserve the saved project objective, audience, cadence, status conventions, focus, and output contract unless the new sources explicitly support a change.',
        'Do not carry forward prior-period progress, health, causes, risks, issues, owners, dates, actions, decisions, or commitments unless the new sources restate them.',
      ].join('\n')
    : [
        `Run the same recurring KPI report for ${period}.`,
        'Use the newly attached files as the authoritative sources for this run.',
        'Preserve the saved KPI definitions, filters, comparison method, and output contract unless the new sources explicitly prove that a definition changed.',
        'Do not carry forward prior-period values, findings, causes, actions, owners, or dates unless they are present in the newly attached sources.',
      ].join('\n')

  const repeatMutation = useMutation({
    mutationFn: async ({ period, files }: { period: string; files: File[] }) => {
      if (!agentId || !thread?.id) throw new Error('This report no longer has a reusable task history.')
      const uploadedResources = await Promise.all(
        files.map(async (file) => (await filesApi.upload(file)).data)
      )
      return (await agentsApi.run(agentId, {
        task_prompt: repeatPrompt(period),
        thread_id: thread.id,
        resource_ids: uploadedResources.map((file) => file.id),
        work_pack_answers: { [repeatPeriodField]: period },
      })).data
    },
    onSuccess: (nextExecution, variables) => {
      setShowRepeat(false)
      setRepeatFiles([])
      setRepeatPeriod('')
      setRepeatError(null)
      void queryClient.invalidateQueries({ queryKey: ['task-threads'] })
      navigate(`/work/${nextExecution.id}`, {
        replace: true,
        state: {
          prompt: repeatPrompt(variables.period),
          taskTitle: thread?.title || routeState?.taskTitle,
          agentId,
          workPack: workPack
            ? {
                ...workPack,
                answers: { ...workPack.answers, [repeatPeriodField]: variables.period },
              }
            : workPack,
        },
      })
    },
    onError: (error) => {
      setRepeatError(error instanceof Error ? error.message : `WorkerBee could not start the next ${isProjectStatus ? 'project update' : 'report period'}.`)
    },
  })

  const download = async (output: { id: string; filename: string }) => {
    setDownloadingId(output.id)
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
    } catch {
      setFileDeliveryNotice({
        message: platform.isDesktop
          ? 'WorkerBee could not save this file. Choose another location and try again.'
          : 'WorkerBee could not download this file. Try again.',
        error: true,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const prepareEmailDraft = async (artifact: RecentOutputFile) => {
    setEmailActionBusy(true)
    setEmailActionError(null)
    setEmailActionNotice(null)
    try {
      const response = await outputsApi.downloadRecentFile(artifact.id)
      const content = await (response.data as Blob).text()
      setEmailReview({ artifact, draft: parseEmailDraft(content, artifact.filename) })
    } catch {
      setEmailActionNotice('WorkerBee could not open this message for review. Download the file and try again.')
    } finally {
      setEmailActionBusy(false)
    }
  }

  const confirmEmailDraft = async (draft: EmailDraft) => {
    if (!emailReview || !executionId) return
    setEmailActionBusy(true)
    setEmailActionError(null)
    const artifact = emailReview.artifact
    try {
      const contentHash = await sha256(canonicalEmailDraft(draft))
      const eventBase = {
        action_type: 'email_draft_handoff' as const,
        artifact_id: artifact.id,
        artifact_filename: artifact.filename,
        destination_label: 'Default email app',
        recipients: [...draft.to, ...draft.cc],
        subject: draft.subject.trim(),
        content_sha256: contentHash,
        user_confirmed: true as const,
      }
      await executionsApi.recordExternalAction(executionId, { ...eventBase, stage: 'approved' })
      await platform.openEmailDraft(draft)
      setEmailReview(null)
      setEmailActionNotice('Draft opened in your email app. Nothing was sent.')
      try {
        await executionsApi.recordExternalAction(executionId, { ...eventBase, stage: 'opened' })
        void queryClient.invalidateQueries({ queryKey: ['work-logs', executionId] })
      } catch {
        setEmailActionNotice('Draft opened in your email app and nothing was sent. WorkerBee could not record the final handoff status.')
      }
    } catch (error) {
      setEmailActionError(error instanceof Error ? error.message : 'WorkerBee could not open the email draft.')
    } finally {
      setEmailActionBusy(false)
    }
  }

  const prepareCalendarDraft = async (artifact: RecentOutputFile) => {
    setCalendarActionBusy(true)
    setCalendarActionError(null)
    setCalendarActionNotice(null)
    try {
      const response = await outputsApi.downloadRecentFile(artifact.id)
      const content = await (response.data as Blob).text()
      setCalendarReview({ artifact, draft: parseMeetingCalendarDraft(content, artifact.id) })
    } catch {
      setCalendarActionNotice('WorkerBee could not prepare this follow-up for calendar review. Download the file and try again.')
    } finally {
      setCalendarActionBusy(false)
    }
  }

  const confirmCalendarDraft = async (draft: CalendarDraft) => {
    if (!calendarReview || !executionId) return
    setCalendarActionBusy(true)
    setCalendarActionError(null)
    const artifact = calendarReview.artifact
    const destinationLabel = platform.isDesktop ? 'Default calendar app' : 'Calendar file (.ics)'
    try {
      const contentHash = await sha256(canonicalCalendarDraft(draft))
      const eventBase = {
        action_type: 'calendar_draft_handoff' as const,
        artifact_id: artifact.id,
        artifact_filename: artifact.filename,
        destination_label: destinationLabel,
        recipients: draft.attendees,
        subject: draft.title.trim(),
        scheduled_start: draft.startLocal,
        timezone: draft.timezone,
        duration_minutes: draft.durationMinutes,
        content_sha256: contentHash,
        user_confirmed: true as const,
      }
      await executionsApi.recordExternalAction(executionId, { ...eventBase, stage: 'approved' })
      const method = await platform.openCalendarDraft(draft)
      setCalendarReview(null)
      setCalendarActionNotice(
        method === 'opened'
          ? 'Calendar draft opened. WorkerBee did not add the event or send invitations.'
          : 'Calendar draft downloaded. Open it to review and add the tentative event.'
      )
      try {
        await executionsApi.recordExternalAction(executionId, { ...eventBase, stage: method })
        void queryClient.invalidateQueries({ queryKey: ['work-logs', executionId] })
      } catch {
        setCalendarActionNotice(
          method === 'opened'
            ? 'Calendar draft opened and no invitations were sent. WorkerBee could not record the final handoff status.'
            : 'Calendar draft downloaded. WorkerBee could not record the final handoff status.'
        )
      }
    } catch (error) {
      setCalendarActionError(error instanceof Error ? error.message : 'WorkerBee could not prepare the calendar draft.')
    } finally {
      setCalendarActionBusy(false)
    }
  }

  const currentAttempt = thread?.attempts?.find(
    (attempt) => attempt.execution.id === executionId
  )
  const revisionFiles = useMemo(() => {
    const candidates = [
      ...(agentResourcesQuery.data ?? []).map((file) => ({
        name: file.original_filename,
        size: file.file_size,
      })),
      ...(currentAttempt?.artifacts ?? []).map((artifact) => ({
        name: artifact.filename,
        size: artifact.file_size,
      })),
    ]
    const seen = new Set<string>()
    return candidates.filter((file) => {
      const key = `${file.name}:${file.size}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [agentResourcesQuery.data, currentAttempt?.artifacts])

  const requestRevision = () => {
    const requestedRevision = revisionNote.trim()
    if (!requestedRevision) return
    const controls = loadDataControls()
    if (shouldReviewBeforeSending(controls)) {
      setReviewEveryTask(controls.reviewBeforeSending)
      setRevisionForReview(requestedRevision)
      return
    }
    retryMutation.mutate(requestedRevision)
  }

  const confirmRevision = () => {
    if (!revisionForReview) return
    saveDataControls({
      reviewBeforeSending: reviewEveryTask,
      externalProcessingAcknowledgedAt: new Date().toISOString(),
    })
    const requestedRevision = revisionForReview
    setRevisionForReview(null)
    retryMutation.mutate(requestedRevision)
  }

  const addRepeatFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? [])
    setRepeatFiles((current) => {
      const existing = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      )
      return [
        ...current,
        ...incoming.filter(
          (file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`)
        ),
      ]
    })
    event.target.value = ''
    setRepeatError(null)
  }

  const requestRepeatRun = () => {
    const period = repeatPeriod.trim()
    if (!period || repeatFiles.length === 0) {
      setRepeatError(`Add the new ${isProjectStatus ? 'status period' : 'reporting period'} and at least one source file.`)
      return
    }
    if (shouldReviewBeforeSending(loadDataControls())) {
      setRepeatForReview(true)
      return
    }
    repeatMutation.mutate({ period, files: repeatFiles })
  }

  const confirmRepeatRun = () => {
    saveDataControls({
      reviewBeforeSending: reviewEveryTask,
      externalProcessingAcknowledgedAt: new Date().toISOString(),
    })
    setRepeatForReview(false)
    repeatMutation.mutate({ period: repeatPeriod.trim(), files: repeatFiles })
  }

  const step = progressStep(execution?.status)
  const stages = ['Workspace prepared', 'Reviewing your request and files', 'Creating the deliverable', 'Ready to review']

  return (
    <>
    <main className="min-h-screen bg-[#f6f5f2] px-5 py-6 text-[#25231f] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-white hover:text-stone-900"
          >
            <ArrowLeft size={17} />
            Home
          </button>
          <div className="flex items-center gap-2 text-sm font-bold">
            <WorkerBeeMark size={36} />
            WorkerBee
          </div>
        </header>

        <section className="mt-10 overflow-hidden rounded-[26px] border border-[#dedad2] bg-white shadow-[0_18px_55px_rgba(54,48,38,0.09)]">
          <div className="border-b border-stone-100 px-6 py-7 sm:px-9">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b6928]">
                  {thread?.title || routeState?.taskTitle || workPack?.title || workPackDefinition?.title || 'WorkerBee task'}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                  {execution?.status === 'completed'
                    ? 'Your work is ready'
                    : execution?.status === 'failed'
                      ? 'This task needs attention'
                      : execution?.status === 'cancelled'
                        ? 'Task stopped'
                        : 'WorkerBee is on it'}
                </h1>
                {prompt && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-stone-600">{prompt}</p>}
                {currentAttemptNumber && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-500">
                    Version {currentAttemptNumber}{thread?.attempt_count ? ` of ${thread.attempt_count}` : ''}
                  </p>
                )}
              </div>
              {isActive(execution) && (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <LoaderCircle size={14} className="animate-spin" />
                  Working in your workspace
                </span>
              )}
            </div>
          </div>

          {executionQuery.isLoading && (
            <div className="flex items-center justify-center gap-3 px-8 py-20 text-sm text-stone-500">
              <LoaderCircle size={18} className="animate-spin" />
              Opening the task…
            </div>
          )}

          {!executionQuery.isLoading && execution && (
            <div className="px-6 py-7 sm:px-9 sm:py-9">
              {execution.status === 'failed' ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 shrink-0 text-rose-600" size={20} />
                    <div>
                      <h2 className="text-sm font-semibold text-rose-900">WorkerBee could not finish</h2>
                      <p className="mt-2 text-sm leading-6 text-rose-800">{errorMessage(execution)}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3 pl-8">
                    <button
                      type="button"
                      onClick={() => retryMutation.mutate(undefined)}
                      disabled={retryMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {retryMutation.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900"
                    >
                      Back home
                    </button>
                  </div>
                </div>
              ) : execution.status === 'completed' ? (
                <div>
                  {previewQuery.data && (
                    <ArtifactPreview
                      output={previewOutput!}
                      content={previewQuery.data}
                      outputType={previewOutputType}
                      workPackId={workPack?.id}
                    />
                  )}
                  {workPack && (
                    <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className={`rounded-2xl border p-5 ${outputValidation?.valid === false ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                        <div className="flex items-start gap-3">
                          {outputValidation?.valid === false ? (
                            <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700" />
                          ) : (
                            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-700" />
                          )}
                          <div>
                            <h2 className={`text-sm font-semibold ${outputValidation?.valid === false ? 'text-amber-950' : 'text-emerald-950'}`}>
                              {outputValidation?.valid === false
                                ? 'Expected deliverables need attention'
                                : workPackOutputs.length > 1
                                  ? 'All promised deliverables found'
                                  : 'Expected deliverable found'}
                            </h2>
                            <p className={`mt-1.5 text-xs leading-5 ${outputValidation?.valid === false ? 'text-amber-800' : 'text-emerald-800'}`}>
                              {outputValidation?.valid === false
                                ? `WorkerBee did not find ${outputValidation.missing_filenames?.join(', ') || outputValidation.expected_filename || outputValidation.expected_extension || 'the promised deliverable'}. Review the available files or retry the task.`
                                : workPackOutputs.length > 1
                                  ? `${workPackOutputs.length} promised files are ready to review.`
                                  : `${workPackOutputFilename || previewOutput?.filename || 'The deliverable'} is ready to review.`}
                            </p>
                            {workPackOutputs.length > 1 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {workPackOutputs.map((output) => {
                                  const filename = output.filename || 'deliverable'
                                  const outputStatus = outputValidation?.expected_outputs?.find(
                                    (candidate) => candidate.filename.toLowerCase() === filename.toLowerCase()
                                  )
                                  return (
                                    <span key={filename} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 font-mono text-[10px] font-semibold">
                                      {outputStatus?.valid === false ? <AlertTriangle size={11} /> : <Check size={11} />}
                                      {filename}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                        <h2 className="text-sm font-semibold">Review before sharing</h2>
                        <p className="mt-1 text-xs text-stone-500">Quickly confirm the pack-specific quality bar.</p>
                        <div className="mt-3 space-y-2">
                          {workPackQualityChecks.map((check, index) => (
                            <div key={check} className="flex items-start gap-2.5 text-xs leading-5 text-stone-600">
                              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-stone-300 bg-white text-[9px] font-semibold text-stone-500">{index + 1}</span>
                              {check}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-7">
                    <h2 className="text-sm font-semibold">Deliverables</h2>
                    {emailActionNotice && (
                      <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs leading-5 text-sky-800">{emailActionNotice}</p>
                    )}
                    {calendarActionNotice && (
                      <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-800">{calendarActionNotice}</p>
                    )}
                    {fileDeliveryNotice && (
                      <div className={`mt-3 flex flex-col gap-3 rounded-xl border px-3.5 py-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between ${fileDeliveryNotice.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={fileDeliveryNotice.error ? 'alert' : 'status'}>
                        <span>{fileDeliveryNotice.message}</span>
                        {fileDeliveryNotice.filePath && (
                          <button type="button" onClick={() => void platform.revealLocalFile(fileDeliveryNotice.filePath!)} className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-semibold text-emerald-800 sm:self-auto">
                            <FolderOpen size={14} /> Show in folder
                          </button>
                        )}
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      {outputs.map((output) => (
                        <div key={output.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 px-4 py-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                            <FileOutput size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{output.filename}</p>
                            <p className="mt-0.5 text-xs text-stone-500">{platform.isDesktop ? 'Ready to save to this computer' : 'Ready to download'}</p>
                          </div>
                          {isEmailMessageArtifact(output.filename) && (
                            <button
                              type="button"
                              onClick={() => void prepareEmailDraft(output)}
                              disabled={emailActionBusy}
                              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#25231f] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {emailActionBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Mail size={15} />}
                              <span className="hidden sm:inline">Open email draft</span>
                              <span className="sm:hidden">Email</span>
                            </button>
                          )}
                          {isCalendarSourceArtifact(output.filename) && (
                            <button
                              type="button"
                              onClick={() => void prepareCalendarDraft(output)}
                              disabled={calendarActionBusy}
                              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {calendarActionBusy ? <LoaderCircle size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
                              <span className="hidden sm:inline">Create follow-up event</span>
                              <span className="sm:hidden">Calendar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void download(output)}
                            className="rounded-xl border border-stone-200 p-2.5 text-stone-600 hover:bg-stone-50"
                            aria-label={`${platform.isDesktop ? 'Save a copy of' : 'Download'} ${output.filename}`}
                          >
                            {downloadingId === output.id ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(workPack?.id === 'recurring-reporting' || isProjectStatus) && thread && (
                    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                      {!showRepeat ? (
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                          <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-800 shadow-sm">
                              <LineChart size={18} />
                            </span>
                            <div>
                              <h2 className="text-sm font-semibold text-stone-900">{isProjectStatus ? 'Ready for the next status update?' : 'Ready for the next period?'}</h2>
                              <p className="mt-1 text-xs leading-5 text-stone-600">
                                {isProjectStatus
                                  ? 'Keep the same project setup and add current-period files. WorkerBee will save the update as the next version in this project history.'
                                  : 'Keep the same KPI definitions and add new-period files. WorkerBee will save the run as the next version in this report history.'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRepeat(true)
                              setRepeatError(null)
                            }}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            <RotateCcw size={15} />
                            {isProjectStatus ? 'Create next update' : 'Run next period'}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                            <RotateCcw size={16} />
                            {isProjectStatus ? 'Create the next project update' : 'Run the saved report setup again'}
                          </div>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <label className="text-xs font-semibold text-stone-700">
                              {isProjectStatus ? 'New status period' : 'New reporting period'}
                              <input
                                value={repeatPeriod}
                                onChange={(event) => {
                                  setRepeatPeriod(event.target.value)
                                  setRepeatError(null)
                                }}
                                placeholder={isProjectStatus ? 'Week ending July 31, 2026' : 'Week ending July 28, 2026'}
                                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                              />
                            </label>
                            <div>
                              <p className="text-xs font-semibold text-stone-700">{isProjectStatus ? 'Current-period source files' : 'New-period source files'}</p>
                              <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:border-stone-500">
                                <Files size={16} />
                                Add files
                                <input type="file" multiple className="hidden" onChange={addRepeatFiles} />
                              </label>
                            </div>
                          </div>
                          {repeatFiles.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {repeatFiles.map((file, index) => (
                                <span key={`${file.name}:${file.lastModified}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-stone-700">
                                  <span className="max-w-[220px] truncate">{file.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setRepeatFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                    className="font-semibold text-stone-400 hover:text-stone-800"
                                    aria-label={`Remove ${file.name}`}
                                  >
                                    Remove
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {repeatError && (
                            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{repeatError}</p>
                          )}
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowRepeat(false)
                                setRepeatFiles([])
                                setRepeatPeriod('')
                                setRepeatError(null)
                              }}
                              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={requestRepeatRun}
                              disabled={repeatMutation.isPending}
                              className="inline-flex items-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {repeatMutation.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                              Review and run
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {thread && <div className="mt-6 rounded-2xl border border-[#e4d7bc] bg-[#fbf7ee] p-5">
                    {!showRevision ? (
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <h2 className="text-sm font-semibold text-stone-900">Want a stronger version?</h2>
                          <p className="mt-1 text-xs leading-5 text-stone-600">
                            Ask for a change and WorkerBee will keep this version while creating the next one.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowRevision(true)}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white"
                        >
                          <PencilLine size={15} />
                          Improve this result
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="revision-note" className="text-sm font-semibold text-stone-900">
                          What should change in the next version?
                        </label>
                        <textarea
                          id="revision-note"
                          value={revisionNote}
                          onChange={(event) => setRevisionNote(event.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="For example: shorten the opening, quantify the top risks, and move action owners into a table."
                          className="mt-3 w-full resize-y rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                        />
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowRevision(false)
                              setRevisionNote('')
                            }}
                            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={requestRevision}
                            disabled={!revisionNote.trim() || retryMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {retryMutation.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <PencilLine size={15} />}
                            Create version {(thread?.attempt_count || currentAttemptNumber || 1) + 1}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>}
                </div>
              ) : (
                <div>
                  <div className="space-y-1">
                    {stages.map((label, index) => {
                      const stageNumber = index + 1
                      const complete = stageNumber < step
                      const active = stageNumber === step
                      return (
                        <div key={label} className="flex items-center gap-4 rounded-xl px-3 py-3">
                          <span className={`grid h-7 w-7 place-items-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-400'}`}>
                            {complete ? <Check size={15} /> : active ? <LoaderCircle size={15} className="animate-spin" /> : <Circle size={10} />}
                          </span>
                          <span className={`text-sm ${active ? 'font-semibold text-stone-900' : 'text-stone-500'}`}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-6 rounded-xl bg-[#f5efe3] px-4 py-3 text-xs leading-5 text-[#765719]">
                    You can leave this screen. WorkerBee will keep working in your local workspace.
                  </p>
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  >
                    <Square size={13} />
                    Stop task
                  </button>
                </div>
              )}

              {thread && thread.attempts && thread.attempts.length > 0 && (
                <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <History size={17} className="text-[#8b6928]" />
                        Version history
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-stone-500">
                        Every attempt and its deliverables stay available here.
                      </p>
                    </div>
                    <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-500">
                      {thread.attempt_count} {thread.attempt_count === 1 ? 'version' : 'versions'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {thread.attempts.map((attempt) => {
                      const selected = attempt.execution.id === executionId
                      const attemptRevision = typeof attempt.execution.result?.revision_note === 'string'
                        ? attempt.execution.result.revision_note
                        : null
                      return (
                        <div
                          key={attempt.id}
                          className={`rounded-xl border px-4 py-3 ${selected ? 'border-amber-300 bg-amber-50/70' : 'border-stone-200 bg-white'}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <button
                              type="button"
                              onClick={() => navigate(`/work/${attempt.execution.id}`)}
                              disabled={selected}
                              className="min-w-0 w-full flex-1 text-left disabled:cursor-default"
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-stone-900">Version {attempt.attempt_number}</span>
                                {selected && <span className="text-[11px] font-semibold text-amber-800">Viewing</span>}
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClasses(attempt.execution.status)}`}>
                                  {statusLabel(attempt.execution.status)}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs text-stone-500">
                                {attempt.execution.started_at
                                  ? new Date(attempt.execution.started_at).toLocaleString(undefined, {
                                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                    })
                                  : 'Recently'}
                                {' · '}{attempt.artifacts.length} {attempt.artifacts.length === 1 ? 'file' : 'files'}
                              </span>
                              {attemptRevision && (
                                <span className="mt-1.5 block break-words text-xs leading-5 text-stone-600 sm:truncate">
                                  Requested change: {attemptRevision}
                                </span>
                              )}
                            </button>
                            <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:justify-end">
                              {attempt.artifacts.slice(0, 3).map((artifact) => (
                                <button
                                  key={artifact.id}
                                  type="button"
                                  onClick={() => void download(artifact)}
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 hover:border-stone-300 hover:text-stone-900 sm:max-w-[190px]"
                          title={`${platform.isDesktop ? 'Save a copy of' : 'Download'} ${artifact.filename}`}
                                >
                                  <Download size={12} />
                                  <span className="truncate">{artifact.filename}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="mt-8 border-t border-stone-100 pt-5">
                <button
                  type="button"
                  onClick={() => setShowDetails((value) => !value)}
                  className="flex items-center gap-2 text-xs font-semibold text-stone-500 hover:text-stone-800"
                >
                  <ChevronDown size={15} className={`transition ${showDetails ? 'rotate-180' : ''}`} />
                  Activity details
                </button>
                {showDetails && (
                  <div className="mt-4 max-h-64 space-y-2 overflow-auto rounded-xl bg-stone-950 p-4 font-mono text-[11px] leading-5 text-stone-300">
                    {(logsQuery.data ?? []).map((log) => (
                      <p key={log.id}>{log.message}</p>
                    ))}
                    {(logsQuery.data ?? []).length === 0 && <p>Waiting for activity…</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
    {revisionForReview && (
      <DataSharingReviewDialog
        eyebrow="Before WorkerBee creates a new version"
        request={`Revision request:\n${revisionForReview}`}
        files={revisionFiles}
        destination={runtimeQuery.data?.modelService || 'Selected model service'}
        model={runtimeQuery.data?.model}
        reviewEveryTask={reviewEveryTask}
        confirmLabel={`Send and create version ${(thread?.attempt_count || currentAttemptNumber || 1) + 1}`}
        onReviewEveryTaskChange={setReviewEveryTask}
        onClose={() => setRevisionForReview(null)}
        onConfirm={confirmRevision}
      />
    )}
    {repeatForReview && (
      <DataSharingReviewDialog
        eyebrow={isProjectStatus ? 'Before WorkerBee creates the next project update' : 'Before WorkerBee runs the next reporting period'}
        request={repeatPrompt(repeatPeriod.trim())}
        files={repeatFiles.map((file) => ({ name: file.name, size: file.size }))}
        destination={runtimeQuery.data?.modelService || 'Selected model service'}
        model={runtimeQuery.data?.model}
        reviewEveryTask={reviewEveryTask}
        confirmLabel={`Send and create version ${(thread?.attempt_count || currentAttemptNumber || 1) + 1}`}
        onReviewEveryTaskChange={setReviewEveryTask}
        onClose={() => setRepeatForReview(false)}
        onConfirm={confirmRepeatRun}
      />
    )}
    {emailReview && (
      <EmailDraftReviewDialog
        artifactFilename={emailReview.artifact.filename}
        initialDraft={emailReview.draft}
        busy={emailActionBusy}
        error={emailActionError}
        onClose={() => {
          if (emailActionBusy) return
          setEmailReview(null)
          setEmailActionError(null)
        }}
        onConfirm={(draft) => void confirmEmailDraft(draft)}
      />
    )}
    {calendarReview && (
      <CalendarDraftReviewDialog
        artifactFilename={calendarReview.artifact.filename}
        initialDraft={calendarReview.draft}
        destinationLabel={platform.isDesktop ? 'Default calendar app' : 'Calendar file (.ics)'}
        confirmLabel={platform.isDesktop ? 'Open draft in calendar' : 'Download calendar draft'}
        busy={calendarActionBusy}
        error={calendarActionError}
        onClose={() => {
          if (calendarActionBusy) return
          setCalendarReview(null)
          setCalendarActionError(null)
        }}
        onConfirm={(draft) => void confirmCalendarDraft(draft)}
      />
    )}
    </>
  )
}
