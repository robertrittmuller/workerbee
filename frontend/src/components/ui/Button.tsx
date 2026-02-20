import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'icon'
  size?: 'sm' | 'md' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'font-mono font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
    
    const variants = {
      primary: 'bg-primary text-bg-deep rounded crt-button-glow hover:brightness-110 active:translate-y-[1px]',
      secondary: 'bg-interface-border text-white rounded hover:bg-interface-border/80 active:scale-[0.98]',
      outline: 'border border-interface-border text-accent-tan rounded hover:bg-interface-border/30 hover:text-white',
      ghost: 'text-accent-tan hover:text-white hover:bg-interface-border/30 rounded',
      icon: 'text-accent-tan hover:text-white hover:bg-interface-border/30 rounded',
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
