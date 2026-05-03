import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Trash2, Edit2, LayoutGrid, List, Layers, Plus, Users, ArrowRightLeft, Settings, UserPlus } from 'lucide-react';
import { logAudit } from '../services/auditLogger';
import { triggerHaptic } from '../utils/haptics';
import { dataService } from '../core';
import { RecycleBin } from '../components/RecycleBin';
import { useToast } from '../components/ui/Toast';

interface CustomFieldConfig {
  name: string;
  type: 'text' | 'number';
  is_mandatory: boolean;
  values?: string[];
}

type UnitType = 'INR' | 'gm' | 'pcs';

interface Ledger {
  id: string;
  name: string;
  unit_type: UnitType;
  created_at: string;
  balance?: number;
  cash_in?: number;
  cash_out?: number;
  categories?: string[] | null;
  decimal_precision: number;
  decimal_rule: 'entry' | 'ledger';
  category_required: boolean;
  custom_fields_config: CustomFieldConfig[];
  restrict_backdated_entries: 'always' | 'never' | 'one_day';
  ledger_locked_until_date?: string | null;
  is_deleted?: boolean;
  color?: string;
}

export function LedgersList() {
  const navigate = useNavigate();
  const { businessId, bookId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [bookName, setBookName] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerUnitType, setNewLedgerUnitType] = useState<UnitType>('INR');
  const [newLedgerPrecision, setNewLedgerPrecision] = useState<number>(2);
  const [newSecondaryCategories, setNewSecondaryCategories] = useState<string[]>([]);
  const [secondaryCategoryMandatory, setSecondaryCategoryMandatory] = useState(false);
  const [newCustomFieldMandatory, setNewCustomFieldMandatory] = useState(false);
  const [newCustomFieldValues, setNewCustomFieldValues] = useState<string[]>([]);
  const [newCustomFieldValueInput, setNewCustomFieldValueInput] = useState("");
  const [newRestrictBackdatedEntries, setNewRestrictBackdatedEntries] = useState<'always' | 'never' | 'one_day'>('always');
  const [newLedgerColor, setNewLedgerColor] = useState('#3B82F6');
  const [newSecondaryCategoryInputValue, setNewSecondaryCategoryInputValue] = useState('');
  const [newCustomFieldEditValue, setNewCustomFieldEditValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deletingLedgerId, setDeletingLedgerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('ledgersViewMode') as 'grid' | 'list') || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'oldest' | 'balance'>('newest');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ledgersViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 300);
    }
  }, [isCreateModalOpen]);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [selectedLedgerForRename, setSelectedLedgerForRename] = useState<Ledger | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameUnitType, setRenameUnitType] = useState<UnitType>('INR');
  const [renamePrecision, setRenamePrecision] = useState<number>(2);
  const [renameCategoryRequired, setRenameCategoryRequired] = useState(false);
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editCategoryInputValue, setEditCategoryInputValue] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<CustomFieldConfig[]>([]);
  const [renameRestrictBackdatedEntries, setRenameRestrictBackdatedEntries] = useState<'always' | 'never' | 'one_day'>('always');
  const [renameLockedUntilDate, setRenameLockedUntilDate] = useState<string | null>(null);
  const [renameColor, setRenameColor] = useState('#3B82F6');
  const [renaming, setRenaming] = useState(false);

  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [selectedLedgerForAccess, setSelectedLedgerForAccess] = useState<Ledger | null>(null);
  const [businessMembers, setBusinessMembers] = useState<any[]>([]);
  const [ledgerMembers, setLedgerMembers] = useState<string[]>([]);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedLedgerForMove, setSelectedLedgerForMove] = useState<Ledger | null>(null);
  const [availableBooks, setAvailableBooks] = useState<any[]>([]);
  const [targetBookId, setTargetBookId] = useState('');
  const [moving, setMoving] = useState(false);

  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  useEffect(() => {
    // Listen for global header actions
    const handleOpenCreate = () => { triggerHaptic('light'); setIsCreateModalOpen(true); };
    
    window.addEventListener('open-create-modal', handleOpenCreate);
    
    return () => {
      window.removeEventListener('open-create-modal', handleOpenCreate);
    };
  }, [bookId]);

  useEffect(() => {
    if (businessId && bookId) {
      loadBookInfo();
      loadLedgers(true);
      loadAvailableBooks();
      loadDeletedCount();
    }
  }, [user, businessId, bookId]);

  const loadDeletedCount = async () => {
    if (!businessId) return;
    try {
      const items = await dataService.getDeletedItems(businessId);
      setDeletedCount(items.length);
    } catch (err) {
      console.error('Error loading deleted count:', err);
    }
  };

  const loadAvailableBooks = async () => {
    try {
      const booksData = await dataService.getBooks(businessId!);
      if (isMounted.current) {
        setAvailableBooks(booksData || []);
      }
    } catch (err) {
      console.error('Error loading available books:', err);
    }
  };

  const loadBookInfo = async () => {
    try {
      const booksData = await dataService.getBooks(businessId!);
      const book = booksData.find(b => b.id === bookId);

      if (book && isMounted.current) {
        setBookName(book.name);
      }

      if (!user) {
        setUserRole('captain');
        return;
      }
      
      setUserRole('captain'); // offline default
    } catch (error) {
      console.error('Error loading book info:', error);
      if (isMounted.current) {
        setLoadError('Failed to load book header information.');
      }
    }
  };

  const filteredAndSortedLedgers = ledgers
    .filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'balance') return (b.balance || 0) - (a.balance || 0);
      return 0;
    });

  const loadLedgers = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const ledgersData = await dataService.getLedgers(bookId!);
      
      if (ledgersData.length === 0) {
        setLedgers([]);
        setLoadError(null);
        return;
      }

      const ledgersWithBalances = await Promise.all(ledgersData.map(async (ledger: any) => {
        const txs = await dataService.getTransactions(ledger.id);
        const cash_in = txs.filter((t: any) => t.type === 'cash_in' && !t.is_deleted).reduce((sum: number, t: any) => sum + t.amount, 0);
        const cash_out = txs.filter((t: any) => t.type === 'cash_out' && !t.is_deleted).reduce((sum: number, t: any) => sum + t.amount, 0);
        return {
          ...ledger,
          unit_type: (ledger.unit_type || ledger.unit) as UnitType,
          cash_in,
          cash_out,
          balance: cash_in - cash_out,
        };
      }));

      setLedgers(ledgersWithBalances as unknown as Ledger[]);
      setLoadError(null);
    } catch (error: any) {
      console.error('Error loading ledgers:', error);
      setLoadError(error?.message || 'Failed to load ledgers');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };


  const handleCreateLedger = async () => {
    if (!user && ledgers.length >= 1) {
       dataService.triggerSignup();
       return;
    }

    if (!newLedgerName.trim() || creating) return;

    // Check for uniqueness
    const isDuplicate = ledgers.some(l => l.name.toLowerCase() === newLedgerName.trim().toLowerCase());
    if (isDuplicate) {
      setCreateError('A ledger with this name already exists in this book.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const customFields = newCustomFieldEditValue.trim()
        ? [{
            name: newCustomFieldEditValue.trim(),
            is_mandatory: newCustomFieldMandatory,
            values: newCustomFieldValues,
          }]
        : [];

      await dataService.createLedger({
        business_id: businessId!,
        book_id: bookId!,
        name: newLedgerName.trim(),
        unit_type: newLedgerUnitType,
        decimal_precision: newLedgerUnitType === 'gm' ? newLedgerPrecision : (newLedgerUnitType === 'pcs' ? 0 : 2),
        category_required: secondaryCategoryMandatory,
        categories: newSecondaryCategories,
        custom_fields_config: customFields,
        restrict_backdated_entries: newRestrictBackdatedEntries,
        color: newLedgerColor,
      });

      setIsCreateModalOpen(false);
      setNewLedgerName('');
      setNewLedgerUnitType('INR');
      setNewLedgerPrecision(2);
      setSecondaryCategoryMandatory(false);
      setNewSecondaryCategories([]);
      setNewSecondaryCategoryInputValue('');
      setNewCustomFieldEditValue('');
      setNewCustomFieldValues([]);
      setNewCustomFieldValueInput('');
      setNewCustomFieldMandatory(false);
      setNewRestrictBackdatedEntries('always');
      loadLedgers();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error creating ledger:', error);
      toast.error(`Failed to create ledger: ${error.message || 'Unknown error'}.`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLedger = async (ledgerId: string) => {
    const activeUserId = user?.id || 'offline_user';
    setDeletingLedgerId(ledgerId);
    try {

      // Call internal dataService which cascades down automatically by pushing delete ops.
      await dataService.deleteLedger(ledgerId);

      setDeleteConfirm(null);
      // Optimistic local state update
      setLedgers(prev => prev.filter(l => l.id !== ledgerId));
      
      // Audit log (non-blocking)
      const now = new Date().toISOString();
      logAudit(businessId!, activeUserId, 'DELETE', 'LEDGER', ledgerId, {
        new_value: { deleted_at: now, is_deleted: true }
      });
      loadLedgers();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error deleting ledger:', error);
      toast.error(error.message || 'Failed to delete ledger. Please try again.');
      setDeleteConfirm(null);
      loadLedgers();
    } finally {
      setDeletingLedgerId(null);
    }
  };

  const handleRenameLedger = async () => {
    if (!renameValue.trim() || !selectedLedgerForRename) return;

    setRenaming(true);
    try {
      if (renameUnitType === 'INR') {
        // Handle INR logic if needed, but precision was unused
      }

      const updateObj: any = {
        name: renameValue,
        unit: renameUnitType,
        categories: editCategories,
        decimal_precision: renameUnitType === 'gm' ? renamePrecision : (renameUnitType === 'pcs' ? 0 : 2),
        is_category_mandatory: renameCategoryRequired,
        custom_fields_config: editCustomFields,
        restrict_backdated_entries: renameRestrictBackdatedEntries,
        ledger_locked_until_date: renameLockedUntilDate || null,
        color: renameColor
      };

      await dataService.updateLedger(selectedLedgerForRename.id, updateObj);

      setIsRenameModalOpen(false);
      setSelectedLedgerForRename(null);
      setRenameValue('');
      setRenameUnitType('INR');
      setRenamePrecision(2);
      setRenameCategoryRequired(false);
      setEditCategories([]);
      setEditCategoryInputValue('');
      setEditCustomFields([]);
      setNewCustomFieldEditValue('');
      setRenameRestrictBackdatedEntries('always');
      await logAudit(businessId!, user!.id, 'UPDATE', 'LEDGER', selectedLedgerForRename.id, {
        old_value: selectedLedgerForRename,
        new_value: { name: renameValue, unit_type: renameUnitType }
      });
      loadLedgers();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error renaming ledger:', error);
      toast.error(`Failed to update ledger: ${error.message || 'Unknown error'}.`);
    } finally {
      setRenaming(false);
    }
  };

  const openAccessModal = async (ledger: Ledger, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLedgerForAccess(ledger);
    setIsAccessModalOpen(true);

    // Offline fallback: membership sync occurs behind syncEngine
    setBusinessMembers([]);
    setLedgerMembers([]);
  };

  const toggleLedgerAccess = async (memberUserId: string) => {
    console.warn(`Membership toggling for ${memberUserId} deferred to hybrid model.`);
  };

  const formatAmount = (amount: number, ledger: Ledger) => {
    const precision = ledger.decimal_precision ?? 2;
    const formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });

    if (ledger.unit_type === 'INR') {
      return `₹${formatted}`;
    } else {
      return `${formatted} ${ledger.unit_type}`;
    }
  };

  const canDeleteLedger = ['captain', 'vice_captain'].includes(userRole);

  return (
    <Layout showBack title={bookName} loading={loading}>
      <div className={`space-y-6 animate-fade-in ${isRefreshing ? 'opacity-70 pointer-events-none' : 'opacity-100'} transition-opacity min-h-[600px]`}>
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-6 ${ledgers.length === 0 ? 'mb-0' : 'mb-8'}`}>
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] uppercase">Ledgers</h2>
            <p className="mt-1 text-secondary">Track entries with precision and clarity</p>
          </div>
        </div>

        {/* Action Bar - Search/Sort/View Mode */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-card border border-border/40 backdrop-blur-2xl">
          <div className="relative group w-full md:w-auto md:min-w-[320px]">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-secondary group-focus-within:text-primary transition-colors">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search ledgers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-input border border-border/40 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {['captain', 'vice_captain', 'team_member'].includes(userRole) && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { triggerHaptic('medium'); setIsCreateModalOpen(true); }}
                className="!px-6 !py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest !bg-primary !text-primary-contrast shadow-xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
              >
                New Ledger
              </Button>
            )}

            {!user && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { triggerHaptic('medium'); dataService.triggerSignup(); }}
                className="!px-6 !py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest text-primary border-primary/20 hover:bg-primary/5 transition-all"
              >
                Sign Up
              </Button>
            )}
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
                  <option value="balance">Balance</option>
                </select>
              </div>

              <div className="flex items-center gap-1 p-1 bg-input/50 border border-border/40 rounded-2xl shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-primary text-primary-contrast shadow-lg' : 'text-secondary hover:text-primary'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-primary text-primary-contrast shadow-lg' : 'text-secondary hover:text-primary'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Recycle Bin */}
              <button
                onClick={() => setIsRecycleBinOpen(true)}
                className="relative p-2.5 bg-input/50 border border-border/40 rounded-2xl text-secondary hover:text-red-400 transition-all active:scale-95 shrink-0"
                title="Recycle Bin"
              >
                <Trash2 className="w-4 h-4" />
                {deletedCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white ring-2 ring-[var(--bg-card)] shadow-lg animate-in zoom-in duration-300">
                    {deletedCount}
                  </span>
                )}
              </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            <p className="font-semibold mb-1">⚠️ Failed to load ledgers</p>
            <p>{loadError}</p>
            <p className="mt-2 text-xs opacity-70">This usually means the database migration has not been applied. Please run the SQL from <code>DEFINITIVE_LEDGER_UPGRADE.sql</code> in your Supabase SQL Editor.</p>
          </div>
        )}
        {ledgers.length === 0 && !loadError ? (
          <div className="text-center py-16">
            <Layers className="w-16 h-16 text-secondary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-primary mb-2">No ledgers yet</h3>
            <p className="text-secondary mb-6">Create your first ledger by clicking "New Ledger" above</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredAndSortedLedgers.map((ledger) => {
              const accentHex = ledger.color || '#3B82F6';
              const total = { balance: ledger.balance || 0 };
              return (
                <div
                  key={ledger.id}
                  onClick={() => navigate(`/business/${businessId}/books/${bookId}/ledgers/${ledger.id}`)}
                  className="group relative cursor-pointer overflow-hidden rounded-[2rem] transition-all duration-500 hover:-translate-y-1.5 active:scale-[0.97] flex flex-col p-5 backdrop-blur-3xl"
                  style={{
                    background: `linear-gradient(165deg, ${accentHex}25, ${accentHex}08)`,
                    border: `1.5px solid ${accentHex}40`,
                    boxShadow: `0 20px 55px -12px ${accentHex}50`,
                  }}
                >
                  {/* Hover wash */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `linear-gradient(145deg, ${accentHex}30, ${accentHex}10)` }}
                  />

                    {/* Actions */}
                    {canDeleteLedger && (
                      <div className="absolute top-4 right-4 flex gap-1.5 z-20 transition-all opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLedgerForRename(ledger);
                            setRenameValue(ledger.name);
                            setRenameUnitType(ledger.unit_type);
                            setRenamePrecision(ledger.decimal_precision);
                            setRenameCategoryRequired(ledger.category_required || false);
                            setEditCategories(ledger.categories || []);
                            const rawConfig = ledger.custom_fields_config;
                            const normalized = (Array.isArray(rawConfig) ? rawConfig : []).map((f: any) =>
                              typeof f === 'string' ? { name: f, is_mandatory: false, values: [] } : { values: [], ...f }
                            );
                            setEditCustomFields(normalized);
                            setRenameRestrictBackdatedEntries(ledger.restrict_backdated_entries || 'always');
                            setRenameLockedUntilDate(ledger.ledger_locked_until_date || null);
                            setRenameColor(ledger.color || '#3B82F6');
                            setIsRenameModalOpen(true);
                          }}
                          className="p-2 rounded-xl backdrop-blur-md transition-all active:scale-95"
                          style={{ background: `${accentHex}25`, border: `1px solid ${accentHex}50` }}
                        >
                          <Edit2 className="w-4 h-4" style={{ color: accentHex }} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ledger.id); }}
                          className="p-2 bg-red-500/20 rounded-xl border border-red-500/40 transition-all active:scale-95"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    )}

                  {/* Centered Identity */}
                  <div className="flex flex-col items-center justify-center flex-1 py-4">
                    <div
                      className="w-11 h-11 rounded-2xl mb-2 flex items-center justify-center shadow-lg transition-all group-hover:scale-110"
                      style={{ background: `${accentHex}18`, border: `2px solid ${accentHex}50` }}
                    >
                      <Layers className="w-6 h-6" style={{ color: accentHex }} />
                    </div>
                    <h3 className="text-base font-black text-center leading-tight tracking-tight uppercase" style={{ color: 'var(--text-primary)' }}>
                      {ledger.name}
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-60" style={{ color: 'var(--text-secondary)' }}>
                      {ledger.unit_type === 'INR' ? 'Cash' : ledger.unit_type === 'gm' ? 'Weight' : 'Pcs'}
                    </p>
                  </div>

                  {userRole !== 'data_entry' ? (
                    <div className="mt-auto space-y-2 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-60" style={{ color: 'var(--text-secondary)' }}>Net Balance</span>
                        <span className={`text-sm font-black truncate max-w-[120px] ${total.balance < 0 ? 'text-red-500' : ''}`} style={total.balance < 0 ? {} : { color: accentHex }}>
                          {formatAmount(ledger.balance || 0, ledger)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col items-center py-2.5 rounded-xl border border-border/40" style={{ background: 'var(--bg-input)' }}>
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">In</span>
                          <span className="text-[11px] font-black truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatAmount(ledger.cash_in || 0, ledger).replace(/[₹\sgm|pcs]/g, '')}</span>
                        </div>
                        <div className="flex flex-col items-center py-2.5 rounded-xl border border-border/40" style={{ background: 'var(--bg-input)' }}>
                          <span className="text-[8px] font-black uppercase tracking-widest text-red-500">Out</span>
                          <span className="text-[11px] font-black truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatAmount(ledger.cash_out || 0, ledger).replace(/[₹\sgm|pcs]/g, '')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto py-6 flex flex-col items-center justify-center opacity-20 border-t border-dashed" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current mb-2" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Entry Access Only</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedLedgers.map((ledger) => {
              const accentHex = ledger.color || '#3B82F6';
              return (
                <div
                  key={ledger.id}
                  onClick={() => navigate(`/business/${businessId}/books/${bookId}/ledgers/${ledger.id}`)}
                  className="group relative cursor-pointer rounded-[2rem] overflow-hidden transition-all duration-500 hover:-translate-y-1 active:scale-[0.99] backdrop-blur-2xl"
                  style={{
                    background: `linear-gradient(135deg, ${accentHex}20, ${accentHex}08)`,
                    border: `1.5px solid ${accentHex}40`,
                    boxShadow: `0 12px 40px -15px ${accentHex}40`,
                  }}
                >
                  {/* Colored left strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: accentHex }} />

                  <div className="flex items-center justify-between gap-4 p-4 pl-5">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-2.5 rounded-lg shrink-0" style={{ background: `${accentHex}18`, border: `1px solid ${accentHex}35` }}>
                        <Layers className="w-5 h-5" style={{ color: accentHex }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary, #fff)' }}>
                          {ledger.name}
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #888)' }}>
                          {ledger.unit_type === 'INR' ? '₹ INR' : ledger.unit_type === 'gm' ? 'Weight' : 'Pieces'}
                        </p>
                      </div>
                      {userRole !== 'data_entry' && (
                        <div className="flex flex-col mt-0.5 min-w-0 lg:hidden">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-tight" style={{ color: '#10B981' }}>In {formatAmount(ledger.cash_in || 0, ledger).replace('₹', '')}</span>
                            <span className="text-[10px] font-bold uppercase tracking-tight" style={{ color: '#EF4444' }}>Out {formatAmount(ledger.cash_out || 0, ledger).replace('₹', '')}</span>
                          </div>
                          <span className="text-[11px] font-black mt-1 pt-1" style={{ color: (ledger.balance || 0) >= 0 ? accentHex : '#EF4444', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            Bal: {formatAmount(ledger.balance || 0, ledger)}
                          </span>
                        </div>
                      )}
                    </div>
                    {userRole !== 'data_entry' && (
                      <div className="hidden lg:flex gap-6 px-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: '#10B981' }}>In</p>
                          <p className="text-sm font-bold" style={{ color: 'var(--text-primary, #fff)' }}>{formatAmount(ledger.cash_in || 0, ledger)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: '#EF4444' }}>Out</p>
                          <p className="text-sm font-bold" style={{ color: 'var(--text-primary, #fff)' }}>{formatAmount(ledger.cash_out || 0, ledger)}</p>
                        </div>
                        <div className="text-right whitespace-nowrap min-w-[100px]">
                          <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary, #888)' }}>Balance</p>
                          <p className="text-sm font-bold" style={{ color: (ledger.balance || 0) >= 0 ? accentHex : '#EF4444' }}>{formatAmount(ledger.balance || 0, ledger)}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 shrink-0">
                      {canDeleteLedger && (
                        <div className="flex gap-2 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLedgerForRename(ledger);
                              setRenameValue(ledger.name);
                              setRenameUnitType(ledger.unit_type);
                              setRenamePrecision(ledger.decimal_precision);
                              setRenameCategoryRequired(ledger.category_required || false);
                              setEditCategories(ledger.categories || []);
                              const rawConfig = ledger.custom_fields_config;
                              const normalized = (Array.isArray(rawConfig) ? rawConfig : []).map((f: any) =>
                                typeof f === 'string' ? { name: f, is_mandatory: false, values: [] } : { values: [], ...f }
                              );
                              setEditCustomFields(normalized);
                              setRenameRestrictBackdatedEntries(ledger.restrict_backdated_entries || 'always');
                              setRenameLockedUntilDate(ledger.ledger_locked_until_date || null);
                              setRenameColor(ledger.color || '#3B82F6');
                              setIsRenameModalOpen(true);
                            }}
                            className="p-1.5 transition-colors"
                            style={{ color: 'var(--text-secondary, #888)' }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => openAccessModal(ledger, e)}
                            className="p-1.5 transition-colors"
                            style={{ color: 'var(--text-secondary, #888)' }}
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLedgerForMove(ledger);
                              setTargetBookId(bookId || '');
                              setIsMoveModalOpen(true);
                            }}
                            className="p-1.5 transition-colors"
                            style={{ color: 'var(--text-secondary, #888)' }}
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(ledger.id);
                            }}
                            className="p-1.5 text-red-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
          onClose={() => setIsCreateModalOpen(false)}
          title="CREATE NEW LEDGER"
          footer={
            <div className="flex gap-3 w-full">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 rounded-xl py-3 font-black uppercase tracking-widest text-[10px]"
              >
                Cancel
              </Button>
              <Button
                form="create-ledger-form"
                type="submit"
                variant="primary"
                loading={creating}
                disabled={!newLedgerName.trim()}
                className="flex-1 rounded-xl py-3 font-black uppercase tracking-widest text-[10px]"
              >
                Create
              </Button>
            </div>
          }
        >
        <form 
          id="create-ledger-form" 
          onSubmit={(e) => { e.preventDefault(); handleCreateLedger(); }}
          className="space-y-4"
        >
          {/* Section 1: Basic Configuration & Layout */}
          <div className="border border-border/40 rounded-2xl p-4 bg-white/[0.02] space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Input
                  ref={nameInputRef}
                  label="Ledger Name"
                  placeholder="e.g. Sales Account"
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  maxLength={80}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="shrink-0 min-w-[150px]">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary ml-1 mb-2">Unit Type</label>
                <div className="flex p-1 bg-input rounded-xl border border-border/40 h-[46px] overflow-x-auto">
                  {(['INR', 'gm', 'pcs'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => { triggerHaptic('light'); setNewLedgerUnitType(unit); }}
                      className={`flex-1 px-3 text-[9px] font-black uppercase rounded-lg transition-all min-w-[40px] ${newLedgerUnitType === unit ? 'bg-primary text-primary-contrast shadow-lg' : 'text-secondary hover:text-primary'}`}
                    >
                      {unit === 'INR' ? 'Cash' : unit === 'gm' ? 'Gram' : 'Pcs'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-secondary ml-1 mb-2">Backdated Entries</label>
                <div className="flex gap-1.5 p-1 bg-input/50 rounded-xl border border-border/40 h-[46px]">
                  {(['always', 'never', 'one_day'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { triggerHaptic('light'); setNewRestrictBackdatedEntries(opt); }}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-tight transition-all ${
                        newRestrictBackdatedEntries === opt
                          ? 'bg-primary text-primary-contrast shadow-md font-black'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {opt === 'one_day' ? '1 Day' : opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shrink-0">
                <div className="flex items-center justify-between ml-1 mb-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Color</label>
                  <div className="flex items-center gap-1.5 ml-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: newLedgerColor }} />
                    <span className="text-[8px] font-mono text-secondary uppercase font-bold">{newLedgerColor}</span>
                  </div>
                </div>
                <div className="flex gap-2 p-1 bg-input/40 rounded-xl border border-border/40 h-[46px] items-center px-2">
                  <div className="flex gap-1">
                    {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => { triggerHaptic('light'); setNewLedgerColor(color); }}
                        className={`w-3.5 h-3.5 rounded-full transition-all relative ${newLedgerColor === color ? 'scale-125 ring-2 ring-primary ring-offset-1 ring-offset-[#1a1a1a] z-10' : 'opacity-30 hover:opacity-100'}`}
                        style={{ background: color }}
                        title={color}
                    aria-label={`Color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="w-px h-4 bg-border/40 mx-1" />
              <div className="relative group flex items-center">
                <input
                  type="color"
                  value={newLedgerColor}
                  onChange={(e) => { triggerHaptic('light'); setNewLedgerColor(e.target.value); }}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-card border border-border overflow-hidden"
                />
              </div>
              </div>
            </div>
          </div>
          </div>

          {/* Section 2: Category Setup */}
          <div className="border border-border/40 rounded-xl p-4 bg-white/[0.01] space-y-4">
            <div className="flex items-center justify-between py-1 border-b border-border/10 pb-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Category</h4>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Mandatory</span>
                <label className="relative inline-flex items-center cursor-pointer scale-75">
                  <input type="checkbox" className="sr-only peer" checked={secondaryCategoryMandatory} onChange={(e) => setSecondaryCategoryMandatory(e.target.checked)} />
                  <div className="w-11 h-6 bg-card border border-border/50 rounded-full peer peer-focus:ring-2 peer-focus:ring-gold peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold transition-all"></div>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Add values..."
                    value={newSecondaryCategoryInputValue}
                    onChange={(e) => setNewSecondaryCategoryInputValue(e.target.value)}
                    className="!py-2.5 !rounded-xl !text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newSecondaryCategoryInputValue.trim() && !newSecondaryCategories.includes(newSecondaryCategoryInputValue.trim())) {
                          setNewSecondaryCategories([...newSecondaryCategories, newSecondaryCategoryInputValue.trim()]);
                          setNewSecondaryCategoryInputValue('');
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-4 !rounded-xl h-[46px] border border-border/40"
                  onClick={() => {
                    if (newSecondaryCategoryInputValue.trim() && !newSecondaryCategories.includes(newSecondaryCategoryInputValue.trim())) {
                      setNewSecondaryCategories([...newSecondaryCategories, newSecondaryCategoryInputValue.trim()]);
                      setNewSecondaryCategoryInputValue('');
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {newSecondaryCategories.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {newSecondaryCategories.map((cat, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-input/40 border border-border/20 rounded-lg group">
                      <span className="text-[10px] font-black text-primary uppercase tracking-tight">{cat}</span>
                      <button 
                        type="button"
                        onClick={() => setNewSecondaryCategories(newSecondaryCategories.filter((_, i) => i !== idx))} 
                        className="text-secondary opacity-40 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Custom Fields */}
          <div className="border border-border/40 rounded-xl p-4 bg-white/[0.01] space-y-4">
            <div className="flex items-center justify-between py-1 border-b border-border/10 pb-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Custom Fields</h4>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Mandatory</span>
                <label className="relative inline-flex items-center cursor-pointer scale-75">
                  <input type="checkbox" className="sr-only peer" checked={newCustomFieldMandatory} onChange={(e) => setNewCustomFieldMandatory(e.target.checked)} />
                  <div className="w-11 h-6 bg-card border border-border/50 rounded-full peer peer-focus:ring-2 peer-focus:ring-gold peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold transition-all"></div>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Field Title"
                placeholder="e.g. Bill No, Quantity..."
                value={newCustomFieldEditValue}
                onChange={(e) => setNewCustomFieldEditValue(e.target.value)}
                className="!py-2.5 !rounded-xl !text-xs"
              />

              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Add values..."
                    value={newCustomFieldValueInput}
                    onChange={(e) => setNewCustomFieldValueInput(e.target.value)}
                    className="!py-2.5 !rounded-xl !text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newCustomFieldValueInput.trim() && !newCustomFieldValues.includes(newCustomFieldValueInput.trim())) {
                          setNewCustomFieldValues([...newCustomFieldValues, newCustomFieldValueInput.trim()]);
                          setNewCustomFieldValueInput('');
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-4 !rounded-xl h-[46px] border border-border/40"
                  onClick={() => {
                    if (newCustomFieldValueInput.trim() && !newCustomFieldValues.includes(newCustomFieldValueInput.trim())) {
                      setNewCustomFieldValues([...newCustomFieldValues, newCustomFieldValueInput.trim()]);
                      setNewCustomFieldValueInput('');
                    }
                  }}
                  disabled={!newCustomFieldValueInput.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {newCustomFieldValues.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {newCustomFieldValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-input/40 border border-border/20 rounded-lg group">
                      <span className="text-[10px] font-black text-primary uppercase tracking-tight">{val}</span>
                      <button 
                        type="button"
                        onClick={() => setNewCustomFieldValues(newCustomFieldValues.filter((_, i) => i !== idx))}
                        className="text-secondary opacity-40 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {createError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider text-center">
              {createError}
            </div>
          )}
        </form>
      </Modal>
      )}

      {deleteConfirm !== null && (
        <Modal
          isOpen={deleteConfirm !== null}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Ledger"
          size="sm"
        >
        <div className="space-y-4">
          <p className="text-primary">
            Are you sure you want to delete this ledger? This will also delete all transactions within it. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirm(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirm && handleDeleteLedger(deleteConfirm)}
              loading={deletingLedgerId !== null}
              className="flex-1"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isRenameModalOpen && (
        <Modal
          isOpen={isRenameModalOpen}
          onClose={() => {
            setIsRenameModalOpen(false);
            setSelectedLedgerForRename(null);
            setRenameValue('');
            setRenameUnitType('INR');
            setRenamePrecision(2);
            setRenameCategoryRequired(false);
            setEditCategories([]);
            setEditCategoryInputValue('');
            setEditCustomFields([]);
            setNewCustomFieldEditValue('');
            setRenameLockedUntilDate(null);
            setRenameRestrictBackdatedEntries('never');
          }}
          title="Edit Ledger"
        >
        <div className="space-y-6">
          {/* Section 1: Ledger Settings */}
          <div className="bg-card/40 border border-border/40 rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-gold/10 rounded-lg">
                <Settings className="w-4 h-4 text-gold" />
              </div>
              <h4 className="text-sm font-bold text-primary uppercase tracking-tight">Ledger Settings</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Ledger Name"
                placeholder="e.g., Party A, New Expenses"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={80}
              />
              <div>
                <label className="block text-sm font-bold text-primary uppercase tracking-tight mb-2">
                  Unit Type
                </label>
                <select
                  className="input-dark w-full"
                  value={renameUnitType}
                  onChange={(e) => setRenameUnitType(e.target.value as UnitType)}
                >
                  <option value="INR">₹ INR (Indian Rupee)</option>
                  <option value="gm">Grams (gm)</option>
                  <option value="pcs">Pieces (pcs)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-border/20">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-primary">Category Mandatory</span>
                <span className="text-[10px] text-secondary">Force selection of a category for every entry</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={renameCategoryRequired}
                  onChange={(e) => setRenameCategoryRequired(e.target.checked)}
                />
                <div className="w-11 h-6 bg-card border border-border/50 rounded-full peer peer-focus:ring-2 peer-focus:ring-gold peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold transition-all"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renameUnitType === 'gm' && (
                <div>
                  <label className="block text-sm font-bold text-secondary uppercase tracking-widest mb-2">
                    Decimal Precision
                  </label>
                  <select
                    className="input-dark w-full"
                    value={renamePrecision}
                    onChange={(e) => setRenamePrecision(Number(e.target.value))}
                  >
                    <option value={0}>0 Places</option>
                    <option value={1}>1 Place</option>
                    <option value={2}>2 Places</option>
                    <option value={3}>3 Places</option>
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-secondary uppercase tracking-widest mb-3">
                  Restrict Backdated Entries
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['always', 'never', 'one_day'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRenameRestrictBackdatedEntries(opt)}
                      className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${renameRestrictBackdatedEntries === opt ? 'bg-gold text-[var(--primary-contrast)] border-primary shadow-lg shadow-gold/20' : 'bg-card text-secondary border-border/40 hover:border-primary/30'}`}
                    >
                      {opt.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {userRole === 'captain' && (
                <div className="md:col-span-2 pt-2 border-t border-white/5">
                  <label className="block text-xs font-bold text-secondary uppercase tracking-widest mb-2">
                    Security Lock Date
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="date"
                      value={renameLockedUntilDate || ''}
                      onChange={(e) => setRenameLockedUntilDate(e.target.value || null)}
                      className="flex-1"
                    />
                    {renameLockedUntilDate && (
                      <button 
                        onClick={() => setRenameLockedUntilDate(null)}
                        className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-all"
                        title="Remove Lock"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Category Management */}
          <div className="bg-card/40 border border-border/40 rounded-2xl p-5 space-y-4 transition-all hover:border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-gold/10 rounded-lg">
                <Layers className="w-4 h-4 text-gold" />
              </div>
              <h4 className="text-sm font-bold text-primary uppercase tracking-tight">Manage Categories</h4>
            </div>
            
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Sales, Purchase, Old Gold..."
                value={editCategoryInputValue}
                onChange={(e) => setEditCategoryInputValue(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editCategoryInputValue.trim() && !editCategories.includes(editCategoryInputValue.trim())) {
                      setEditCategories([...editCategories, editCategoryInputValue.trim()]);
                      setEditCategoryInputValue('');
                    }
                  }
                }}
              />
              <Button
                variant="secondary"
                className="px-4 shrink-0"
                onClick={() => {
                  if (editCategoryInputValue.trim() && !editCategories.includes(editCategoryInputValue.trim())) {
                    setEditCategories([...editCategories, editCategoryInputValue.trim()]);
                    setEditCategoryInputValue('');
                  }
                }}
                disabled={!editCategoryInputValue.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            {editCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {editCategories.map((cat, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gold/5 border border-primary/20 rounded-xl text-primary text-xs font-medium group transition-all hover:border-primary/40">
                    {cat}
                    <button
                      onClick={() => setEditCategories(editCategories.filter((_, i) => i !== idx))}
                      className="text-secondary hover:text-red-500 ml-0.5 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-black/10 rounded-xl border border-dashed border-border/50">
                <p className="text-[10px] text-secondary uppercase font-bold tracking-widest">No categories defined</p>
              </div>
            )}
          </div>

          {/* Section 3: Custom Columns */}
          <div className="bg-card/40 border border-border/40 rounded-2xl p-5 space-y-4 transition-all hover:border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <Plus className="w-4 h-4 text-blue-400" />
              </div>
              <h4 className="text-sm font-bold text-primary uppercase tracking-tight">Custom Columns</h4>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Column Name (e.g. Person, Box No...)"
                value={newCustomFieldEditValue}
                onChange={(e) => setNewCustomFieldEditValue(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newCustomFieldEditValue.trim() && !editCustomFields.some(f => f.name === newCustomFieldEditValue.trim())) {
                      setEditCustomFields([...editCustomFields, { name: newCustomFieldEditValue.trim(), type: 'text', is_mandatory: false }]);
                      setNewCustomFieldEditValue('');
                    }
                  }
                }}
              />
              <Button
                variant="secondary"
                className="px-4 shrink-0"
                onClick={() => {
                  if (newCustomFieldEditValue.trim() && !editCustomFields.some(f => f.name === newCustomFieldEditValue.trim())) {
                    setEditCustomFields([...editCustomFields, { name: newCustomFieldEditValue.trim(), type: 'text', is_mandatory: false }]);
                    setNewCustomFieldEditValue('');
                  }
                }}
                disabled={!newCustomFieldEditValue.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {editCustomFields.length > 0 ? (
              <div className="overflow-hidden border border-border/20 rounded-xl">
                {/* Desktop Header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 p-3 bg-black/40 text-[10px] font-black text-secondary uppercase tracking-widest border-b border-border/20">
                  <div className="col-span-5">Column Name</div>
                  <div className="col-span-3">Type</div>
                  <div className="col-span-3 text-center">Mandatory</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Field List */}
                <div className="divide-y divide-border/10">
                  {editCustomFields.map((field, idx) => (
                    <div key={idx} className="sm:grid sm:grid-cols-12 sm:gap-4 flex flex-col p-4 sm:p-3 bg-black/20 group hover:bg-black/40 transition-colors">
                      {/* Name - mobile first */}
                      <div className="sm:col-span-5 flex items-center gap-2 mb-3 sm:mb-0">
                        <div className="w-1 h-4 bg-gold rounded-full hidden sm:block" />
                        <span className="text-sm font-bold text-primary truncate">{field.name}</span>
                        <span className="sm:hidden ml-auto text-[8px] font-black bg-gold/10 text-gold px-2 py-0.5 rounded-full uppercase">Field {idx + 1}</span>
                      </div>

                      {/* Type Select */}
                      <div className="sm:col-span-3 mb-4 sm:mb-0">
                        <div className="sm:hidden text-[9px] font-bold text-secondary uppercase mb-1">Field Type</div>
                        <select
                          className="w-full bg-card border border-border/40 rounded-lg px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-primary/50"
                          value={field.type}
                          onChange={(e) => {
                            const updated = [...editCustomFields];
                            updated[idx] = { ...updated[idx], type: e.target.value as 'text' | 'number' };
                            setEditCustomFields(updated);
                          }}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                        </select>
                      </div>

                      {/* Mandatory Toggle */}
                      <div className="sm:col-span-3 flex items-center justify-between sm:justify-center gap-3">
                        <span className="sm:hidden text-[9px] font-bold text-secondary uppercase">Mandatory</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={field.is_mandatory}
                            onChange={(e) => {
                              const updated = [...editCustomFields];
                              updated[idx] = { ...updated[idx], is_mandatory: e.target.checked };
                              setEditCustomFields(updated);
                            }}
                          />
                          <div className="w-11 h-6 bg-card border border-border/50 rounded-full peer peer-focus:ring-2 peer-focus:ring-gold peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold transition-all"></div>
                        </label>
                      </div>

                      {/* Remove Button */}
                      <div className="sm:col-span-1 flex justify-end items-center mt-3 sm:mt-0 pt-3 sm:pt-0 border-t border-border/5 sm:border-0">
                        <button
                          onClick={() => setEditCustomFields(editCustomFields.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Remove Column"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Options Entry (always visible if choices exist) */}
                      <div className="sm:col-span-12 mt-2 pt-2 border-t border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-60">Predefined Choices</p>
                          <p className="text-[8px] text-secondary/40 italic">Optional: specific values to select from</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="bg-black/20 border border-border/50 rounded-xl px-3 py-1.5 text-xs text-primary focus:outline-none focus:border-primary/50 flex-1"
                            placeholder="Add choice..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val && !(field.values || []).includes(val)) {
                                  const updated = [...editCustomFields];
                                  updated[idx] = { ...updated[idx], values: [...(updated[idx].values || []), val] };
                                  setEditCustomFields(updated);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>
                        {(field.values || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(field.values || []).map((v, vi) => (
                              <span key={vi} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-secondary group-hover:border-primary/20">
                                {v}
                                <button
                                  onClick={() => {
                                    const updated = [...editCustomFields];
                                    updated[idx] = { ...updated[idx], values: (updated[idx].values || []).filter((_, i) => i !== vi) };
                                    setEditCustomFields(updated);
                                  }}
                                  className="text-red-400 hover:text-red-500 ml-1 leading-none"
                                >&times;</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 bg-black/10 rounded-xl border border-dashed border-border/40">
                <Plus className="w-8 h-8 text-secondary/30 mx-auto mb-2" />
                <p className="text-[10px] text-secondary uppercase font-bold tracking-widest">No custom columns added</p>
              </div>
            )}
          </div>

          {/* Color Picker with Preview */}
          <div className="space-y-4 pt-4 border-t border-border/20">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Ledger Accent Color</label>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: renameColor }} />
                <span className="text-xs font-mono text-secondary uppercase font-bold">{renameColor}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2 flex-1">
                {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setRenameColor(color); }}
                    className={`w-7 h-7 rounded-lg transition-all relative ${renameColor === color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-[#1a1a1a]' : 'opacity-40 hover:opacity-100'}`}
                    style={{ background: color }}
                    title={color}
                    aria-label={`Color ${color}`}
                  />
                ))}
               <div className="relative group flex items-center">
                <input
                  type="color"
                  value={renameColor}
                  onChange={(e) => { triggerHaptic('light'); setRenameColor(e.target.value); }}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-card border border-border overflow-hidden"
                />
              </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/30">
            <Button
              variant="secondary"
              onClick={() => {
                setIsRenameModalOpen(false);
                setSelectedLedgerForRename(null);
              }}
              className="flex-1 font-bold text-sm"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRenameLedger}
              loading={renaming}
              disabled={!renameValue.trim()}
              className="flex-1 font-bold text-sm"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isAccessModalOpen && (
        <Modal
          isOpen={isAccessModalOpen}
          onClose={() => setIsAccessModalOpen(false)}
          title="Manage Ledger Access"
        >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-secondary mb-4">
            Select team members who should have access to <strong>{selectedLedgerForAccess?.name}</strong>.
            Captains, Vice Captains, and members with explicit Book access inherently have access to all nested ledgers.
          </p>

          <div className="space-y-4">
            {businessMembers.map((member) => {
              // Captains and Vice Captains always have access, disable toggle
              const isSuperUser = ['captain', 'vice_captain'].includes(member.role);
              const hasExplicitAccess = ledgerMembers.includes(member.user_id);
              const hasAccess = isSuperUser || hasExplicitAccess;

              return (
                <div key={member.user_id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {member.profiles.full_name || member.profiles.email}
                    </p>
                    <p className="text-xs text-secondary capitalize">{member.role.replace('_', ' ')}</p>
                  </div>
                  <button
                    onClick={() => !isSuperUser && toggleLedgerAccess(member.user_id)}
                    disabled={isSuperUser}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasAccess ? 'bg-gold' : 'bg-secondary'
                      } ${isSuperUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasAccess ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>
              );
            })}

            {businessMembers.length === 0 && (
              <p className="text-center text-sm text-secondary py-4">No other members in this business.</p>
            )}
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate(`/business/${businessId}/team`)}
              className="w-full text-blue-500 border-blue-500/20 hover:bg-blue-500/10 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite or Remove Members
            </Button>
            <Button variant="primary" onClick={() => setIsAccessModalOpen(false)} className="w-full">
              Done
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isMoveModalOpen && (
        <Modal
          isOpen={isMoveModalOpen}
          onClose={() => setIsMoveModalOpen(false)}
          title="Move Ledger"
        >
        <div className="space-y-4">
          <p className="text-secondary text-sm">
            Select the book you want to move <strong className="text-primary">{selectedLedgerForMove?.name}</strong> to.
            All transactions and settings will be moved as well.
          </p>
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Target Book</label>
            <select
              className="input-dark"
              value={targetBookId}
              onChange={(e) => setTargetBookId(e.target.value)}
            >
              <option value="">Select a book</option>
              {availableBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.id === bookId ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-6 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setIsMoveModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!selectedLedgerForMove || !targetBookId || targetBookId === bookId) return;
                setMoving(true);
                try {
                  await dataService.updateLedger(selectedLedgerForMove.id, { book_id: targetBookId });
                  setIsMoveModalOpen(false);
                  loadLedgers();
                } catch (err) {
                  if (import.meta.env.DEV) console.error('Error moving ledger:', err);
                  toast.error('Failed to move ledger');
                } finally {
                  setMoving(false);
                }
              }}
              loading={moving}
              disabled={!targetBookId || targetBookId === bookId}
              className="flex-1"
            >
              Move Ledger
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isRecycleBinOpen && (
        <RecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          businessId={businessId!}
          onRefresh={() => {
            loadLedgers();
            loadDeletedCount();
          }}
        />
      )}
    </Layout>
  );
}
