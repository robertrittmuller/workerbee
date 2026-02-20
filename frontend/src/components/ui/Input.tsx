import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, ...props }, ref) => {
    return (
      <div className="relative">
        <div
          className={cn(
            'group relative w-full h-12 bg-white/5 rounded border border-interface-border',
            'flex items-center px-4 transition-all duration-200',
            'focus-within:border-primary focus-within:shadow-[0_0_10px_rgba(244,175,37,0.2)]',
            error && 'border-signal-red'
          )}
        >
          {icon && (
            <span className="material-symbols-outlined text-accent-tan group-focus-within:text-primary transition-colors mr-2">
              {icon}
            </span>
          )}
          <input
            className={cn(
              'w-full bg-transparent border-none focus:ring-0 text-white',
              'placeholder-accent-tan/50 font-mono text-sm h-full',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-signal-red font-mono">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
