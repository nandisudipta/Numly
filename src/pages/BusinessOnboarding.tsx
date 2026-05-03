import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { useAuth } from '../hooks/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Building2, UserPlus, ArrowRight, Check } from 'lucide-react';

export function BusinessOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [businessName, setBusinessName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    checkExistingBusinesses();
  }, [user]);

  const checkExistingBusinesses = async () => {
    if (!user) {
       setLoading(false);
       return;
    }

    try {
      const { data } = await supabase
        .from('business_members')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1);

      if (data && data.length > 0) {
        navigate('/businesses', { replace: true });
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking businesses:', error);
      setLoading(false);
    }
  };

  const handleCreateBusiness = async () => {
    if (businessName.trim().length < 2) {
      setError('Business name must be at least 2 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Local first creation
      const { dataService } = await import('../core');
      const newSpace = await dataService.createSpace({ name: businessName.trim() });
      
      navigate(`/business/${newSpace.id}/books`);
    } catch (err: any) {
      setError(err.message || 'Failed to create business');
      setLoading(false);
    }
  };

  const handleJoinBusiness = async () => {
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }

    if (!user) {
      setError('Joining a team requires a cloud account. Please login first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('join_business_with_code', {
        code: inviteCode.toUpperCase().trim(),
      });

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const result = data as any;
      if (result?.success) {
        navigate(`/business/${result.business_id}/books`);
      } else {
        setError(result?.error || 'Failed to join business');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error joining business:', error);
      setError(error.message || 'Failed to join business');
      setLoading(false);
    }
  };

  if (loading && mode === 'select') {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
      </div>
    );
  }

  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-main flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="max-w-4xl w-full py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-black text-primary mb-2 tracking-tight">
              Welcome to NUMLY
            </h1>
            <p className="text-secondary text-base sm:text-lg">
              Modern Cloud Bookkeeping System
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setMode('create')}
              className="group relative bg-card hover:bg-[#222222] border border-border rounded-2xl p-6 sm:p-8 transition-all duration-200 text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gold/10 rounded-xl group-hover:bg-gold/20 transition-colors">
                  <Building2 className="w-6 h-6 sm:w-8 h-8 text-gold" />
                </div>
                <ArrowRight className="w-5 h-5 sm:w-6 h-6 text-secondary group-hover:text-gold group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-1">
                Create Business
              </h2>
              <p className="text-secondary text-sm sm:text-base mb-4">
                Full control as Captain of your business
              </p>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-secondary/80 uppercase tracking-wider font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold"></span>
                  Features
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-secondary">
                  <Check className="w-3.5 h-3.5 text-gold" />
                  <span>Manage team & roles</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-secondary">
                  <Check className="w-3.5 h-3.5 text-gold" />
                  <span>Generate invite codes</span>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="group relative bg-card hover:bg-[#222222] border border-border rounded-2xl p-6 sm:p-8 transition-all duration-200 text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-[#10B981]/10 rounded-xl group-hover:bg-[#10B981]/20 transition-colors">
                  <UserPlus className="w-6 h-6 sm:w-8 h-8 text-[#10B981]" />
                </div>
                <ArrowRight className="w-5 h-5 sm:w-6 h-6 text-secondary group-hover:text-[#10B981] group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-1">
                Join Business
              </h2>
              <p className="text-secondary text-sm sm:text-base mb-4">
                Join an existing team via invite code
              </p>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-secondary/80 uppercase tracking-wider font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                  Process
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-secondary">
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Use invite code to join</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-secondary">
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Viewer by default</span>
                </div>
              </div>
            </button>
          </div>

          <div className="text-center mt-8">
            <button
              onClick={() => navigate('/businesses')}
              className="text-secondary hover:text-primary transition-colors"
            >
              Skip to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <button
            onClick={() => {
              setMode('select');
              setError('');
              setBusinessName('');
            }}
            className="text-secondary hover:text-primary transition-colors mb-6"
          >
            ← Back
          </button>

          <div className="bg-card border border-border rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-gold/10 rounded-xl">
                <Building2 className="w-8 h-8 text-gold" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  Create Business
                </h2>
                <p className="text-secondary">You'll be the Captain</p>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Business Name"
                placeholder="e.g., My Store, Gold Trading"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                maxLength={80}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBusiness();
                  }
                }}
              />

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              <Button
                variant="primary"
                onClick={handleCreateBusiness}
                loading={loading}
                disabled={!businessName.trim()}
                className="w-full"
              >
                Create Business
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => {
            setMode('select');
            setError('');
            setInviteCode('');
          }}
          className="text-secondary hover:text-primary transition-colors mb-6"
        >
          ← Back
        </button>

        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-[#10B981]/10 rounded-xl">
              <UserPlus className="w-8 h-8 text-[#10B981]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-primary">
                Join Business
              </h2>
              <p className="text-secondary">Enter your invite code</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Invite Code"
              placeholder="ABCD1234"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleJoinBusiness();
                }
              }}
              maxLength={8}
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleJoinBusiness}
              loading={loading}
              disabled={!inviteCode.trim()}
              className="w-full"
            >
              Join Business
            </Button>
          </div>

          <div className="mt-6 p-4 bg-main rounded-lg">
            <p className="text-sm text-secondary">
              <strong className="text-primary">Need an invite code?</strong>
              <br />
              Ask your team captain to share the invite code with you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
