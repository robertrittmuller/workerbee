/// <reference types="vite/client" />

type WorkerBeeRuntimeStatus = {
  mode: 'starting' | 'local' | 'remote' | 'error' | string
  apiBaseUrl: string
  message: string
  modelService: string
  model: string | null
  processingLocation: 'external' | 'local' | string
}

type WorkerBeeModelConnection = {
  provider: 'included' | 'openai' | 'anthropic' | string
  providerLabel: string
  model: string | null
  keyLast4: string | null
  configured: boolean
  secureStorageAvailable: boolean
}

type WorkerBeeModelConnectionInput = {
  provider: 'included' | 'openai' | 'anthropic'
  model?: string
  apiKey?: string
}

type WorkerBeeLocalFile = {
  path: string
  name: string
  size: number
}

type WorkerBeeEmailDraft = {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

type WorkerBeeCalendarDraft = {
  uid: string
  title: string
  startLocal: string
  durationMinutes: number
  timezone: string
  location: string
  attendees: string[]
  notes: string
}

type WorkerBeeFileExport = {
  filename: string
  bytes: Uint8Array
}

type WorkerBeeFileExportResult = {
  saved: boolean
  filePath?: string
}

type WorkerBeeTaskNotification = {
  executionId: string
  status: 'completed' | 'failed'
}

interface Window {
  workerbeeDesktop?: {
    isDesktop: true
    platform: string
    apiBaseUrl: string
    runtimeMode: string
    desktopSessionSecret: string
    getRuntimeStatus: () => Promise<WorkerBeeRuntimeStatus>
    onRuntimeStatusChanged: (
      listener: (status: WorkerBeeRuntimeStatus) => void
    ) => () => void
    getModelConnection: () => Promise<WorkerBeeModelConnection>
    saveModelConnection: (
      settings: WorkerBeeModelConnectionInput
    ) => Promise<WorkerBeeModelConnection>
    selectFiles: () => Promise<WorkerBeeLocalFile[]>
    selectDirectory: () => Promise<string | null>
    revealFile: (filePath: string) => Promise<boolean>
    saveFileCopy: (input: WorkerBeeFileExport) => Promise<WorkerBeeFileExportResult>
    openEmailDraft: (draft: WorkerBeeEmailDraft) => Promise<boolean>
    openCalendarDraft: (draft: WorkerBeeCalendarDraft) => Promise<boolean>
    showTaskNotification: (input: WorkerBeeTaskNotification) => Promise<boolean>
    onOpenTaskNotification: (listener: (executionId: string) => void) => () => void
  }
}
