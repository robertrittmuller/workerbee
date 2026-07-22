import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileSignature,
  FileSpreadsheet,
  ListFilter,
  LineChart,
  NotebookPen,
  Paperclip,
  Plus,
  Presentation,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import {
  validateWorkPack,
  workPackAnswerSummary,
  type WorkPackAnswers,
  type WorkPackDefinition,
  type WorkPackField,
} from '@/lib/workPacks'

type Props = {
  pack: WorkPackDefinition
  answers: WorkPackAnswers
  files: File[]
  libraryFiles?: Array<{ id: string; name: string; size: number }>
  onAnswersChange: (answers: WorkPackAnswers) => void
  onChooseFiles: () => void
  onRemoveFile: (index: number) => void
  onRemoveLibraryFile?: (id: string) => void
  onCancel: () => void
  onApply: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`
  return `${(kilobytes / 1024).toFixed(1)} MB`
}

function PackIcon({ pack }: { pack: WorkPackDefinition }) {
  const Icon = pack.icon === 'summary'
    ? FileSearch
    : pack.icon === 'table'
      ? FileSpreadsheet
      : pack.icon === 'cleanup'
        ? ListFilter
      : pack.icon === 'reporting'
        ? LineChart
      : pack.icon === 'project'
        ? ClipboardList
      : pack.icon === 'research'
        ? FileSearch
      : pack.icon === 'proposal'
        ? FileSignature
      : pack.icon === 'presentation'
        ? Presentation
      : pack.icon === 'followup'
        ? ClipboardCheck
      : pack.icon === 'meeting'
        ? CalendarCheck2
        : pack.icon === 'memo'
          ? NotebookPen
          : BarChart3
  return <Icon size={22} />
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: WorkPackField
  value: string | string[] | boolean | undefined
  onChange: (value: string | string[] | boolean) => void
}) {
  if (field.type === 'select') {
    return (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(field.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
              value === option
                ? 'border-[#25231f] bg-[#25231f] text-white shadow-sm'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    )
  }

  if (field.type === 'multi-select') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(field.options ?? []).map((option) => {
          const isSelected = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(isSelected ? selected.filter((item) => item !== option) : [...selected, option])}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
                isSelected
                  ? 'border-[#8b6928] bg-[#f5efe3] text-[#654b18]'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
              }`}
            >
              {isSelected && <Check size={14} />}
              {option}
            </button>
          )
        })}
      </div>
    )
  }

  if (field.type === 'toggle') {
    const checked = Boolean(value)
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-2.5 flex w-full items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-left"
      >
        <span className="text-sm font-medium text-stone-700">{checked ? 'Included' : 'Not included'}</span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-[#25231f]' : 'bg-stone-300'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`} />
        </span>
      </button>
    )
  }

  const sharedClass =
    'mt-2.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm leading-6 text-stone-800 placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'

  return field.type === 'textarea' ? (
    <textarea
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      rows={3}
      className={`${sharedClass} resize-none`}
    />
  ) : (
    <input
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      className={sharedClass}
    />
  )
}

