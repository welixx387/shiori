import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'glass' | 'light'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'btn-shine bg-ember-animated text-white shadow-glow hover:brightness-110',
  secondary: 'bg-surface-2 text-fg border border-line/10 hover:bg-surface-3 hover:border-line/15',
  ghost: 'text-fg-2 hover:text-fg hover:bg-line/[0.06]',
  outline: 'border border-line/15 text-fg hover:border-line/30 hover:bg-line/[0.04]',
  danger: 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15',
  glass: 'glass text-fg hover:bg-surface/80',
  light: 'bg-white text-[#16131c] shadow-lg hover:bg-white/90',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[3.25rem] px-7 text-[15px]',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  variant?: 'ghost' | 'glass' | 'secondary'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, variant = 'ghost', className, children, type = 'button', ...rest },
  ref
) {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  const look =
    variant === 'glass'
      ? 'glass hover:bg-surface/80'
      : variant === 'secondary'
        ? 'bg-surface-2 border border-line/10 hover:bg-surface-3'
        : 'hover:bg-line/[0.07]'
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-fg-2 transition-[background-color,color,transform] duration-200 hover:text-fg active:scale-90 disabled:opacity-40',
        dims,
        look,
        active && 'bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
