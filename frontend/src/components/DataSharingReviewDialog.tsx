import { Paperclip, ShieldCheck, X } from 'lucide-react'

type ReviewFile = {
  name: string
  size?: number | null
}

type DataSharingReviewDialogProps = {
  eyebrow?: string
  request: string
  files: ReviewFile[]
  destination: string
  model?: string | null
  reviewEveryTask: boolean
  confirmLabel?: string
  onReviewEveryTaskChange: (value: boolean) => void
  onClose: () => void
  onConfirm: () => void
}

function formatFileSize(bytes?: number | null): string | null {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function DataSharingReviewDialog({
  eyebrow = 'Before WorkerBee starts',
  request,
  files,
  destination,
  model,
  reviewEveryTask,
  confirmLabel = 'Send and start task',
  onReviewEveryTaskChange,
  onClose,
  onConfirm,
}: DataSharingReviewDialogProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-review-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-auto rounded-3xl border border-white/40 bg-white shadow-[0_28px_90px_rgba(28,25,23,0.28)]"
      >
        <div className="sticky top-0 z-10 border-b border-stone-200 bg-[#faf8f4] px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                <ShieldCheck size={21} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{eyebrow}</p>
                <h2 id="data-review-title" className="mt-1 text-xl font-semibold tracking-[-0.025em]">Review what will be shared</h2>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label="Close review">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-7">
          <div className="rounded-2xl border border-stone-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Destination</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{destination}</p>
                {model && <p className="mt-0.5 font-mono text-xs text-stone-500">{model}</p>}
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">External processing</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Request</p>
            <p className="mt-2 max-h-32 overflow-auto whitespace-pre-line rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">{request}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Files included</p>
            {files.length ? (
              <div className="mt-2 max-h-36 space-y-1.5 overflow-auto rounded-2xl border border-stone-200 p-2">
                {files.map((file, index) => {
                  const size = formatFileSize(file.size)
                  return (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-stone-700">
                      <Paperclip size={14} className="shrink-0 text-stone-400" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      {size && <span className="text-xs text-stone-400">{size}</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">No files—only the request above will be sent.</p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#f5efe3] p-4">
            <input
              type="checkbox"
              checked={reviewEveryTask}
              onChange={(event) => onReviewEveryTaskChange(event.target.checked)}
              className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-amber-400"
            />
            <span>
              <span className="block text-sm font-semibold text-stone-800">Show this review before every task</span>
              <span className="mt-0.5 block text-xs leading-5 text-stone-600">You can change this later in Data controls.</span>
            </span>
          </label>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-200">Go back</button>
          <button type="button" onClick={onConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 py-3 text-sm font-semibold text-white hover:bg-black">
            <ShieldCheck size={16} />
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
