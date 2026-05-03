import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Mail } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, user } = useAuth();

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = search.get('error') || hash.get('error');
    const desc = search.get('error_description') || hash.get('error_description');
    if (oauthError) {
      setError(desc || oauthError);
    }
  }, []);

  // ── Email Login ──────────────────────────────────────────────────────
  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!cleanPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await signIn(cleanEmail, cleanPassword);
      if (error) {
        if (error.message.includes('fetch')) {
          setError('Connection error. Please check your internet connection.');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please confirm your email before signing in.');
        } else {
          setError(error.message);
        }
        setLoading(false);
      } else {
        setTimeout(() => navigate('/', { replace: true }), 500);
      }
    } catch {
      setError('Unable to connect to server. Please check your internet connection.');
      setLoading(false);
    }
  };

  // ── Google ───────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) setError(error.message);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-primary">
            NUMLY
          </h1>
          <p className="text-secondary text-sm font-medium opacity-60 tracking-wide mt-1">
            Professional Cloud Bookkeeping
          </p>
        </div>

        <div className="card-dark">
          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-primary">Password</label>
                <Link to="/forgot-password" className="text-xs text-gold hover:text-gold-hover">
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              <Mail className="w-5 h-5" /> Sign in with Email
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-secondary">or</span>
            </div>
          </div>

          {/* Google */}
          <Button type="button" variant="secondary" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            Sign in with Google
          </Button>

          <p className="mt-6 text-center text-sm text-secondary">
            Don't have an account?{' '}
            <Link to="/signup" className="text-gold hover:text-gold-hover font-medium">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
