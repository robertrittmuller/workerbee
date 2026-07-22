export const MAX_LIBRARY_TASK_SOURCES = 20

export type LibraryQuickStart = {
  workflowId: 'document-summarization' | 'spreadsheet-cleanup' | 'research-synthesis'
  label: 'Summarize' | 'Clean spreadsheet' | 'Compare sources'
  reason: string
}

type LibraryQuickStartSource = {
  file_type: string
  content_type: string
}

const TABULAR_CONTENT_TYPES = new Set([
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export function libraryQuickStart(
  sources: readonly LibraryQuickStartSource[]
): LibraryQuickStart | null {
  if (sources.length === 0) return null
  if (sources.length >= 2) {
    return {
      workflowId: 'research-synthesis',
      label: 'Compare sources',
      reason: `${sources.length} sources · compare claims, disagreements, and gaps`,
    }
  }

  const source = sources[0]!
  const fileType = source.file_type.trim().toLowerCase()
  const contentType = source.content_type.trim().toLowerCase()
  if (fileType === 'csv' || fileType === 'excel' || TABULAR_CONTENT_TYPES.has(contentType)) {
    return {
      workflowId: 'spreadsheet-cleanup',
      label: 'Clean spreadsheet',
      reason: 'One tabular source · preserve rows and explain every cleanup',
    }
  }

  return {
    workflowId: 'document-summarization',
    label: 'Summarize',
    reason: 'One source · create a grounded executive brief',
  }
}

export function uniqueLibrarySourceIds(values: readonly string[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function resolveLibrarySourceSet(
  sourceSetIds: readonly string[],
  availableSourceIds: readonly string[]
): { fileIds: string[]; missingIds: string[] } {
  const requestedIds = uniqueLibrarySourceIds(sourceSetIds).slice(0, MAX_LIBRARY_TASK_SOURCES)
  const available = new Set(uniqueLibrarySourceIds(availableSourceIds))
  return {
    fileIds: requestedIds.filter((id) => available.has(id)),
    missingIds: requestedIds.filter((id) => !available.has(id)),
  }
}

export function librarySourceSearch(search: string, sourceIds: readonly string[]): string {
  const params = new URLSearchParams(search)
  params.delete('source')
  for (const id of uniqueLibrarySourceIds(sourceIds).slice(0, MAX_LIBRARY_TASK_SOURCES)) {
    params.append('source', id)
  }
  return params.toString()
}

export function libraryTaskSearch(
  search: string,
  sourceIds: readonly string[],
  workflowId?: string
): string {
  const params = new URLSearchParams(librarySourceSearch(search, sourceIds))
  params.delete('workflow')
  const normalizedWorkflowId = workflowId?.trim()
  if (normalizedWorkflowId) params.set('workflow', normalizedWorkflowId)
  return params.toString()
}

export function libraryPreviewSourceId(search: string): string {
  return new URLSearchParams(search).get('preview')?.trim() ?? ''
}

export function libraryPreviewSearch(search: string, sourceId?: string): string {
  const params = new URLSearchParams(search)
  params.delete('preview')
  const normalizedId = sourceId?.trim()
  if (normalizedId) params.set('preview', normalizedId)
  return params.toString()
}

export function attachedSourceCount(localFileCount: number, librarySourceIds: readonly string[]): number {
  return Math.max(0, localFileCount) + uniqueLibrarySourceIds(librarySourceIds).length
}

export function taskResourceIds(
  connectedResourceIds: string[],
  librarySourceIds: readonly string[],
  uploadedResourceIds: string[]
): string[] {
  return Array.from(
    new Set([
      ...connectedResourceIds,
      ...uniqueLibrarySourceIds(librarySourceIds),
      ...uploadedResourceIds,
    ])
  )
}
