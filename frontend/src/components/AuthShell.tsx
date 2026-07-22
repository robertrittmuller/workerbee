import type { ReactNode } from 'react'
import { Check, Files, ShieldCheck, Sparkles } from 'lucide-react'
import { PublicHeader } from '@/components/PublicHeader'

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

const assurances = [
  'Start from a real business task, not a blank agent canvas',
  'Review every deliverable and consequential action',
  'Use the web or an installable local workspace',
]

export function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f]">
      <PublicHeader />
      <main className="relative overflow-hidden px-5 pb-12 pt-28 sm:px-8 lg:min-h-screen lg:px-10 lg:pt-32">
        <div className="pointer-events-none absolute -left-40 top-20 h-[520px] w-[520px] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-48 bottom-0 h-[580px] w-[580px] rounded-full bg-emerald-100/60 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <section className="hidden lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
              <Sparkles size={14} />
              Built for the work after the meeting
            </div>
            <h2 className="mt-6 max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.045em]">
              Useful work out.<br />Your judgment stays in.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-stone-600">
              Give WorkerBee the request and working files. It creates reviewable reports, briefs, follow-ups, proposals, presentations, and more.
            </p>
            <div className="mt-8 space-y-3">
              {assurances.map((assurance) => (
                <div key={assurance} className="flex items-start gap-3 text-sm leading-6 text-stone-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={13} strokeWidth={3} /></span>
                  {assurance}
                </div>
              ))}
            </div>
            <div className="mt-9 grid max-w-lg grid-cols-2 gap-3">
              <div className="rounded-2xl border border-stone-200 bg-white/75 p-4 shadow-sm">
                <Files size={18} className="text-[#8b6928]" />
                <p className="mt-3 text-sm font-semibold">Your working files</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">Attach only what the task needs.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white/75 p-4 shadow-sm">
                <ShieldCheck size={18} className="text-emerald-700" />
                <p className="mt-3 text-sm font-semibold">Review boundaries</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">Nothing consequential happens silently.</p>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_rgba(64,54,38,0.12)] sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b6928]">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[34px]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
            <div className="mt-7">{children}</div>
          </section>
        </div>
      </main>
      <footer className="border-t border-stone-200 bg-white px-5 py-5 text-center text-xs text-stone-500">
        © 2026 WorkerBee · Clear work, reviewable results.
      </footer>
    </div>
  )
}
