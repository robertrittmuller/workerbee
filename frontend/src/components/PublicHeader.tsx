import { Link } from 'react-router-dom'
import { WorkerBeeBrand } from '@/components/WorkerBeeBrand'

type PublicHeaderProps = {
  code: string
}

export function PublicHeader({ code }: PublicHeaderProps) {
  return (
    <nav className="fixed top-0 w-full h-16 z-50 bg-bg-sidebar border-b border-interface-border flex items-center px-6 lg:px-12 justify-between">
      <WorkerBeeBrand code={code} to="/" />
      <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest text-accent-tan">
        <a className="hover:text-primary transition-colors flex items-center gap-2" href="/#features">
          // Product
        </a>
        <a className="hover:text-primary transition-colors flex items-center gap-2" href="#">
          // Docs
        </a>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/login">
          <button className="font-mono text-xs uppercase tracking-widest text-accent-tan hover:text-white transition-colors">
            Login
          </button>
        </Link>
        <Link to="/login">
          <button className="bg-primary text-bg-deep px-4 py-1.5 font-mono font-bold text-xs uppercase crt-button-glow">
            Get Started
          </button>
        </Link>
      </div>
    </nav>
  )
}
