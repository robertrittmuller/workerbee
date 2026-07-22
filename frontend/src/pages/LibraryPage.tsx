import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  File,
  FileArchive,
  FileImage,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Files,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Layers3,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import WorkspaceSidebar from '@/components/WorkspaceSidebar'
import FilePreviewDialog from '@/components/FilePreviewDialog'
import { filesApi, outputsApi, type FileResource, type RecentOutputFile, type ResourceGroup, type SourceSet } from '@/lib/api'
import {
  filterLibraryOutputs,
  filterLibrarySources,
  formatFileSize,
  type LibrarySource,
  type LibraryView,
} from '@/lib/librarySearch'
import { platform } from '@/lib/platform'
import { deliverFile } from '@/lib/fileDelivery'
import {
  MAX_LIBRARY_TASK_SOURCES,
  libraryPreviewSearch,
  libraryPreviewSourceId,
  libraryQuickStart,
  libraryTaskSearch,
  resolveLibrarySourceSet,
  uniqueLibrarySourceIds,
} from '@/lib/libraryHandoff'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function fileIcon(fileType: string, contentType: string) {
  const classes = 'h-5 w-5'
  if (fileType === 'excel' || fileType === 'csv') return <FileSpreadsheet className={classes} />
  if (fileType === 'image' || contentType.startsWith('image/')) return <FileImage className={classes} />
  if (fileType === 'pdf' || fileType === 'word' || fileType === 'text') return <FileText className={classes} />
  if (contentType.includes('zip')) return <FileArchive className={classes} />
  return <File className={classes} />
}

