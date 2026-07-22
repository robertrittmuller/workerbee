import type { FileResource, RecentOutputFile } from '@/lib/api'

export type LibraryView = 'all' | 'sources' | 'deliverables'

export interface LibrarySource extends FileResource {
  groupId?: string
  groupName?: string
}

function includesQuery(values: Array<string | null | undefined>, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return values.some((value) => value?.toLocaleLowerCase().includes(normalized))
}

export function filterLibrarySources(
  sources: LibrarySource[],
  query: string,
  groupId?: string
): LibrarySource[] {
  return sources.filter(
    (source) =>
      (!groupId || source.groupId === groupId) &&
      includesQuery(
        [source.original_filename, source.file_type, source.content_type, source.groupName],
        query
      )
  )
}

export function filterLibraryOutputs(
  outputs: RecentOutputFile[],
  query: string
): RecentOutputFile[] {
  return outputs.filter((output) =>
    includesQuery(
      [output.filename, output.agent_name, output.output_name, output.output_type, output.content_type],
      query
    )
  )
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
