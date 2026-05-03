import { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverGlow?: boolean;
  variant?: 'default' | 'dark';
  style?: CSSProperties;
}

export function Card({ children, className = '', onClick, hoverGlow = true, variant = 'default', style }: CardProps) {
  const clickableStyles = onClick 
    ? 'cursor-pointer group active:scale-[0.98]' 
    : '';
  
  const variantStyles = variant === 'dark' 
    ? 'bg-card/80 border-border/80' 
    : 'neon-card';

  const glowStyles = hoverGlow 
    ? 'hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10' 
    : '';

  return (
    <div
      className={`${variantStyles} p-6 ${clickableStyles} ${glowStyles} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}
