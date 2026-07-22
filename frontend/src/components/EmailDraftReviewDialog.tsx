import { useMemo, useState } from 'react'
import { Mail, ShieldCheck, X } from 'lucide-react'
import {
  parseRecipientText,
  validateEmailDraft,
  type EmailDraft,
} from '@/lib/emailDraft'

type Props = {
  artifactFilename: string
  initialDraft: EmailDraft
  busy?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (draft: EmailDraft) => void
}

export default function EmailDraftReviewDialog({
  artifactFilename,
  initialDraft,
  busy = false,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [to, setTo] = useState(initialDraft.to.join(', '))
  const [cc, setCc] = useState(initialDraft.cc.join(', '))
  const [subject, setSubject] = useState(initialDraft.subject)
  const [body, setBody] = useState(initialDraft.body)
  const [confirmed, setConfirmed] = useState(false)
  const draft = useMemo(
    () => ({ to: parseRecipientText(to), cc: parseRecipientText(cc), subject, body }),
    [body, cc, subject, to]
  )
  const validation = useMemo(() => validateEmailDraft(draft), [draft])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/55 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-draft-title"
        className="my-4 w-full max-w-3xl overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-[#fbf7ee] px-6 py-5 sm:px-8">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Mail size={20} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b6928]">Approval required</p>
              <h2 id="email-draft-title" className="mt-1 text-xl font-semibold tracking-[-0.025em]">Review the exact email draft</h2>
              <p className="mt-1 text-xs leading-5 text-stone-600">Nothing is sent. WorkerBee will only open this content as a draft in your default email app.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-stone-500 hover:bg-white disabled:opacity-50" aria-label="Close email review"><X size={18} /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <ShieldCheck size={15} />
            <span><strong>Destination:</strong> Default email app</span>
            <span className="text-emerald-600">·</span>
            <span className="min-w-0 truncate"><strong>Source:</strong> {artifactFilename}</span>
          </div>
          <label className="block text-xs font-semibold text-stone-700">
            To
            <input autoFocus value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@company.com" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            CC <span className="font-normal text-stone-400">(optional)</span>
            <input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="name@company.com" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Subject
            <input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Message
            <textarea value={body} maxLength={12000} rows={11} onChange={(event) => setBody(event.target.value)} className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 px-3.5 py-3 font-mono text-xs font-normal leading-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          </label>
          {(!validation.valid || error) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700">
              {error || validation.errors[0]}
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm leading-5 text-stone-700">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#25231f]" />
            <span><strong>I reviewed the recipients and content.</strong><br /><span className="text-xs text-stone-500">My email app will open a draft; it will not be sent automatically.</span></span>
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4 sm:px-8">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-white disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => onConfirm(validation.draft)} disabled={!validation.valid || !confirmed || busy} className="inline-flex items-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Mail size={15} />
            {busy ? 'Opening draft…' : 'Open draft in email app'}
          </button>
        </div>
      </section>
    </div>
  )
}
