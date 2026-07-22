import type { FileResource, RecentOutputFile, TaskThread } from '@/lib/api'
import { WORK_PACKS, type WorkPackId } from '@/lib/workPacks'

export type WorkSearchItem = {
  id: string
  kind: 'workflow' | 'thread' | 'output' | 'source'
  title: string
  description: string
  meta: string
  searchable: string
  executionId?: string
  fileId?: string
  workPackId?: WorkPackId
  timestamp?: number
}

const WORKFLOW_GROUPS: Record<string, string> = {
  'document-summarization': 'Briefs & decisions',
  'data-extractor-csv': 'Data & reporting',
  'spreadsheet-cleanup': 'Data & reporting',
  'recurring-reporting': 'Data & reporting',
  'project-status-reporting': 'Projects & operations',
  'research-synthesis': 'Research & analysis',
  'proposal-creation': 'Briefs & decisions',
  'html5-dashboard-generator': 'Data & reporting',
  'presentation-creation': 'Briefs & decisions',
  'meeting-preparation': 'Meetings',
  'meeting-follow-up': 'Meetings',
  'decision-memo': 'Briefs & decisions',
  'blank-template': 'Start from a request',
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function timestamp(value: string | null | undefined): number {
  return value ? Date.parse(value) || 0 : 0
}

export function buildWorkSearchItems(
  threads: TaskThread[],
  outputs: RecentOutputFile[],
  sources: FileResource[] = []
): WorkSearchItem[] {
  const threadItems = threads
    .filter((thread) => Boolean(thread.latest_execution_id))
    .map((thread) => ({
      id: `thread:${thread.id}`,
      kind: 'thread' as const,
      title: thread.title,
      description: thread.original_prompt,
      meta: `${thread.attempt_count} ${thread.attempt_count === 1 ? 'version' : 'versions'} · ${thread.status}`,
      searchable: normalize(`${thread.title} ${thread.original_prompt} ${thread.status}`),
      executionId: thread.latest_execution_id ?? undefined,
      timestamp: timestamp(thread.updated_at),
    }))

  const outputItems = outputs.map((output) => ({
    id: `output:${output.id}`,
    kind: 'output' as const,
    title: output.filename,
    description: output.agent_name
      ? `Created by ${output.agent_name}`
      : 'Created by WorkerBee',
    meta: `${output.attempt_number ? `Version ${output.attempt_number} · ` : ''}${output.output_type || output.content_type}`,
    searchable: normalize(
      `${output.filename} ${output.agent_name || ''} ${output.output_name || ''} ${output.output_type || ''} ${output.content_type}`
    ),
    executionId: output.execution_id,
    timestamp: timestamp(output.created_at),
  }))

  const sourceItems = sources.map((source) => ({
    id: `source:${source.id}`,
    kind: 'source' as const,
    title: source.original_filename,
    description: 'Reusable source file',
    meta: `${source.file_type || 'file'} · ${formatFileSize(source.file_size)}`,
    searchable: normalize(
      `${source.original_filename} ${source.filename} ${source.file_type} ${source.content_type}`
    ),
    fileId: source.id,
    timestamp: timestamp(source.created_at),
  }))

  const workflowItems = WORK_PACKS.map((workPack) => {
    const group = WORKFLOW_GROUPS[workPack.id] || 'Common task'
    const outputNames = (workPack.outputs ?? [])
      .map((output) => `${output.label} ${output.filename}`)
      .join(' ')
    return {
      id: `workflow:${workPack.id}`,
      kind: 'workflow' as const,
      title: workPack.title,
      description: workPack.description,
      meta: workPack.guided ? `${group} · ${workPack.setupTime}` : group,
      searchable: normalize(
        `${workPack.title} ${workPack.description} ${group} ${workPack.sourceHint} ${outputNames}`
      ),
      workPackId: workPack.id,
    }
  })

  return [...threadItems, ...outputItems, ...sourceItems, ...workflowItems]
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function itemScore(item: WorkSearchItem, query: string): number {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    if (item.kind === 'thread') return 300 + (item.timestamp ?? 0) / 10_000_000_000
    if (item.kind === 'output') return 200 + (item.timestamp ?? 0) / 10_000_000_000
    if (item.kind === 'source') return 150 + (item.timestamp ?? 0) / 10_000_000_000
    return 100
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean)
  if (!tokens.every((token) => item.searchable.includes(token))) return -1
  const title = normalize(item.title)
  let score = item.kind === 'thread' ? 30 : item.kind === 'source' ? 25 : item.kind === 'workflow' ? 20 : 10
  if (title === normalizedQuery) score += 200
  else if (title.startsWith(normalizedQuery)) score += 120
  else if (title.includes(normalizedQuery)) score += 80
  for (const token of tokens) {
    if (title.startsWith(token)) score += 25
    else if (title.includes(token)) score += 15
  }
  return score
}

export function searchWorkItems(items: WorkSearchItem[], query: string): WorkSearchItem[] {
  return items
    .map((item) => ({ item, score: itemScore(item, query) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item)
}
