import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Trash2, Edit2, LayoutGrid, List, Layers, Plus } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { dataService } from '../core';
import { RecycleBin } from '../components/RecycleBin';


// Modal components
import { CreateLedgerModal } from '../components/modals/CreateLedgerModal';
import { RenameLedgerModal } from '../components/modals/RenameLedgerModal';
import { DeleteLedgerModal } from '../components/modals/DeleteLedgerModal';

interface Ledger {
  id: string;
  name: string;
  unit_type: 'INR' | 'gm' | 'pcs';
  created_at: string;
  balance?: number;
  cash_in?: number;
  cash_out?: number;
  categories?: string[] | null;
  decimal_precision: number;
  decimal_rule: 'entry' | 'ledger';
  category_required: boolean;
  custom_fields_config: any[];
  restrict_backdated_entries: 'always' | 'never' | 'one_day';
  color?: string;
  is_deleted?: boolean;
}

export function LedgersList() {
  const navigate = useNavigate();
  const { businessId, bookId } = useParams();
  const { user } = useAuth();
  const isMounted = useRef(true);

  // Main state
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookName, setBookName] = useState('');

  // View & Filter state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('ledgersViewMode') as 'grid' | 'list') || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'oldest' | 'balance'>('newest');

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);

  // Recycle bin state
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  // Setup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ledgersViewMode', viewMode);
  }, [viewMode]);

  // Load data
  useEffect(() => {
    if (businessId && bookId) {
      loadData();
    }
  }, [user, businessId, bookId]);

  // Global event listener for create modal
  useEffect(() => {
    const handleOpenCreate = () => {
      triggerHaptic('light');
      setIsCreateModalOpen(true);
    };

    window.addEventListener('open-create-modal', handleOpenCreate);
    return () => window.removeEventListener('open-create-modal', handleOpenCreate);
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Load book info
      const booksData = await dataService.getBooks(businessId!);
      const book = booksData.find(b => b.id === bookId);

      if (book && isMounted.current) {
        setBookName(book.name);
      }

      // Load ledgers with balances
      const ledgersData = await dataService.getLedgers(bookId!);

      const ledgersWithBalances = await Promise.all(
        ledgersData.map(async (ledger: any) => {
          const txs = await dataService.getTransactions(ledger.id);
          const cash_in = txs
            .filter((t: any) => t.type === 'cash_in' && !t.is_deleted)
            .reduce((sum: number, t: any) => sum + t.amount, 0);
          const cash_out = txs
            .filter((t: any) => t.type === 'cash_out' && !t.is_deleted)
            .reduce((sum: number, t: any) => sum + t.amount, 0);

          return {
            ...ledger,
            unit_type: (ledger.unit_type || ledger.unit) as any,
            cash_in,
            cash_out,
            balance: cash_in - cash_out,
          };
        })
      );

      if (isMounted.current) {
        setLedgers(ledgersWithBalances);
        setLoadError(null);
      }

      // Load deleted count
      const items = await dataService.getDeletedItems(businessId!);
      if (isMounted.current) {
        setDeletedCount(items.length);
      }
    } catch (error: any) {
      console.error('Error loading ledgers:', error);
      if (isMounted.current) {
        setLoadError(error?.message || 'Failed to load ledgers');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Computed state
  const filteredAndSortedLedgers = ledgers
    .filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'balance') return (b.balance || 0) - (a.balance || 0);
      return 0;
    });

  // Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  const handleCreateSuccess = () => {
    loadData();
  };

  const handleEditClick = (ledger: Ledger) => {
    setSelectedLedger(ledger);
    setIsRenameModalOpen(true);
  };

  const handleDeleteClick = (ledger: Ledger) => {
    setSelectedLedger(ledger);
    setIsDeleteModalOpen(true);
  };

  const handleLedgerClick = (ledger: Ledger) => {
    navigate(`/business/${businessId}/books/${bookId}/ledgers/${ledger.id}`);
  };

  const formatAmount = (amount: number, ledger: Ledger): string => {
    const factor = Math.pow(10, ledger.decimal_precision);
    const formatted = (Math.round(amount * factor) / factor).toFixed(ledger.decimal_precision);

    if (ledger.unit_type === 'INR') return `₹${formatted}`;
    if (ledger.unit_type === 'gm') return `${formatted}g`;
    if (ledger.unit_type === 'pcs') return `${Math.floor(amount)} pcs`;

    return formatted;
  };

  // Loading state
  if (loading) {
    return (
      <Layout title={bookName || 'Loading...'}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border-4 border-gold/20 border-t-gold animate-spin mx-auto" />
            <p className="text-secondary text-sm">Loading ledgers...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={bookName || 'Ledgers'}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
              <Layers className="w-8 h-8" />
              {bookName}
            </h1>
            <p className="text-secondary text-sm mt-1">{ledgers.length} ledger{ledgers.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>

            {deletedCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsRecycleBinOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                Recycle Bin ({deletedCount})
              </Button>
            )}

            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-5 h-5" />
              Create Ledger
            </Button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-3">
          <Input
            type="search"
            placeholder="Search ledgers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-gold/50"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="balance">Balance</option>
            </select>

            <div className="flex gap-1 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-gold/20 text-gold'
                    : 'bg-surface text-secondary hover:text-primary'
                }`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-gold/20 text-gold'
                    : 'bg-surface text-secondary hover:text-primary'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {loadError && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 text-red-500 rounded-xl text-sm">
            {loadError}
          </div>
        )}

        {/* Empty State */}
        {filteredAndSortedLedgers.length === 0 && (
          <div className="text-center py-12">
            <Layers className="w-12 h-12 text-secondary/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-primary mb-2">
              {searchQuery ? 'No ledgers found' : 'No ledgers yet'}
            </h3>
            <p className="text-secondary text-sm">
              {searchQuery
                ? 'Try a different search'
                : 'Create your first ledger to get started'}
            </p>
          </div>
        )}

        {/* Ledgers Grid/List */}
        {filteredAndSortedLedgers.length > 0 && (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-3'
            }
          >
            {filteredAndSortedLedgers.map((ledger) => (
              <div
                key={ledger.id}
                className="card-dark group hover:shadow-lg transition-all cursor-pointer"
                onClick={() => handleLedgerClick(ledger)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-primary text-lg">{ledger.name}</h3>
                    <p className="text-xs text-secondary mt-1">
                      {ledger.unit_type === 'INR' && '₹ Indian Rupee'}
                      {ledger.unit_type === 'gm' && '⚖️ Grams'}
                      {ledger.unit_type === 'pcs' && '📦 Pieces'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(ledger);
                      }}
                      className="p-1.5 hover:bg-primary/10 rounded-lg text-secondary hover:text-primary transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(ledger);
                      }}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-secondary hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Balance Display */}
                <div className="p-3 bg-surface rounded-lg mb-3">
                  <div className="text-xs text-secondary mb-1">Balance</div>
                  <div className="text-2xl font-bold text-primary">
                    {formatAmount(ledger.balance || 0, ledger)}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-green-500/10 rounded text-green-500 text-center">
                    <div>In</div>
                    <div className="font-semibold">{formatAmount(ledger.cash_in || 0, ledger)}</div>
                  </div>
                  <div className="p-2 bg-red-500/10 rounded text-red-500 text-center">
                    <div>Out</div>
                    <div className="font-semibold">{formatAmount(ledger.cash_out || 0, ledger)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateLedgerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        businessId={businessId!}
        bookId={bookId!}
        existingLedgerNames={ledgers.map(l => l.name)}
      />

      <RenameLedgerModal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setSelectedLedger(null);
        }}
        onSuccess={handleCreateSuccess}
        ledger={selectedLedger as any}
      />

      <DeleteLedgerModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedLedger(null);
        }}
        onSuccess={handleCreateSuccess}
        ledgerId={selectedLedger?.id || ''}
        ledgerName={selectedLedger?.name || ''}
        transactionCount={0} // Count transactions if needed
      />

      {/* Recycle Bin */}
      {isRecycleBinOpen && (
        <RecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          onRefresh={handleCreateSuccess}
          businessId={businessId!}
        />
      )}
    </Layout>
  );
}
