import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export function AcceptInvite() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { user } = useAuth();

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [businessId, setBusinessId] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage('Missing invitation token.');
            return;
        }

        if (!user) {
            // If the user isn't logged in, they need to log in or sign up first.
            // We store the token in session storage to redirect them back here after auth.
            sessionStorage.setItem('pending_invite_token', token);
            navigate('/login', { replace: true });
            return;
        }

        acceptInvitation(token);
    }, [token, user, navigate]);

    const acceptInvitation = async (inviteToken: string) => {
        try {
            setStatus('loading');

            const { data, error } = await supabase.rpc('accept_business_invitation', {
                invite_token: inviteToken
            });

            if (error) {
                throw error;
            }

            // Check if our custom RPC returned success
            const result = data as any;
            if (result && result.success) {
                setBusinessId(result.business_id);
                setStatus('success');
            } else {
                setStatus('error');
                setErrorMessage(result?.error || 'Failed to accept invitation');
            }

        } catch (err: any) {
            console.error('Error accepting invitation:', err);
            setStatus('error');
            setErrorMessage(err.message || 'An unexpected error occurred while accepting the invitation.');
        }
    };

    return (
        <Layout title="Accept Invitation" showBack={false}>
            <div className="max-w-md mx-auto mt-12">
                <Card variant="dark" className="text-center py-12">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            <h2 className="text-xl font-bold text-primary">Processing Invitation...</h2>
                            <p className="text-secondary">Please wait while we add you to the business.</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <div className="w-16 h-16 bg-[#10B981]/10 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-[#10B981]" />
                            </div>
                            <h2 className="text-xl font-bold text-primary">Invitation Accepted!</h2>
                            <p className="text-secondary mb-6">You have successfully joined the business.</p>

                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={() => navigate(businessId ? `/business/${businessId}` : '/businesses')}
                            >
                                Go to Dashboard
                            </Button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                <XCircle className="w-8 h-8 text-red-500" />
                            </div>
                            <h2 className="text-xl font-bold text-primary">Invitation Failed</h2>
                            <p className="text-red-400 mb-6">{errorMessage}</p>

                            <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => navigate('/businesses')}
                            >
                                Return to My Businesses
                            </Button>
                        </div>
                    )}
                </Card>
            </div>
        </Layout>
    );
}
