import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderOpen,
  Laptop,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  MonitorDown,
  Presentation,
  ShieldCheck,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { PublicHeader } from '@/components/PublicHeader'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'

type WorkCard = {
  icon: LucideIcon
  title: string
  description: string
  outputs: string
  color: string
}

const workCards: WorkCard[] = [
  { icon: LineChart, title: 'Report project status', description: 'Align progress, risks, decisions, owners, and dates from current project evidence.', outputs: 'Status report · register · stakeholder draft', color: 'bg-emerald-50 text-emerald-700' },
  { icon: BarChart3, title: 'Run a recurring report', description: 'Turn each period’s data into a consistent KPI readout, scorecard, and repeatable run.', outputs: 'Performance report · scorecard · runbook', color: 'bg-sky-50 text-sky-700' },
  { icon: MessageSquareText, title: 'Follow up after a meeting', description: 'Convert notes into a grounded recap with accountable actions and an editable message.', outputs: 'Recap · action register · follow-up draft', color: 'bg-amber-50 text-amber-800' },
  { icon: FileSearch, title: 'Synthesize research', description: 'Compare sources while keeping disagreements, inference, and evidence gaps visible.', outputs: 'Synthesis · claim ledger · source register', color: 'bg-violet-50 text-violet-700' },
  { icon: FileText, title: 'Draft a proposal', description: 'Answer requirements persuasively without hiding unsupported claims or unconfirmed terms.', outputs: 'Proposal · requirements matrix · review', color: 'bg-rose-50 text-rose-700' },
  { icon: Presentation, title: 'Create a presentation', description: 'Shape source material into a clear slide story with evidence and speaker notes.', outputs: 'PowerPoint · reviewable outline', color: 'bg-orange-50 text-orange-700' },
]

