import axios, { AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import { platform } from './platform'

const API_URL = platform.apiBaseUrl || import.meta.env.VITE_API_URL || ''
const sanitizedApiUrl = API_URL.trim().replace(/\/$/, '')
const isContainerInternalHost =
  /^https?:\/\/backend(?::\d+)?$/i.test(sanitizedApiUrl)

const API_BASE_URL =
  !sanitizedApiUrl || isContainerInternalHost
    ? '/api/v1'
    : `${sanitizedApiUrl}/api/v1`

export const api = axios.create({
  baseURL: API_BASE_URL,
})

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

function readAccessToken(): string | null {
  const direct = localStorage.getItem('access_token')
  if (direct) {
    return direct
  }

  const legacy = localStorage.getItem('auth-storage')
  if (!legacy) {
    return null
  }

  try {
    const parsed = JSON.parse(legacy)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

function readRefreshToken(): string | null {
  return localStorage.getItem('refresh_token')
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('access_token', accessToken)
  localStorage.setItem('refresh_token', refreshToken)
}

function clearStoredAuth(): void {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('auth-storage')
}

function setAuthorizationHeader(config: InternalAxiosRequestConfig, token: string): void {
  if (!config.headers) {
    config.headers = new AxiosHeaders()
  }
  if (config.headers instanceof AxiosHeaders) {
    config.headers.set('Authorization', `Bearer ${token}`)
    return
  }
  ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
}

let refreshPromise: Promise<string | null> | null = null

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    return Promise.resolve(null)
  }

  // Keep a single in-flight refresh so concurrent 401s do not trigger multiple refresh requests.
  refreshPromise = axios
    .post<{ access_token: string; refresh_token: string; token_type: string }>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        headers: { Authorization: `Bearer ${refreshToken}` },
      }
    )
    .then(({ data }) => {
      storeTokens(data.access_token, data.refresh_token)
      return data.access_token
    })
    .catch(() => {
      clearStoredAuth()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

api.interceptors.request.use(
  (config) => {
    const token = readAccessToken()
    if (token) {
      setAuthorizationHeader(config, token)
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined
    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error)
    }

    const requestUrl = originalRequest.url ?? ''
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/desktop-session') ||
      requestUrl.includes('/auth/refresh')

    if (isAuthRequest || originalRequest._retry) {
      clearStoredAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    originalRequest._retry = true
    const newAccessToken = await refreshAccessToken()

    if (!newAccessToken) {
      clearStoredAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    setAuthorizationHeader(originalRequest, newAccessToken)
    return api.request(originalRequest)
  }
)

export interface User {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface AgentTemplate {
  id: string
  name: string
  description: string
  markdown_files: string[]
}

export interface Agent {
  id: string
  user_id: string
  agent_type_id: string | null
  name: string
  description: string | null
  config: Record<string, unknown> | null
  llm_settings: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FileResource {
  id: string
  user_id: string
  filename: string
  original_filename: string
  content_type: string
  file_size: number
  storage_path: string
  file_type: string
  created_at: string
}

export interface FilePreviewTable {
  name: string
  rows: string[][]
  truncated: boolean
}

export interface FilePreview {
  kind: 'text' | 'table' | 'image' | 'unavailable'
  detail: string
  text: string | null
  tables: FilePreviewTable[]
  page_count: number | null
  truncated: boolean
}

export interface ResourceGroup {
  id: string
  user_id: string
  name: string
  is_default: boolean
  created_at: string
  file_count: number
}

export interface ResourceGroupBatchAssignResponse {
  resource_group_id: string
  moved_count: number
}

export interface SourceSet {
  id: string
  user_id: string
  name: string
  file_ids: string[]
  file_count: number
  created_at: string
  updated_at: string
}

export interface RecentOutputFile {
  id: string
  execution_id: string
  output_id: string | null
  filename: string
  content_type: string
  file_size: number
  storage_path: string
  created_at: string
  agent_id: string | null
  agent_name: string | null
  output_name: string | null
  output_type: string | null
  thread_id?: string | null
  attempt_number?: number | null
}

export interface Execution {
  id: string
  workflow_id: string | null
  agent_id: string | null
  task_id: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  result: Record<string, unknown> | null
  error_message: string | null
}

export interface ExecutionLogEntry {
  id: string
  timestamp: string
  level: string
  message: string
  data?: Record<string, unknown> | null
}

export interface ArtifactVersion {
  id: string
  execution_id: string
  output_id: string | null
  filename: string
  content_type: string
  file_size: number
  storage_path: string
  created_at: string
}

export interface TaskThreadAttempt {
  id: string
  attempt_number: number
  execution: Execution
  artifacts: ArtifactVersion[]
}

export interface TaskThread {
  id: string
  title: string
  original_prompt: string
  agent_id: string | null
  status: Execution['status']
  work_pack: Record<string, unknown> | null
  resource_ids: string[]
  created_at: string
  updated_at: string
  latest_execution_id: string | null
  latest_attempt_number: number
  attempt_count: number
  artifact_count: number
  attempts?: TaskThreadAttempt[]
}

export const authApi = {
  desktopSession: (secret: string) =>
    api.post<{ access_token: string; refresh_token: string; token_type: string }>(
      '/auth/desktop-session',
      {},
      { headers: { 'X-WorkerBee-Desktop-Session': secret } }
    ),

  login: (email: string, password: string) =>
    api.post<{ access_token: string; refresh_token: string; token_type: string }>('/auth/login', {
      email,
      password,
    }),

  register: (email: string, password: string, fullName: string) =>
    api.post<User>('/auth/register', { email, password, full_name: fullName }),

  refresh: (refreshToken: string) =>
    api.post<{ access_token: string; refresh_token: string; token_type: string }>(
      '/auth/refresh',
      {},
      {
        headers: { Authorization: `Bearer ${refreshToken}` },
      }
    ),

  me: () => api.get<User>('/auth/me'),
}

export const agentsApi = {
  list: (params?: { skip?: number; limit?: number }) => api.get<Agent[]>('/agents', { params }),

  get: (id: string) => api.get<Agent>(`/agents/${id}`),

  create: (data: {
    name: string
    description?: string
    agent_type_id?: string
    config?: Record<string, unknown>
    llm_settings?: Record<string, unknown>
  }) => api.post<Agent>('/agents', data),

  createFromTemplate: (data: {
    template_id: string
    name: string
    description?: string
    agent_type_id?: string
    llm_settings?: Record<string, unknown>
    resource_ids: string[]
    work_pack?: {
      id: string
      answers: Record<string, string | string[] | boolean>
    }
  }) => api.post<Agent>('/agents/from-template', data),

  update: (
    id: string,
    data: Partial<Pick<Agent, 'name' | 'description' | 'config' | 'llm_settings' | 'is_active'>>
  ) => api.put<Agent>(`/agents/${id}`, data),

  delete: (id: string) => api.delete(`/agents/${id}`),

  listTypes: () =>
    api.get<
      {
        id: string
        name: string
        provider: string
        model_name: string
        description: string | null
      }[]
    >('/agents/types'),

  listTemplates: () => api.get<AgentTemplate[]>('/agents/templates'),

  run: (
    id: string,
    data?: {
      task_prompt?: string
      task_id?: string
      resource_ids?: string[]
      thread_id?: string
      thread_title?: string
      revision_note?: string
      base_execution_id?: string
      work_pack_answers?: Record<string, string | string[] | boolean>
      session_id?: string
      opencode_agent?: string
    }
  ) =>
    api.post<Execution>(`/agents/${id}/run`, data ?? {}),

  listResources: (id: string) => api.get<FileResource[]>(`/agents/${id}/resources`),

  updateResources: (id: string, resourceIds: string[]) =>
    api.put<Agent>(`/agents/${id}/resources`, { resource_ids: resourceIds }),

  removeResource: (id: string, fileId: string) =>
    api.delete<Agent>(`/agents/${id}/resources/${fileId}`),
}

export const filesApi = {
  list: () => api.get<FileResource[]>('/files'),

  get: (id: string) => api.get<FileResource>(`/files/${id}`),

  preview: (id: string) => api.get<FilePreview>(`/files/${id}/preview`),

  listResourceGroups: () => api.get<ResourceGroup[]>('/files/resource-groups'),

  createResourceGroup: (name: string) =>
    api.post<ResourceGroup>('/files/resource-groups', { name }),

  renameResourceGroup: (resourceGroupId: string, name: string) =>
    api.patch<ResourceGroup>(`/files/resource-groups/${resourceGroupId}`, { name }),

  listFilesByResourceGroup: (resourceGroupId: string) =>
    api.get<FileResource[]>(`/files/resource-groups/${resourceGroupId}/files`),

  assignFileToResourceGroup: (fileId: string, resourceGroupId?: string | null) =>
    api.put<FileResource>(`/files/${fileId}/resource-group`, {
      resource_group_id: resourceGroupId,
    }),

  assignFilesToResourceGroup: (fileIds: string[], resourceGroupId?: string | null) =>
    api.put<ResourceGroupBatchAssignResponse>('/files/resource-groups/batch-assign', {
      file_ids: fileIds,
      resource_group_id: resourceGroupId,
    }),

  removeFileFromResourceGroup: (fileId: string) =>
    api.put<FileResource>(`/files/${fileId}/resource-group`, {
      resource_group_id: null,
    }),

  deleteResourceGroup: (resourceGroupId: string) =>
    api.delete(`/files/resource-groups/${resourceGroupId}`),

  upload: (file: globalThis.File, resourceGroupId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (resourceGroupId) {
      formData.append('resource_group_id', resourceGroupId)
    }
    return api.post<FileResource>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  delete: (id: string) => api.delete(`/files/${id}`),

  download: (id: string) => api.get(`/files/${id}/download`, { responseType: 'blob' }),

  downloadBatch: (fileIds: string[]) =>
    api.post('/files/batch-download', { file_ids: fileIds }, { responseType: 'blob' }),

  listSourceSets: () => api.get<SourceSet[]>('/files/source-sets'),

  createSourceSet: (name: string, fileIds: string[]) =>
    api.post<SourceSet>('/files/source-sets', { name, file_ids: fileIds }),

  updateSourceSet: (sourceSetId: string, data: { name?: string; file_ids?: string[] }) =>
    api.patch<SourceSet>(`/files/source-sets/${sourceSetId}`, data),

  deleteSourceSet: (sourceSetId: string) =>
    api.delete(`/files/source-sets/${sourceSetId}`),
}

export const outputsApi = {
  listRecentFiles: (params?: { skip?: number; limit?: number; agent_id?: string }) =>
    api.get<RecentOutputFile[]>('/outputs/recent-files', { params }),

  downloadRecentFile: (artifactId: string) =>
    api.get(`/outputs/recent-files/${artifactId}/download`, { responseType: 'blob' }),
}

export const taskThreadsApi = {
  list: (params?: { skip?: number; limit?: number }) =>
    api.get<TaskThread[]>('/task-threads', { params }),

  get: (id: string) => api.get<TaskThread>(`/task-threads/${id}`),

  getByExecution: (executionId: string) =>
    api.get<TaskThread>(`/task-threads/by-execution/${executionId}`),
}

type ExternalActionEventInput = {
  artifact_id: string
  artifact_filename: string
  destination_label: string
  recipients: string[]
  subject: string
  content_sha256: string
  user_confirmed: true
} & (
  | {
      action_type: 'email_draft_handoff'
      stage: 'approved' | 'opened'
    }
  | {
      action_type: 'calendar_draft_handoff'
      stage: 'approved' | 'opened' | 'downloaded'
      scheduled_start: string
      timezone: string
      duration_minutes: number
    }
)

export const executionsApi = {
  list: (params?: { workflow_id?: string; agent_id?: string; skip?: number; limit?: number }) =>
    api.get<Execution[]>('/executions', { params }),

  get: (id: string) => api.get<Execution>(`/executions/${id}`),

  create: (data: {
    workflow_id?: string
    agent_id?: string
    task_id?: string
    input_data?: Record<string, unknown>
  }) => api.post<Execution>('/executions', data),

  cancel: (id: string) => api.post<Execution>(`/executions/${id}/cancel`),

  getLogs: (id: string) => api.get<ExecutionLogEntry[]>(`/executions/${id}/logs`),

  recordExternalAction: (
    id: string,
    data: ExternalActionEventInput
  ) => api.post<{ id: string; status: 'approved' | 'opened' | 'downloaded' }>(
    `/executions/${id}/external-action-events`,
    data
  ),

  stream: (id: string) => {
    const token = readAccessToken()
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    const streamUrl = `${API_BASE_URL}/executions/${id}/stream${query}`
    return new EventSource(streamUrl)
  },
}

export function getAgentResourceIds(agent: Agent): string[] {
  const config = agent.config
  if (!config || typeof config !== 'object') {
    return []
  }

  const resourceIds = (config as { resource_ids?: unknown }).resource_ids
  if (!Array.isArray(resourceIds)) {
    return []
  }

  return resourceIds
    .map((value) => (typeof value === 'string' ? value : null))
    .filter((value): value is string => Boolean(value))
}
