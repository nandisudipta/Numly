import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

function readErrorFromLocation(): { error: string; description?: string } | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = search.get('error') || hash.get('error');
  const description =
    search.get('error_description') || hash.get('error_description') || undefined;
  if (!error) return null;
  return { error, description };
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>('Detecting…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 1) Surface OAuth errors that came back in the URL
      const urlError = readErrorFromLocation();
      if (urlError) {
        setErrorMessage(urlError.description || urlError.error);
        return;
      }

      // 2) PKCE flow: explicit code exchange. Supabase ships ?code= on the
      //    redirect; we have to swap it for a session ourselves.
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        setDebug('Exchanging code for session…');
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (cancelled) return;
          if (error) {
            setErrorMessage(`Code exchange failed: ${error.message}`);
            return;
          }
        } catch (e: any) {
          if (cancelled) return;
          setErrorMessage(`Code exchange threw: ${e?.message || String(e)}`);
          return;
        }
      }

      // 3) Implicit flow (#access_token=...) — auto-detected by createClient()
      //    by reading window.location.hash. Just verify the session.
      setDebug('Verifying session…');
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (data.session) {
        navigate('/', { replace: true });
        return;
      }

      // 4) No session yet — wait briefly for SIGNED_IN, then time out.
      setDebug('Waiting for sign-in to settle…');
      const timeout = setTimeout(() => {
        if (cancelled) return;
        setErrorMessage('Sign-in did not complete. The session never arrived.');
      }, 6_000);

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          clearTimeout(timeout);
          sub.subscription.unsubscribe();
          navigate('/', { replace: true });
        }
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-primary mb-2">Sign-in failed</h1>
          <p className="text-secondary mb-6 break-words">{errorMessage}</p>
          <Button variant="primary" className="w-full" onClick={() => navigate('/login')}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-secondary text-sm">{debug}</p>
    </div>
  );
}
