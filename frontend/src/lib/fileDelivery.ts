import { platform, type FileExportResult } from '@/lib/platform'

export type DeliveredFile = FileExportResult & {
  method: 'saved' | 'downloaded' | 'cancelled'
}

export async function deliverFile(blob: Blob, filename: string): Promise<DeliveredFile> {
  if (platform.isDesktop) {
    const result = await platform.saveLocalFile(blob, filename)
    return {
      ...result,
      method: result.saved ? 'saved' : 'cancelled',
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return { saved: true, method: 'downloaded' }
}
