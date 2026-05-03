import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ShieldCheck, ArrowRight, X } from 'lucide-react';

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSkip: () => void;
  onSignUp: () => void;
}

export const LoginPromptModal: React.FC<LoginPromptModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onSkip,
  onSignUp
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center text-center p-6 space-y-6 max-w-md mx-auto bg-card rounded-3xl border border-border/40 backdrop-blur-3xl shadow-2xl">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-3">
          <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Secure your data</h2>
          <p className="text-secondary text-sm leading-relaxed px-4">
            Your data is currently stored locally. Sign in or sign up to back it up and access it across devices seamlessly.
          </p>
        </div>

        <div className="w-full space-y-3 pt-4">
          <Button
            variant="primary"
            onClick={onLogin}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-xs"
          >
            Continue with Google
            <ArrowRight className="w-4 h-4" />
          </Button>

          <div className="flex flex-col items-center gap-1.5 pt-2">
            <span className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-40">Or Use Email</span>
            <Button
              variant="secondary"
              onClick={onSignUp}
              className="w-full py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] border-primary/20 hover:bg-primary/5 transition-all text-primary"
            >
              Sign Up with Email
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={onSkip}
            className="w-full py-3 text-secondary hover:text-primary transition-colors font-bold uppercase tracking-widest text-[10px]"
          >
            Skip for now
          </Button>
        </div>

        {/* Close button at top right */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-secondary hover:text-primary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </Modal>
  );
};
