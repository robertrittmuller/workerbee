import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'icon'
  size?: 'sm' | 'md' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'font-display font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
    
    const variants = {
      primary: 'bg-amber text-espresso-dark rounded-xl shadow-pneumatic active:shadow-pneumatic-pressed active:translate-y-[1px] hover:brightness-110',
      secondary: 'bg-espresso text-plastic rounded-xl hover:bg-espresso-dark active:scale-[0.98]',
      outline: 'border border-tungsten/30 text-espresso rounded-xl hover:bg-ceramic hover:border-tungsten/50',
      ghost: 'text-tungsten hover:text-espresso hover:bg-ceramic rounded-xl',
      icon: 'text-tungsten hover:text-espresso hover:bg-ceramic rounded-xl',
    }
    
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
      icon: 'w-10 h-10',
    }
    
    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