export default function WorkPackDialog({
  pack,
  answers,
  files,
  libraryFiles = [],
  onAnswersChange,
  onChooseFiles,
  onRemoveFile,
  onRemoveLibraryFile,
  onCancel,
  onApply,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [errors, setErrors] = useState<string[]>([])
  const minimumSources = pack.minimumSources ?? 1
  const sourceCount = files.length + libraryFiles.length
  const answerSummary = useMemo(() => workPackAnswerSummary(pack, answers), [answers, pack])

  useEffect(() => {
    setErrors((current) => current.filter((error) => !error.startsWith('Add at least')))
  }, [sourceCount])

  const updateAnswer = (fieldId: string, value: string | string[] | boolean) => {
    onAnswersChange({ ...answers, [fieldId]: value })
    setErrors([])
  }

  const continueToSources = () => {
    const fieldErrors = validateWorkPack(pack, answers, Math.max(sourceCount, 1)).filter(
      (error) => !error.startsWith('Add at least')
    )
    if (fieldErrors.length) {
      setErrors(fieldErrors)
      return
    }
    setErrors([])
    setStep(2)
  }

  const apply = () => {
    const validationErrors = validateWorkPack(pack, answers, sourceCount)
    if (validationErrors.length) {
      setErrors(validationErrors)
      return
    }
    onApply()
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-pack-title"
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-[0_30px_100px_rgba(28,25,23,0.32)]"
      >
        <header className="border-b border-stone-200 bg-[#faf8f4] px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${pack.accent}`}>
                <PackIcon pack={pack} />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-500">
                  <span className="sm:hidden">Step {step} of 2</span>
                  <span className="hidden items-center gap-2 sm:flex">
                    <span>Guided setup</span>
                    <span className="h-1 w-1 rounded-full bg-stone-300" />
                    <span>Step {step} of 2</span>
                  </span>
                </div>
                <h2 id="work-pack-title" className="mt-1.5 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                  {pack.title}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-stone-600">
                  {step === 1 ? 'A few choices give WorkerBee a strong definition of done.' : 'Add the source material and review the promised deliverable.'}
                </p>
              </div>
            </div>
            <button type="button" onClick={onCancel} className="rounded-xl p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label="Close guided setup">
              <X size={19} />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <span className={`h-1.5 rounded-full ${step >= 1 ? 'bg-[#25231f]' : 'bg-stone-200'}`} />
            <span className={`h-1.5 rounded-full ${step >= 2 ? 'bg-[#25231f]' : 'bg-stone-200'}`} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          {step === 1 ? (
            <div className="space-y-6">
              {pack.fields.map((field) => (
                <div key={field.id}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <label className="text-sm font-semibold text-stone-800">{field.label}</label>
                    {field.required && <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Required</span>}
                  </div>
                  {field.help && <p className="mt-1 text-xs text-stone-500">{field.help}</p>}
                  <FieldControl field={field} value={answers[field.id]} onChange={(value) => updateAnswer(field.id, value)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold">Source files</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-500">{pack.sourceHint}</p>
                    {minimumSources > 1 && (
                      <p className="mt-1.5 text-xs font-semibold text-[#765719]">
                        {Math.min(sourceCount, minimumSources)} of {minimumSources} required sources added
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={onChooseFiles} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                    <Plus size={15} /> Add files
                  </button>
                </div>
                {sourceCount ? (
                  <div className="mt-3 space-y-2 rounded-2xl border border-stone-200 p-2">
                    {libraryFiles.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 rounded-xl bg-[#faf7f0] px-3 py-2.5">
                        <Paperclip size={15} className="shrink-0 text-[#9a711a]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">{file.name}</span>
                        <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">Library</span>
                        <span className="text-xs text-stone-400">{formatFileSize(file.size)}</span>
                        {onRemoveLibraryFile && <button type="button" onClick={() => onRemoveLibraryFile(file.id)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`Remove ${file.name}`}><X size={14} /></button>}
                      </div>
                    ))}
                    {files.map((file, index) => (
                      <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-stone-50">
                        <Paperclip size={15} className="shrink-0 text-stone-400" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">{file.name}</span>
                        <span className="text-xs text-stone-400">{formatFileSize(file.size)}</span>
                        <button type="button" onClick={() => onRemoveFile(index)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`Remove ${file.name}`}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button type="button" onClick={onChooseFiles} className="mt-3 flex w-full flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center hover:border-amber-400 hover:bg-amber-50/40">
                    <Paperclip size={20} className="text-stone-400" />
                    <span className="mt-2 text-sm font-semibold text-stone-700">
                      {minimumSources === 1 ? 'Add at least one source file' : `Add at least ${minimumSources} source files`}
                    </span>
                    <span className="mt-1 text-xs text-stone-500">Only the files you choose will be included.</span>
                  </button>
                )}
              </section>

              <section className="rounded-2xl border border-[#e3dccd] bg-[#faf7f0] p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#765719]">
                  <Sparkles size={14} /> Definition of done
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-stone-500">
                      {(pack.outputs?.length ?? 1) > 1 ? 'Deliverables' : 'Deliverable'}
                    </p>
                    <div className="mt-1.5 space-y-1.5">
                      {(pack.outputs ?? [{ filename: pack.outputFilename ?? '', type: pack.outputType ?? 'markdown', label: 'Deliverable' }]).map((output) => (
                        <div key={output.filename} className="flex items-center gap-2">
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{output.type}</span>
                          <span className="font-mono text-sm font-semibold text-stone-800">{output.filename}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500">Setup</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {answerSummary.map((summary) => <span key={summary} className="rounded-lg bg-white px-2 py-1 text-xs text-stone-600">{summary}</span>)}
                    </div>
                  </div>
                </div>
                <div className="mt-5 border-t border-[#e3dccd] pt-4">
                  <p className="text-xs font-semibold text-stone-500">Review checklist</p>
                  <div className="mt-2 space-y-2">
                    {pack.qualityChecks.map((check) => (
                      <div key={check} className="flex items-start gap-2 text-xs leading-5 text-stone-600">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                        {check}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <div className="flex gap-3 rounded-2xl bg-sky-50 p-4 text-xs leading-5 text-sky-900">
                <ShieldCheck size={17} className="mt-0.5 shrink-0" />
                You will still review the exact request, filenames, and model destination before WorkerBee starts.
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-semibold">One more thing</p>
              <ul className="mt-2 space-y-1 text-xs leading-5">
                {errors.map((error) => <li key={error}>• {error}</li>)}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {step === 1 ? (
            <button type="button" onClick={onCancel} className="rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-200">Cancel</button>
          ) : (
            <button type="button" onClick={() => { setErrors([]); setStep(1) }} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-200">
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {step === 1 ? (
            <button type="button" onClick={continueToSources} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 py-3 text-sm font-semibold text-white hover:bg-black">
              Continue to sources <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={apply} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 py-3 text-sm font-semibold text-white hover:bg-black">
              <Check size={16} /> Use this setup
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
