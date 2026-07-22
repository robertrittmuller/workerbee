import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Download,
  Eye,
  FileQuestion,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react'
import { filesApi, type FilePreviewTable, type FileResource } from '@/lib/api'
import { formatFileSize } from '@/lib/librarySearch'
import { platform } from '@/lib/platform'

type Props = {
  source: FileResource
  collectionName?: string
  busy: boolean
  onClose: () => void
  onDownload: (source: FileResource) => void
  onUseInTask: (source: FileResource) => void
}

function TablePreview({ table }: { table: FilePreviewTable }) {
  const header = table.rows[0] ?? []
  const body = table.rows.slice(1)
  const columnCount = Math.max(header.length, ...body.map((row) => row.length), 0)
  const columns = Array.from({ length: columnCount }, (_, index) => header[index] || `Column ${index + 1}`)

  if (!table.rows.length) {
    return <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-stone-500">This sheet does not contain previewable rows.</div>
  }

  return (
    <div className="max-h-[58vh] overflow-auto bg-white">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#293438] text-white">
          <tr>
            {columns.map((column, index) => (
              <th key={`${column}-${index}`} className="whitespace-nowrap border-r border-white/10 px-3 py-3 font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-stone-100 even:bg-stone-50/70">
              {columns.map((_, columnIndex) => (
                <td key={columnIndex} className="max-w-[280px] truncate whitespace-nowrap border-r border-stone-100 px-3 py-2.5 text-stone-700">
                  {row[columnIndex] || <span className="text-stone-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FilePreviewDialog({ source, collectionName, busy, onClose, onDownload, onUseInTask }: Props) {
  const [activeTableIndex, setActiveTableIndex] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const previewQuery = useQuery({
    queryKey: ['file-preview', source.id],
    queryFn: async () => (await filesApi.preview(source.id)).data,
  })
  const imageQuery = useQuery({
    queryKey: ['file-preview-image', source.id],
    queryFn: async () => (await filesApi.download(source.id)).data as Blob,
    enabled: previewQuery.data?.kind === 'image',
    staleTime: 60_000,
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!(imageQuery.data instanceof Blob)) {
      setImageUrl(null)
      return
    }
    const nextUrl = URL.createObjectURL(imageQuery.data)
    setImageUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [imageQuery.data])

  useEffect(() => setActiveTableIndex(0), [source.id])

  const preview = previewQuery.data
  const activeTable = useMemo(
    () => preview?.tables?.[activeTableIndex] ?? preview?.tables?.[0],
    [activeTableIndex, preview?.tables]
  )
  const loading = previewQuery.isLoading || (preview?.kind === 'image' && imageQuery.isLoading)
  const failed = previewQuery.isError || imageQuery.isError

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/55 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="source-preview-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-[#f8f7f4] shadow-[0_32px_110px_rgba(28,25,23,0.38)]">
        <header className="border-b border-stone-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f0ece3] text-[#765719]"><Eye size={20} /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a711a]">Source preview</p>
                <h2 id="source-preview-title" className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-stone-900 sm:text-xl">{source.original_filename}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                  <span>{collectionName ?? 'Default'}</span><span aria-hidden="true">·</span><span>{formatFileSize(source.file_size)}</span><span aria-hidden="true">·</span><span>{source.file_type || 'file'}</span>
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700" aria-label="Close source preview"><X size={19} /></button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start gap-2.5 border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-xs leading-5 text-emerald-900 sm:px-7">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span><strong className="font-semibold">Private preview.</strong> WorkerBee reads a bounded copy inside your workspace. Nothing is sent to a model until you start a task and approve the sharing review.</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            {loading ? (
              <div className="grid min-h-[360px] place-items-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500"><span className="flex items-center gap-2"><LoaderCircle size={20} className="animate-spin" />Preparing a safe preview…</span></div>
            ) : failed ? (
              <div className="grid min-h-[360px] place-items-center rounded-2xl border border-rose-200 bg-rose-50 px-6 text-center"><div><FileQuestion size={28} className="mx-auto text-rose-500" /><p className="mt-3 font-semibold text-rose-900">Preview could not be loaded</p><p className="mt-1 text-sm text-rose-700">The original file is unchanged. You can retry, use it in a task, or save a copy.</p><button type="button" onClick={() => void previewQuery.refetch()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-800 shadow-sm">Try again</button></div></div>
            ) : preview?.kind === 'image' ? (
              <div className="grid min-h-[360px] place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-[linear-gradient(45deg,#f3f1ed_25%,transparent_25%),linear-gradient(-45deg,#f3f1ed_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f1ed_75%),linear-gradient(-45deg,transparent_75%,#f3f1ed_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] p-4">
                {imageUrl ? <img src={imageUrl} alt={`Preview of ${source.original_filename}`} className="max-h-[58vh] max-w-full rounded-lg object-contain shadow-lg" /> : <ImageIcon size={32} className="text-stone-400" />}
              </div>
            ) : preview?.kind === 'table' && activeTable ? (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Table2 size={17} className="text-emerald-600" />Table preview</div>
                  {preview.tables.length > 1 && <div className="flex gap-1 overflow-x-auto rounded-lg bg-stone-200/70 p-1">{preview.tables.map((table, index) => <button key={`${table.name}-${index}`} type="button" onClick={() => setActiveTableIndex(index)} aria-pressed={index === activeTableIndex} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${index === activeTableIndex ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>{table.name}</button>)}</div>}
                </div>
                <TablePreview table={activeTable} />
              </div>
            ) : preview?.kind === 'text' ? (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-800"><FileText size={17} className="text-sky-600" />Readable content{preview.page_count ? <span className="ml-auto text-xs font-normal text-stone-500">{preview.page_count} {preview.page_count === 1 ? 'page' : 'pages'}</span> : null}</div>
                <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 font-sans text-sm leading-7 text-stone-700 sm:px-7">{preview.text || 'No readable text was found in this file.'}</pre>
              </div>
            ) : (
              <div className="grid min-h-[360px] place-items-center rounded-2xl border border-stone-200 bg-white px-6 text-center"><div><FileQuestion size={30} className="mx-auto text-stone-400" /><p className="mt-3 font-semibold text-stone-900">Preview is not available</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-500">{preview?.detail || 'You can still use this source in a task or save a copy.'}</p></div></div>
            )}
          </div>

          {preview && preview.kind !== 'unavailable' && (
            <div className="border-t border-stone-200 bg-white px-5 py-3 text-xs leading-5 text-stone-500 sm:px-7">
              {preview.detail}{preview.truncated ? ' This preview is intentionally limited; the task can use the complete source.' : ''}
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="flex items-center gap-2 text-xs text-stone-500"><Paperclip size={14} />The exact library file will be attached—no duplicate upload.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={() => onDownload(source)} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-300 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{platform.isDesktop ? 'Save a copy' : 'Download'}</button>
            <button type="button" onClick={() => onUseInTask(source)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#293438] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#162024]">Use in a task <ArrowRight size={16} /></button>
          </div>
        </footer>
      </section>
    </div>
  )
}