const trustPoints = [
  { icon: UserCheck, title: 'You approve consequential actions', description: 'WorkerBee shows recipients and exact content before an external handoff. Drafts never send themselves.' },
  { icon: ClipboardCheck, title: 'Every result has a review bar', description: 'Pack-specific checks call out missing evidence, unsupported claims, owners, dates, and assumptions.' },
  { icon: LockKeyhole, title: 'Local work stays practical', description: 'The installable app runs without admin access and can work with files from your computer.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f]">
      <PublicHeader />

      <main>
        <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-8 sm:pt-36 lg:px-10 lg:pb-28">
          <div className="pointer-events-none absolute -left-48 top-12 h-[560px] w-[560px] rounded-full bg-amber-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -right-52 top-32 h-[600px] w-[600px] rounded-full bg-emerald-100/70 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/75 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm">
                <Sparkles size={14} />
                From business request to reviewable work
              </div>
              <h1 className="mt-6 max-w-3xl text-[44px] font-semibold leading-[0.98] tracking-[-0.06em] sm:text-6xl lg:text-[72px]">
                Give it the work.<br /><span className="text-[#936b18]">Keep the judgment.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
                WorkerBee turns your request and working files into reports, briefs, follow-ups, proposals, presentations, and other work you can inspect, improve, and trust.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25231f] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,35,31,0.18)] transition hover:-translate-y-0.5 hover:bg-black">
                  Start with a common task <ArrowRight size={17} />
                </Link>
                <a href="#work" className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white">
                  See what it can do
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-stone-600">
                {['Web workspace', 'Local desktop app', 'Human review gates'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-700" strokeWidth={3} />{item}</span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl">
              <div className="absolute -inset-5 rounded-[40px] bg-gradient-to-br from-white/80 to-amber-100/50 blur-xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_28px_90px_rgba(73,62,41,0.16)]">
                <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-5 py-3.5">
                  <div className="flex items-center gap-2.5"><WorkerBeeMark size={30} /><span className="text-sm font-bold">WorkerBee</span></div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Ready to work</span>
                </div>
                <div className="p-5 sm:p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b6928]">Your request</p>
                  <div className="mt-3 rounded-2xl border border-stone-200 bg-[#fbfaf8] p-4 text-sm leading-6 text-stone-700">
                    Create this week’s Atlas project update for the steering committee. Use the plan, meeting notes, and risk register. Make decisions and owner gaps obvious.
                    <div className="mt-4 flex flex-wrap gap-2">
                      {['project-plan.docx', 'team-notes.docx', 'risk-register.xlsx'].map((file) => (
                        <span key={file} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-stone-600"><FolderOpen size={12} />{file}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[
                      ['Project status', 'Ready to review'],
                      ['Accountable register', '12 tracked items'],
                      ['Stakeholder message', 'Draft only'],
                    ].map(([title, detail], index) => (
                      <div key={title} className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm">
                        <span className={`grid h-8 w-8 place-items-center rounded-xl ${index === 2 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                          {index === 2 ? <MessageSquareText size={15} /> : <Check size={15} strokeWidth={3} />}
                        </span>
                        <p className="mt-3 text-xs font-semibold">{title}</p>
                        <p className="mt-1 text-[10px] text-stone-500">{detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-start gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-amber-800" /><p className="text-xs leading-5 text-amber-900"><strong>Review before sharing.</strong><br />Confirm recipients, health, owners, and dates.</p></div>
                    <span className="hidden shrink-0 rounded-xl bg-[#25231f] px-3 py-2 text-[10px] font-semibold text-white sm:block">Open review</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="work" className="scroll-mt-24 border-y border-stone-200 bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b6928]">Common work, unusually well done</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Start with the result you need.</h2>
              <p className="mt-4 text-base leading-7 text-stone-600">Guided task packs give business users strong defaults, required evidence, promised deliverables, and a clear review checklist.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workCards.map(({ icon: Icon, title, description, outputs, color }) => (
                <article key={title} className="group rounded-[24px] border border-stone-200 bg-[#fbfaf8] p-5 transition hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_16px_45px_rgba(72,60,41,0.09)]">
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl ${color}`}><Icon size={20} /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
                  <p className="mt-5 border-t border-stone-200 pt-4 text-[11px] font-semibold leading-5 text-stone-500">{outputs}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b6928]">A shorter path to useful</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Three steps. No agent engineering degree.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                ['01', 'Choose the outcome', 'Start with a common task or describe the result in plain language. WorkerBee asks only for details that change the work.'],
                ['02', 'Add the evidence', 'Attach the plans, notes, spreadsheets, and source material the task should use. The request stays visible.'],
                ['03', 'Review and improve', 'Inspect the deliverables, quality checks, evidence gaps, and version history before anything leaves your workspace.'],
              ].map(([number, title, description]) => (
                <div key={number} className="relative overflow-hidden rounded-[26px] border border-stone-200 bg-white p-6 shadow-sm">
                  <span className="text-5xl font-semibold tracking-[-0.06em] text-amber-200">{number}</span>
                  <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="desktop" className="scroll-mt-24 bg-[#25231f] px-5 py-20 text-white sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-amber-200"><MonitorDown size={14} />Web when you want it. Local when you need it.</div>
              <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">An installable workspace without an IT ticket.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-stone-300">WorkerBee’s desktop app installs per user without administrator access. It can select local files and folders, keeps its working library on the computer, and uses the same guided workflows as the web.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {['No administrator access required', 'Native local file and folder selection', 'Private local task history', 'Explicit model and data controls'].map((item) => (
                  <span key={item} className="flex items-center gap-2 text-sm text-stone-200"><Check size={15} className="text-amber-300" strokeWidth={3} />{item}</span>
                ))}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-300 text-stone-900"><Laptop size={20} /></span><div><p className="text-sm font-semibold">Local workspace ready</p><p className="mt-0.5 text-xs text-stone-400">Your library stays on this computer.</p></div></div>
              <div className="mt-5 space-y-3">
                {[
                  ['Choose local files', 'Open the native file picker'],
                  ['Select a working folder', 'Keep deliverables where your team expects'],
                  ['Review data controls', 'See the model destination before a run'],
                ].map(([title, detail]) => (
                  <div key={title} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3.5"><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-stone-400">{detail}</p></div><ArrowRight size={16} className="shrink-0 text-amber-300" /></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="scroll-mt-24 border-b border-stone-200 bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b6928]">Trust is part of the workflow</p><h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Automation that knows where to stop.</h2></div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {trustPoints.map(({ icon: Icon, title, description }) => (
                <article key={title} className="rounded-[24px] border border-stone-200 p-6"><Icon size={22} className="text-emerald-700" /><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-stone-600">{description}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-100 via-[#f5e6be] to-emerald-100 p-7 text-center shadow-sm sm:p-12">
            <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Start with work that is already waiting.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-700">Pick a common task, add the files you already have, and get a result designed to be reviewed—not blindly trusted.</p>
            <Link to="/register" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#25231f] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-black">Create your workspace <ArrowRight size={17} /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <Link to="/" className="flex items-center gap-2.5"><WorkerBeeMark size={34} /><span className="font-bold tracking-[-0.025em]">WorkerBee</span></Link>
          <p className="text-xs text-stone-500">© 2026 WorkerBee · Clear work, reviewable results.</p>
          <div className="flex gap-5 text-xs font-semibold text-stone-500"><a href="#work" className="hover:text-stone-900">Product</a><a href="#trust" className="hover:text-stone-900">Trust</a><Link to="/login" className="hover:text-stone-900">Sign in</Link></div>
        </div>
      </footer>
    </div>
  )
}
