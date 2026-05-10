import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { Database } from '../types/database.types';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Users, Mail, Shield, Trash2, Crown, Copy, RefreshCw, FileEdit, BookOpen, Layers, Lock, Clock, Check } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    email: string;
    full_name: string | null;
  };
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
}

export function TeamManagement() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'team_member' | 'vice_captain' | 'data_entry'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Post-invite success state — keep the modal open with a clear "share this link" CTA
  // instead of auto-closing, so the captain doesn't have to hunt the pending row.
  const [createdInvite, setCreatedInvite] = useState<{ token: string; email: string; link: string } | null>(null);
  const [createdInviteCopied, setCreatedInviteCopied] = useState(false);

  // Access Management States
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [businessBooks, setBusinessBooks] = useState<Database['public']['Tables']['books']['Row'][]>([]);
  const [businessLedgers, setBusinessLedgers] = useState<Database['public']['Tables']['ledgers']['Row'][]>([]);
  const [memberBookAccess, setMemberBookAccess] = useState<string[]>([]);
  const [memberLedgerAccess, setMemberLedgerAccess] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  // In-flight guards so rapid double-taps on toggles can't race
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // Per-row in-flight guards for role/remove so the row can't double-fire
  const [busyMember, setBusyMember] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (businessId) {
      loadBusinessInfo();
      if (user) {
        loadMembers();
      } else {
        setUserRole('captain');
        setLoading(false);
      }
    }
  }, [user, businessId]);

  const loadBusinessInfo = async () => {
    try {
      const { data: business } = await supabase
        .from('businesses')
        .select('name, invite_code')
        .eq('id', businessId!)
        .single();

      if (business) {
        setBusinessName(business.name);
        setInviteCode(business.invite_code || '');
      }

      const { data: membership } = await supabase
        .from('business_members')
        .select('role')
        .eq('business_id', businessId!)
        .eq('user_id', user!.id)
        .single();

      if (membership) {
        setUserRole(membership.role);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading business info:', error);
    }
  };

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('business_members')
        .select(`
          *,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .eq('business_id', businessId!)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      setMembers(data || []);

      const { data: inviteData, error: inviteError } = await supabase
        .from('business_invitations')
        .select('*')
        .eq('business_id', businessId!)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!inviteError) setPendingInvites(inviteData || []);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAccessModal = async (member: Member) => {
    setSelectedMember(member);
    setIsAccessModalOpen(true);
    setLoadingAccess(true);

    try {
      // Fetch all books for the business
      const { data: books } = await supabase
        .from('books')
        .select('*')
        .eq('business_id', businessId!);

      if (books) setBusinessBooks(books);

      // Fetch all ledgers for those books
      if (books && books.length > 0) {
        const bookIds = books.map(b => b.id);
        const { data: ledgers } = await supabase
          .from('ledgers')
          .select('*')
          .in('book_id', bookIds);

        if (ledgers) setBusinessLedgers(ledgers);
      }

      // Fetch user's explicit book access
      const { data: bookMembers } = await supabase
        .from('book_members')
        .select('book_id')
        .eq('user_id', member.user_id);

      if (bookMembers) setMemberBookAccess(bookMembers.map(bm => bm.book_id));

      // Fetch user's explicit ledger access
      const { data: ledgerMembers } = await supabase
        .from('ledger_members')
        .select('ledger_id')
        .eq('user_id', member.user_id);

      if (ledgerMembers) setMemberLedgerAccess(ledgerMembers.map(lm => lm.ledger_id));

    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading access data:', error);
    } finally {
      setLoadingAccess(false);
    }
  };

  // Optimistic toggle with rollback so the UI never lies about server state.
  // The in-flight guard collapses rapid double-taps into a single round-trip.
  const toggleBookAccess = async (bookId: string) => {
    if (!selectedMember) return;
    const key = `book:${bookId}`;
    if (toggling.has(key)) return;
    setToggling(prev => { const n = new Set(prev); n.add(key); return n; });

    const had = memberBookAccess.includes(bookId);
    setMemberBookAccess(prev => had ? prev.filter(id => id !== bookId) : [...prev, bookId]);

    try {
      if (had) {
        const { error } = await supabase.from('book_members').delete()
          .eq('book_id', bookId).eq('user_id', selectedMember.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('book_members').insert({
          book_id: bookId, user_id: selectedMember.user_id
        });
        if (error) throw error;
      }
    } catch (e: any) {
      setMemberBookAccess(prev => had ? [...prev, bookId] : prev.filter(id => id !== bookId));
      toast.error(e?.message || 'Could not update book access. Please try again.');
      if (import.meta.env.DEV) console.error(e);
    } finally {
      setToggling(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const toggleLedgerAccess = async (ledgerId: string) => {
    if (!selectedMember) return;
    const key = `ledger:${ledgerId}`;
    if (toggling.has(key)) return;
    setToggling(prev => { const n = new Set(prev); n.add(key); return n; });

    const had = memberLedgerAccess.includes(ledgerId);
    setMemberLedgerAccess(prev => had ? prev.filter(id => id !== ledgerId) : [...prev, ledgerId]);

    try {
      if (had) {
        const { error } = await supabase.from('ledger_members').delete()
          .eq('ledger_id', ledgerId).eq('user_id', selectedMember.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ledger_members').insert({
          ledger_id: ledgerId, user_id: selectedMember.user_id
        });
        if (error) throw error;
      }
    } catch (e: any) {
      setMemberLedgerAccess(prev => had ? [...prev, ledgerId] : prev.filter(id => id !== ledgerId));
      toast.error(e?.message || 'Could not update ledger access. Please try again.');
      if (import.meta.env.DEV) console.error(e);
    } finally {
      setToggling(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setInviting(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data, error } = await supabase
        .from('business_invitations')
        .insert({
          business_id: businessId!,
          email,
          role: inviteRole,
          invited_by: user!.id,
          expires_at: expiresAt.toISOString(),
        })
        .select('token')
        .single();

      if (error) {
        // Common case: unique constraint — invite for this email already exists.
        if (error.code === '23505') {
          toast.error('An invitation for this email is already pending.');
          return;
        }
        throw error;
      }

      const link = `${window.location.origin}/invite?token=${data?.token}`;
      // Auto-copy so the captain just has to paste it anywhere
      try { await navigator.clipboard.writeText(link); setCreatedInviteCopied(true); } catch { /* ignore */ }

      setCreatedInvite({ token: data?.token as string, email, link });
      loadMembers();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error sending invitation:', error);
      toast.error(`Failed to create invitation: ${error?.message || 'Unknown error'}.`);
    } finally {
      setInviting(false);
    }
  };

  const resetInviteFlow = () => {
    setCreatedInvite(null);
    setCreatedInviteCopied(false);
    setInviteEmail('');
    setInviteRole('viewer');
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    resetInviteFlow();
  };

  const copyCreatedInviteLink = async () => {
    if (!createdInvite) return;
    try {
      await navigator.clipboard.writeText(createdInvite.link);
      setCreatedInviteCopied(true);
      setTimeout(() => setCreatedInviteCopied(false), 2000);
    } catch {
      toast.error('Could not copy link.');
    }
  };

  const handleShareViaEmail = (token: string, email: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    const subject = encodeURIComponent(`Invitation to join ${businessName} on NUMLY`);
    const body = encodeURIComponent(`Hello,\n\nYou have been invited to join the business "${businessName}" on NUMLY - Modern Cloud Bookkeeping.\n\nClick the link below to accept the invitation and join the team:\n${link}\n\nBest regards,\nThe NUMLY Team`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (busyMember.has(memberId)) return;
    setBusyMember(prev => { const n = new Set(prev); n.add(memberId); return n; });

    const prevMembers = members;
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));

    try {
      const { error } = await supabase
        .from('business_members')
        .update({ role: newRole as any })
        .eq('id', memberId);
      if (error) throw error;
    } catch (error: any) {
      setMembers(prevMembers);
      if (import.meta.env.DEV) console.error('Error updating role:', error);
      toast.error(error?.message || 'Failed to update role.');
    } finally {
      setBusyMember(prev => { const n = new Set(prev); n.delete(memberId); return n; });
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user!.id) {
      toast.error('You cannot remove yourself from the team.');
      return;
    }
    if (busyMember.has(memberId)) return;
    if (!confirm('Are you sure you want to remove this team member?')) return;

    setBusyMember(prev => { const n = new Set(prev); n.add(memberId); return n; });
    const prevMembers = members;
    setMembers(prev => prev.filter(m => m.id !== memberId));

    try {
      const { error } = await supabase
        .from('business_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
    } catch (error: any) {
      setMembers(prevMembers);
      if (import.meta.env.DEV) console.error('Error removing member:', error);
      toast.error(error?.message || 'Failed to remove team member.');
    } finally {
      setBusyMember(prev => { const n = new Set(prev); n.delete(memberId); return n; });
    }
  };

  const handleUpdateInviteRole = async (inviteId: string, newRole: string) => {
    if (busyMember.has(inviteId)) return;
    setBusyMember(prev => { const n = new Set(prev); n.add(inviteId); return n; });

    const prevInvites = pendingInvites;
    setPendingInvites(prev => prev.map(i => i.id === inviteId ? { ...i, role: newRole } : i));

    try {
      const { error } = await supabase
        .from('business_invitations')
        .update({ role: newRole as any })
        .eq('id', inviteId);
      if (error) throw error;
    } catch (error: any) {
      setPendingInvites(prevInvites);
      if (import.meta.env.DEV) console.error('Error updating invite role:', error);
      toast.error(error?.message || 'Failed to update invitation role.');
    } finally {
      setBusyMember(prev => { const n = new Set(prev); n.delete(inviteId); return n; });
    }
  };

  const handleRemoveInvite = async (inviteId: string) => {
    if (busyMember.has(inviteId)) return;
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    setBusyMember(prev => { const n = new Set(prev); n.add(inviteId); return n; });
    const prevInvites = pendingInvites;
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId));

    try {
      const { error } = await supabase
        .from('business_invitations')
        .delete()
        .eq('id', inviteId);
      if (error) throw error;
    } catch (error: any) {
      setPendingInvites(prevInvites);
      if (import.meta.env.DEV) console.error('Error removing invite:', error);
      toast.error(error?.message || 'Failed to revoke invitation.');
    } finally {
      setBusyMember(prev => { const n = new Set(prev); n.delete(inviteId); return n; });
    }
  };

  const handleCopyInviteLink = async (token: string, email: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(`Invite link copied for ${email}.`);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to copy', error);
      toast.info(`Copy this link: ${link}`);
    }
  };

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to copy:', error);
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleRegenerateCode = async () => {
    if (!confirm('Are you sure? This will invalidate the current invite code.')) {
      return;
    }

    setRegeneratingCode(true);
    try {
      const { data, error } = await supabase.rpc('regenerate_invite_code', {
        business_id: businessId!,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        setInviteCode(result.invite_code);
        toast.success('Invite code regenerated.');
      } else {
        toast.error(result?.error || 'Failed to regenerate code');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error regenerating code:', error);
      toast.error(error.message || 'Failed to regenerate code');
    } finally {
      setRegeneratingCode(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      captain: { text: 'Captain', color: 'bg-primary text-[#0B0B0B]', icon: Crown },
      vice_captain: { text: 'Vice Captain', color: 'bg-primary-hover text-[#0B0B0B]', icon: Shield },
      team_member: { text: 'Team Member', color: 'bg-white/10 text-primary', icon: Users },
      viewer: { text: 'Viewer', color: 'bg-white/5 text-secondary', icon: Users },
      data_entry: { text: 'Data Entry', color: 'bg-white/10 text-primary', icon: FileEdit },
    };
    const badge = badges[role as keyof typeof badges] || badges.viewer;
    const Icon = badge.icon;

    return (
      <span className={`${badge.color} text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {badge.text}
      </span>
    );
  };

  const canInvite = ['captain', 'vice_captain'].includes(userRole);
  const canManageRoles = userRole === 'captain';
  const canRemoveMembers = ['captain', 'vice_captain'].includes(userRole);

  if (loading) {
    return (
      <Layout showBack title={businessName}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBack title={businessName}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-primary">Team Management</h2>
            <p className="text-secondary mt-1">Manage team members and their roles</p>
          </div>
          {canInvite && (
            <div className="flex gap-2">
              {userRole === 'captain' && (
                <Button variant="secondary" onClick={() => navigate(`/business/${businessId}/audit`)}>
                  <Clock className="w-5 h-5 mr-2" />
                  Audit Logs
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
                <Mail className="w-5 h-5 mr-2" />
                Invite via Email
              </Button>
            </div>
          )}
        </div>

        {canInvite && inviteCode && (
          <Card variant="dark" className="bg-primary/5 border border-primary/20">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Invite Code</h3>
                <p className="text-sm text-secondary mb-3">
                  Share this code with team members to let them join your business
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-main rounded-lg p-4 border border-border">
                  <p className="text-2xl font-mono font-bold text-primary text-center tracking-wider">
                    {inviteCode}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleCopyInviteCode}
                >
                  {copied ? 'Copied!' : <Copy className="w-5 h-5" />}
                </Button>
                {userRole === 'captain' && (
                  <Button
                    variant="secondary"
                    onClick={handleRegenerateCode}
                    loading={regeneratingCode}
                  >
                    <RefreshCw className="w-5 h-5" />
                  </Button>
                )}
              </div>

              <div className="text-xs text-secondary">
                <p>• New members will join as <strong className="text-primary">Viewer</strong> by default</p>
                <p>• You can change their role after they join</p>
                {userRole === 'captain' && <p>• Regenerate the code to revoke the old one</p>}
              </div>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id} variant="dark">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-primary">
                      {member.profiles.full_name || member.profiles.email}
                    </h3>
                    <p className="text-sm text-secondary">{member.profiles.email}</p>
                    <p className="text-xs text-secondary mt-1">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {canManageRoles && member.role !== 'captain' ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      disabled={busyMember.has(member.id)}
                      className="bg-card-hover text-primary px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="vice_captain">Vice Captain</option>
                      <option value="team_member">Team Member</option>
                      <option value="data_entry">Data Entry</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    getRoleBadge(member.role)
                  )}

                  {canManageRoles && member.role !== 'captain' && member.user_id !== user!.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAccessModal(member);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary transition-colors text-[10px] font-black uppercase tracking-widest"
                      title="Restrict to specific books and ledgers"
                    >
                      <Lock className="w-3 h-3" />
                      Access
                    </button>
                  )}

                  {canRemoveMembers && member.role !== 'captain' && member.user_id !== user!.id && (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.user_id)}
                      disabled={busyMember.has(member.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {pendingInvites.map((invite) => (
            <Card key={invite.id} variant="dark" className="border border-dashed border-primary/30 opacity-75">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-3 bg-primary/5 rounded-xl border border-primary/20">
                    <Mail className="w-6 h-6 text-primary/70" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-primary">
                        {invite.email}
                      </h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        Pending
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-1">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => handleShareViaEmail(invite.token, invite.email)} className="px-2 py-1 h-auto text-xs">
                    <Mail className="w-3 h-3 mr-1" />
                    Share via Email
                  </Button>

                  <Button variant="secondary" onClick={() => handleCopyInviteLink(invite.token, invite.email)} className="px-2 py-1 h-auto text-xs">
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Link
                  </Button>

                  {canManageRoles ? (
                    <select
                      value={invite.role}
                      onChange={(e) => handleUpdateInviteRole(invite.id, e.target.value)}
                      disabled={busyMember.has(invite.id)}
                      className="bg-card-hover text-primary px-3 py-2 rounded-lg text-sm font-semibold opacity-80 disabled:opacity-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="vice_captain">Vice Captain</option>
                      <option value="team_member">Team Member</option>
                      <option value="data_entry">Data Entry</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="opacity-80 scale-90 origin-right">{getRoleBadge(invite.role)}</span>
                  )}

                  {canRemoveMembers && (
                    <button
                      onClick={() => handleRemoveInvite(invite.id)}
                      disabled={busyMember.has(invite.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-5 h-5 text-red-500/70" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card variant="dark" className="bg-primary/5 border border-primary/20">
          <h3 className="text-lg font-semibold text-primary mb-3">Role Permissions</h3>
          <div className="space-y-2 text-sm text-secondary">
            <div className="flex items-start gap-2">
              <Crown className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <span className="text-primary font-semibold">Captain:</span> Full control including business deletion and team management
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-primary-hover mt-0.5" />
              <div>
                <span className="text-primary-hover font-semibold">Vice Captain:</span> Manage books, ledgers, and transactions. Cannot delete business
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <span className="text-primary font-semibold">Team Member:</span> Add transactions and view all data. Cannot delete books/ledgers
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-secondary mt-0.5" />
              <div>
                <span className="text-secondary font-semibold">Viewer:</span> Read-only access to all data
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileEdit className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <span className="text-primary font-semibold">Data Entry:</span> Add transactions only. Cannot see cash summaries or overall balances
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        title={`Access: ${selectedMember?.profiles?.full_name || selectedMember?.profiles?.email || 'User'}`}
      >
        <div className="space-y-4">
          {loadingAccess ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {businessBooks.length > 0 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-[11px] leading-relaxed text-secondary">
                  Toggle a book ON to grant access to <span className="text-primary font-semibold">all its ledgers</span>.
                  Leave the book OFF and toggle individual ledgers below for granular access.
                </div>
              )}

              <div className="space-y-3 text-primary">
                {businessBooks.map(book => {
                  const ledgers = businessLedgers.filter(l => l.book_id === book.id);
                  const hasBook = memberBookAccess.includes(book.id);
                  const bookKey = `book:${book.id}`;
                  const bookBusy = toggling.has(bookKey);

                  return (
                    <div key={book.id} className="bg-card p-3 sm:p-4 rounded-xl border border-border">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                          <span className="font-semibold text-sm sm:text-base truncate">{book.name}</span>
                        </div>
                        <button
                          onClick={() => toggleBookAccess(book.id)}
                          disabled={bookBusy}
                          aria-pressed={hasBook}
                          aria-label={`${hasBook ? 'Revoke' : 'Grant'} full access to ${book.name}`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${hasBook ? 'bg-primary' : 'bg-secondary'} ${bookBusy ? 'opacity-60' : ''}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasBook ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {ledgers.length > 0 && (
                        <div className="mt-3 pl-3 space-y-1.5 border-l-2 border-border ml-1.5">
                          {ledgers.map(ledger => {
                            const hasLedger = memberLedgerAccess.includes(ledger.id);
                            const ledgerKey = `ledger:${ledger.id}`;
                            const ledgerBusy = toggling.has(ledgerKey);
                            return (
                              <div key={ledger.id} className="flex items-center justify-between gap-3 py-1">
                                <div className="flex items-center gap-2 text-xs sm:text-sm text-secondary min-w-0 flex-1">
                                  <Layers className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{ledger.name}</span>
                                </div>
                                <button
                                  onClick={() => toggleLedgerAccess(ledger.id)}
                                  disabled={hasBook || ledgerBusy}
                                  aria-pressed={hasBook || hasLedger}
                                  aria-label={`${hasLedger ? 'Revoke' : 'Grant'} access to ${ledger.name}`}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${hasBook || hasLedger ? 'bg-primary' : 'bg-secondary'} ${hasBook ? 'opacity-50 cursor-not-allowed' : ''} ${ledgerBusy ? 'opacity-60' : ''}`}
                                >
                                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${hasBook || hasLedger ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {businessBooks.length === 0 && (
                  <p className="text-secondary text-center py-4">No books created yet</p>
                )}
              </div>
            </>
          )}
          <Button
            variant="primary"
            className="w-full mt-2"
            onClick={() => setIsAccessModalOpen(false)}
          >
            Done
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isInviteModalOpen}
        onClose={closeInviteModal}
        title={createdInvite ? 'Invitation Ready' : 'Invite Team Member'}
      >
        {createdInvite ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--tx-in-rgb) / 0.15)' }}>
                <Check className="w-5 h-5" style={{ color: 'var(--tx-in)' }} strokeWidth={3} />
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Invite created for {createdInvite.email}</p>
                <p className="text-xs text-secondary mt-0.5">Send this link to let them join. Expires in 7 days.</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-input p-3 flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-primary truncate select-all">
                {createdInvite.link}
              </code>
              <button
                onClick={copyCreatedInviteLink}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-contrast text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform inline-flex items-center gap-1"
              >
                {createdInviteCopied ? <><Check className="w-3 h-3" strokeWidth={3} /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => handleShareViaEmail(createdInvite.token, createdInvite.email)}
                className="flex-1 text-xs"
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                Share via Email
              </Button>
              <Button variant="primary" onClick={resetInviteFlow} className="flex-1 text-xs">
                Invite Another
              </Button>
            </div>

            <button
              onClick={closeInviteModal}
              className="w-full text-center text-xs text-secondary hover:text-primary transition-colors py-1"
            >
              Done
            </button>
          </div>
        ) : (
        <div className="space-y-4">
          <Input
            type="email"
            label="Email Address"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && inviteEmail.trim() && !inviting) handleInvite(); }}
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              Role
            </label>
            <select
              className="input-dark"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'team_member' | 'vice_captain' | 'data_entry')}
            >
              <option value="viewer">Viewer (Read-only)</option>
              <option value="data_entry">Data Entry (Add transactions only)</option>
              <option value="team_member">Team Member</option>
              <option value="vice_captain">Vice Captain</option>
            </select>
          </div>

          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
            <p className="text-sm text-primary">
              We'll create an invitation link. Copy it or share by email — the recipient can sign up and join in one tap.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={closeInviteModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleInvite}
              loading={inviting}
              disabled={!inviteEmail.trim()}
              className="flex-1"
            >
              Send Invitation
            </Button>
          </div>
        </div>
        )}
      </Modal>
    </Layout>
  );
}
