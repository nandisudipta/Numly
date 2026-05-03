import { useState, useEffect, useRef, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { getColorConfig } from '../utils/colorConfig';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Plus, Pencil, Trash2, LayoutGrid, List, Building2, Users, UserPlus } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';


interface Business {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  logo_url?: string | null;
  created_at: string;
  owner_id: string;
  member_count?: number;
  user_role?: string;
  books_count?: number;
  ledgers_count?: number;
  is_deleted?: boolean;
}

export function BusinessList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newBusinessDescription, setNewBusinessDescription] = useState('');
  const [newBusinessColor, setNewBusinessColor] = useState('#3B82F6');
  const [newBusinessLogo, setNewBusinessLogo] = useState('🏢');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editBusinessDescription, setEditBusinessDescription] = useState('');
  const [editBusinessLogo, setEditBusinessLogo] = useState('🏢');
  const [editBusinessColor, setEditBusinessColor] = useState('#3B82F6');
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [deletingBusiness, setDeletingBusiness] = useState<Business | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('businessViewMode') as 'grid' | 'list') || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'oldest' | 'role'>('newest');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('businessViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 300);
    }
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (isJoinModalOpen) {
      setTimeout(() => {
        joinInputRef.current?.focus();
      }, 300);
    }
  }, [isJoinModalOpen]);

  useEffect(() => {
    loadBusinesses(true);
    
    // Listen for global header actions
    const handleOpenCreate = () => { triggerHaptic('light'); setIsCreateModalOpen(true); };
    const handleOpenJoin = () => { triggerHaptic('light'); setIsJoinModalOpen(true); };
    
    window.addEventListener('open-create-modal', handleOpenCreate);
    window.addEventListener('open-join-modal', handleOpenJoin);
    
    return () => {
      window.removeEventListener('open-create-modal', handleOpenCreate);
      window.removeEventListener('open-join-modal', handleOpenJoin);
    };
  }, [user]);


  const uploadLogo = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredAndSortedBusinesses = businesses
    .filter(b => b.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
                 (b.description?.toLowerCase().includes(deferredSearchQuery.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'role') {
        const rolesOrder = ['captain', 'vice_captain', 'team_member', 'viewer'];
        return rolesOrder.indexOf(a.user_role || '') - rolesOrder.indexOf(b.user_role || '');
      }
      return 0;
    });

  const loadBusinesses = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const spaces = await dataService.getSpaces();
      
      const businessesList = spaces.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color || '#3B82F6',
        logo_url: s.logo_url || '🏢',
        created_at: s.created_at,
        owner_id: s.owner_id || '',
        user_role: s.owner_id === user?.id ? 'captain' : 'captain', // Default to captain for local
        member_count: 1,
        is_deleted: s.is_deleted
      }));

      // Fetch stats for ALL businesses safely through DataService
      const businessesWithStats = await Promise.all(businessesList.map(async (bus: any) => {
        const { books, ledgers } = await dataService.getBusinessData(bus.id);
        return {
          ...bus,
          books_count: books.length,
          ledgers_count: ledgers.length
        };
      }));

      setBusinesses(businessesWithStats as unknown as Business[]);
    } catch (error) {
      console.error('Error loading businesses:', error);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleCreateBusiness = async () => {
    if (!newBusinessName.trim() || creating) return;

    // Check uniqueness
    const isDuplicate = businesses.some(b => b.name.toLowerCase() === newBusinessName.trim().toLowerCase());
    if (isDuplicate) {
      setCreateError('You already have a business with this name.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      let logoUrl = newBusinessLogo;
      if (newLogoFile && user) {
        logoUrl = await uploadLogo(newLogoFile);
      }

      await dataService.createSpace({
        name: newBusinessName.trim(),
        description: newBusinessDescription.trim(),
        color: newBusinessColor,
        logo_url: logoUrl
      });

      setIsCreateModalOpen(false);
      setNewBusinessName('');
      setNewBusinessDescription('');
      setNewBusinessColor('#3B82F6');
      setNewBusinessLogo('🏢');
      loadBusinesses();
    } catch (error: any) {
      console.error('Error creating business:', error);
      setCreateError(error.message || 'Failed to create business');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinBusiness = async () => {
    if (!inviteCode.trim()) return;

    setJoining(true);
    setJoinError('');
    try {
      // Offline fallback note: Joining spaces securely requires online sync check
      if (!window.navigator.onLine) {
        setJoinError('Internet connection is required to join a new space securely.');
        setJoining(false);
        return;
      }
      // Deferred via apiClient eventually
      toast.info('Joining via invite code is not yet available. Please ask the owner for an invite link.');
      setIsJoinModalOpen(false);
      setInviteCode('');
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error joining business:', error);
      setJoinError(error.message || 'Failed to join business');
    } finally {
      setJoining(false);
    }
  };

  const handleEditBusiness = async () => {
    if (!editingBusiness || !editBusinessName.trim()) return;

    setEditing(true);
    setEditError('');
    try {
      let logoUrl = editBusinessLogo;
      if (editLogoFile) {
        logoUrl = await uploadLogo(editLogoFile);
      }

      if (editBusinessName.trim().toLowerCase() !== editingBusiness.name.toLowerCase()) {
        const isDuplicate = businesses.some(b => 
          b.name.toLowerCase() === editBusinessName.trim().toLowerCase() && 
          b.id !== editingBusiness.id
        );

        if (isDuplicate) {
          setEditError('A business with this name already exists.');
          setEditing(false);
          return;
        }
      }

      const updatePayload: any = {
        name: editBusinessName.trim(),
        description: editBusinessDescription.trim(),
        color: editBusinessColor,
        logo_url: logoUrl
      };
      
      await dataService.updateSpace(editingBusiness.id, updatePayload);

      setIsEditModalOpen(false);
      setEditingBusiness(null);
      setEditBusinessName('');
      loadBusinesses();
    } catch (error: any) {
      console.error('Error updating business:', error);
      setEditError(error.message || 'Failed to update business');
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteBusiness = async () => {
    if (!deletingBusiness) return;

    setDeleting(true);
    setDeleteError('');
    try {
      await dataService.deleteSpace(deletingBusiness.id);

      setIsDeleteModalOpen(false);
      setDeletingBusiness(null);
      setDeleteConfirmName('');
      loadBusinesses();
    } catch (error: any) {
      console.error('Error deleting business:', error);
      setDeleteError(error.message || 'Failed to delete business');
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { text: string }> = {
      captain:     { text: 'Captain' },
      vice_captain:{ text: 'Vice Captain' },
      team_member: { text: 'Member' },
      viewer:      { text: 'Viewer' },
    };
    const badge = badges[role] || badges.viewer;
    return (
      <span
        className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-wider transition-colors"
        style={{
          color: 'var(--badge-text)',
          background: 'var(--badge-bg)',
          border: '1px solid var(--border-color)',
        }}
      >
        {badge.text}
      </span>
    );
  };

  return (
    <Layout loading={loading}>
      <div className={`space-y-6 animate-fade-in ${isRefreshing ? 'opacity-70 pointer-events-none' : 'opacity-100'} transition-opacity min-h-[600px]`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${businesses.length === 0 ? 'mb-0' : 'mb-6'} min-h-[60px]`}>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] uppercase">My Spaces</h1>
            <p className="text-sm sm:text-base mt-1 text-secondary">Manage your team and data</p>
          </div>
          <div className="flex items-center gap-2 p-1 rounded-[1.5rem] bg-card border border-border/60 backdrop-blur-3xl shadow-xl shadow-black/20 shrink-0 self-start md:self-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { triggerHaptic('light'); setIsJoinModalOpen(true); }}
              className="!px-4 !py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-white/5 whitespace-nowrap"
            >
              Join Space
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { triggerHaptic('medium'); setIsCreateModalOpen(true); }}
              className="!px-5 !py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest bg-primary text-primary-contrast shadow-xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95 whitespace-nowrap"
            >
              New Space
            </Button>
          </div>
        </div>

        {/* Action Bar - Filter/Sort/View Mode */}
        {businesses.length > 0 && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-card border border-border/40 backdrop-blur-2xl">
            <div className="relative group w-full md:w-auto md:min-w-[320px]">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-secondary group-focus-within:text-primary transition-colors">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search spaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-input border border-border/40 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Sort Select */}
              <div className="flex-1 md:flex-none flex items-center bg-input/50 border border-border/40 rounded-2xl p-1 px-3">
                <span className="text-[10px] font-black uppercase text-secondary mr-2">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer py-2 focus:ring-0"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name</option>
                  <option value="role">Role</option>
                </select>
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 p-1 bg-input/50 border border-border/40 rounded-2xl shrink-0">
                <button
                  onClick={() => { triggerHaptic('light'); setViewMode('grid'); }}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-primary text-primary-contrast shadow-lg' : 'text-secondary hover:text-primary'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { triggerHaptic('light'); setViewMode('list'); }}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-primary text-primary-contrast shadow-lg' : 'text-secondary hover:text-primary'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {businesses.length === 0 ? (
          <div className="text-center py-20 bg-card/30 rounded-[3rem] border border-border/50 backdrop-blur-sm">
            <div className="w-24 h-24 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
              <Building2 className="w-10 h-10 text-gold" />
            </div>
            <h3 className="text-2xl font-extrabold text-primary mb-3">No spaces yet</h3>
            <p className="text-secondary mb-10 max-w-sm mx-auto opacity-70">
              Start your journey by creating your first space for ledgers or joining an existing one.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto px-6">
              <Button
                variant="primary"
                className="w-full shadow-primary/20"
                onClick={() => { triggerHaptic('light'); setIsCreateModalOpen(true); }}
              >
                <Plus className="w-5 h-5 stroke-[3px]" />
                Create Space
              </Button>
              <Button
                variant="secondary"
                className="w-full shadow-sm"
                onClick={() => { triggerHaptic('light'); setIsJoinModalOpen(true); }}
              >
                <UserPlus className="w-5 h-5" />
                Join Existing
              </Button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredAndSortedBusinesses.map((business) => {
              const colorConfig = getColorConfig(business.color || '#3B82F6');
              return (
                <div
                  key={business.id}
                  onClick={() => { triggerHaptic('light'); navigate(`/business/${business.id}/books`); }}
                  className="relative overflow-hidden rounded-[2.5rem] cursor-pointer group active:scale-[0.97] transition-all duration-500 min-h-[300px] flex flex-col backdrop-blur-3xl"
                  style={{
                    background: `linear-gradient(165deg, ${colorConfig.hex}30, ${colorConfig.hex}08)`,
                    border: `1.5px solid ${colorConfig.hex}40`,
                    boxShadow: `0 25px 60px -15px ${colorConfig.hex}60`,
                  } as React.CSSProperties}
                >
                  {/* Full-bleed color wash on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `linear-gradient(145deg, ${colorConfig.hex}35, ${colorConfig.hex}15)` }}
                  />

                  {/* Actions — appear on hover, positioned to not overlap the dot */}
                  {['captain', 'vice_captain'].includes(business.user_role || '') && (
                    <div className="absolute top-3 right-3 flex gap-1 z-10 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); navigate(`/business/${business.id}/team`); }}
                        className="p-1.5 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                        style={{ background: `${colorConfig.hex}30`, border: `1px solid ${colorConfig.hex}50` }}
                      >
                        <Users className="w-3 h-3" style={{ color: colorConfig.hex }} />
                      </button>
                      {business.user_role === 'captain' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); setEditingBusiness(business); setEditBusinessName(business.name); setEditBusinessDescription(business.description || ''); setEditBusinessLogo(business.logo_url || '🏢'); setEditBusinessColor(business.color || '#3B82F6'); setIsEditModalOpen(true); }}
                            className="p-1.5 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                            style={{ background: `${colorConfig.hex}30`, border: `1px solid ${colorConfig.hex}50` }}
                          >
                            <Pencil className="w-3 h-3" style={{ color: colorConfig.hex }} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerHaptic('medium'); setDeletingBusiness(business); setIsDeleteModalOpen(true); }}
                            className="p-1.5 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Card Body */}
                  <div className="pt-6 pb-3 px-5 flex flex-col h-full relative z-[1]">
                    {/* Centered Identity */}
                    <div className="flex flex-col items-center justify-center flex-1">
                      <div
                        className="w-12 h-12 rounded-2xl mb-2 flex items-center justify-center text-2xl shadow-lg transition-transform group-hover:scale-110"
                        style={{ background: `${colorConfig.hex}18`, border: `2px solid ${colorConfig.hex}40` }}
                      >
                        {business.logo_url?.startsWith('http') ? (
                          <img src={business.logo_url} alt="" className="w-full h-full object-cover rounded-2xl" />
                        ) : (
                          <span>{business.logo_url || '🏢'}</span>
                        )}
                      </div>
                      
                      <h3 className="text-base font-black text-center tracking-tight leading-tight uppercase" style={{ color: 'var(--text-primary)' }}>
                        {business.name}
                      </h3>
                      <div className="mt-1">
                        {business.user_role && getRoleBadge(business.user_role)}
                      </div>
                    </div>

                    {/* Organized Insights - Horizontal Footer */}
                    <div className="mt-auto grid grid-cols-3 gap-1 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex flex-col items-center py-1.5 bg-black/10 rounded-xl border border-white/5">
                        <span className="text-[7px] font-black uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Books</span>
                        <span className="text-[11px] font-black" style={{ color: colorConfig.hex }}>{business.books_count || 0}</span>
                      </div>
                      <div className="flex flex-col items-center py-2 bg-black/10 rounded-xl border border-white/5">
                        <span className="text-[7px] font-black uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Ledgers</span>
                        <span className="text-[11px] font-black" style={{ color: 'var(--text-primary)' }}>{business.ledgers_count || 0}</span>
                      </div>
                      <div className="flex flex-col items-center py-2 bg-black/10 rounded-xl border border-white/5">
                        <span className="text-[7px] font-black uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Peers</span>
                        <span className="text-[11px] font-black" style={{ color: 'var(--text-primary)' }}>{business.member_count || 1}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedBusinesses.map((business) => {
              const colorConfig = getColorConfig(business.color || '#3B82F6');
              return (
                <div
                  key={business.id}
                  onClick={() => { triggerHaptic('light'); navigate(`/business/${business.id}/books`); }}
                  className="relative overflow-hidden rounded-[2rem] cursor-pointer group active:scale-[0.98] transition-all duration-500 hover:-translate-y-1 flex items-center backdrop-blur-3xl"
                  style={{
                    background: `linear-gradient(135deg, ${colorConfig.hex}20, ${colorConfig.hex}08)`,
                    border: `1.5px solid ${colorConfig.hex}40`,
                    boxShadow: `0 15px 45px -15px ${colorConfig.hex}50`,
                  }}
                >
                  {/* Colored left accent strip */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                    style={{ background: `linear-gradient(to bottom, ${colorConfig.hex}, ${colorConfig.hex}80)`, boxShadow: `2px 0 12px ${colorConfig.hex}50` }}
                  />

                  <div className="flex items-center gap-4 p-4 pl-6">
                    {/* Logo icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                      style={{ background: `${colorConfig.hex}18`, border: `1.5px solid ${colorConfig.hex}40` }}
                    >
                      {business.logo_url?.startsWith('http') ? (
                        <img src={business.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{business.logo_url || '🏢'}</span>
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black tracking-tight truncate uppercase" style={{ color: 'var(--text-primary)' }}>
                        {business.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 underline-offset-4">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ background: `${colorConfig.hex}15`, color: colorConfig.hex }}>
                          {business.books_count || 0} Books
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                          {business.ledgers_count || 0} Ledgers
                        </span>
                      </div>
                    </div>

                    {/* Right side: members + role + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                        <Users className="w-3 h-3" />
                        {business.member_count}
                      </div>

                      {business.user_role && getRoleBadge(business.user_role)}

                      {['captain', 'vice_captain'].includes(business.user_role || '') && (
                        <div className="flex gap-1 transition-all">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/business/${business.id}/team`); }}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: colorConfig.hex, background: `${colorConfig.hex}15` }}
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          {business.user_role === 'captain' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingBusiness(business); setEditBusinessName(business.name); setEditBusinessDescription(business.description || ''); setEditBusinessLogo(business.logo_url || '🏢'); setEditBusinessColor(business.color || '#3B82F6'); setIsEditModalOpen(true); }}
                              className="p-2 rounded-lg transition-colors"
                              style={{ color: colorConfig.hex, background: `${colorConfig.hex}15` }}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setCreateError('');
            setNewBusinessName('');
          }}
          title="Create New Business"
          footer={
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                form="create-business-form"
                type="submit"
                variant="primary"
                loading={creating}
                disabled={!newBusinessName.trim()}
                className="flex-1"
              >
                Create
              </Button>
            </div>
          }
        >
        <form id="create-business-form" onSubmit={(e) => { e.preventDefault(); handleCreateBusiness(); }} className="space-y-4">
          <Input
            ref={nameInputRef}
            label="Space Name"
            placeholder="Business Name"
            value={newBusinessName}
            onChange={(e) => setNewBusinessName(e.target.value)}
            maxLength={80}
            required
            autoFocus
            autoComplete="off"
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Space Accent Color</label>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: newBusinessColor }} />
                <span className="text-[10px] font-mono text-secondary uppercase font-bold">{newBusinessColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2 flex-1">
                {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setNewBusinessColor(color); }}
                    className={`w-7 h-7 rounded-lg transition-all relative ${newBusinessColor === color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-[#1a1a1a]' : 'opacity-40 hover:opacity-100'}`}
                    style={{ background: color }}
                    title={color}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
              <div className="relative flex items-center shrink-0">
                <input
                  type="color"
                  value={newBusinessColor}
                  onChange={(e) => { triggerHaptic('light'); setNewBusinessColor(e.target.value); }}
                  className="w-7 h-7 rounded-lg cursor-pointer bg-card border border-border appearance-none p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-lg"
                />
              </div>
            </div>
          </div>

          <Input
            label="Logo Emoji"
            placeholder="🏢, 🚀, 💎"
            value={newBusinessLogo}
            onChange={(e) => setNewBusinessLogo(e.target.value)}
            maxLength={2}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary">Business Description</label>
            <textarea
              className="input-dark min-h-[100px] resize-none"
              placeholder="Tell us about your business..."
              value={newBusinessDescription}
              onChange={(e) => setNewBusinessDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary">Business Logo</label>
            <div className="flex gap-4 items-center">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl overflow-hidden shrink-0 transition-all duration-300 bg-card border border-border"
              >
                {newLogoFile ? (
                  <img src={URL.createObjectURL(newLogoFile)} className="w-full h-full object-cover" />
                ) : (
                  newBusinessLogo
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewLogoFile(e.target.files?.[0] || null)}
                className="text-xs text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
              />
            </div>
          </div>
          {createError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {createError}
            </div>
          )}
        </form>
      </Modal>
      )}

      {isJoinModalOpen && (
        <Modal
          isOpen={isJoinModalOpen}
          onClose={() => {
            setIsJoinModalOpen(false);
            setJoinError('');
            setInviteCode('');
          }}
          title="Join Business"
          footer={
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsJoinModalOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                form="join-business-form"
                type="submit"
                variant="primary"
                loading={joining}
                disabled={!inviteCode.trim()}
                className="flex-1"
              >
                Join
              </Button>
            </div>
          }
        >
        <form id="join-business-form" onSubmit={(e) => { e.preventDefault(); handleJoinBusiness(); }} className="space-y-4">
          <Input
            ref={joinInputRef}
            label="Invite Code"
            placeholder="ABCD1234"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="off"
            required
          />
          {joinError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {joinError}
            </div>
          )}
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm text-secondary">
              <strong className="text-primary">Need an invite code?</strong>
              <br />
              Ask your team captain to share the invite code with you.
            </p>
          </div>
        </form>
      </Modal>
      )}

      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingBusiness(null);
            setEditError('');
          }}
          title="Edit Business"
        >
        <div className="space-y-4">
          <Input
            label="Business Name"
            placeholder="e.g., My Store, Gold Trading"
            value={editBusinessName}
            onChange={(e) => setEditBusinessName(e.target.value)}
            maxLength={80}
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary">Business Description</label>
            <textarea
              className="input-dark min-h-[100px] resize-none"
              placeholder="Tell us about your business..."
              value={editBusinessDescription}
              onChange={(e) => setEditBusinessDescription(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Space Accent Color</label>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: editBusinessColor }} />
                <span className="text-[10px] font-mono text-secondary uppercase font-bold">{editBusinessColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2 flex-1">
                {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                  <button
                    key={color}
                    type="button"
                               onClick={() => { triggerHaptic('light'); setEditBusinessColor(color); }}
                               className={`w-7 h-7 rounded-lg transition-all relative ${editBusinessColor === color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card' : 'opacity-40 hover:opacity-100'}`}
                               style={{ background: color }}
                               title={color}
                    aria-label={`Color ${color}`}
                             />
                           ))}
                         </div>

              <div className="relative flex items-center shrink-0">
                <input
                  type="color"
                  value={editBusinessColor}
                  onChange={(e) => { triggerHaptic('light'); setEditBusinessColor(e.target.value); }}
                  className="w-7 h-7 rounded-lg cursor-pointer bg-card border border-border appearance-none p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-lg"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary">Business Logo</label>
            <div className="flex gap-4 items-center">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl overflow-hidden shrink-0 transition-all duration-300 bg-card border border-border"
              >
                {editLogoFile ? (
                  <img src={URL.createObjectURL(editLogoFile)} className="w-full h-full object-cover" />
                ) : editBusinessLogo.startsWith('http') ? (
                  <img src={editBusinessLogo} className="w-full h-full object-cover" />
                ) : (
                  editBusinessLogo
                )}
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditLogoFile(e.target.files?.[0] || null)}
                  className="text-xs text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
                />
                {(editBusinessLogo.startsWith('http') || editLogoFile) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditBusinessLogo('🏢');
                      setEditLogoFile(null);
                    }}
                    className="text-xs text-red-500 font-bold text-left hover:underline px-4"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
          </div>
          {editError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-500 text-sm">{editError}</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingBusiness(null);
                setEditError('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleEditBusiness}
              loading={editing}
              disabled={!editBusinessName.trim() || (editBusinessName.trim() === editingBusiness?.name && editBusinessDescription.trim() === (editingBusiness?.description || '') && !editLogoFile && editBusinessLogo === editingBusiness?.logo_url && editBusinessColor === editingBusiness?.color)}
              className="flex-1"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isDeleteModalOpen && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeletingBusiness(null);
            setDeleteConfirmName('');
            setDeleteError('');
          }}
          title="Delete Business"
        >
        <div className="space-y-4">
          <p className="text-primary">
            Are you sure you want to delete <strong className="text-white">{deletingBusiness?.name}</strong>?
          </p>
          <p className="text-sm text-red-500">
            This action cannot be undone. All books, ledgers, and transactions associated with this business will be permanently deleted.
          </p>
          <div className="mt-4">
            <p className="text-secondary text-sm mb-2">
              Please type <strong>{deletingBusiness?.name}</strong> to confirm.
            </p>
            <Input
              label=""
              placeholder={deletingBusiness?.name}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && deleteConfirmName === deletingBusiness?.name) {
                  handleDeleteBusiness();
                }
              }}
            />
          </div>
          {deleteError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-500 text-sm">{deleteError}</p>
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeletingBusiness(null);
                setDeleteConfirmName('');
                setDeleteError('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDeleteBusiness}
              loading={deleting}
              disabled={deleteConfirmName !== deletingBusiness?.name}
              className="flex-1 !bg-red-500 hover:!bg-red-600 !text-white !border-red-500 disabled:!opacity-50 disabled:!cursor-not-allowed"
            >
              Delete Business
            </Button>
          </div>
        </div>
      </Modal>
      )}
    </Layout >
  );
}