interface OrganizationData {
  groups: ResourceGroup[]
  groupByFileId: Record<string, ResourceGroup>
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [view, setView] = useState<LibraryView>('all')
  const [query, setQuery] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameCollectionName, setRenameCollectionName] = useState('')
  const [showBatchMove, setShowBatchMove] = useState(false)
  const [batchTargetGroupId, setBatchTargetGroupId] = useState('')
  const [showSaveSet, setShowSaveSet] = useState(false)
  const [newSourceSetName, setNewSourceSetName] = useState('')
  const [renamingSourceSetId, setRenamingSourceSetId] = useState<string | null>(null)
  const [renameSourceSetName, setRenameSourceSetName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deliveryNotice, setDeliveryNotice] = useState<{ message: string; filePath?: string } | null>(null)
  const [previewSource, setPreviewSource] = useState<FileResource | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => new Set())
  const shortcutLabel =
    platform.name === 'darwin' || navigator.platform.toLocaleLowerCase().includes('mac')
      ? '⌘K'
      : 'Ctrl K'
  const searchString = searchParams.toString()
  const previewSourceId = libraryPreviewSourceId(searchString)

  const filesQuery = useQuery({
    queryKey: ['library-files'],
    queryFn: async () => (await filesApi.list()).data,
  })
  const outputsQuery = useQuery({
    queryKey: ['library-outputs'],
    queryFn: async () => (await outputsApi.listRecentFiles({ limit: 100 })).data,
  })
  const organizationQuery = useQuery<OrganizationData>({
    queryKey: ['library-organization'],
    queryFn: async () => {
      const groups = (await filesApi.listResourceGroups()).data
      const groupFiles = await Promise.all(
        groups.map(async (group) => ({
          group,
          files: (await filesApi.listFilesByResourceGroup(group.id)).data,
        }))
      )
      const groupByFileId: Record<string, ResourceGroup> = {}
      for (const entry of groupFiles) {
        for (const file of entry.files) groupByFileId[file.id] = entry.group
      }
      return { groups, groupByFileId }
    },
  })
  const sourceSetsQuery = useQuery({
    queryKey: ['library-source-sets'],
    queryFn: async () => (await filesApi.listSourceSets()).data,
  })

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const groups = organizationQuery.data?.groups ?? []
  const sources = useMemo<LibrarySource[]>(
    () =>
      (filesQuery.data ?? []).map((file) => {
        const group = organizationQuery.data?.groupByFileId[file.id]
        return { ...file, groupId: group?.id, groupName: group?.name }
      }),
    [filesQuery.data, organizationQuery.data]
  )
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources]
  )
  const sourceSets = useMemo(() => sourceSetsQuery.data ?? [], [sourceSetsQuery.data])
  const outputs = useMemo(() => outputsQuery.data ?? [], [outputsQuery.data])
  const visibleSources = useMemo(
    () => filterLibrarySources(sources, query, selectedGroupId || undefined),
    [query, selectedGroupId, sources]
  )
  const visibleOutputs = useMemo(() => filterLibraryOutputs(outputs, query), [outputs, query])
  const selectedSources = useMemo(
    () => sources.filter((source) => selectedSourceIds.has(source.id)),
    [selectedSourceIds, sources]
  )
  const selectedQuickStart = useMemo(() => libraryQuickStart(selectedSources), [selectedSources])
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const isLoading = filesQuery.isLoading || outputsQuery.isLoading || organizationQuery.isLoading || sourceSetsQuery.isLoading
  const showSourcesSection =
    view === 'sources' ||
    (view === 'all' && (visibleSources.length > 0 || visibleOutputs.length === 0 || !query.trim()))
  const showOutputsSection =
    view === 'deliverables' ||
    (view === 'all' && (visibleOutputs.length > 0 || visibleSources.length === 0 || !query.trim()))

  useEffect(() => {
    const availableIds = new Set(sources.map((source) => source.id))
    setSelectedSourceIds((current) => {
      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [sources])

  useEffect(() => {
    if (!previewSourceId || filesQuery.isLoading || filesQuery.isError) return
    const source = (filesQuery.data ?? []).find((item) => item.id === previewSourceId)
    if (source) {
      setPreviewSource((current) => current?.id === source.id ? current : source)
      return
    }
    setPreviewSource(null)
    setErrorMessage('That source file is no longer available in this workspace.')
    setSearchParams(libraryPreviewSearch(searchString), { replace: true })
  }, [filesQuery.data, filesQuery.isError, filesQuery.isLoading, previewSourceId, searchString, setSearchParams])

  const openPreview = (source: FileResource) => {
    setPreviewSource(source)
    setSearchParams(libraryPreviewSearch(searchString, source.id), { replace: true })
  }

  const closePreview = () => {
    setPreviewSource(null)
    setSearchParams(libraryPreviewSearch(searchString), { replace: true })
  }

  const toggleSourceSelection = (sourceId: string) => {
    const selected = selectedSourceIds.has(sourceId)
    if (!selected && selectedSourceIds.size >= MAX_LIBRARY_TASK_SOURCES) {
      setErrorMessage(`Choose no more than ${MAX_LIBRARY_TASK_SOURCES} source files for one task.`)
      return
    }
    setSelectedSourceIds((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  const selectVisibleSources = () => {
    const candidateIds = uniqueLibrarySourceIds([
      ...selectedSourceIds,
      ...visibleSources.map((source) => source.id),
    ])
    const nextIds = candidateIds.slice(0, MAX_LIBRARY_TASK_SOURCES)
    setSelectedSourceIds(new Set(nextIds))
    if (candidateIds.length > MAX_LIBRARY_TASK_SOURCES) {
      setErrorMessage(`Selected the first ${MAX_LIBRARY_TASK_SOURCES} files. Start another task for the remaining sources.`)
    }
  }

  const startTaskWithSources = (sourceIds: readonly string[], workflowId?: string) => {
    const search = libraryTaskSearch('', sourceIds, workflowId)
    navigate(`/dashboard?${search}`)
  }

  const resolvedSavedSetSources = (sourceSet: SourceSet): LibrarySource[] | null => {
    const resolution = resolveLibrarySourceSet(
      sourceSet.file_ids,
      sources.map((source) => source.id)
    )
    if (resolution.missingIds.length > 0 || resolution.fileIds.length !== sourceSet.file_count) {
      setErrorMessage(`“${sourceSet.name}” includes a source that is no longer available. Refresh or update the saved set before using it.`)
      return null
    }
    return resolution.fileIds.map((id) => sourceById.get(id)!).filter(Boolean)
  }

  const selectSavedSourceSet = (sourceSet: SourceSet) => {
    const resolvedSources = resolvedSavedSetSources(sourceSet)
    if (!resolvedSources) return
    setSelectedSourceIds(new Set(resolvedSources.map((source) => source.id)))
    setSelectedGroupId('')
    setQuery('')
    setView('sources')
    setErrorMessage(null)
    setDeliveryNotice({
      message: `Selected “${sourceSet.name}” · ${resolvedSources.length} ${resolvedSources.length === 1 ? 'source' : 'sources'} ready.`,
    })
  }

  const startTaskWithSavedSourceSet = (sourceSet: SourceSet) => {
    const resolvedSources = resolvedSavedSetSources(sourceSet)
    if (!resolvedSources) return
    startTaskWithSources(resolvedSources.map((source) => source.id))
  }

  const refreshSources = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library-files'] }),
      queryClient.invalidateQueries({ queryKey: ['library-organization'] }),
    ])
  }

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selectedFiles.length) return
    setUploading(true)
    setErrorMessage(null)
    try {
      for (const file of selectedFiles) {
        await filesApi.upload(file, selectedGroupId || undefined)
      }
      await refreshSources()
      setView('sources')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The selected files could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  const createCollection = async (event: FormEvent) => {
    event.preventDefault()
    const name = newCollectionName.trim()
    if (!name) return
    setBusyId('new-collection')
    setErrorMessage(null)
    try {
      const created = (await filesApi.createResourceGroup(name)).data
      await queryClient.invalidateQueries({ queryKey: ['library-organization'] })
      setSelectedGroupId(created.id)
      setNewCollectionName('')
      setShowNewCollection(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The collection could not be created.')
    } finally {
      setBusyId(null)
    }
  }

  const openSaveSourceSet = () => {
    setShowBatchMove(false)
    setNewSourceSetName('')
    setShowSaveSet(true)
  }

  const saveSelectedSourceSet = async (event: FormEvent) => {
    event.preventDefault()
    const name = newSourceSetName.trim()
    if (!name || selectedSources.length === 0) return
    setBusyId('save-source-set')
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const created = (await filesApi.createSourceSet(
        name,
        selectedSources.map((source) => source.id)
      )).data
      await queryClient.invalidateQueries({ queryKey: ['library-source-sets'] })
      setShowSaveSet(false)
      setNewSourceSetName('')
      setDeliveryNotice({
        message: `Saved “${created.name}” for repeat work with ${created.file_count} ${created.file_count === 1 ? 'source' : 'sources'}.`,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The selected source set could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  const beginRenameSourceSet = (sourceSet: SourceSet) => {
    setRenamingSourceSetId(sourceSet.id)
    setRenameSourceSetName(sourceSet.name)
  }

  const renameSourceSet = async (event: FormEvent) => {
    event.preventDefault()
    const sourceSet = sourceSets.find((item) => item.id === renamingSourceSetId)
    const name = renameSourceSetName.trim()
    if (!sourceSet || !name) return
    setBusyId(`rename-source-set-${sourceSet.id}`)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const renamed = (await filesApi.updateSourceSet(sourceSet.id, { name })).data
      await queryClient.invalidateQueries({ queryKey: ['library-source-sets'] })
      setRenamingSourceSetId(null)
      setRenameSourceSetName('')
      setDeliveryNotice({ message: `Renamed saved set to “${renamed.name}”.` })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The saved set could not be renamed.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteSourceSet = async (sourceSet: SourceSet) => {
    if (!window.confirm(`Delete the saved set “${sourceSet.name}”? Its source files will stay in your library.`)) return
    setBusyId(`delete-source-set-${sourceSet.id}`)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      await filesApi.deleteSourceSet(sourceSet.id)
      await queryClient.invalidateQueries({ queryKey: ['library-source-sets'] })
      setRenamingSourceSetId(null)
      setDeliveryNotice({ message: `Deleted the saved set “${sourceSet.name}”. Source files were not changed.` })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The saved set could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  const replaceSourceSetFiles = async (sourceSet: SourceSet) => {
    if (selectedSources.length === 0) return
    if (!window.confirm(`Replace the files in “${sourceSet.name}” with the ${selectedSources.length} currently selected ${selectedSources.length === 1 ? 'source' : 'sources'}?`)) return
    setBusyId(`update-source-set-${sourceSet.id}`)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const updated = (await filesApi.updateSourceSet(sourceSet.id, {
        file_ids: selectedSources.map((source) => source.id),
      })).data
      await queryClient.invalidateQueries({ queryKey: ['library-source-sets'] })
      setDeliveryNotice({
        message: `Updated “${updated.name}” with ${updated.file_count} ${updated.file_count === 1 ? 'source' : 'sources'}.`,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The saved set files could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  const moveSource = async (source: FileResource, groupId: string) => {
    setBusyId(source.id)
    setErrorMessage(null)
    try {
      await filesApi.assignFileToResourceGroup(source.id, groupId || null)
      await refreshSources()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The file could not be moved.')
    } finally {
      setBusyId(null)
    }
  }

  const openBatchMove = () => {
    setShowSaveSet(false)
    const sourceGroupIds = new Set(selectedSources.map((source) => source.groupId).filter(Boolean))
    const target =
      groups.find((group) => !sourceGroupIds.has(group.id)) ??
      groups.find((group) => group.is_default) ??
      groups[0]
    setBatchTargetGroupId(target?.id ?? '')
    setShowBatchMove(true)
  }

  const moveSelectedSources = async () => {
    const target = groups.find((group) => group.id === batchTargetGroupId)
    if (!target || selectedSources.length === 0) return
    setBusyId('batch-move')
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const response = await filesApi.assignFilesToResourceGroup(
        selectedSources.map((source) => source.id),
        target.id
      )
      await refreshSources()
      setSelectedSourceIds(new Set())
      setShowBatchMove(false)
      setDeliveryNotice({
        message: `Moved ${response.data.moved_count} ${response.data.moved_count === 1 ? 'source' : 'sources'} to “${target.name}”.`,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The selected files could not be moved.')
    } finally {
      setBusyId(null)
    }
  }

  const beginRenameCollection = (group: ResourceGroup) => {
    setRenamingGroupId(group.id)
    setRenameCollectionName(group.name)
  }

  const renameCollection = async (event: FormEvent) => {
    event.preventDefault()
    const group = groups.find((item) => item.id === renamingGroupId)
    const name = renameCollectionName.trim()
    if (!group || group.is_default || !name) return
    setBusyId(`rename-${group.id}`)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const renamed = (await filesApi.renameResourceGroup(group.id, name)).data
      await queryClient.invalidateQueries({ queryKey: ['library-organization'] })
      setRenamingGroupId(null)
      setRenameCollectionName('')
      setDeliveryNotice({ message: `Renamed collection to “${renamed.name}”.` })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The collection could not be renamed.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteCollection = async (group: ResourceGroup) => {
    if (group.is_default || group.file_count > 0) return
    if (!window.confirm(`Delete the empty collection “${group.name}”? This cannot be undone.`)) return
    setBusyId(`delete-${group.id}`)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      await filesApi.deleteResourceGroup(group.id)
      setSelectedGroupId('')
      await queryClient.invalidateQueries({ queryKey: ['library-organization'] })
      setDeliveryNotice({ message: `Deleted the empty collection “${group.name}”.` })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The collection could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  const downloadSource = async (source: FileResource) => {
    setBusyId(source.id)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const response = await filesApi.download(source.id)
      const result = await deliverFile(response.data as Blob, source.original_filename)
      if (result.method !== 'cancelled') {
        setDeliveryNotice({
          message: result.method === 'saved'
            ? `Saved “${source.original_filename}” to this computer.`
            : `Download started for “${source.original_filename}”.`,
          filePath: result.filePath,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The file could not be downloaded.')
    } finally {
      setBusyId(null)
    }
  }

  const downloadSelectedSources = async () => {
    if (selectedSources.length < 2) return
    const sourceCount = selectedSources.length
    setBusyId('batch-download')
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const response = await filesApi.downloadBatch(selectedSources.map((source) => source.id))
      const result = await deliverFile(response.data as Blob, 'workerbee-sources.zip')
      if (result.method !== 'cancelled') {
        setDeliveryNotice({
          message: result.method === 'saved'
            ? `Saved ${sourceCount} sources as “workerbee-sources.zip”.`
            : `Download started for ${sourceCount} sources.`,
          filePath: result.filePath,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The selected files could not be downloaded.')
    } finally {
      setBusyId(null)
    }
  }

  const downloadSavedSourceSet = async (sourceSet: SourceSet) => {
    const resolvedSources = resolvedSavedSetSources(sourceSet)
    if (!resolvedSources) return
    const busyKey = `download-source-set-${sourceSet.id}`
    setBusyId(busyKey)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const response = await filesApi.downloadBatch(resolvedSources.map((source) => source.id))
      const result = await deliverFile(response.data as Blob, 'workerbee-sources.zip')
      if (result.method !== 'cancelled') {
        setDeliveryNotice({
          message: result.method === 'saved'
            ? `Saved “${sourceSet.name}” as “workerbee-sources.zip”.`
            : `Download started for “${sourceSet.name}”.`,
          filePath: result.filePath,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The saved source set could not be downloaded.')
    } finally {
      setBusyId(null)
    }
  }

  const downloadOutput = async (output: RecentOutputFile) => {
    setBusyId(output.id)
    setErrorMessage(null)
    setDeliveryNotice(null)
    try {
      const response = await outputsApi.downloadRecentFile(output.id)
      const result = await deliverFile(response.data as Blob, output.filename)
      if (result.method !== 'cancelled') {
        setDeliveryNotice({
          message: result.method === 'saved'
            ? `Saved “${output.filename}” to this computer.`
            : `Download started for “${output.filename}”.`,
          filePath: result.filePath,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The deliverable could not be downloaded.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteSource = async (source: FileResource) => {
    if (!window.confirm(`Delete “${source.original_filename}” from your library? This cannot be undone.`)) return
    setBusyId(source.id)
    setErrorMessage(null)
    try {
      await filesApi.delete(source.id)
      setSelectedSourceIds((current) => {
        if (!current.has(source.id)) return current
        const next = new Set(current)
        next.delete(source.id)
        return next
      })
      await refreshSources()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The file could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  const sourceRows = visibleSources.map((source) => (
    <article
      key={source.id}
      className={`grid gap-4 border-t border-stone-200 px-5 py-4 transition sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-6 ${selectedSourceIds.has(source.id) ? 'bg-[#fbf6ea]' : 'hover:bg-[#fbfaf7]'}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <label className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center" aria-label={`Select ${source.original_filename}`}>
          <input
            type="checkbox"
            checked={selectedSourceIds.has(source.id)}
            onChange={() => toggleSourceSelection(source.id)}
            className="peer sr-only"
          />
          <span className={`grid h-5 w-5 place-items-center rounded-md border transition ${selectedSourceIds.has(source.id) ? 'border-[#293438] bg-[#293438] text-white' : 'border-stone-300 bg-white text-transparent peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400'}`}><Check size={13} strokeWidth={3} /></span>
        </label>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0ece3] text-[#765719]">
          {fileIcon(source.file_type, source.content_type)}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-stone-900">{source.original_filename}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
            <span>{source.groupName ?? 'Default'}</span>
            <span aria-hidden="true">·</span>
            <span>{formatFileSize(source.file_size)}</span>
            <span aria-hidden="true">·</span>
            <span>{DATE_FORMAT.format(new Date(source.created_at))}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-[76px] sm:pl-0">
        <button
          type="button"
          onClick={() => openPreview(source)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300"
        >
          <Eye size={15} /> Preview
        </button>
        <label className="sr-only" htmlFor={`group-${source.id}`}>Collection for {source.original_filename}</label>
        <select
          id={`group-${source.id}`}
          value={source.groupId ?? ''}
          disabled={busyId === source.id}
          onChange={(event) => void moveSource(source, event.target.value)}
          className="max-w-40 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-600 outline-none focus:border-[#b58a25]"
        >
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => void downloadSource(source)}
          disabled={busyId === source.id}
          className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:opacity-50"
                    aria-label={`${platform.isDesktop ? 'Save a copy of' : 'Download'} ${source.original_filename}`}
        >
          {busyId === source.id ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
        </button>
        <button
          type="button"
          onClick={() => void deleteSource(source)}
          disabled={busyId === source.id}
          className="rounded-lg p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          aria-label={`Delete ${source.original_filename}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  ))

  const outputRows = visibleOutputs.map((output) => (
    <article
      key={output.id}
      className="grid gap-4 border-t border-stone-200 px-5 py-4 transition hover:bg-[#fbfaf7] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf2ef] text-[#316756]">
          <FileOutput size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-stone-900">{output.output_name || output.filename}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
            <span>{output.agent_name || 'WorkerBee'}</span>
            {output.output_type && <><span aria-hidden="true">·</span><span>{output.output_type}</span></>}
            <span aria-hidden="true">·</span>
            <span>{formatFileSize(output.file_size)}</span>
            <span aria-hidden="true">·</span>
            <span>{DATE_FORMAT.format(new Date(output.created_at))}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-14 sm:pl-0">
        <button
          type="button"
          onClick={() => navigate(`/work/${output.execution_id}`)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300"
        >
          Open task
        </button>
        <button
          type="button"
          onClick={() => void downloadOutput(output)}
          disabled={busyId === output.id}
          className="rounded-lg bg-[#293438] p-2 text-white transition hover:bg-[#162024] disabled:opacity-50"
                    aria-label={`${platform.isDesktop ? 'Save a copy of' : 'Download'} ${output.filename}`}
        >
          {busyId === output.id ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
        </button>
      </div>
    </article>
  ))

  const emptyState = (kind: 'sources' | 'deliverables') => (
    <div className="border-t border-stone-200 px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0ece3] text-stone-500">
        {kind === 'sources' ? <Folder size={22} /> : <FileOutput size={22} />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-stone-900">
        {query ? 'No matching files' : kind === 'sources' ? 'Add your first source file' : 'Your deliverables will appear here'}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
        {query
          ? 'Try a different search or collection.'
          : kind === 'sources'
            ? 'Upload documents, spreadsheets, images, or PDFs to reuse in your work.'
            : 'When WorkerBee completes a task, every generated file is saved in this library.'}
      </p>
      {!query && kind === 'sources' && (
        <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white">
          Upload files
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f] lg:grid lg:grid-cols-[252px_1fr]">
      <WorkspaceSidebar active="library" mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#e5e2dc]/90 bg-[#f6f5f2]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-700 lg:hidden" aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <button type="button" onClick={() => navigate('/dashboard')} className="hidden items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900 sm:flex">
              <ArrowLeft size={16} />
              Back to work
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <span className="hidden sm:inline">{platform.isDesktop ? 'Saved on this computer' : 'Private workspace'}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a711a]">Workspace library</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-stone-900 sm:text-4xl">Files & outputs</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">Keep source material organized and find every deliverable WorkerBee creates.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowNewCollection(true)} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300">
                <FolderPlus size={17} />
                New collection
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162024] disabled:opacity-60">
                {uploading ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
                {uploading ? 'Uploading…' : 'Upload files'}
              </button>
              <input ref={fileInputRef} type="file" multiple onChange={uploadFiles} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp" />
            </div>
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Library summary">
            {[
              { label: 'Source files', value: sources.length, icon: Folder, tone: 'bg-[#f0ece3] text-[#765719]' },
              { label: 'Deliverables', value: outputs.length, icon: FileOutput, tone: 'bg-[#eaf2ef] text-[#316756]' },
              { label: 'Collections', value: groups.length, icon: FileArchive, tone: 'bg-[#eeeaf3] text-[#66557b]' },
              { label: 'Saved sets', value: sourceSets.length, icon: Layers3, tone: 'bg-[#e9eef1] text-[#3f626d]' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_28px_rgba(54,48,38,0.04)]">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div>
                <div><p className="text-2xl font-bold tracking-tight text-stone-900">{value}</p><p className="text-xs font-medium text-stone-500">{label}</p></div>
              </div>
            ))}
          </section>

          {errorMessage && (
            <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          )}

          {deliveryNotice && (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between" role="status">
              <span>{deliveryNotice.message}</span>
              <div className="flex items-center gap-2">
                {deliveryNotice.filePath && (
                  <button type="button" onClick={() => void platform.revealLocalFile(deliveryNotice.filePath!)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <FolderOpen size={14} /> Show in folder
                  </button>
                )}
                <button type="button" onClick={() => setDeliveryNotice(null)} aria-label="Dismiss message"><X size={16} /></button>
              </div>
            </div>
          )}

          {showNewCollection && (
            <form onSubmit={createCollection} className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#dfd6c2] bg-[#fbf6ea] p-4 sm:flex-row sm:items-center">
              <FolderPlus size={19} className="hidden text-[#765719] sm:block" />
              <label htmlFor="collection-name" className="sr-only">Collection name</label>
              <input id="collection-name" autoFocus value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="Collection name, e.g. Q3 planning" className="min-w-0 flex-1 rounded-xl border border-[#ddd2b9] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#b58a25]" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNewCollection(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600">Cancel</button>
                <button type="submit" disabled={!newCollectionName.trim() || busyId === 'new-collection'} className="inline-flex items-center gap-2 rounded-xl bg-[#293438] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busyId === 'new-collection' && <LoaderCircle size={15} className="animate-spin" />} Create
                </button>
              </div>
            </form>
          )}

          {sourceSets.length > 0 && view !== 'deliverables' && (
            <section className="mt-5 rounded-2xl border border-[#cad8dc] bg-[#edf3f4] p-4 shadow-[0_10px_30px_rgba(48,70,76,0.05)] sm:p-5" aria-label="Saved source sets">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#3f626d] shadow-sm"><Layers3 size={18} /></span>
                  <div>
                    <h2 className="text-sm font-semibold text-stone-900">Saved source sets</h2>
                    <p className="text-xs leading-5 text-stone-500">Reuse the same evidence for recurring reviews, reports, and decisions.</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-[#52717a]">{sourceSets.length} reusable {sourceSets.length === 1 ? 'set' : 'sets'}</p>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {sourceSets.map((sourceSet) => {
                  const filenames = sourceSet.file_ids.map((id) => sourceById.get(id)?.original_filename ?? 'Unavailable source')
                  const isSelected = sourceSet.file_count === selectedSourceIds.size && sourceSet.file_ids.every((id) => selectedSourceIds.has(id))
                  return (
                    <article key={sourceSet.id} className={`rounded-xl border bg-white p-4 transition ${isSelected ? 'border-[#8aa6ae] shadow-[0_0_0_2px_rgba(100,135,145,0.12)]' : 'border-[#d7e1e3] shadow-sm'}`}>
                      {renamingSourceSetId === sourceSet.id ? (
                        <form onSubmit={renameSourceSet} className="space-y-3">
                          <label htmlFor={`rename-source-set-${sourceSet.id}`} className="text-xs font-semibold text-stone-600">Rename saved set</label>
                          <input id={`rename-source-set-${sourceSet.id}`} autoFocus value={renameSourceSetName} onChange={(event) => setRenameSourceSetName(event.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#6f929c] focus:ring-2 focus:ring-[#dce8ea]" />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setRenamingSourceSetId(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500">Cancel</button>
                            <button type="submit" disabled={!renameSourceSetName.trim() || busyId === `rename-source-set-${sourceSet.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#293438] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                              {busyId === `rename-source-set-${sourceSet.id}` && <LoaderCircle size={13} className="animate-spin" />} Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-semibold text-stone-900">{sourceSet.name}</h3>
                              <p className="mt-1 text-xs font-medium text-[#52717a]">{sourceSet.file_count} {sourceSet.file_count === 1 ? 'source' : 'sources'}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => beginRenameSourceSet(sourceSet)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={`Rename ${sourceSet.name}`}><Pencil size={14} /></button>
                              <button type="button" onClick={() => void deleteSourceSet(sourceSet)} disabled={busyId === `delete-source-set-${sourceSet.id}`} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Delete ${sourceSet.name}`}>{busyId === `delete-source-set-${sourceSet.id}` ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>
                            </div>
                          </div>
                          <p className="mt-3 truncate text-xs text-stone-500" title={filenames.join(' · ')}>{filenames.join(' · ')}</p>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => selectSavedSourceSet(sourceSet)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${isSelected ? 'bg-[#dfe9eb] text-[#345762]' : 'border border-stone-200 text-stone-600 hover:border-stone-300'}`}>{isSelected ? 'Selected' : 'Select set'}</button>
                            <button type="button" onClick={() => void downloadSavedSourceSet(sourceSet)} disabled={busyId === `download-source-set-${sourceSet.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:border-stone-300 disabled:opacity-50">
                              {busyId === `download-source-set-${sourceSet.id}` ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />} Download
                            </button>
                            {selectedSources.length > 0 && !isSelected && (
                              <button type="button" onClick={() => void replaceSourceSetFiles(sourceSet)} disabled={busyId === `update-source-set-${sourceSet.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:border-stone-300 disabled:opacity-50">
                                {busyId === `update-source-set-${sourceSet.id}` ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Update files
                              </button>
                            )}
                            <button type="button" onClick={() => startTaskWithSavedSourceSet(sourceSet)} className="ml-auto rounded-lg bg-[#293438] px-3 py-2 text-xs font-semibold text-white hover:bg-[#162024]">Use in task</button>
                          </div>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_14px_40px_rgba(54,48,38,0.05)]">
            <div className="border-b border-stone-200 p-4 lg:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="inline-flex w-fit rounded-xl bg-[#f2f0eb] p-1">
                  {([
                    ['all', 'All files'],
                    ['sources', 'Sources'],
                    ['deliverables', 'Deliverables'],
                  ] as Array<[LibraryView, string]>).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setView(id)} className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${view === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`} aria-pressed={view === id}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative w-full lg:w-80">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files, assistants, or types" className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-14 text-sm outline-none transition focus:border-[#b58a25] focus:ring-2 focus:ring-[#eadcb8]" />
                  <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-400 sm:block">{shortcutLabel}</kbd>
                </div>
              </div>
              {view !== 'deliverables' && groups.length > 0 && (
                <>
                  <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                    <button type="button" onClick={() => setSelectedGroupId('')} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${!selectedGroupId ? 'border-[#c9b483] bg-[#f8f0dd] text-[#765719]' : 'border-stone-200 text-stone-500 hover:text-stone-800'}`}>All collections</button>
                    {groups.map((group) => (
                      <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedGroupId === group.id ? 'border-[#c9b483] bg-[#f8f0dd] text-[#765719]' : 'border-stone-200 text-stone-500 hover:text-stone-800'}`}>
                        {group.name} <span className="ml-1 opacity-60">{group.file_count}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => setShowNewCollection(true)} className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-100"><Plus size={13} className="mr-1 inline" />Add</button>
                  </div>
                  {selectedGroup && !selectedGroup.is_default && (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      {renamingGroupId === selectedGroup.id ? (
                        <form onSubmit={renameCollection} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                          <label htmlFor="rename-collection" className="shrink-0 text-xs font-semibold text-stone-600">Rename collection</label>
                          <input id="rename-collection" autoFocus value={renameCollectionName} onChange={(event) => setRenameCollectionName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#b58a25]" />
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => setRenamingGroupId(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500">Cancel</button>
                            <button type="submit" disabled={!renameCollectionName.trim() || busyId === `rename-${selectedGroup.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#293438] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                              {busyId === `rename-${selectedGroup.id}` && <LoaderCircle size={13} className="animate-spin" />} Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className="text-xs text-stone-500"><span className="font-semibold text-stone-700">{selectedGroup.name}</span> · {selectedGroup.file_count} {selectedGroup.file_count === 1 ? 'source' : 'sources'}</p>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => beginRenameCollection(selectedGroup)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-white"><Pencil size={13} /> Rename</button>
                            <button type="button" onClick={() => void deleteCollection(selectedGroup)} disabled={selectedGroup.file_count > 0 || busyId === `delete-${selectedGroup.id}`} title={selectedGroup.file_count > 0 ? 'Move every source out of this collection before deleting it.' : 'Delete this empty collection'} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-400">
                              {busyId === `delete-${selectedGroup.id}` ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete collection
                            </button>
                          </div>
                          {selectedGroup.file_count > 0 && <span className="text-[11px] text-stone-400 sm:order-last">Move its files first to delete it.</span>}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center text-stone-500"><LoaderCircle size={24} className="mr-2 animate-spin" />Loading your library…</div>
            ) : (
              <>
                {showSourcesSection && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-6">
                      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{view === 'all' ? 'Source files' : `${visibleSources.length} source ${visibleSources.length === 1 ? 'file' : 'files'}`}</h2>
                      <div className="flex items-center gap-3">
                        {visibleSources.length > 0 && <button type="button" onClick={selectVisibleSources} className="text-xs font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900">Select visible</button>}
                        <span className="text-xs text-stone-400">{visibleSources.length}</span>
                      </div>
                    </div>
                    {sourceRows.length ? sourceRows : emptyState('sources')}
                  </div>
                )}
                {showOutputsSection && (
                  <div className={view === 'all' && showSourcesSection ? 'border-t-8 border-[#f6f5f2]' : ''}>
                    {view === 'all' && <div className="flex items-center justify-between px-5 py-3 lg:px-6"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Deliverables</h2><span className="text-xs text-stone-400">{visibleOutputs.length}</span></div>}
                    {outputRows.length ? outputRows : emptyState('deliverables')}
                  </div>
                )}
              </>
            )}
          </section>
          {selectedSources.length > 0 && selectedQuickStart && (
            <section className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-[#cab989] bg-[#293438] px-4 py-3 text-white shadow-[0_22px_55px_rgba(28,38,41,0.28)] sm:flex-row sm:items-center sm:justify-between lg:left-[276px]" aria-label="Selected source files">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f1cf77]"><Files size={17} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{selectedSources.length} {selectedSources.length === 1 ? 'source' : 'sources'} selected</p>
                  <p className="truncate text-xs text-white/60">{selectedSources.map((source) => source.original_filename).join(' · ')}</p>
                  <p className="mt-1 truncate text-[10px] font-medium text-[#f1cf77]/80">Recommended: {selectedQuickStart.reason}</p>
                </div>
              </div>
              {showSaveSet ? (
                <form onSubmit={saveSelectedSourceSet} className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                  <label htmlFor="source-set-name" className="sr-only">Saved source set name</label>
                  <input id="source-set-name" autoFocus value={newSourceSetName} onChange={(event) => setNewSourceSetName(event.target.value)} placeholder="Name this reusable set" className="min-w-44 rounded-xl border border-white/20 bg-white px-3 py-2 text-xs font-semibold text-stone-800 outline-none placeholder:text-stone-400" />
                  <button type="button" onClick={() => setShowSaveSet(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Cancel</button>
                  <button type="submit" disabled={!newSourceSetName.trim() || busyId === 'save-source-set'} className="inline-flex items-center gap-2 rounded-xl bg-[#f1cf77] px-4 py-2.5 text-sm font-semibold text-[#293438] disabled:opacity-50">
                    {busyId === 'save-source-set' ? <LoaderCircle size={15} className="animate-spin" /> : <Layers3 size={15} />} Save set
                  </button>
                </form>
              ) : showBatchMove ? (
                <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                  <label htmlFor="batch-move-target" className="sr-only">Move selected sources to collection</label>
                  <select id="batch-move-target" value={batchTargetGroupId} onChange={(event) => setBatchTargetGroupId(event.target.value)} className="min-w-36 rounded-xl border border-white/20 bg-white px-3 py-2 text-xs font-semibold text-stone-800 outline-none">
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowBatchMove(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Cancel</button>
                  <button type="button" onClick={() => void moveSelectedSources()} disabled={!batchTargetGroupId || busyId === 'batch-move'} className="inline-flex items-center gap-2 rounded-xl bg-[#f1cf77] px-4 py-2.5 text-sm font-semibold text-[#293438] disabled:opacity-50">
                    {busyId === 'batch-move' ? <LoaderCircle size={15} className="animate-spin" /> : <FolderInput size={15} />} Move files
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setSelectedSourceIds(new Set())} className="rounded-xl px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Clear</button>
                  <button type="button" onClick={openBatchMove} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"><FolderInput size={14} /> Move</button>
                  <button type="button" onClick={openSaveSourceSet} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"><Layers3 size={14} /> Save set</button>
                  {selectedSources.length > 1 && (
                    <button type="button" onClick={() => void downloadSelectedSources()} disabled={busyId === 'batch-download'} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50">
                      {busyId === 'batch-download' ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Download
                    </button>
                  )}
                  <button type="button" onClick={() => startTaskWithSources(selectedSources.map((source) => source.id))} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white">Choose task</button>
                  <button
                    type="button"
                    onClick={() => startTaskWithSources(
                      selectedSources.map((source) => source.id),
                      selectedQuickStart.workflowId
                    )}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f1cf77] px-4 py-2.5 text-sm font-semibold text-[#293438] shadow-sm hover:bg-[#f6d98f] sm:flex-none"
                  >
                    <Sparkles size={15} />
                    {selectedQuickStart.label}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </section>
          )}
          <p className="mt-4 text-center text-xs leading-5 text-stone-400">
            Source files are available to tasks you choose. Deliverables are versioned with their producing task.
          </p>
        </main>
      </div>

      {previewSource && (
        <FilePreviewDialog
          source={previewSource}
          collectionName={organizationQuery.data?.groupByFileId[previewSource.id]?.name}
          busy={busyId === previewSource.id}
          onClose={closePreview}
          onDownload={(source) => void downloadSource(source)}
          onUseInTask={(source) => startTaskWithSources(uniqueLibrarySourceIds([...selectedSourceIds, source.id]))}
        />
      )}
    </div>
  )
}
