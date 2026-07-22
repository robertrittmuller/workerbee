import workerBeeIcon from '@/assets/workerbee-icon.png'

type WorkerBeeMarkProps = {
  size?: number
  className?: string
}

export function WorkerBeeMark({ size = 40, className = '' }: WorkerBeeMarkProps) {
  return (
    <img
      src={workerBeeIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      className={`shrink-0 rounded-[24%] ${className}`.trim()}
    />
  )
}
