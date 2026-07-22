import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-stone-200/80 bg-[#f8f7f4]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex items-center gap-2.5 text-[#25231f] no-underline" aria-label="WorkerBee home">
          <WorkerBeeMark size={38} />
          <span className="text-lg font-bold tracking-[-0.035em]">WorkerBee</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex" aria-label="Public navigation">
          <a href="/#work" className="transition hover:text-stone-950">What it does</a>
          <a href="/#how" className="transition hover:text-stone-950">How it works</a>
          <a href="/#desktop" className="transition hover:text-stone-950">Desktop app</a>
          <a href="/#trust" className="transition hover:text-stone-950">Trust</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 transition hover:bg-white hover:text-stone-950 sm:px-4">
            Sign in
          </Link>
          <Link to="/register" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25231f] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black sm:px-4">
            Start free
            <ArrowRight size={15} className="hidden sm:block" />
          </Link>
        </div>
      </div>
    </header>
  )
}
