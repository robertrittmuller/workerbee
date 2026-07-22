import { Link } from 'react-router-dom'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'

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
      <WorkerBeeMark size={38} />
      <span className="text-xl font-mono font-extrabold tracking-tighter uppercase text-white crt-glow">
        WorkerBee <span className="text-accent-tan font-normal text-xs">{code}</span>
      </span>
    </Link>
  )
}
