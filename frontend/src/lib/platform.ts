import { buildMailtoUrl, type EmailDraft } from '@/lib/emailDraft'
import {
  buildCalendarIcs,
  calendarDraftFilename,
  type CalendarDraft,
} from '@/lib/calendarDraft'

export type RuntimeStatus = WorkerBeeRuntimeStatus
export type LocalFile = WorkerBeeLocalFile
export type ModelConnection = WorkerBeeModelConnection
export type ModelConnectionInput = WorkerBeeModelConnectionInput
export type FileExportResult = WorkerBeeFileExportResult

const desktopBridge = window.workerbeeDesktop

export const platform = {
  isDesktop: Boolean(desktopBridge?.isDesktop),
  kind: desktopBridge?.isDesktop ? ('desktop' as const) : ('web' as const),
  name: desktopBridge?.platform || 'web',
  apiBaseUrl: desktopBridge?.apiBaseUrl || '',
  runtimeMode: desktopBridge?.runtimeMode || 'remote',
  desktopSessionSecret: desktopBridge?.desktopSessionSecret || '',

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    if (desktopBridge) return desktopBridge.getRuntimeStatus()
    return {
      mode: 'remote',
      apiBaseUrl: '',
      message: 'Connected to WorkerBee on the web.',
      modelService: 'Organization-managed model service',
      model: null,
      processingLocation: 'external',
    }
  },

  async getModelConnection(): Promise<ModelConnection> {
    if (desktopBridge) return desktopBridge.getModelConnection()
    return {
      provider: 'included',
      providerLabel: 'Organization managed',
      model: null,
      keyLast4: null,
      configured: false,
      secureStorageAvailable: false,
    }
  },

  async saveModelConnection(settings: ModelConnectionInput): Promise<ModelConnection> {
    if (!desktopBridge) throw new Error('Model connections are managed by your WorkerBee administrator.')
    return desktopBridge.saveModelConnection(settings)
  },

  onRuntimeStatusChanged(listener: (status: RuntimeStatus) => void): () => void {
    return desktopBridge?.onRuntimeStatusChanged(listener) ?? (() => undefined)
  },

  async selectLocalFiles(): Promise<LocalFile[]> {
    return desktopBridge?.selectFiles() ?? []
  },

  async selectLocalDirectory(): Promise<string | null> {
    return desktopBridge?.selectDirectory() ?? null
  },

  async revealLocalFile(filePath: string): Promise<boolean> {
    return desktopBridge?.revealFile(filePath) ?? false
  },

  async saveLocalFile(blob: Blob, filename: string): Promise<FileExportResult> {
    if (!desktopBridge) return { saved: false }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return desktopBridge.saveFileCopy({ filename, bytes })
  },

  async openEmailDraft(draft: EmailDraft): Promise<boolean> {
    if (desktopBridge) return desktopBridge.openEmailDraft(draft)
    const anchor = document.createElement('a')
    anchor.href = buildMailtoUrl(draft)
    anchor.rel = 'noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return true
  },

  async openCalendarDraft(draft: CalendarDraft): Promise<'opened' | 'downloaded'> {
    if (desktopBridge) {
      await desktopBridge.openCalendarDraft(draft)
      return 'opened'
    }
    const blob = new Blob([buildCalendarIcs(draft)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = calendarDraftFilename(draft.title)
    anchor.rel = 'noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    return 'downloaded'
  },

  async showTaskNotification(input: WorkerBeeTaskNotification): Promise<boolean> {
    return desktopBridge?.showTaskNotification(input) ?? false
  },

  onOpenTaskNotification(listener: (executionId: string) => void): () => void {
    return desktopBridge?.onOpenTaskNotification(listener) ?? (() => undefined)
  },
}
