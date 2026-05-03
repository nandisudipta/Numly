import { useState, useEffect, useRef } from 'react';
import { triggerHaptic } from '../utils/haptics';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Trash2, Edit2, LayoutGrid, List, Book as BookIcon, BookOpen, Users, Settings, ArrowUp, ArrowDown, UserPlus, ArrowRightLeft } from 'lucide-react';
import { logAudit } from '../services/auditLogger';
import { RecycleBin } from '../components/RecycleBin';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';

interface BookTotals {
  INR: { in: number; out: number; balance: number };
  gm: { in: number; out: number; balance: number };
  pcs: { in: number; out: number; balance: number };
}

interface Book {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  ledger_count?: number;
  totals?: BookTotals;
  position?: number;
  color?: string;
}
interface BusinessRole {
  id: string;
  name: string;
  user_role: string;
}

interface MemberWithProfile {
  user_id: string;
  role: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | {
    full_name: string | null;
    email: string;
  }[] | null;
}

export function BooksList() {
  const navigate = useNavigate();
  const { businessId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [businessName, setBusinessName] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookDescription, setNewBookDescription] = useState('');
  const [newBookColor, setNewBookColor] = useState('#3B82F6');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('booksViewMode') as 'grid' | 'list') || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'oldest' | 'ledgers'>('newest');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('booksViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 300);
    }
  }, [isCreateModalOpen]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBookForEdit, setSelectedBookForEdit] = useState<Book | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editDescValue, setEditDescValue] = useState('');
  const [editColorValue, setEditColorValue] = useState('#3B82F6');
  const [editing, setEditing] = useState(false);

  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [reorderedBooks, setReorderedBooks] = useState<Book[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [selectedBookForAccess, setSelectedBookForAccess] = useState<Book | null>(null);
  const [businessMembers, setBusinessMembers] = useState<MemberWithProfile[]>([]);
  const [bookMembers, setBookMembers] = useState<string[]>([]);

  const [isMoveBookModalOpen, setIsMoveBookBookModalOpen] = useState(false);
  const [selectedBookForMove, setSelectedBookForMove] = useState<Book | null>(null);
  const [availableBusinesses, setAvailableBusinesses] = useState<BusinessRole[]>([]);
  const [targetBusinessId, setTargetBusinessId] = useState('');
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
  }, [businessId]);

  useEffect(() => {
    if (businessId) {
      loadBusinessInfo();
      loadBooks(true);
      loadAvailableBusinesses();
      loadDeletedCount();
    }
  }, [user, businessId]);

  useEffect(() => {
    const handleSync = () => loadDeletedCount();
    window.addEventListener('entity:soft-deleted', handleSync);
    window.addEventListener('entity:restored', handleSync);
    return () => {
      window.removeEventListener('entity:soft-deleted', handleSync);
      window.removeEventListener('entity:restored', handleSync);
    };
  }, []);

  const loadDeletedCount = async () => {
    try {
      const items = await dataService.getDeletedItems(businessId!);
      setDeletedCount(items.length);
    } catch (err) {
      console.error('Error loading deleted count:', err);
    }
  };

  const loadAvailableBusinesses = async () => {
    try {
      const spaces = await dataService.getSpaces();
      if (isMounted.current) {
        setAvailableBusinesses(spaces.map((s: any) => ({
          id: s.id,
          name: s.name,
          user_role: 'captain' // For purely local offline, user owns spaces
        })));
      }
    } catch (err) {
      console.error('Error loading available businesses:', err);
    }
  };

  const loadBusinessInfo = async () => {
    try {
      const spaces = await dataService.getSpaces();
      const currentSpace = spaces.find(s => s.id === businessId);

      if (currentSpace) {
        setBusinessName(currentSpace.name);
      }

      if (!user) {
        setUserRole('captain');
        return;
      }
      
      // Offline model assumes ownership for un-synced data
      setUserRole('captain');
      loadBusinessMembers();
    } catch (error) {
      console.error('Error loading business info:', error);
    }
  };

  const loadBusinessMembers = async () => {
    setBusinessMembers([]); // Offline behavior skips business_members until sync
  };

  const filteredAndSortedBooks = books
    .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                 (b.description?.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'ledgers') return (b.ledger_count || 0) - (a.ledger_count || 0);
      return 0;
    });

  const loadBooks = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const { books: booksData, ledgers: allLedgers, transactions: allTransactions } = await dataService.getBusinessData(businessId!);
      
      if (!isMounted.current) return;

      const booksWithData = booksData.map((book) => {
        const bookLedgers = (allLedgers || []).filter(l => l.book_id === book.id);
        const totals: BookTotals = {
          INR: { in: 0, out: 0, balance: 0 },
          gm: { in: 0, out: 0, balance: 0 },
          pcs: { in: 0, out: 0, balance: 0 },
        };

        bookLedgers.forEach((ledger: any) => {
          const ledgerTransactions = (allTransactions || []).filter((t: any) => t.ledger_id === ledger.id);
          const unit = (['gm', 'gram'].includes(ledger.unit_type) ? 'gm' : (['pcs', 'pieces'].includes(ledger.unit_type) ? 'pcs' : 'INR')) as keyof BookTotals;
          
          ledgerTransactions.forEach((t: any) => {
            const amount = Number(t.amount);
            if (t.type === 'cash_in') {
              totals[unit].in += amount;
              totals[unit].balance += amount;
            } else {
              totals[unit].out += amount;
              totals[unit].balance -= amount;
            }
          });
        });

        return {
          ...book,
          ledger_count: bookLedgers.length,
          totals,
        };
      });

      setBooks(booksWithData as unknown as Book[]);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleCreateBook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Check if user should sign up first (optional but recommended)
    if (!user && books.length >= 1) {
       dataService.triggerSignup();
       return;
    }

    if (!newBookName.trim()) return;

    // Check for uniqueness
    const isDuplicate = books.some(b => b.name.toLowerCase() === newBookName.trim().toLowerCase());
    if (isDuplicate) {
      setCreateError('A book with this name already exists in this business.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const newBook = await dataService.createBook({
        business_id: businessId!,
        name: newBookName.trim(),
        description: newBookDescription.trim(),
        color: newBookColor
      });

      // Log creation
      if (user) {
        await logAudit(businessId!, user.id, 'CREATE', 'BOOK', newBook.id, {
          new_value: { name: newBookName.trim() }
        });
      }

      setIsCreateModalOpen(false);
      setNewBookName('');
      setNewBookDescription('');
      loadBooks();
    } catch (error: unknown) {
      console.error('Error creating book:', error);
      setCreateError((error as Error).message || 'Failed to create book. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    const now = new Date().toISOString();
    const activeUserId = user?.id || 'offline_user';
    setDeletingBookId(bookId);
    try {
      await dataService.deleteBook(bookId);

      setDeleteConfirm(null);
      
      // Optimistic local state update
      setBooks(prev => prev.filter(b => b.id !== bookId));
      
      // Audit log (non-blocking)
      logAudit(businessId!, activeUserId, 'DELETE', 'BOOK', bookId, {
        new_value: { deleted_at: now, is_deleted: true }
      });

      // Refresh counts and sync
      loadDeletedCount();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error deleting book:', error);
      toast.error(error.message || 'Failed to delete book. Please try again.');
      setDeleteConfirm(null);
    } finally {
      setDeletingBookId(null);
      loadBooks();
    }
  };

  const handleEditBook = async () => {
    if (!editNameValue.trim() || !selectedBookForEdit) return;

    setEditing(true);
    try {
      const updatePayload: any = {
        name: editNameValue.trim(),
        description: editDescValue.trim(),
        color: editColorValue,
      };

      await dataService.updateBook(selectedBookForEdit.id, updatePayload);

      setIsEditModalOpen(false);
      await logAudit(businessId!, user!.id, 'UPDATE', 'BOOK', selectedBookForEdit.id, {
        old_value: selectedBookForEdit,
        new_value: { name: editNameValue }
      });
      setSelectedBookForEdit(null);
      setEditNameValue('');
      setEditDescValue('');
      loadBooks();
    } catch (error) {
      console.error('Error editing book:', error);
    } finally {
      setEditing(false);
    }
  };

  const handleMoveBook = (index: number, direction: 'up' | 'down') => {
    const newBooks = [...reorderedBooks];
    if (direction === 'up' && index > 0) {
      [newBooks[index], newBooks[index - 1]] = [newBooks[index - 1], newBooks[index]];
    } else if (direction === 'down' && index < newBooks.length - 1) {
      [newBooks[index], newBooks[index + 1]] = [newBooks[index + 1], newBooks[index]];
    }
    setReorderedBooks(newBooks);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      for (let i = 0; i < reorderedBooks.length; i++) {
        await dataService.updateBook(reorderedBooks[i].id, { position: i });
      }
      setBooks(reorderedBooks);
      setIsReorderModalOpen(false);
      loadBooks();
    } catch (error) {
      console.error('Error saving order:', error);
    } finally {
      setSavingOrder(false);
    }
  };

  const openAccessModal = async (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBookForAccess(book);
    setIsAccessModalOpen(true);
    // Stub for sync engine logic resolving book_members
    setBookMembers([]);
  };

  const toggleMemberAccess = async (userId: string, isAssigned: boolean) => {
    console.warn(`Membership toggling for ${userId} (${isAssigned}) deferred to hybrid model.`);
  };

  const formatAmount = (amount: number, unit_type: string) => {
    if (unit_type === 'INR') {
      return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (['gram', 'gm'].includes(unit_type)) {
      return `${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gm`;
    } else {
      return `${amount.toLocaleString('en-IN')} pcs`;
    }
  };


  const canDeleteBook = ['captain', 'vice_captain'].includes(userRole);

  return (
    <Layout showBack title={businessName} loading={loading}>
      <div className={`space-y-6 animate-fade-in ${isRefreshing ? 'opacity-70 pointer-events-none' : 'opacity-100'} transition-opacity`}>
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-6 ${books.length === 0 ? 'mb-0' : 'mb-8'}`}>
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] uppercase">Books</h2>
            <p className="text-sm sm:text-base mt-1 text-secondary">Organise your data into logical spaces</p>
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
              placeholder="Search books..."
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
                New Book
              </Button>
            )}

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
                <option value="ledgers">Ledgers</option>
              </select>
            </div>

            {/* View Toggle */}
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

        {books.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-secondary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-primary mb-2">No books yet</h3>
            <p className="text-secondary mb-6">Create your first book by clicking "New Book" above</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredAndSortedBooks.map((book) => {
              const accentHex = book.color || '#3B82F6';
              return (
                <div
                  key={book.id}
                  onClick={() => navigate(`/business/${businessId}/books/${book.id}/ledgers`)}
                  className="group relative cursor-pointer overflow-hidden rounded-[2.5rem] transition-all duration-500 hover:-translate-y-1.5 active:scale-[0.97] flex flex-col min-h-[320px] backdrop-blur-3xl"
                  style={{
                    background: `linear-gradient(165deg, ${accentHex}25, ${accentHex}08)`,
                    border: `1.5px solid ${accentHex}40`,
                    boxShadow: `0 20px 55px -12px ${accentHex}50`,
                  }}
                >
                  {/* Hover wash */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
                    style={{ background: `linear-gradient(145deg, ${accentHex}30, ${accentHex}10)` }}
                  />

                  {/* Colored top bar */}
                  <div
                    className="h-1 w-full"
                    style={{ background: `linear-gradient(90deg, ${accentHex}, ${accentHex}88)` }}
                  />

                  {/* Actions */}
                  {canDeleteBook && (
                    <div className="absolute top-3 right-3 flex gap-1 z-20 transition-all opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedBookForEdit(book); setEditNameValue(book.name); setEditDescValue(book.description || ''); setEditColorValue(book.color || '#3B82F6'); setIsEditModalOpen(true); }}
                        className="p-2 rounded-xl backdrop-blur-md transition-all active:scale-95"
                        style={{ background: `${accentHex}25`, border: `1px solid ${accentHex}50` }}
                      >
                        <Edit2 className="w-4 h-4" style={{ color: accentHex }} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(book.id); }}
                        className="p-2 bg-red-500/20 rounded-xl border border-red-500/40 hover:bg-red-500/30 transition-all active:scale-95"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="flex flex-col items-center pt-5 pb-4 px-5 relative z-[1] flex-1">
                    <div
                      className="p-3.5 rounded-2xl shadow-lg transition-all group-hover:scale-105"
                      style={{ background: `${accentHex}18`, border: `2px solid ${accentHex}50` }}
                    >
                      <BookIcon className="w-8 h-8" style={{ color: accentHex }} />
                    </div>
                    <h3 className="mt-3 text-base font-black text-center leading-tight tracking-tight uppercase" style={{ color: 'var(--text-primary)' }}>
                      {book.name}
                    </h3>
                    {book.description && (
                      <p className="text-[10px] text-center mt-2 font-black uppercase tracking-[0.15em] opacity-70 line-clamp-2 h-6" style={{ color: 'var(--text-secondary)' }}>
                        {book.description}
                      </p>
                    )}
                    <div
                      className="mt-3 px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase"
                      style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)', color: 'var(--badge-text)' }}
                    >
                      {book.ledger_count || 0} {book.ledger_count === 1 ? 'Ledger' : 'Ledgers'}
                    </div>

                    {/* Totals - High-density Organized Layout */}
                    <div className="w-full mt-auto pt-2 space-y-2">
                      {book.totals && (['INR', 'gm', 'pcs'] as const).some(u => book.totals![u].in > 0 || book.totals![u].out > 0) ? (
                        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: `${accentHex}25` }}>
                          {(['INR', 'gm', 'pcs'] as const).map((unit) => {
                            const total = book.totals![unit];
                            if (total.in === 0 && total.out === 0) return null;
                            return (
                              <div key={unit} className="flex items-center justify-between gap-2 animate-fade-in p-1.5 bg-black/10 rounded-xl border border-white/5">
                                <div className="flex flex-col">
                                  <span className="font-black uppercase tracking-widest text-[8px]" style={{ color: 'var(--text-label)' }}>
                                    {unit === 'INR' ? 'Cash' : unit === 'gm' ? 'Weight' : 'Pcs'}
                                  </span>
                                  <span className={`text-[11px] font-black leading-none mt-1 ${total.balance < 0 ? 'text-red-500' : ''}`} style={total.balance < 0 ? {} : { color: accentHex }}>
                                    {formatAmount(total.balance, unit)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-4 text-right">
                                  <div className="flex flex-col">
                                    <span className="text-[7px] font-black uppercase opacity-60" style={{ color: 'var(--text-secondary)' }}>In</span>
                                    <span className="text-[10px] font-black leading-none mt-0.5 text-emerald-500">
                                      {formatAmount(total.in, unit).replace(/[₹\sgm|pcs]/g, '')}
                                    </span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[7px] font-black uppercase opacity-60" style={{ color: 'var(--text-secondary)' }}>Out</span>
                                    <span className="text-[10px] font-black leading-none mt-0.5 text-red-500">
                                      {formatAmount(total.out, unit).replace(/[₹\sgm|pcs]/g, '')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-20 border-t border-dashed" style={{ borderColor: `${accentHex}25` }}>
                          <div className="w-1.5 h-1.5 rounded-full bg-current mb-2" />
                          <span className="text-[8px] font-black uppercase tracking-widest">No Activity Records</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedBooks.map((book) => {
              const accentHex = book.color || '#3B82F6';
              return (
                <div
                  key={book.id}
                  onClick={() => navigate(`/business/${businessId}/books/${book.id}/ledgers`)}
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
                        <BookIcon className="w-5 h-5" style={{ color: accentHex }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary, #fff)' }}>
                          {book.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                          {book.ledger_count || 0} {book.ledger_count === 1 ? 'ledger' : 'ledgers'}
                        </p>
                          {book.totals && (['INR', 'gm', 'pcs'] as const).some(u => book.totals![u].in > 0 || book.totals![u].out > 0) && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 lg:hidden">
                              {(['INR', 'gm', 'pcs'] as const).map((unit) => {
                                const total = book.totals![unit];
                                if (total.in === 0 && total.out === 0) return null;
                                return (
                                  <span key={unit} className="text-[10px] font-bold whitespace-nowrap" style={{ color: (total.balance || 0) >= 0 ? accentHex : '#EF4444' }}>
                                    {unit === 'INR' ? '₹' : unit === 'gm' ? 'gm' : 'pcs'} {formatAmount(total.balance, unit).replace('₹','').replace(' gm','').replace(' pcs','')}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {book.totals && (
                      <div className="hidden lg:flex gap-6 px-4 shrink-0">
                        {(['INR', 'gm', 'pcs'] as const).map((unit) => {
                          const total = book.totals![unit];
                          if (total.in === 0 && total.out === 0) return null;
                          return (
                            <div key={unit} className="text-right whitespace-nowrap">
                              <p className="text-[10px] uppercase font-bold tracking-wider mb-0.5" style={{ color: 'var(--text-secondary, #888)' }}>
                                {unit === 'INR' ? '₹ INR' : unit === 'gm' ? 'Gram' : 'Pieces'}
                              </p>
                              <p className="text-sm font-bold" style={{ color: (total.balance >= 0) ? accentHex : '#EF4444' }}>
                                {formatAmount(total.balance, unit)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-3 shrink-0">
                      {canDeleteBook && (
                        <div className="flex transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBookForEdit(book);
                              setEditNameValue(book.name);
                              setEditDescValue(book.description || '');
                              setIsEditModalOpen(true);
                            }}
                            className="p-1.5 transition-colors"
                            style={{ color: 'var(--text-secondary, #888)' }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBookForMove(book);
                            setTargetBusinessId(businessId || '');
                            setIsMoveBookBookModalOpen(true);
                          }}
                          className="p-1.5 text-secondary hover:text-gold transition-colors"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => openAccessModal(book, e)}
                          className="p-1.5 text-secondary hover:text-gold transition-colors"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(book.id);
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

        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => navigate(`/business/${businessId}/team`)}
          >
            <Settings className="w-5 h-5" />
            Manage Team
          </Button>
        </div>
      </div>

      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setCreateError(null);
          }}
          title="Create New Book"
          footer={
            <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateError(null);
              }}
              disabled={creating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              form="create-book-form"
              type="submit"
              variant="primary"
              loading={creating}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        }
      >
        <form id="create-book-form" onSubmit={handleCreateBook} className="space-y-4">
          <Input
            ref={nameInputRef}
            label="Book Name"
            placeholder="e.g. Sales, Inventory, Personal"
            value={newBookName}
            onChange={(e) => setNewBookName(e.target.value)}
            maxLength={80}
            disabled={creating}
            required
            autoComplete="off"
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Book Accent Color</label>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: newBookColor }} />
                <span className="text-[10px] font-mono text-secondary uppercase font-bold">{newBookColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2 flex-1">
                {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setNewBookColor(color); }}
                    className={`w-7 h-7 rounded-lg transition-all relative ${newBookColor === color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-[#1a1a1a]' : 'opacity-40 hover:opacity-100'}`}
                    style={{ background: color }}
                    title={color}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
              <div className="relative group flex items-center">
                <input
                  type="color"
                  value={newBookColor}
                  onChange={(e) => { triggerHaptic('light'); setNewBookColor(e.target.value); }}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-card border border-border overflow-hidden"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary mb-2">Description (Optional)</label>
            <textarea
              value={newBookDescription}
              onChange={(e) => setNewBookDescription(e.target.value)}
              disabled={creating}
              maxLength={500}
              className="input-dark resize-none w-full h-24"
              placeholder="Brief purpose of this book..."
            />
          </div>

          {createError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
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
          title="Delete Book"
          size="sm"
        >
        <div className="space-y-4">
          <p className="text-primary">
            Are you sure you want to delete this book? This will also delete all ledgers and transactions within it. This action cannot be undone.
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
              onClick={() => deleteConfirm && handleDeleteBook(deleteConfirm)}
              loading={deletingBookId !== null}
              className="flex-1"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedBookForEdit(null);
            setEditNameValue('');
            setEditDescValue('');
          }}
          title="Edit Book"
        >
        <div className="space-y-4">
          <Input
            label="Book Name"
            placeholder="e.g., Daily Cash, Gold Stock"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            maxLength={80}
          />
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              Description (optional)
            </label>
            <textarea
              className="input-dark resize-none w-full"
              rows={3}
              placeholder="Brief description of this book"
              value={editDescValue}
              onChange={(e) => setEditDescValue(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Book Accent Color</label>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: editColorValue }} />
                <span className="text-[10px] font-mono text-secondary uppercase font-bold">{editColorValue}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-2 flex-1">
                {['#28C7D0', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#3B82F6', '#D9E34B', '#14B8A6'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setEditColorValue(color); }}
                    className={`w-7 h-7 rounded-lg transition-all relative ${editColorValue === color ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-[#1a1a1a]' : 'opacity-40 hover:opacity-100'}`}
                    style={{ background: color }}
                    title={color}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
              <div className="relative group flex items-center">
                <input
                  type="color"
                  value={editColorValue}
                  onChange={(e) => { triggerHaptic('light'); setEditColorValue(e.target.value); }}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-card border border-border overflow-hidden"
                />
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-border flex justify-between items-center">
            <button
              onClick={() => {
                setIsEditModalOpen(false);
                setDeleteConfirm(selectedBookForEdit?.id || null);
              }}
              className="text-red-500 hover:text-red-400 text-sm font-medium flex items-center gap-1.5 transition-colors p-2 hover:bg-red-500/10 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Delete Book
            </button>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEditBook}
                loading={editing}
                disabled={!editNameValue.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      )}

      {isReorderModalOpen && (
        <Modal
          isOpen={isReorderModalOpen}
          onClose={() => setIsReorderModalOpen(false)}
          title="Sort Books"
        >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {reorderedBooks.map((book, index) => (
            <div key={book.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">{book.name}</p>
                {book.description && <p className="text-xs text-secondary truncate">{book.description}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMoveBook(index, 'up')}
                  disabled={index === 0}
                  className="p-1 hover:bg-gold/10 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowUp className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => handleMoveBook(index, 'down')}
                  disabled={index === reorderedBooks.length - 1}
                  className="p-1 hover:bg-gold/10 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowDown className="w-4 h-4 text-primary" />
                </button>
              </div>
            </div>
          ))}
          {reorderedBooks.length === 0 && (
            <p className="text-center text-sm text-secondary py-4">No books to reorder.</p>
          )}
          <div className="pt-4 flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsReorderModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveOrder}
              loading={savingOrder}
              disabled={reorderedBooks.length === 0}
              className="flex-1"
            >
              Save Order
            </Button>
          </div>
        </div>
      </Modal>
      )}

      {isAccessModalOpen && (
        <Modal
          isOpen={isAccessModalOpen}
          onClose={() => setIsAccessModalOpen(false)}
          title={`Access: ${selectedBookForAccess?.name}`}
        >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-secondary">
            Captains and Vice Captains always have access to all books. Select which specific team members should have access to this book.
          </p>
          <div className="space-y-2">
            {businessMembers.map((member) => {
              const isAdmin = member.role === 'captain' || member.role === 'vice_captain';
              const isAssigned = isAdmin || bookMembers.includes(member.user_id);
              const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;

              return (
                <div key={member.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
                  <input
                    type="checkbox"
                    checked={isAssigned}
                    disabled={isAdmin}
                    onChange={() => toggleMemberAccess(member.user_id, isAssigned)}
                    className="w-5 h-5 rounded border-border text-gold focus:ring-gold disabled:opacity-50"
                  />
                  <div>
                    <p className="text-sm font-semibold text-primary flex items-center gap-2">
                      {profile?.full_name || member.user_id}
                      <span className="text-[10px] text-secondary uppercase px-2 py-0.5 bg-[#333333] rounded-full inline-block">
                        {member.role.replace('_', ' ')}
                      </span>
                    </p>
                    <p className="text-xs text-secondary">{profile?.email}</p>
                  </div>
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

      {isMoveBookModalOpen && (
        <Modal
          isOpen={isMoveBookModalOpen}
          onClose={() => setIsMoveBookBookModalOpen(false)}
          title="Move Book"
        >
        <div className="space-y-4">
          <p className="text-secondary text-sm">
            Select the business you want to move <strong className="text-primary">{selectedBookForMove?.name}</strong> to.
            All ledgers and transactions within this book will be moved.
          </p>
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Target Business</label>
            <select
              className="input-dark"
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
            >
              <option value="">Select a business</option>
              {availableBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.id === businessId ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-6 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setIsMoveBookBookModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!selectedBookForMove || !targetBusinessId || targetBusinessId === businessId) return;
                try {
                  await dataService.updateBook(selectedBookForMove.id, { business_id: targetBusinessId });
                  
                  // Move children ledgers offline via Dexie
                  const ledgers = await dataService.getLedgers(selectedBookForMove.id);
                  for (const l of ledgers) {
                    await dataService.updateLedger(l.id, { business_id: targetBusinessId });
                    const txs = await dataService.getTransactions(l.id);
                    for (const t of txs) {
                      await dataService.updateTransaction(t.id, { business_id: targetBusinessId });
                    }
                  }
                  
                  setIsMoveBookBookModalOpen(false);
                  loadBooks();
                } catch (err) {
                  if (import.meta.env.DEV) console.error('Error moving book:', err);
                  toast.error('Failed to move book');
                } finally {
                  setMoving(false);
                }
              }}
              loading={moving}
              disabled={!targetBusinessId || targetBusinessId === businessId}
              className="flex-1"
            >
              Move Book
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
          onRefresh={() => loadBooks()}
        />
      )}
    </Layout>
  );
}
