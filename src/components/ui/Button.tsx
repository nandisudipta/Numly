import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'font-black rounded-[1.25rem] transition-[transform,box-shadow,background-color,color,border-color,opacity] duration-150 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.97] outline-none focus:ring-2 focus:ring-primary/30 will-change-transform';

  const variantStyles = {
    primary: 'bg-primary text-[var(--primary-contrast)] shadow-lg shadow-primary/20 hover:shadow-primary/30',
    secondary: 'bg-card text-primary border border-border/60 hover:bg-card-hover backdrop-blur-2xl',
    danger: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
    success: 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 hover:bg-[#10B981]/20',
    ghost: 'bg-transparent text-secondary hover:text-primary hover:bg-card-hover',
  };

  const sizeStyles = {
    sm: 'px-4 py-2.5 text-xs tracking-wider uppercase',
    md: 'px-7 py-3.5 text-sm font-bold',
    lg: 'px-10 py-5 text-base font-bold',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin stroke-[3px]" />}
      {children}
    </button>
  );
}
