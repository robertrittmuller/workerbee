import { useMemo, useState } from 'react'
import { CalendarPlus, ShieldCheck, X } from 'lucide-react'
import {
  parseCalendarAttendees,
  validateCalendarDraft,
  type CalendarDraft,
} from '@/lib/calendarDraft'

type Props = {
  artifactFilename: string
  initialDraft: CalendarDraft
  destinationLabel: string
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (draft: CalendarDraft) => void
}

export default function CalendarDraftReviewDialog({
  artifactFilename,
  initialDraft,
  destinationLabel,
  confirmLabel,
  busy = false,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [title, setTitle] = useState(initialDraft.title)
  const [startDate, setStartDate] = useState(initialDraft.startLocal.split('T')[0] || '')
  const [startTime, setStartTime] = useState(initialDraft.startLocal.split('T')[1] || '')
  const [durationMinutes, setDurationMinutes] = useState(initialDraft.durationMinutes)
  const [location, setLocation] = useState(initialDraft.location)
  const [attendees, setAttendees] = useState(initialDraft.attendees.join(', '))
  const [notes, setNotes] = useState(initialDraft.notes)
  const [confirmed, setConfirmed] = useState(false)
  const draft = useMemo(() => ({
    ...initialDraft,
    title,
    startLocal: startDate && startTime ? `${startDate}T${startTime}` : '',
    durationMinutes,
    location,
    attendees: parseCalendarAttendees(attendees),
    notes,
  }), [attendees, durationMinutes, initialDraft, location, notes, startDate, startTime, title])
  const validation = useMemo(() => validateCalendarDraft(draft), [draft])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/55 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-draft-title"
        className="my-4 w-full max-w-3xl overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-[#f2f8f6] px-6 py-5 sm:px-8">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><CalendarPlus size={20} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Approval required</p>
              <h2 id="calendar-draft-title" className="mt-1 text-xl font-semibold tracking-[-0.025em]">Review the exact calendar draft</h2>
              <p className="mt-1 text-xs leading-5 text-stone-600">WorkerBee prepares a tentative event. It is not added or sent until you finish in your calendar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-stone-500 hover:bg-white disabled:opacity-50" aria-label="Close calendar review"><X size={18} /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <ShieldCheck size={15} />
            <span><strong>Destination:</strong> {destinationLabel}</span>
            <span className="text-emerald-600">·</span>
            <span className="min-w-0 truncate"><strong>Source:</strong> {artifactFilename}</span>
          </div>
          <label className="block text-xs font-semibold text-stone-700">
            Event title
            <input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
            <label className="block text-xs font-semibold text-stone-700">
              Event date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block text-xs font-semibold text-stone-700">
              Start time
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block text-xs font-semibold text-stone-700">
              Duration (minutes)
              <input type="number" min={15} max={480} step={15} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
          </div>
          <p className="-mt-2 text-xs text-stone-500">Timezone: <strong className="font-semibold text-stone-700">{initialDraft.timezone}</strong></p>
          <label className="block text-xs font-semibold text-stone-700">
            Attendee email addresses <span className="font-normal text-stone-400">(optional)</span>
            <input value={attendees} onChange={(event) => setAttendees(event.target.value)} placeholder="name@company.com, teammate@company.com" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <span className="mt-1.5 block font-normal text-stone-500">WorkerBee never adds or invites attendees automatically.</span>
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Location <span className="font-normal text-stone-400">(optional)</span>
            <input value={location} maxLength={500} onChange={(event) => setLocation(event.target.value)} placeholder="Room, address, or meeting link" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Event notes <span className="font-normal text-stone-400">(optional)</span>
            <textarea value={notes} maxLength={12000} rows={9} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 px-3.5 py-3 font-mono text-xs font-normal leading-5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          {(!validation.valid || error) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700" role="alert">
              {error || validation.errors[0]}
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm leading-5 text-stone-700">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
            <span><strong>I reviewed the title, time, attendees, and notes.</strong><br /><span className="text-xs text-stone-500">The event remains tentative until I finish in my calendar.</span></span>
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4 sm:px-8">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-white disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => onConfirm(validation.draft)} disabled={!validation.valid || !confirmed || busy} className="inline-flex items-center gap-2 rounded-xl bg-[#25231f] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <CalendarPlus size={15} />
            {busy ? 'Preparing draft…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
