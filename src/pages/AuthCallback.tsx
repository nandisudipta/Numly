import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface ErrorState {
  error: string;
  description?: string;
  code?: string;
}

function readErrorFromLocation(): ErrorState | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const error = search.get('error') || hash.get('error');
  const description = search.get('error_description') || hash.get('error_description');
  const code = search.get('error_code') || hash.get('error_code');

  if (!error) return null;

  return { error, description, code };
}

function getReadableErrorMessage(error: ErrorState): string {
  // Handle common OAuth errors
  const errorMap: Record<string, string> = {
    'access_denied': 'You denied access. Please try again and allow access to continue.',
    'server_error': 'Google server error. Please try again in a moment.',
    'temporarily_unavailable': 'Google is temporarily unavailable. Please try again soon.',
    'invalid_request': 'Invalid request. Please refresh and try again.',
    'unsupported_response_type': 'Configuration error. Please contact support.',
    'invalid_scope': 'Permission scope error. Please contact support.',
    'invalid_grant': 'Authorization failed. Please sign in again.',
  };

  if (errorMap[error.error]) {
    return errorMap[error.error];
  }

  if (error.description) {
    return error.description;
  }

  return `Authentication failed: ${error.error}. Please try again.`;
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>('Detecting…');
  const [sessionEstablished, setSessionEstablished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeout: NodeJS.Timeout;

    const run = async () => {
      try {
        // 1) Surface OAuth errors that came back in the URL
        const urlError = readErrorFromLocation();
        if (urlError) {
          const readableMessage = getReadableErrorMessage(urlError);
          console.error('OAuth Error:', urlError);
          setErrorMessage(readableMessage);
          return;
        }

        // 2) PKCE flow: explicit code exchange
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          setDebug('Exchanging code for session…');
          console.log('Found auth code, exchanging for session...');

          try {
            const { error, data } = await supabase.auth.exchangeCodeForSession(window.location.href);

            if (cancelled) return;

            if (error) {
              console.error('Code exchange error:', error);
              setErrorMessage(`Code exchange failed: ${error.message || 'Unknown error'}`);
              return;
            }

            if (data?.session) {
              console.log('Session established successfully');
              setSessionEstablished(true);
              if (cancelled) return;
              navigate('/', { replace: true });
              return;
            }
          } catch (e: any) {
            if (cancelled) return;
            console.error('Code exchange exception:', e);
            setErrorMessage(`Code exchange threw: ${e?.message || String(e)}`);
            return;
          }
        }

        // 3) Implicit flow (#access_token=...) — auto-detected by createClient()
        setDebug('Verifying session…');
        console.log('Checking for existing session...');

        const { data, error } = await supabase.auth.getSession();

        if (cancelled) return;

        if (error) {
          console.error('Get session error:', error);
          setErrorMessage(error.message);
          return;
        }

        if (data.session) {
          console.log('Session found, redirecting...');
          setSessionEstablished(true);
          navigate('/', { replace: true });
          return;
        }

        // 4) No session yet — wait briefly for SIGNED_IN event
        setDebug('Waiting for sign-in to settle…');
        console.log('No session found, waiting for auth state change...');

        timeout = setTimeout(() => {
          if (cancelled) return;
          console.error('Timeout: Sign-in did not complete');
          setErrorMessage('Sign-in did not complete. Please try again.');
        }, 8_000);

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
          if (cancelled) return;

          console.log('Auth state change event:', event);

          if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            clearTimeout(timeout);
            sub.subscription.unsubscribe();
            console.log('Sign-in complete, redirecting...');
            setSessionEstablished(true);
            navigate('/', { replace: true });
          }
        });

        return () => {
          sub.subscription.unsubscribe();
        };
      } catch (err: any) {
        if (cancelled) return;
        console.error('Unexpected error in AuthCallback:', err);
        setErrorMessage(`Unexpected error: ${err?.message || String(err)}`);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [navigate]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-primary mb-2">Sign-in failed</h1>
          <p className="text-secondary mb-6 break-words text-sm leading-relaxed">{errorMessage}</p>

          <div className="space-y-3">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => navigate('/login')}
            >
              Back to sign in
            </Button>

            <button
              onClick={() => {
                setErrorMessage(null);
                window.location.href = '/auth/callback';
              }}
              className="w-full px-4 py-2 text-secondary text-sm hover:bg-surface rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-secondary text-sm">{debug}</p>
      {process.env.NODE_ENV === 'development' && (
        <p className="text-xs text-secondary opacity-50 mt-4">
          Check console for detailed logs
        </p>
      )}
    </div>
  );
}
