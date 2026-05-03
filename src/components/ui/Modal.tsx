import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidths: Record<string, string> = {
    sm: '28rem',
    md: '36rem',
    lg: '48rem',
    xl: '64rem',
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 animate-fade-in" 
      role="dialog" 
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="relative w-full flex flex-col bg-[var(--bg-modal)] shadow-2xl rounded-2xl overflow-hidden"
        style={{
          maxWidth: maxWidths[size],
          maxHeight: '90vh',
          height: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] shrink-0">
          <div className="flex flex-col">
            {title && (
              <h2 className="text-lg font-black tracking-tight text-[var(--text-primary)] uppercase">
                {title}
              </h2>
            )}
            <div className="h-1 w-6 bg-[var(--primary)] rounded-full mt-1.5 opacity-80" />
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-all active:scale-95"
            aria-label="Close modal"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-numly overscroll-contain">
          <div className="w-full max-w-full overflow-x-hidden">
            {children}
          </div>
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--primary)]/[0.02] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
