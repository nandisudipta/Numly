import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useTheme, Theme } from '../hooks/ThemeContext';
import { ArrowLeft, Moon, Sun, Monitor, LogOut } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  loading?: boolean;
}

const THEMES: { id: Theme; label: string; color: string; title: string; name: string; Icon: any }[] = [
  { id: 'standard', label: '🏢', color: '#2563EB', title: 'Standard Professional Mode', name: 'Standard', Icon: Monitor },
  { id: 'neon',     label: '🔋', color: '#A3E635', title: 'Neon OLED Dark Mode',        name: 'Neon',     Icon: Moon },
  { id: 'royal',    label: '👑', color: '#A67C52', title: 'Royal Ivory Light Mode',     name: 'Royal',    Icon: Sun },
];

export function BrandedLoader() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 flex overflow-hidden">
      <div className="h-full bg-primary animate-loading-bar w-1/3" />
    </div>
  );
}

import { useState, useEffect } from 'react';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowPrompt(true);
      }
    };
    const manualHandler = () => {
      if (!window.matchMedia('(display-mode: standalone)').matches && deferredPrompt) {
        setShowPrompt(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('app:trigger-install', manualHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('app:trigger-install', manualHandler);
    };
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md animate-slide-up">
      <div className="bg-card/90 backdrop-blur-2xl border border-primary/20 rounded-3xl p-5 shadow-[0_20px_50px_-20px_rgba(var(--primary-rgb),0.3)] ring-1 ring-white/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-sm font-black text-primary uppercase tracking-tight">Install Numly BRO</h5>
            <div className="flex flex-col gap-0.5 mt-0.5">
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest opacity-60">Works like native app</p>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest opacity-60">Offline ready</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowPrompt(false)}
              className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors"
            >
              Later
            </button>
            <button 
              onClick={handleInstall}
              className="px-5 py-2.5 bg-primary text-primary-contrast text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all"
            >
              Install
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children, title, showBack, onBack, loading }: LayoutProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const currentIdx = THEMES.findIndex(t => t.id === theme);
  const nextTheme  = THEMES[(currentIdx + 1) % THEMES.length].id;
  const activeTheme = THEMES[currentIdx] || THEMES[0];
  const ThemeIcon = activeTheme.Icon;

  return (
    <div className="min-h-screen flex flex-col">
      {loading && <BrandedLoader />}
      
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-40 backdrop-blur-3xl border-b"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between h-[64px]">

            {/* Left — Branded Identity / Back */}
            <div className="flex items-center gap-3 z-10 min-w-[120px]">
              {showBack ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { triggerHaptic('light'); handleBack(); }}
                    className="p-2 rounded-xl active:scale-90 transition-transform bg-white/5"
                    style={{ border: '1px solid var(--border-color)' }}
                  >
                    <ArrowLeft className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                  </button>
                  {title && (
                    <h1 className="text-base sm:text-lg font-black tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] sm:max-w-[200px]" style={{ color: 'var(--primary)' }}>
                      {title}
                    </h1>
                  )}
                </div>
              ) : (
                <div className="flex flex-col -space-y-1 group cursor-default">
                  <span className="text-xs sm:text-sm font-black tracking-tighter uppercase text-[var(--primary)] group-hover:text-primary transition-colors">Numly Bro</span>
                  <span className="text-[7px] sm:text-[8px] font-black tracking-[0.2em] uppercase text-secondary opacity-40">PERSONAL LEDGER</span>
                </div>
              )}
            </div>

            {/* Right — Simplified Theme Switcher + User */}
            <div className="flex items-center gap-2 z-10 min-w-[120px] justify-end">
              {/* Simple Theme Selector */}
              <button
                onClick={() => { triggerHaptic('medium'); setTheme(nextTheme); }}
                title={activeTheme.title}
                className="flex items-center gap-2 p-1.5 sm:pr-3 rounded-2xl border transition-all active:scale-95 group overflow-hidden"
                style={{ 
                  background: 'color-mix(in srgb, var(--primary) 7%, transparent)', 
                  borderColor: 'var(--border-color)' 
                }}
              >
                <div 
                  className="w-7 h-7 rounded-xl flex items-center justify-center transition-all group-hover:rotate-12"
                  style={{ background: `${activeTheme.color}20`, color: activeTheme.color }}
                >
                  <ThemeIcon size={14} strokeWidth={3} />
                </div>
                <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                  {activeTheme.name}
                </span>
              </button>

              <div className="h-6 w-px mx-1 block sm:hidden" />

              {user && (
                <button
                  onClick={() => { triggerHaptic('light'); handleSignOut(); }}
                  title={`Sign out (${user?.email})`}
                  aria-label={`Sign out ${user?.email}`}
                  className="flex items-center gap-2 pl-1 pr-2 sm:pr-3 py-1 rounded-2xl transition-all active:scale-95 group border border-transparent hover:border-[var(--border-color)]"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                    }}
                  >{user?.email?.[0] || 'U'}</div>
                  <div className="hidden sm:flex flex-col items-start leading-none text-left">
                    <span className="text-[10px] font-black uppercase truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>{user?.email?.split('@')[0]}</span>
                    <span className="text-[8px] font-black uppercase opacity-60" style={{ color: 'var(--text-secondary)' }}>Sign out</span>
                  </div>
                  <LogOut className="w-4 h-4 sm:hidden" style={{ color: 'var(--text-secondary)' }} />
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 sm:pt-10 sm:pb-20">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
      <PWAInstallPrompt />
    </div>
  );
}
