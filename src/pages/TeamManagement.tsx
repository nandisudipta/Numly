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
import { Users, Mail, Shield, Trash2, Crown, Copy, RefreshCw, FileEdit, BookOpen, Layers, Settings, Clock } from 'lucide-react';
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

  // Access Management States
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [businessBooks, setBusinessBooks] = useState<Database['public']['Tables']['books']['Row'][]>([]);
  const [businessLedgers, setBusinessLedgers] = useState<Database['public']['Tables']['ledgers']['Row'][]>([]);
  const [memberBookAccess, setMemberBookAccess] = useState<string[]>([]);
  const [memberLedgerAccess, setMemberLedgerAccess] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);

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

  const toggleBookAccess = async (bookId: string) => {
    if (!selectedMember) return;
    try {
      if (memberBookAccess.includes(bookId)) {
        await supabase.from('book_members').delete()
          .eq('book_id', bookId).eq('user_id', selectedMember.user_id);
        setMemberBookAccess(prev => prev.filter(id => id !== bookId));
      } else {
        await supabase.from('book_members').insert({
          book_id: bookId, user_id: selectedMember.user_id
        });
        setMemberBookAccess(prev => [...prev, bookId]);
      }
    } catch (e) { if (import.meta.env.DEV) console.error(e); }
  };

  const toggleLedgerAccess = async (ledgerId: string) => {
    if (!selectedMember) return;
    try {
      if (memberLedgerAccess.includes(ledgerId)) {
        await supabase.from('ledger_members').delete()
          .eq('ledger_id', ledgerId).eq('user_id', selectedMember.user_id);
        setMemberLedgerAccess(prev => prev.filter(id => id !== ledgerId));
      } else {
        await supabase.from('ledger_members').insert({
          ledger_id: ledgerId, user_id: selectedMember.user_id
        });
        setMemberLedgerAccess(prev => [...prev, ledgerId]);
      }
    } catch (e) { if (import.meta.env.DEV) console.error(e); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error } = await supabase
        .from('business_invitations')
        .insert({
          business_id: businessId!,
          email: inviteEmail.toLowerCase(),
          role: inviteRole,
          invited_by: user!.id,
          expires_at: expiresAt.toISOString(),
        });

      if (error) throw error;

      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      toast.success('Invitation created. Copy the link or share it via email.');
      loadMembers();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error sending invitation:', error);
      toast.error(`Failed to create invitation: ${error?.message || 'Unknown error'}.`);
    } finally {
      setInviting(false);
    }
  };

  const handleShareViaEmail = (token: string, email: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    const subject = encodeURIComponent(`Invitation to join ${businessName} on NUMLY`);
    const body = encodeURIComponent(`Hello,\n\nYou have been invited to join the business "${businessName}" on NUMLY - Modern Cloud Bookkeeping.\n\nClick the link below to accept the invitation and join the team:\n${link}\n\nBest regards,\nThe NUMLY Team`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('business_members')
        .update({ role: newRole as any })
        .eq('id', memberId);

      if (error) throw error;

      loadMembers();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating role:', error);
      toast.error('Failed to update role.');
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user!.id) {
      toast.error('You cannot remove yourself from the team.');
      return;
    }

    if (!confirm('Are you sure you want to remove this team member?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('business_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      loadMembers();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error removing member:', error);
      toast.error('Failed to remove team member.');
    }
  };

  const handleUpdateInviteRole = async (inviteId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('business_invitations')
        .update({ role: newRole as any })
        .eq('id', inviteId);

      if (error) throw error;
      loadMembers();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating invite role:', error);
      toast.error('Failed to update invitation role.');
    }
  };

  const handleRemoveInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      const { error } = await supabase
        .from('business_invitations')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;

      loadMembers();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error removing invite:', error);
      toast.error('Failed to revoke invitation. Ensure you have the right permissions.');
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
                      className="bg-card-hover text-primary px-3 py-2 rounded-lg text-sm font-semibold"
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

                  {canManageRoles && !['captain', 'vice_captain'].includes(member.role) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAccessModal(member);
                      }}
                      className="p-2 hover:bg-primary/10 rounded-lg transition-colors text-secondary hover:text-primary"
                      title="Assign Book & Ledger Access"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  )}

                  {canRemoveMembers && member.role !== 'captain' && member.user_id !== user!.id && (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.user_id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
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
                      className="bg-card-hover text-primary px-3 py-2 rounded-lg text-sm font-semibold opacity-80"
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
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
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
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {loadingAccess ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4 text-primary">
              {businessBooks.map(book => {
                const ledgers = businessLedgers.filter(l => l.book_id === book.id);
                const hasBook = memberBookAccess.includes(book.id);

                return (
                  <div key={book.id} className="bg-card p-4 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-lg">{book.name}</span>
                      </div>
                      <button
                        onClick={() => toggleBookAccess(book.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasBook ? 'bg-primary' : 'bg-secondary'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasBook ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {ledgers.length > 0 && (
                      <div className="mt-3 pl-4 space-y-2 border-l-2 border-border ml-2">
                        {ledgers.map(ledger => {
                          const hasLedger = memberLedgerAccess.includes(ledger.id);
                          return (
                            <div key={ledger.id} className="flex items-center justify-between py-1">
                              <div className="flex items-center gap-2 text-sm text-secondary">
                                <Layers className="w-4 h-4" />
                                {ledger.name}
                              </div>
                              <button
                                onClick={() => toggleLedgerAccess(ledger.id)}
                                disabled={hasBook}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hasBook || hasLedger ? 'bg-primary' : 'bg-secondary'} ${hasBook ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          )}
          <Button
            variant="primary"
            className="w-full mt-4"
            onClick={() => setIsAccessModalOpen(false)}
          >
            Done
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Team Member"
      >
        <div className="space-y-4">
          <Input
            type="email"
            label="Email Address"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
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
              An invitation link will be sent to this email address. The user can accept the invitation by signing in or creating an account.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsInviteModalOpen(false)}
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
      </Modal>
    </Layout>
  );
}
