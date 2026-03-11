import { Link } from 'react-router-dom'

type WorkerBeeBrandProps = {
  code: string
  to?: string
  className?: string
}

export function WorkerBeeBrand({
  code,
  to = '/',
  className = '',
}: WorkerBeeBrandProps) {
  return (
    <Link to={to} className={`flex items-center gap-3 text-white no-underline ${className}`.trim()}>
      <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
        <span className="material-symbols-outlined text-2xl font-bold">smart_toy</span>
      </div>
      <span className="text-xl font-mono font-extrabold tracking-tighter uppercase text-white crt-glow">
        WorkerBee <span className="text-accent-tan font-normal text-xs">{code}</span>
      </span>
    </Link>
  )
}
