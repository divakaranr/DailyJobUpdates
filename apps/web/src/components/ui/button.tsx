import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const variants = {
  primary: 'bg-brand text-brand-fg shadow-sm shadow-brand/25 hover:bg-brand-strong',
  gradient: 'bg-gradient-to-r from-brand to-accent text-white shadow-md shadow-brand/30 hover:brightness-110 dark:text-white',
  secondary: 'bg-surface text-fg border border-line shadow-xs hover:border-line-strong hover:bg-surface-2',
  soft: 'bg-brand-soft text-brand hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110 dark:text-bg',
  'danger-soft': 'bg-danger-soft text-danger hover:brightness-95',
  success: 'bg-success text-white hover:brightness-110 dark:text-bg',
} as const;

const sizes = {
  xs: 'h-7 px-2.5 text-xs rounded-lg',
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8 rounded-lg',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  external?: boolean;
}

export function LinkButton({ href, variant = 'primary', size = 'md', icon, className, children, external, ...rest }: LinkButtonProps) {
  const cls = buttonClass(variant, size, className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls} {...rest}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
