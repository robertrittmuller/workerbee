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
            'group relative w-full h-12 bg-ceramic rounded-xl border border-transparent',
            'shadow-inset-slot flex items-center px-4 transition-all duration-200',
            'focus-within:border-amber focus-within:shadow-inset',
            error && 'border-signal-red'
          )}
        >
          {icon && (
            <span className="material-symbols-outlined text-tungsten group-focus-within:text-amber transition-colors mr-2">
              {icon}
            </span>
          )}
          <input
            className={cn(
              'w-full bg-transparent border-none focus:ring-0 text-espresso',
              'placeholder-tungsten/50 font-body text-sm h-full',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-signal-red">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
