import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import {
  Agent,
  Execution,
  RecentOutputFile,
  agentsApi,
  executionsApi,
  filesApi,
  getAgentResourceIds,
  outputsApi,
  ResourceGroup,
} from '@/lib/api'

type ActivityType = 'tool' | 'llm' | 'resource' | 'execution' | 'error' | 'system'

type AgentActivityLog = {
  id: string
  executionId: string
  executionStatus: string
  timestamp: string
  level: string
  message: string
  data?: Record<string, unknown> | null
}

function getExecutionTimestamp(execution: Execution): number {
  const timestamp = execution.started_at ?? execution.completed_at
  if (!timestamp) {
    return 0
  }
  return Number.isNaN(Date.parse(timestamp)) ? 0 : Date.parse(timestamp)
}

function inferActivityType(activity: AgentActivityLog): ActivityType {
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
    payload.includes('document')
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

function formatActivityTime(timestamp: string): string {
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

function isExecutionActive(status: Execution['status']): boolean {
  return status === 'pending' || status === 'running'
}

function readErrorDetail(data?: Record<string, unknown> | null): string | null {
  const detail = data?.error
  if (typeof detail !== 'string') {
    return null
  }
  const trimmed = detail.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isMarkdownOutput(output: RecentOutputFile): boolean {
  return (
    output.output_type?.toLowerCase() === 'markdown' ||
    output.content_type?.toLowerCase() === 'text/markdown' ||
    output.filename.toLowerCase().endsWith('.md')
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentDescription, setNewAgentDescription] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [newAgentGroupIds, setNewAgentGroupIds] = useState<string[]>([])
  const [agentLinkedGroupIds, setAgentLinkedGroupIds] = useState<string[]>([])
  const [newResourceGroupName, setNewResourceGroupName] = useState('')
  const [createUploadGroupId, setCreateUploadGroupId] = useState('')
  const [selectedResourceGroupId, setSelectedResourceGroupId] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false)
  const [fileManagerTab, setFileManagerTab] = useState<'input' | 'output' | 'markdown'>('input')
  const [fileManagerSearch, setFileManagerSearch] = useState('')
  const [groupFilesVisibleCount, setGroupFilesVisibleCount] = useState(100)
  const [selectedOutputAgentId, setSelectedOutputAgentId] = useState('')
  const [outputAgentSearch, setOutputAgentSearch] = useState('')
  const [outputAgentsVisibleCount, setOutputAgentsVisibleCount] = useState(80)
  const [outputFileSearch, setOutputFileSearch] = useState('')
  const [outputFilesVisibleCount, setOutputFilesVisibleCount] = useState(100)
  const [downloadingOutputId, setDownloadingOutputId] = useState<string | null>(null)
  const [isSyncingAgentGroups, setIsSyncingAgentGroups] = useState(false)
  const [isDeletingResourceGroup, setIsDeletingResourceGroup] = useState(false)
  const [groupActionFileId, setGroupActionFileId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [agentPendingDelete, setAgentPendingDelete] = useState<Agent | null>(null)
  const [markdownViewerFile, setMarkdownViewerFile] = useState<RecentOutputFile | null>(null)
  const [markdownViewerContent, setMarkdownViewerContent] = useState('')
  const [markdownViewerError, setMarkdownViewerError] = useState<string | null>(null)
  const [isMarkdownViewerLoading, setIsMarkdownViewerLoading] = useState(false)

  const token = localStorage.getItem('access_token')

  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [navigate, token])

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await agentsApi.list({ limit: 1000 })).data,
    enabled: Boolean(token),
  })

  const templatesQuery = useQuery({
    queryKey: ['agent-templates'],
    queryFn: async () => (await agentsApi.listTemplates()).data,
    enabled: Boolean(token),
  })

  const filesQuery = useQuery({
    queryKey: ['files'],
    queryFn: async () => (await filesApi.list()).data,
    enabled: Boolean(token),
  })

  const resourceGroupsQuery = useQuery({
    queryKey: ['resource-groups'],
    queryFn: async () => (await filesApi.listResourceGroups()).data,
    enabled: Boolean(token),
  })

  const selectedResourceGroup = useMemo<ResourceGroup | null>(() => {
    if (!selectedResourceGroupId) {
      return null
    }
    return (
      resourceGroupsQuery.data?.find((group) => group.id === selectedResourceGroupId) ?? null
    )
  }, [resourceGroupsQuery.data, selectedResourceGroupId])

  const defaultResourceGroupId = useMemo(() => {
    if (!resourceGroupsQuery.data || resourceGroupsQuery.data.length === 0) {
      return ''
    }
    const defaultGroup = resourceGroupsQuery.data.find((group) => group.is_default)
    return defaultGroup?.id ?? resourceGroupsQuery.data[0]?.id ?? ''
  }, [resourceGroupsQuery.data])

  const groupFilesQuery = useQuery({
    queryKey: ['resource-group-files', selectedResourceGroupId],
    queryFn: async () => (await filesApi.listFilesByResourceGroup(selectedResourceGroupId)).data,
    enabled: Boolean(token && selectedResourceGroupId),
  })

  const filteredGroupFiles = useMemo(() => {
    const files = groupFilesQuery.data ?? []
    const searchTerm = fileManagerSearch.trim().toLowerCase()
    if (!searchTerm) {
      return files
    }
    return files.filter((file) => file.original_filename.toLowerCase().includes(searchTerm))
  }, [fileManagerSearch, groupFilesQuery.data])

  const visibleGroupFiles = useMemo(
    () => filteredGroupFiles.slice(0, groupFilesVisibleCount),
    [filteredGroupFiles, groupFilesVisibleCount]
  )

  const remainingGroupFilesCount = Math.max(filteredGroupFiles.length - visibleGroupFiles.length, 0)

  const selectedAgent = useMemo<Agent | null>(() => {
    if (!selectedAgentId || !agentsQuery.data) {
      return null
    }
    return agentsQuery.data.find((agent) => agent.id === selectedAgentId) ?? null
  }, [agentsQuery.data, selectedAgentId])

  const executionsQuery = useQuery({
    queryKey: ['executions', selectedAgentId],
    queryFn: async () => (await executionsApi.list({ agent_id: selectedAgentId ?? undefined })).data,
    enabled: Boolean(selectedAgentId),
    refetchInterval: (query) => {
      if (!selectedAgentId) {
        return false
      }
      const executions = query.state.data as Execution[] | undefined
      if (!executions) {
        return false
      }
      return executions.some((execution) => isExecutionActive(execution.status)) ? 4000 : false
    },
    refetchOnWindowFocus: false,
  })

  const recentExecutions = useMemo(() => {
    const executions = executionsQuery.data ?? []
    return [...executions]
      .sort((a, b) => getExecutionTimestamp(b) - getExecutionTimestamp(a))
      .slice(0, 6)
  }, [executionsQuery.data])

  const hasActiveRecentExecution = useMemo(
    () => recentExecutions.some((execution) => isExecutionActive(execution.status)),
    [recentExecutions]
  )

  const activeRecentExecutions = useMemo(
    () => recentExecutions.filter((execution) => isExecutionActive(execution.status)),
    [recentExecutions]
  )

  const activityLogQuery = useQuery({
    queryKey: ['agent-activity', selectedAgentId, recentExecutions.map((item) => item.id).join(',')],
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
              data: log.data ?? null,
            }))
          } catch {
            return []
          }
        })
      )

      return logSets
        .flat()
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 80)
    },
    enabled: Boolean(selectedAgentId && recentExecutions.length > 0),
    refetchInterval: hasActiveRecentExecution ? 4000 : false,
    refetchOnWindowFocus: false,
  })

  const latestExecutionErrors = useMemo(() => {
    const errors = new Map<string, string>()
    for (const activity of activityLogQuery.data ?? []) {
      if (activity.level.toLowerCase() !== 'error') {
        continue
      }
      const detail = readErrorDetail(activity.data)
      if (!detail || errors.has(activity.executionId)) {
        continue
      }
      errors.set(activity.executionId, detail)
    }
    return errors
  }, [activityLogQuery.data])

  const recentOutputQuery = useQuery({
    queryKey: ['recent-output-files'],
    queryFn: async () => (await outputsApi.listRecentFiles({ limit: 10 })).data,
    enabled: Boolean(token),
    refetchInterval: hasActiveRecentExecution ? 5000 : false,
    refetchOnWindowFocus: false,
  })

  const fileManagerOutputQuery = useQuery({
    queryKey: ['file-manager-output-files', selectedOutputAgentId],
    queryFn: async () =>
      (
        await outputsApi.listRecentFiles({
          limit: 300,
          agent_id: selectedOutputAgentId || undefined,
        })
      ).data,
    enabled: Boolean(token && isFileManagerOpen && fileManagerTab !== 'input'),
    refetchInterval:
      isFileManagerOpen && fileManagerTab !== 'input' && hasActiveRecentExecution ? 5000 : false,
    refetchOnWindowFocus: false,
  })

  const sortedAgents = useMemo(() => {
    const agents = agentsQuery.data ?? []
    return [...agents].sort((a, b) => a.name.localeCompare(b.name))
  }, [agentsQuery.data])

  const selectedOutputAgent = useMemo(
    () => sortedAgents.find((agent) => agent.id === selectedOutputAgentId) ?? null,
    [selectedOutputAgentId, sortedAgents]
  )

  const filteredOutputAgents = useMemo(() => {
    const searchTerm = outputAgentSearch.trim().toLowerCase()
    if (!searchTerm) {
      return sortedAgents
    }
    return sortedAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(searchTerm) ||
        (agent.description ?? '').toLowerCase().includes(searchTerm)
    )
  }, [outputAgentSearch, sortedAgents])

  const visibleOutputAgents = useMemo(
    () => filteredOutputAgents.slice(0, outputAgentsVisibleCount),
    [filteredOutputAgents, outputAgentsVisibleCount]
  )

  const remainingOutputAgentsCount = Math.max(
    filteredOutputAgents.length - visibleOutputAgents.length,
    0
  )

  const scopedOutputFiles = useMemo(() => {
    const files = fileManagerOutputQuery.data ?? []
    if (fileManagerTab === 'markdown') {
      return files.filter((file) => isMarkdownOutput(file))
    }
    if (fileManagerTab === 'output') {
      return files.filter((file) => !isMarkdownOutput(file))
    }
    return files
  }, [fileManagerOutputQuery.data, fileManagerTab])

  const filteredOutputFiles = useMemo(() => {
    const files = scopedOutputFiles
    const searchTerm = outputFileSearch.trim().toLowerCase()
    if (!searchTerm) {
      return files
    }
    return files.filter((file) => file.filename.toLowerCase().includes(searchTerm))
  }, [scopedOutputFiles, outputFileSearch])

  const visibleOutputFiles = useMemo(
    () => filteredOutputFiles.slice(0, outputFilesVisibleCount),
    [filteredOutputFiles, outputFilesVisibleCount]
  )

  const remainingOutputFilesCount = Math.max(
    filteredOutputFiles.length - visibleOutputFiles.length,
    0
  )

  useEffect(() => {
    if (!templatesQuery.data || templateId) {
      return
    }
    if (templatesQuery.data.length > 0) {
      setTemplateId(templatesQuery.data[0].id)
    }
  }, [templateId, templatesQuery.data])

  useEffect(() => {
    if (!selectedOutputAgentId) {
      return
    }
    if (!sortedAgents.some((agent) => agent.id === selectedOutputAgentId)) {
      setSelectedOutputAgentId('')
    }
  }, [selectedOutputAgentId, sortedAgents])

  useEffect(() => {
    let isActive = true

    const syncAgentLinkedGroups = async () => {
      if (!selectedAgent) {
        setAgentLinkedGroupIds([])
        setIsSyncingAgentGroups(false)
        return
      }

      const groups = resourceGroupsQuery.data ?? []
      if (groups.length === 0) {
        setAgentLinkedGroupIds([])
        setIsSyncingAgentGroups(false)
        return
      }

      const attachedResourceIds = new Set(getAgentResourceIds(selectedAgent))
      if (attachedResourceIds.size === 0) {
        setAgentLinkedGroupIds([])
        setIsSyncingAgentGroups(false)
        return
      }

      setIsSyncingAgentGroups(true)
      try {
        const linkedGroupMatches = await Promise.all(
          groups.map(async (group) => {
            const files = (await filesApi.listFilesByResourceGroup(group.id)).data
            if (files.length === 0) {
              return null
            }

            const includesEntireGroup = files.every((file) => attachedResourceIds.has(file.id))
            return includesEntireGroup ? group.id : null
          })
        )

        if (!isActive) {
          return
        }

        setAgentLinkedGroupIds(
          linkedGroupMatches.filter((groupId): groupId is string => Boolean(groupId))
        )
      } catch {
        if (isActive) {
          setAgentLinkedGroupIds([])
        }
      } finally {
        if (isActive) {
          setIsSyncingAgentGroups(false)
        }
      }
    }

    void syncAgentLinkedGroups()

    return () => {
      isActive = false
    }
  }, [selectedAgent, resourceGroupsQuery.data])

  useEffect(() => {
    if (!resourceGroupsQuery.data || resourceGroupsQuery.data.length === 0) {
      setCreateUploadGroupId('')
      setSelectedResourceGroupId('')
      return
    }

    if (!createUploadGroupId && defaultResourceGroupId) {
      setCreateUploadGroupId(defaultResourceGroupId)
    }
    if (!selectedResourceGroupId && defaultResourceGroupId) {
      setSelectedResourceGroupId(defaultResourceGroupId)
    }
    if (
      selectedResourceGroupId &&
      !resourceGroupsQuery.data.some((group) => group.id === selectedResourceGroupId)
    ) {
      setSelectedResourceGroupId(defaultResourceGroupId)
    }
  }, [
    resourceGroupsQuery.data,
    defaultResourceGroupId,
    createUploadGroupId,
    selectedResourceGroupId,
  ])

  useEffect(() => {
    setGroupFilesVisibleCount(100)
  }, [selectedResourceGroupId, fileManagerSearch, isFileManagerOpen])

  useEffect(() => {
    setOutputAgentsVisibleCount(80)
  }, [outputAgentSearch, isFileManagerOpen, fileManagerTab])

  useEffect(() => {
    setOutputFilesVisibleCount(100)
  }, [selectedOutputAgentId, outputFileSearch, isFileManagerOpen, fileManagerTab])

  const newAgentLinkedFileCount = useMemo(() => {
    const selectedGroupIds = new Set(newAgentGroupIds)
    return (resourceGroupsQuery.data ?? [])
      .filter((group) => selectedGroupIds.has(group.id))
      .reduce((total, group) => total + group.file_count, 0)
  }, [newAgentGroupIds, resourceGroupsQuery.data])

  const selectedAgentResourceCount = selectedAgent ? getAgentResourceIds(selectedAgent).length : 0

  const selectedAgentLinkedFileCount = useMemo(() => {
    const selectedGroupIds = new Set(agentLinkedGroupIds)
    return (resourceGroupsQuery.data ?? [])
      .filter((group) => selectedGroupIds.has(group.id))
      .reduce((total, group) => total + group.file_count, 0)
  }, [agentLinkedGroupIds, resourceGroupsQuery.data])

  const resolveResourceIdsFromGroups = async (groupIds: string[]): Promise<string[]> => {
    if (groupIds.length === 0) {
      return []
    }

    const filesByGroup = await Promise.all(
      groupIds.map(async (groupId) => (await filesApi.listFilesByResourceGroup(groupId)).data)
    )

    return Array.from(new Set(filesByGroup.flatMap((files) => files.map((file) => file.id))))
  }

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const resourceIds = await resolveResourceIdsFromGroups(newAgentGroupIds)
      return (
        await agentsApi.createFromTemplate({
          template_id: templateId,
          name: newAgentName,
          description: newAgentDescription || undefined,
          resource_ids: resourceIds,
        })
      ).data
    },
    onSuccess: async (agent) => {
      setSuccessMessage('Agent created from template and ready to deploy.')
      setErrorMessage(null)
      setNewAgentName('')
      setNewAgentDescription('')
      setNewAgentGroupIds([])
      setSelectedAgentId(agent.id)
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
    onError: (error: unknown) => {
      setSuccessMessage(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create agent')
    },
  })

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await agentsApi.delete(agentId)
    },
    onSuccess: async () => {
      setSuccessMessage('Agent deleted.')
      setErrorMessage(null)
      setSelectedAgentId(null)
      setAgentPendingDelete(null)
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
      await queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
    onError: (error: unknown) => {
      setSuccessMessage(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete agent')
    },
  })


  const saveAgentGroupLinksMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId) {
        return null
      }
      const resolvedResourceIds = await resolveResourceIdsFromGroups(agentLinkedGroupIds)
      return (await agentsApi.updateResources(selectedAgentId, resolvedResourceIds)).data
    },
    onSuccess: async () => {
      setSuccessMessage('Agent group links updated.')
      setErrorMessage(null)
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
    onError: (error: unknown) => {
      setSuccessMessage(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update resources')
    },
  })

  const createResourceGroupMutation = useMutation({
    mutationFn: async (name: string) => (await filesApi.createResourceGroup(name)).data,
    onSuccess: async (group: ResourceGroup) => {
      setSuccessMessage(`Created resource group "${group.name}".`)
      setErrorMessage(null)
      setNewResourceGroupName('')
      setCreateUploadGroupId(group.id)
      await queryClient.invalidateQueries({ queryKey: ['resource-groups'] })
    },
    onError: (error: unknown) => {
      setSuccessMessage(null)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create resource group')
    },
  })

  const handleCreateAgent = (event: FormEvent) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!templateId) {
      setErrorMessage('Select an agent template.')
      return
    }

    if (!newAgentName.trim()) {
      setErrorMessage('Agent name is required.')
      return
    }

    createAgentMutation.mutate()
  }

  const handleCreateResourceGroup = () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    const groupName = newResourceGroupName.trim()
    if (!groupName) {
      setErrorMessage('Resource group name is required.')
      return
    }

    createResourceGroupMutation.mutate(groupName)
  }

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsUploading(true)

    try {
      const effectiveUploadGroupId = createUploadGroupId || defaultResourceGroupId || ''
      const uploaded = (
        await filesApi.upload(file, effectiveUploadGroupId || undefined)
      ).data

      if (effectiveUploadGroupId) {
        setSelectedResourceGroupId(effectiveUploadGroupId)
      }
      setFileManagerSearch('')

      if (selectedAgentId && agentLinkedGroupIds.length > 0) {
        const resolvedResourceIds = await resolveResourceIdsFromGroups(agentLinkedGroupIds)
        await agentsApi.updateResources(selectedAgentId, resolvedResourceIds)
      }

      setSuccessMessage(`Uploaded ${uploaded.original_filename}.`)
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-group-files'] })
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'File upload failed')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const handleRemoveFileFromResourceGroup = async (fileId: string) => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setGroupActionFileId(fileId)

    try {
      await filesApi.removeFileFromResourceGroup(fileId)

      if (selectedAgentId && agentLinkedGroupIds.length > 0) {
        const resolvedResourceIds = await resolveResourceIdsFromGroups(agentLinkedGroupIds)
        await agentsApi.updateResources(selectedAgentId, resolvedResourceIds)
      }

      setSuccessMessage('File moved to the default resource group.')
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-group-files'] })
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to remove file from group')
    } finally {
      setGroupActionFileId(null)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setGroupActionFileId(fileId)

    try {
      await filesApi.delete(fileId)

      if (selectedAgentId) {
        if (agentLinkedGroupIds.length > 0) {
          const resolvedResourceIds = await resolveResourceIdsFromGroups(agentLinkedGroupIds)
          await agentsApi.updateResources(selectedAgentId, resolvedResourceIds)
        } else if (selectedAgent) {
          const nextResourceIds = getAgentResourceIds(selectedAgent).filter((id) => id !== fileId)
          await agentsApi.updateResources(selectedAgentId, nextResourceIds)
        }
      }

      setSuccessMessage('File deleted.')
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-group-files'] })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete file')
    } finally {
      setGroupActionFileId(null)
    }
  }

  const handleDeleteResourceGroup = async () => {
    if (!selectedResourceGroup) {
      return
    }

    if (selectedResourceGroup.is_default) {
      setErrorMessage('Default resource group cannot be deleted.')
      return
    }

    if (selectedResourceGroup.file_count > 0) {
      setErrorMessage('Remove or delete files in this group before deleting it.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsDeletingResourceGroup(true)

    try {
      await filesApi.deleteResourceGroup(selectedResourceGroup.id)
      setSuccessMessage(`Deleted resource group "${selectedResourceGroup.name}".`)
      setNewAgentGroupIds((current) =>
        current.filter((groupId) => groupId !== selectedResourceGroup.id)
      )
      setAgentLinkedGroupIds((current) =>
        current.filter((groupId) => groupId !== selectedResourceGroup.id)
      )
      await queryClient.invalidateQueries({ queryKey: ['resource-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['resource-group-files'] })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete resource group')
    } finally {
      setIsDeletingResourceGroup(false)
    }
  }

  const toggleId = (values: string[], id: string) => {
    if (values.includes(id)) {
      return values.filter((value) => value !== id)
    }
    return [...values, id]
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('auth-storage')
    navigate('/login')
  }

  const closeMarkdownViewer = () => {
    setMarkdownViewerFile(null)
    setMarkdownViewerContent('')
    setMarkdownViewerError(null)
    setIsMarkdownViewerLoading(false)
  }

  const handleViewMarkdownOutput = async (output: RecentOutputFile) => {
    setMarkdownViewerFile(output)
    setMarkdownViewerContent('')
    setMarkdownViewerError(null)
    setIsMarkdownViewerLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await outputsApi.downloadRecentFile(output.id)
      const text = await (response.data as Blob).text()
      setMarkdownViewerContent(text)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to load markdown output'
      setMarkdownViewerError(detail)
      setErrorMessage(detail)
    } finally {
      setIsMarkdownViewerLoading(false)
    }
  }

  const handleDownloadOutputFile = async (output: RecentOutputFile) => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setDownloadingOutputId(output.id)
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

  const handleDownloadMarkdown = () => {
    if (!markdownViewerFile || !markdownViewerContent) {
      return
    }

    const blob = new Blob([markdownViewerContent], {
      type: 'text/markdown;charset=utf-8',
    })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = markdownViewerFile.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  const isManualRefreshPending =
    executionsQuery.isFetching ||
    activityLogQuery.isFetching ||
    recentOutputQuery.isFetching ||
    fileManagerOutputQuery.isFetching

  const handleManualRefresh = async () => {
    const refreshJobs: Array<Promise<unknown>> = [recentOutputQuery.refetch()]

    if (selectedAgentId) {
      refreshJobs.push(executionsQuery.refetch())
      refreshJobs.push(activityLogQuery.refetch())
    }
    if (isFileManagerOpen && fileManagerTab !== 'input') {
      refreshJobs.push(fileManagerOutputQuery.refetch())
    }

    await Promise.allSettled(refreshJobs)
  }

  const confirmDeleteAgent = () => {
    if (!agentPendingDelete) {
      return
    }
    deleteAgentMutation.mutate(agentPendingDelete.id)
  }

  return (
    <div className="min-h-screen bg-bg-dark text-white">
      <nav className="sticky top-0 z-20 h-16 bg-bg-sidebar border-b border-interface-border flex items-center px-6 lg:px-12 justify-between">
        <div className="flex items-center gap-3">
          <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
            <span className="material-symbols-outlined text-2xl font-bold">smart_toy</span>
          </div>
          <span className="text-xl font-mono font-extrabold tracking-tighter uppercase crt-glow">
            WorkerBee <span className="text-accent-tan font-normal text-xs">[AGENT-PORTAL]</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-interface-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-mono font-medium text-accent-tan uppercase tracking-wider">
              Agent Management
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span>
            Logout
          </Button>
        </div>
      </nav>

      <main className="px-6 py-8 lg:px-12 min-h-[calc(100vh-4rem)]">
        <div className="w-full grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr] h-full">
          <section className="space-y-6">
            <div className="wireframe-box bg-bg-sidebar p-5 space-y-5">
              <div>
                <h1 className="font-mono font-bold text-lg text-white">Create New Agent</h1>
                <p className="text-accent-tan text-xs font-mono mt-1">
                  Build an agent from markdown template files and link resource groups.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateAgent}>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                    Agent Name
                  </label>
                  <input
                    value={newAgentName}
                    onChange={(event) => setNewAgentName(event.target.value)}
                    className="w-full bg-white/5 border border-interface-border rounded px-3 py-2 text-sm font-mono"
                    placeholder="Quarterly Risk Analyst"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                    Template
                  </label>
                  <select
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value)}
                    className="w-full bg-white/5 border border-interface-border rounded px-3 py-2 text-sm font-mono"
                  >
                    {(templatesQuery.data ?? []).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-accent-tan/80 font-mono">
                    {templatesQuery.data?.find((template) => template.id === templateId)?.description ??
                      'No template selected.'}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                    Description
                  </label>
                  <textarea
                    value={newAgentDescription}
                    onChange={(event) => setNewAgentDescription(event.target.value)}
                    className="w-full min-h-24 bg-white/5 border border-interface-border rounded px-3 py-2 text-sm font-mono"
                    placeholder="What this agent is expected to do"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                    Linked Resource Groups
                  </label>
                  <div className="max-h-44 overflow-y-auto border border-interface-border rounded p-2 space-y-2">
                    {(resourceGroupsQuery.data ?? []).map((group) => (
                      <label
                        key={`new-agent-group-${group.id}`}
                        className="flex items-center justify-between gap-2 text-xs font-mono text-accent-tan"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newAgentGroupIds.includes(group.id)}
                            onChange={() =>
                              setNewAgentGroupIds((current) => toggleId(current, group.id))
                            }
                            className="rounded border-interface-border bg-white/10"
                          />
                          <span>{group.name}</span>
                        </span>
                        <span className="text-[10px] text-accent-tan/70">{group.file_count} files</span>
                      </label>
                    ))}
                    {(resourceGroupsQuery.data ?? []).length === 0 && (
                      <p className="text-xs text-accent-tan/70 font-mono">
                        No resource groups yet. Add groups in File Manager.
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-accent-tan/80">
                    Selected groups currently include about {newAgentLinkedFileCount} files.
                  </p>
                </div>

                <Button variant="primary" type="submit" className="w-full" disabled={createAgentMutation.isPending}>
                  <span className="material-symbols-outlined">add</span>
                  {createAgentMutation.isPending ? 'Creating...' : 'Create Agent'}
                </Button>
              </form>
            </div>

            <div className="wireframe-box bg-bg-sidebar p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-mono font-bold text-base">File Manager</h2>
                  <p className="text-accent-tan text-xs font-mono mt-1">
                    Keep file operations in one modal to keep this page clean.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-accent-tan">
                  {(filesQuery.data ?? []).length} files
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFileManagerOpen(true)}
              >
                <span className="material-symbols-outlined text-sm">folder_open</span>
                Manage Files
              </Button>
            </div>

            {errorMessage && (
              <div className="text-xs font-mono text-signal-red bg-signal-red/10 border border-signal-red/30 rounded px-3 py-2">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="text-xs font-mono text-primary bg-primary/10 border border-primary/30 rounded px-3 py-2">
                {successMessage}
              </div>
            )}
          </section>

          <section className="space-y-6 flex flex-col min-h-0">
            <div
              className={`grid gap-6 flex-1 min-h-0 ${
                selectedAgent ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'
              }`}
            >
              <div className="space-y-6 flex flex-col min-h-0">
                <div className="wireframe-box bg-bg-sidebar p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-mono font-bold text-base">Agents</h2>
                    <span className="text-xs font-mono text-accent-tan">
                      {(agentsQuery.data ?? []).length} total
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(agentsQuery.data ?? []).map((agent) => {
                      const attachedCount = getAgentResourceIds(agent).length
                      const isSelected = selectedAgentId === agent.id

                      return (
                        <article
                          key={agent.id}
                          className={`border rounded p-4 transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-interface-border bg-white/5 hover:border-primary/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedAgentId(agent.id)}
                            className="text-left w-full"
                          >
                            <h3 className="font-mono font-bold text-sm text-white truncate">{agent.name}</h3>
                            <p className="text-xs font-mono text-accent-tan mt-1 line-clamp-2 min-h-8">
                              {agent.description || 'No description'}
                            </p>
                            <p className="text-[11px] font-mono text-accent-tan/80 mt-2">
                              Resources: {attachedCount}
                            </p>
                          </button>

                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/agents/${agent.id}/run`)}
                              className="flex-1"
                            >
                              <span className="material-symbols-outlined text-sm">play_arrow</span>
                              Run
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAgentPendingDelete(agent)}
                              disabled={deleteAgentMutation.isPending}
                              className="text-signal-red hover:bg-signal-red/10"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </Button>
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  {agentsQuery.isLoading && <p className="text-xs font-mono text-accent-tan">Loading agents...</p>}
                  {!agentsQuery.isLoading && (agentsQuery.data ?? []).length === 0 && (
                    <p className="text-xs font-mono text-accent-tan">No agents yet. Create one from a template.</p>
                  )}
                </div>

                <div className="wireframe-box bg-bg-sidebar p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono font-bold text-base">Current Agent Activity</h2>
                    <div className="flex items-center gap-2">
                      {selectedAgent && (
                        <span className="text-[11px] font-mono text-accent-tan">
                          {selectedAgent.name}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleManualRefresh()}
                        disabled={isManualRefreshPending}
                        className="text-[11px]"
                      >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {!selectedAgent && (
                    <p className="text-xs font-mono text-accent-tan">
                      Select an agent to view activity logs.
                    </p>
                  )}

                  {selectedAgent && (
                    <div className="max-h-96 overflow-y-auto border border-interface-border rounded p-3 space-y-2">
                      {!executionsQuery.isLoading &&
                        recentExecutions.map((execution) => {
                          const failureReason =
                            execution.error_message ??
                            latestExecutionErrors.get(execution.id) ??
                            null
                          const executionTimestamp = execution.started_at ?? execution.completed_at

                          return (
                            <div
                              key={`execution-status-${execution.id}`}
                              className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 ${getStatusBadgeClasses(execution.status)}`}
                                >
                                  {execution.status}
                                </span>
                                <span className="text-[10px] font-mono text-accent-tan/90">
                                  {executionTimestamp
                                    ? formatActivityTime(executionTimestamp)
                                    : 'No timestamp'}
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-accent-tan/80">
                                {execution.id}
                              </p>
                              {execution.status === 'failed' && failureReason && (
                                <p className="text-xs font-mono text-signal-red break-words">
                                  Reason: {failureReason}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      {executionsQuery.isLoading && (
                        <p className="text-xs font-mono text-accent-tan">Loading executions...</p>
                      )}
                      {!executionsQuery.isLoading && recentExecutions.length === 0 && (
                        <p className="text-xs font-mono text-accent-tan">
                          No runs recorded for this agent.
                        </p>
                      )}
                      {!executionsQuery.isLoading &&
                        recentExecutions.length > 0 &&
                        activityLogQuery.isLoading && (
                          <p className="text-xs font-mono text-accent-tan">Loading activity logs...</p>
                        )}
                      {!activityLogQuery.isLoading &&
                        (activityLogQuery.data ?? []).map((activity) => {
                          const activityType = inferActivityType(activity)
                          const detail = readErrorDetail(activity.data)

                          return (
                            <div
                              key={`${activity.executionId}-${activity.id}`}
                              className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 ${getActivityBadgeClasses(activityType)}`}
                                >
                                  {activityType}
                                </span>
                                <span className="text-[10px] font-mono text-accent-tan/90">
                                  {formatActivityTime(activity.timestamp)}
                                </span>
                              </div>
                              <p className="text-xs font-mono text-white break-words">{activity.message}</p>
                              {activity.level.toLowerCase() === 'error' && detail && (
                                <p className="text-xs font-mono text-signal-red break-words">
                                  Detail: {detail}
                                </p>
                              )}
                              <p className="text-[10px] font-mono text-accent-tan/80">
                                {activity.executionStatus.toUpperCase()} · {activity.executionId}
                              </p>
                            </div>
                          )
                        })}
                      {!activityLogQuery.isLoading &&
                        recentExecutions.length > 0 &&
                        (activityLogQuery.data ?? []).length === 0 && (
                          <p className="text-xs font-mono text-accent-tan">
                            Runs exist but no log entries are available yet.
                          </p>
                        )}
                    </div>
                  )}
                </div>

                <div className="wireframe-box bg-bg-sidebar p-5 space-y-3 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono font-bold text-base">Recent Output</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-accent-tan">
                        Agent-generated files
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleManualRefresh()}
                        disabled={isManualRefreshPending}
                        className="text-[11px]"
                      >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto border border-interface-border rounded p-3 space-y-2">
                    {recentOutputQuery.isLoading && (
                      <p className="text-xs font-mono text-accent-tan">Loading recent output...</p>
                    )}
                    {!recentOutputQuery.isLoading &&
                      (recentOutputQuery.data ?? []).map((output) => (
                        <div
                          key={output.id}
                          className="bg-white/5 border border-interface-border rounded px-3 py-2 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 text-emerald-300 border border-emerald-500/40 bg-emerald-500/10">
                              {output.output_type ?? 'output'}
                            </span>
                            <span className="text-[10px] font-mono text-accent-tan/90">
                              {formatActivityTime(output.created_at)}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-white break-words">{output.filename}</p>
                          <p className="text-[10px] font-mono text-accent-tan/80">
                            {output.agent_name ?? 'Unknown agent'} · {formatFileSize(output.file_size)}
                          </p>
                          {isMarkdownOutput(output) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleViewMarkdownOutput(output)}
                              className="mt-2"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                              View
                            </Button>
                          )}
                        </div>
                      ))}
                    {!recentOutputQuery.isLoading && (recentOutputQuery.data ?? []).length === 0 && (
                      <p className="text-xs font-mono text-accent-tan">
                        No output files generated yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {selectedAgent && (
                <aside className="wireframe-box bg-bg-sidebar p-5 space-y-4 h-fit xl:sticky xl:top-24">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-mono font-bold text-base">Link Resource Groups</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAgentId(null)}
                      className="text-[11px]"
                    >
                      Close
                    </Button>
                  </div>

                  <p className="text-xs font-mono text-accent-tan">
                    Linking groups for <span className="text-white">{selectedAgent.name}</span>
                  </p>

                  {isSyncingAgentGroups && (
                    <p className="text-[11px] font-mono text-accent-tan/80">Syncing linked groups...</p>
                  )}

                  <div className="max-h-52 overflow-y-auto border border-interface-border rounded p-2 space-y-2">
                    {(resourceGroupsQuery.data ?? []).map((group) => (
                      <label
                        key={`agent-group-link-${group.id}`}
                        className="flex items-center justify-between gap-2 text-xs font-mono text-accent-tan"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={agentLinkedGroupIds.includes(group.id)}
                            onChange={() =>
                              setAgentLinkedGroupIds((current) => toggleId(current, group.id))
                            }
                            className="rounded border-interface-border bg-white/10"
                          />
                          <span>{group.name}</span>
                        </span>
                        <span className="text-[10px] text-accent-tan/70">{group.file_count} files</span>
                      </label>
                    ))}
                    {(resourceGroupsQuery.data ?? []).length === 0 && (
                      <p className="text-xs text-accent-tan/70 font-mono">
                        No resource groups available yet.
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-accent-tan/80">
                    Current attached files: {selectedAgentResourceCount}. Linked groups resolve to about{' '}
                    {selectedAgentLinkedFileCount} files.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveAgentGroupLinksMutation.mutate()}
                    disabled={saveAgentGroupLinksMutation.isPending || isSyncingAgentGroups}
                  >
                    <span className="material-symbols-outlined text-sm">save</span>
                    {saveAgentGroupLinksMutation.isPending ? 'Saving...' : 'Save Group Links'}
                  </Button>

                  <div className="pt-3 border-t border-interface-border/70 space-y-3">
                    <h3 className="font-mono font-bold text-sm">Run Console</h3>
                    <p className="text-xs font-mono text-accent-tan">
                      Open the dedicated run page to submit commands, watch live activity, and review outputs.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/agents/${selectedAgent.id}/run`)}
                    >
                      <span className="material-symbols-outlined text-sm">terminal</span>
                      Open Run Page
                    </Button>
                  </div>
                </aside>
              )}
            </div>
          </section>
        </div>
      </main>

      {isFileManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-sm"
            onClick={() => setIsFileManagerOpen(false)}
            aria-label="Close file manager"
          />
          <div className="relative w-full max-w-5xl h-[88vh] max-h-[88vh] overflow-hidden wireframe-box bg-bg-sidebar p-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-mono font-bold text-sm uppercase tracking-wide">File Manager</h3>
                <p className="text-xs font-mono text-accent-tan mt-1">
                  Centralized file operations with scalable browsing for large datasets.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-accent-tan">
                  {fileManagerTab === 'input'
                    ? `${(filesQuery.data ?? []).length} files`
                    : fileManagerTab === 'markdown'
                      ? `${scopedOutputFiles.length} markdown files`
                      : `${scopedOutputFiles.length} output files`}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setIsFileManagerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-interface-border/70 pb-3">
              <Button
                type="button"
                variant={fileManagerTab === 'input' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setFileManagerTab('input')}
              >
                Input Files
              </Button>
              <Button
                type="button"
                variant={fileManagerTab === 'output' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setFileManagerTab('output')}
              >
                Agent Output Files
              </Button>
              <Button
                type="button"
                variant={fileManagerTab === 'markdown' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setFileManagerTab('markdown')}
              >
                Markdown Files
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {fileManagerTab === 'input' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
                  <div className="space-y-3 border border-interface-border rounded p-3 bg-white/5 h-fit">
                    <p className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                      Resource Groups
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        value={newResourceGroupName}
                        onChange={(event) => setNewResourceGroupName(event.target.value)}
                        className="flex-1 bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                        placeholder="New group name"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCreateResourceGroup}
                        disabled={createResourceGroupMutation.isPending}
                      >
                        <span className="material-symbols-outlined text-sm">create_new_folder</span>
                        {createResourceGroupMutation.isPending ? 'Creating...' : 'Create'}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                        Upload Target Group
                      </label>
                      <select
                        value={createUploadGroupId}
                        onChange={(event) => setCreateUploadGroupId(event.target.value)}
                        className="w-full bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                      >
                        <option value="">Default (auto)</option>
                        {(resourceGroupsQuery.data ?? []).map((group) => (
                          <option key={`modal-upload-target-${group.id}`} value={group.id}>
                            {group.name} ({group.file_count})
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-mono text-accent-tan cursor-pointer">
                      <span className="material-symbols-outlined text-sm">upload_file</span>
                      {isUploading ? 'Uploading...' : 'Upload Files'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleUploadFile}
                        disabled={isUploading}
                      />
                    </label>
                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                        Manage Group
                      </label>
                      <select
                        value={selectedResourceGroupId}
                        onChange={(event) => setSelectedResourceGroupId(event.target.value)}
                        className="w-full bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                      >
                        {(resourceGroupsQuery.data ?? []).map((group) => (
                          <option key={`modal-manage-group-${group.id}`} value={group.id}>
                            {group.name} ({group.file_count})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 border border-interface-border rounded p-3 bg-white/5 min-h-[320px]">
                    {!selectedResourceGroup && (
                      <p className="text-xs font-mono text-accent-tan">
                        Select a resource group to manage files.
                      </p>
                    )}

                    {selectedResourceGroup && (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                            Files In {selectedResourceGroup.name}
                          </p>
                          <span className="text-[11px] font-mono text-accent-tan/80">
                            {filteredGroupFiles.length} matches
                          </span>
                        </div>

                        <input
                          value={fileManagerSearch}
                          onChange={(event) => setFileManagerSearch(event.target.value)}
                          className="w-full bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                          placeholder="Search files in selected group"
                        />

                        <div className="max-h-[52vh] overflow-y-auto space-y-1 pr-1">
                          {groupFilesQuery.isLoading && (
                            <p className="text-xs font-mono text-accent-tan">Loading group files...</p>
                          )}
                          {!groupFilesQuery.isLoading &&
                            visibleGroupFiles.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center justify-between gap-2 bg-bg-deep/30 border border-interface-border rounded px-2 py-1"
                              >
                                <span className="text-xs font-mono text-accent-tan truncate">
                                  {file.original_filename}
                                </span>
                                <div className="flex items-center gap-1">
                                  {!selectedResourceGroup.is_default && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-[10px] px-2 py-1"
                                      onClick={() => handleRemoveFileFromResourceGroup(file.id)}
                                      disabled={groupActionFileId === file.id}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] px-2 py-1 text-signal-red hover:bg-signal-red/10"
                                    onClick={() => handleDeleteFile(file.id)}
                                    disabled={groupActionFileId === file.id}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            ))}
                          {!groupFilesQuery.isLoading && filteredGroupFiles.length === 0 && (
                            <p className="text-xs font-mono text-accent-tan/80">
                              {fileManagerSearch.trim() ? 'No files match this search.' : 'No files in this group.'}
                            </p>
                          )}
                        </div>

                        {remainingGroupFilesCount > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setGroupFilesVisibleCount((current) => current + 100)}
                          >
                            <span className="material-symbols-outlined text-sm">expand_more</span>
                            Load 100 More ({remainingGroupFilesCount} remaining)
                          </Button>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-interface-border/70">
                          {selectedResourceGroup.is_default ? (
                            <p className="text-[11px] font-mono text-accent-tan/80">
                              Default group cannot be deleted.
                            </p>
                          ) : (
                            <p className="text-[11px] font-mono text-accent-tan/80">
                              Delete is available only when this group is empty.
                            </p>
                          )}
                          {!selectedResourceGroup.is_default && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-signal-red hover:bg-signal-red/10 border border-signal-red/30"
                              onClick={handleDeleteResourceGroup}
                              disabled={isDeletingResourceGroup || selectedResourceGroup.file_count > 0}
                            >
                              {isDeletingResourceGroup ? 'Deleting...' : 'Delete Group'}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {(fileManagerTab === 'output' || fileManagerTab === 'markdown') && (
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
                  <div className="space-y-3 border border-interface-border rounded p-3 bg-white/5 h-fit">
                    <p className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                      Agent Filter
                    </p>
                    <input
                      value={outputAgentSearch}
                      onChange={(event) => setOutputAgentSearch(event.target.value)}
                      className="w-full bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                      placeholder="Search agents"
                    />
                    <Button
                      type="button"
                      variant={selectedOutputAgentId ? 'outline' : 'primary'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setSelectedOutputAgentId('')}
                    >
                      All Agents
                    </Button>
                    <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                      {agentsQuery.isLoading && (
                        <p className="text-xs font-mono text-accent-tan">Loading agents...</p>
                      )}
                      {visibleOutputAgents.map((agent) => (
                        <button
                          key={`output-agent-filter-${agent.id}`}
                          type="button"
                          onClick={() => setSelectedOutputAgentId(agent.id)}
                          className={`w-full text-left rounded border px-2 py-2 text-xs font-mono transition-colors ${
                            selectedOutputAgentId === agent.id
                              ? 'border-primary bg-primary/10 text-white'
                              : 'border-interface-border bg-bg-deep/30 text-accent-tan hover:border-primary/40'
                          }`}
                        >
                          <p className="truncate">{agent.name}</p>
                          <p className="text-[10px] text-accent-tan/70 truncate">
                            {agent.description || 'No description'}
                          </p>
                        </button>
                      ))}
                      {filteredOutputAgents.length === 0 && (
                        <p className="text-xs font-mono text-accent-tan/80">No agents match this search.</p>
                      )}
                    </div>
                    {remainingOutputAgentsCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOutputAgentsVisibleCount((current) => current + 80)}
                      >
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                        Load More Agents ({remainingOutputAgentsCount} remaining)
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3 border border-interface-border rounded p-3 bg-white/5 min-h-[320px]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wider font-mono text-accent-tan">
                        {fileManagerTab === 'markdown' ? 'Markdown Files' : 'Output Files'}{' '}
                        {selectedOutputAgent ? `· ${selectedOutputAgent.name}` : '· All Agents'}
                      </p>
                      <span className="text-[11px] font-mono text-accent-tan/80">
                        {filteredOutputFiles.length} matches
                      </span>
                    </div>

                    <input
                      value={outputFileSearch}
                      onChange={(event) => setOutputFileSearch(event.target.value)}
                      className="w-full bg-bg-deep/40 border border-interface-border rounded px-2 py-2 text-xs font-mono"
                      placeholder={
                        fileManagerTab === 'markdown'
                          ? 'Search markdown filenames'
                          : 'Search output filenames'
                      }
                    />

                    <div className="max-h-[56vh] overflow-y-auto space-y-1 pr-1">
                      {fileManagerOutputQuery.isLoading && (
                        <p className="text-xs font-mono text-accent-tan">Loading output files...</p>
                      )}
                      {!fileManagerOutputQuery.isLoading &&
                        visibleOutputFiles.map((output) => (
                          <div
                            key={`file-manager-output-${output.id}`}
                            className="bg-bg-deep/30 border border-interface-border rounded px-3 py-2 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 text-emerald-300 border border-emerald-500/40 bg-emerald-500/10">
                                {output.output_type ?? 'output'}
                              </span>
                              <span className="text-[10px] font-mono text-accent-tan/90">
                                {formatActivityTime(output.created_at)}
                              </span>
                            </div>
                            <p className="text-xs font-mono text-white break-words">{output.filename}</p>
                            <p className="text-[10px] font-mono text-accent-tan/80">
                              {output.agent_name ?? 'Unknown agent'} · {formatFileSize(output.file_size)}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleDownloadOutputFile(output)}
                                disabled={downloadingOutputId === output.id}
                              >
                                <span className="material-symbols-outlined text-sm">download</span>
                                {downloadingOutputId === output.id ? 'Downloading...' : 'Download'}
                              </Button>
                              {isMarkdownOutput(output) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleViewMarkdownOutput(output)}
                                >
                                  <span className="material-symbols-outlined text-sm">visibility</span>
                                  View
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      {!fileManagerOutputQuery.isLoading && filteredOutputFiles.length === 0 && (
                        <p className="text-xs font-mono text-accent-tan/80">
                          {outputFileSearch.trim()
                            ? fileManagerTab === 'markdown'
                              ? 'No markdown files match this search.'
                              : 'No output files match this search.'
                            : fileManagerTab === 'markdown'
                              ? 'No markdown files found.'
                              : 'No output files found.'}
                        </p>
                      )}
                    </div>

                    {remainingOutputFilesCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOutputFilesVisibleCount((current) => current + 100)}
                      >
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                        Load 100 More ({remainingOutputFilesCount} remaining)
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {agentPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-sm"
            onClick={() => setAgentPendingDelete(null)}
            aria-label="Close delete confirmation"
          />
          <div className="relative w-full max-w-md wireframe-box bg-bg-sidebar p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded bg-signal-red/20 border border-signal-red/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-signal-red text-base">warning</span>
              </div>
              <div>
                <h3 className="font-mono font-bold text-white text-sm uppercase tracking-wide">
                  Confirm Agent Deletion
                </h3>
                <p className="text-xs font-mono text-accent-tan mt-2">
                  Delete <span className="text-white">{agentPendingDelete.name}</span>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-interface-border/70">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAgentPendingDelete(null)}
                disabled={deleteAgentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={confirmDeleteAgent}
                disabled={deleteAgentMutation.isPending}
                className="text-signal-red hover:bg-signal-red/10 border border-signal-red/30"
              >
                <span className="material-symbols-outlined text-sm">delete_forever</span>
                {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete Agent'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {markdownViewerFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-sm"
            onClick={closeMarkdownViewer}
            aria-label="Close markdown viewer"
          />
          <div className="relative w-full max-w-4xl max-h-[85vh] wireframe-box bg-bg-sidebar p-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-mono font-bold text-sm uppercase tracking-wide">
                  Markdown Viewer
                </h3>
                <p className="text-xs font-mono text-accent-tan mt-1 break-all">
                  {markdownViewerFile.filename}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadMarkdown}
                  disabled={isMarkdownViewerLoading}
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={closeMarkdownViewer}>
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto border border-interface-border rounded bg-bg-deep/40 p-4">
              {isMarkdownViewerLoading && (
                <p className="text-xs font-mono text-accent-tan">Loading markdown file...</p>
              )}
              {!isMarkdownViewerLoading && markdownViewerError && (
                <p className="text-xs font-mono text-signal-red break-words">
                  {markdownViewerError}
                </p>
              )}
              {!isMarkdownViewerLoading && !markdownViewerError && (
                <MarkdownContent content={markdownViewerContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
