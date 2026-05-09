import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../database/supabase';
import { dataService, syncEngine } from '../core';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithApple: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      console.log('Initial session check:', session ? 'Session found' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      dataService.setUserId(session?.user?.id ?? null);

      if (session?.user) {
        syncEngine.triggerAuthSync(session.user.id);
      }
      setLoading(false);
    }).catch((err) => {
      if (!mounted) return;
      console.error('Error getting initial session:', err);
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      console.log('Auth state changed:', event);

      setSession(session);
      setUser(session?.user ?? null);
      dataService.setUserId(session?.user?.id ?? null);

      if (event === 'SIGNED_IN' && session?.user) {
        console.log('User signed in:', session.user.email);
        syncEngine.triggerAuthSync(session.user.id);
        setError(null);
      }

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      console.log('Signing in with email:', email);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        setError(error.message);
      }

      return { error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Sign in failed';
      console.error('Sign in exception:', err);
      setError(errorMsg);
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      setError(null);
      console.log('Signing up with email:', email);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${getRedirectUrl()}/`,
        },
      });

      if (error) {
        console.error('Sign up error:', error);
        setError(error.message);
      }

      if (!error && data.user && data.session) {
        console.log('Sign up successful, session created');
        setUser(data.user);
        setSession(data.session);
      }

      return { error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Sign up failed';
      console.error('Sign up exception:', err);
      setError(errorMsg);
      return { error: err };
    }
  };

  const getRedirectUrl = () => {
    // Use the OAuth callback URL
    return `${window.location.origin}/auth/callback`;
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      console.log('Starting Google OAuth flow...');

      const redirectUrl = getRedirectUrl();
      console.log('OAuth redirect URL:', redirectUrl);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account', // Always show account selector
            access_type: 'offline',    // Request refresh token
          },
        },
      });

      if (error) {
        console.error('OAuth initiation error:', error);
        setError(error.message);
      } else {
        console.log('OAuth flow initiated successfully');
      }

      return { error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Google sign in failed';
      console.error('OAuth exception:', err);
      setError(errorMsg);
      return { error: err };
    }
  };

  const signInWithApple = async () => {
    try {
      setError(null);
      console.log('Starting Apple OAuth flow...');

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: getRedirectUrl(),
        },
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        setError(error.message);
      }

      return { error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Apple sign in failed';
      console.error('Apple OAuth exception:', err);
      setError(errorMsg);
      return { error: err };
    }
  };

  const signOut = async () => {
    try {
      console.log('Signing out...');
      await supabase.auth.signOut();
      setError(null);
      console.log('Sign out successful');
    } catch (err: any) {
      console.error('Sign out error:', err);
      setError(err?.message || 'Sign out failed');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setError(null);
      console.log('Requesting password reset for:', email);

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${getRedirectUrl()}/reset-password`,
        }
      );

      if (error) {
        console.error('Password reset error:', error);
        setError(error.message);
      } else {
        console.log('Password reset email sent');
      }

      return { error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Password reset failed';
      console.error('Password reset exception:', err);
      setError(errorMsg);
      return { error: err };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        error,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        signOut,
        resetPassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
