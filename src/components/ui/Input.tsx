import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full group">
        {label && (
          <label className="block text-xs font-black text-secondary-foreground uppercase tracking-[0.2em] mb-2 ml-1 group-focus-within:text-primary transition-all">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={`w-full px-4 py-3.5 rounded-2xl bg-input border border-border-input text-[var(--text-primary)] transition-all duration-200 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 ${error ? 'border-red-500 ring-2 ring-red-500/20' : ''} ${className}`}
            {...props}
          />
          {error && (
            <p className="mt-1.5 ml-2 text-[10px] font-black text-red-500 uppercase tracking-widest animate-fade-in">{error}</p>
          )}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';
