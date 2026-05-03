import { useState, useEffect, useRef, memo, useMemo, useDeferredValue, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Minus, TrendingUp, TrendingDown, IndianRupee, Calendar, User, Paperclip, FileText, Scale, Package, Pencil, Filter, Trash2 } from 'lucide-react';
import { safeEvaluate } from '../utils/mathEngine';
import { logAudit } from '../services/auditLogger';
import { dataService } from '../core';
import { useTransactionEngine } from '../hooks/useTransactionEngine';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../database/supabase';


interface Transaction {
  id: string;
  amount: number;
  type: 'cash_in' | 'cash_out';
  category: string | null;
  note: string | null;
  attachment_url: string | null;
  transaction_date: string;
  custom_fields_data?: Record<string, unknown>;
  created_at: string;
  created_by: string;
  is_deleted: boolean;
  profiles?: {
    full_name: string | null;
    email: string;
  };
  status?: 'approved' | 'pending_checker' | 'rejected';
}

interface CustomFieldConfig {
  name: string;
  is_mandatory: boolean;
  values?: string[];
}

interface Ledger {
  id: string;
  book_id: string;
  business_id: string;
  name: string;
  unit_type: 'INR' | 'gm' | 'pcs';
  categories?: string[] | null;
  decimal_precision: number;
  decimal_rule: 'entry' | 'ledger';
  category_required: boolean;
  custom_fields_config: CustomFieldConfig[];
  restrict_backdated_entries: 'always' | 'never' | 'one_day';
  ledger_locked_until_date: string | null;
}

const TransactionItem = memo(({ 
  transaction, 
  ledger, 
  userRole, 
  handleEditTransaction,
  formatAmount,
  formatDate,
  deletingTransactionId,
  setIsDeleteModalOpen,
  setTransactionToDelete
}: { 
  transaction: Transaction; 
  ledger: Ledger; 
  userRole: string;
  handleEditTransaction: (t: Transaction) => void;
  formatAmount: (amount: number, l: Ledger) => string;
  formatDate: (d: string) => string;
  deletingTransactionId: string | null;
  setIsDeleteModalOpen: (open: boolean) => void;
  setTransactionToDelete: (t: Transaction | null) => void;
}) => {
  const isDeleting = transaction.id === deletingTransactionId;
  return (
  <Card
    key={transaction.id}
    variant="dark"
    className={`group relative border-l-4 overflow-hidden transition-all hover:translate-x-1 ${isDeleting ? 'opacity-40 grayscale pointer-events-none' : ''}`}
    style={{ borderLeftColor: transaction.type === 'cash_in' ? 'var(--tx-in)' : 'var(--tx-out)' }}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span
              className="text-xl font-black"
              style={{ color: transaction.type === 'cash_in' ? 'var(--tx-in)' : 'var(--tx-out)' }}
            >
              {transaction.type === 'cash_in' ? '+' : '-'}
              {formatAmount(Number(transaction.amount), ledger)}
            </span>
            {transaction.category && (
              <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-secondary font-bold uppercase tracking-tight">
                {transaction.category}
              </span>
            )}
          </div>

          {['captain', 'vice_captain', 'team_member', 'data_entry'].includes(userRole) && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditTransaction(transaction);
                }}
                className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors text-secondary hover:text-primary"
                title="Edit Entry"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeleteModalOpen(true);
                  setTransactionToDelete(transaction);
                }}
                className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-secondary hover:text-red-500"
                title="Delete Entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {transaction.note && (
          <p className="text-primary text-sm leading-relaxed max-w-2xl">
            {transaction.note}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-[10px] text-secondary font-medium">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(transaction.transaction_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{transaction.profiles?.full_name || transaction.profiles?.email || 'System'}</span>
          </div>
          {transaction.attachment_url && (
            <a
              href={transaction.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline decoration-gold/50"
              onClick={(e) => e.stopPropagation()}
            >
              <Paperclip className="w-3 h-3" />
              <span>View Attachment</span>
            </a>
          )}
        </div>

        {transaction.custom_fields_data && Object.keys(transaction.custom_fields_data).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(transaction.custom_fields_data).map(([label, value]) => (
              <div key={label} className="bg-white/5 px-2 py-1 rounded-md border border-border/50 text-[10px]">
                <span className="text-secondary mr-1">{label}:</span>
                <span className="text-primary font-bold">{value as string}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </Card>
);
});

TransactionItem.displayName = 'TransactionItem';

export function LedgerDetail() {
  const { businessId, ledgerId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [pageError, setPageError] = useState<string | null>(null);
  
  const {
    transactions,
    balance: { in: cashIn, out: cashOut, total: balance },
    isSubmitting: creating,
    error: engineError,
    processTransaction,
    getSmartDefaults,
    applyOptimisticDelete,
    applyOptimisticUpdate,
    hydrateTransactions
  } = useTransactionEngine(ledger, []);

  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amount, setAmount] = useState('');
  const [displayAmount, setDisplayAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, string>>({});
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  // Filtering states
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'cash_in' | 'cash_out'>('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const getLocalDatetimePattern = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const [transactionDate, setTransactionDate] = useState(getLocalDatetimePattern());
  const [attachment, setAttachment] = useState<File | null>(null);

  // Defer filter query to keep typing interaction instant 
  const deferredFilterQuery = useDeferredValue(filterQuery);


  useEffect(() => {
    if (businessId && ledgerId) {
      loadLedgerInfo();
      loadUserRole();
      loadTransactions(true);
    }
  }, [user, businessId, ledgerId]);

  useEffect(() => {
    if (!user || !ledgerId) return;

    // Offline mode: real-time channels are deferred. Local state powers UI.
    return () => {};
  }, [ledgerId, user]);

  const loadUserRole = async () => {
    if (!user || !businessId) {
      setUserRole('viewer');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        setUserRole('viewer');
        return;
      }
      setUserRole(data.role || 'viewer');
    } catch {
      setUserRole('viewer');
    }
  };

  const loadLedgerInfo = async () => {
    try {
      const data = await dataService.getLedger(ledgerId!);
      
      if (!data) throw new Error('Ledger not found');

      if (!isMounted.current) return;

      setLedger(data as unknown as Ledger);
    } catch (error: unknown) {
      console.error('Error loading ledger:', error);
      if (isMounted.current) {
        setPageError((error as Error)?.message || 'Failed to load ledger information.');
      }
    }
  };

  const loadTransactions = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const txData = await dataService.getTransactions(ledgerId!);

      if (!isMounted.current) return;

      hydrateTransactions(txData);
      setPageError(null);
    } catch (err: any) {
      console.error('Error loading transactions:', err);
      if (isMounted.current) {
        setPageError(err?.message || 'Failed to load transaction history.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleAmountChange = (val: string) => {
    // Only allow digits, decimals, and operators
    const sanitized = val.replace(/[^0-9.+-/*%()\s]/g, '');
    setDisplayAmount(sanitized);
    
    if (!sanitized.trim()) {
      setAmount('0');
      setCalcError(null);
      return;
    }

    const evaluated = safeEvaluate(sanitized);
    if (evaluated !== null) {
      // Check maximum digits before decimal
      const parts = evaluated.toString().split('.');
      if (parts[0].length > 16) {
        setCalcError('Maximum 16 digits allowed before decimal');
        return;
      }
      setAmount(evaluated.toString());
      setCalcError(null);
    } else {
      // Don't set amount if it's an intermediate state like "10+"
      // But if it's clearly invalid, we can show an error
      if (sanitized.length > 0 && !/[+-/*%()]$/.test(sanitized)) {
        // Only set error if it seems like a finished but invalid expression
      }
    }
  };
  const handleCreateClick = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }

    if (ledger?.category_required && !category.trim()) {
      toast.error('Category is required for this ledger.');
      return;
    }

    // Enforce mandatory custom fields
    const mandatoryFields = (ledger?.custom_fields_config || []).filter((f) => f.is_mandatory);
    for (const f of mandatoryFields) {
      const val = customFieldsData?.[f.name];
      if (typeof val !== 'string' || !val.trim()) {
        toast.error(`${f.name} is required.`);
        return;
      }
    }

    // Enforce decimal precision
    const precision = ledger?.decimal_precision ?? 2;
    const amtStr = String(amount);
    const dot = amtStr.indexOf('.');
    if (dot !== -1 && amtStr.length - dot - 1 > precision) {
      toast.error(`Amount can have at most ${precision} decimal place${precision === 1 ? '' : 's'}.`);
      return;
    }

    // Enforce backdated-entry restriction
    if (ledger?.restrict_backdated_entries && ledger.restrict_backdated_entries !== 'never') {
      const tx = new Date(transactionDate);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (ledger.restrict_backdated_entries === 'always' && tx < startOfToday) {
        toast.error('Backdated entries are not allowed in this ledger.');
        return;
      }
      if (ledger.restrict_backdated_entries === 'one_day') {
        const yesterday = new Date(startOfToday);
        yesterday.setDate(yesterday.getDate() - 1);
        if (tx < yesterday) {
          toast.error('Only today and yesterday entries are allowed.');
          return;
        }
      }
    }

    // Enforce ledger lock-until-date
    if (ledger?.ledger_locked_until_date) {
      const lockDate = new Date(ledger.ledger_locked_until_date);
      const tx = new Date(transactionDate);
      if (tx < lockDate) {
        toast.error(`This ledger is locked for entries before ${lockDate.toLocaleDateString()}.`);
        return;
      }
    }

    if (editingTransaction) {
      const evaluated = safeEvaluate(displayAmount);
      if (evaluated === null) {
        setCalcError('Invalid calculation');
        return;
      }
      executeUpdateTransaction(evaluated);
      return;
    }

    const payload = {
      displayAmount,
      amount,
      type: transactionType,
      category,
      note,
      transaction_date: transactionDate,
      customFieldsData,
    };

    let finalPayload = payload;

    if (attachment && user) {
      const publicUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(attachment);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = e => reject(e);
      });
      finalPayload = { ...payload, attachmentUrl: publicUrl } as any;
    }

    const success = await processTransaction(finalPayload as any, false, undefined);

    if (success) {
      setIsTransactionModalOpen(false);
      resetForm();
    }
  };

  const handleEditTransaction = useCallback((t: Transaction) => {
    setEditingTransaction(t);
    setTransactionType(t.type);
    setDisplayAmount(t.amount.toString());
    setAmount(t.amount.toString());
    setNote(t.note || '');
    setCategory(t.category || '');
    setCustomFieldsData(t.custom_fields_data ? Object.fromEntries(
      Object.entries(t.custom_fields_data).map(([k, v]) => [k, String(v)])
    ) : {});

    const d = new Date(t.transaction_date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setTransactionDate(d.toISOString().slice(0, 16));

    setIsTransactionModalOpen(true);
  }, []);

  const executeUpdateTransaction = async (calculatedAmount: number) => {
    if (!editingTransaction) return;
    try {
      let attachmentUrl = editingTransaction.attachment_url;

      if (attachment) {
        attachmentUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(attachment);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = e => reject(e);
        });
      }

      const patch = {
        amount: calculatedAmount,
        type: transactionType,
        category: category || null,
        note: note || null,
        attachment_url: attachmentUrl,
        transaction_date: new Date(transactionDate).toISOString(),
        custom_fields_data: customFieldsData,
      };

      // Optimistic update — instant UI change before DB write completes
      applyOptimisticUpdate(editingTransaction.id, patch);

      setIsTransactionModalOpen(false);
      resetForm();

      await dataService.updateTransaction(editingTransaction.id, patch);

      await logAudit(businessId!, user!.id, 'UPDATE', 'TRANSACTION', editingTransaction.id, {
        old_value: editingTransaction,
        new_value: { amount: calculatedAmount, type: transactionType, note }
      });
    } catch (error) {
      console.error('Error updating transaction:', error);
      // Re-sync from DB on failure
      loadTransactions();
    }
  };



  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    
    // Deletion Guard: Block if pending_checker
    if (transactionToDelete.status === 'pending_checker') {
      toast.error('Cannot delete a transaction that is currently pending approval.');
      setIsDeleteModalOpen(false);
      setTransactionToDelete(null);
      return;
    }

    const tId = transactionToDelete.id;
    setDeletingTransactionId(tId);
    setIsDeleteModalOpen(false);

    try {
      await dataService.deleteTransaction(tId);

      await logAudit(businessId!, user!.id, 'DELETE', 'TRANSACTION', tId, {
        old_value: transactionToDelete,
        new_value: { is_deleted: true }
      });

      if (isMounted.current) {
        // Optimistic State Update via engine
        applyOptimisticDelete(tId);
        toast.success('Transaction deleted. You can restore it from the recycle bin.');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error deleting transaction:', error);
      toast.error(error.message || 'Failed to delete transaction. Please try again.');
    } finally {
      if (isMounted.current) {
        setDeletingTransactionId(null);
        setTransactionToDelete(null);
        loadTransactions(); // Re-fetch to ensure sync
      }
    }
  };
  const resetForm = () => {
    setAmount('');
    setDisplayAmount('');
    setNote('');
    setCategory('');
    setCustomFieldsData({});
    setAttachment(null);
    setEditingTransaction(null);
    setCalcError(null);
    setTransactionDate(new Date().toISOString().slice(0, 16));
  };

  const amountInputRef = useRef<HTMLInputElement>(null);

  const openTransactionModal = (type: 'cash_in' | 'cash_out') => {
    resetForm();
    const memory = getSmartDefaults();
    setTransactionType(type);
    if (!editingTransaction && memory && memory.lastCategory) {
      setCategory(memory.lastCategory);
    }
    setTransactionDate(getLocalDatetimePattern());
    setIsTransactionModalOpen(true);
    // Focus amount input instantly
    setTimeout(() => {
      amountInputRef.current?.focus();
    }, 10);
  };

  const formatAmount = useCallback((amount: number, ledger: Ledger) => {
    const precision = ledger?.decimal_precision ?? 2;
    const formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });

    if (ledger?.unit_type === 'INR') {
      return `₹${formatted}`;
    } else {
      return `${formatted} ${ledger?.unit_type === 'gm' ? 'gm' : 'pcs'}`;
    }
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const canCreateTransaction = ['captain', 'vice_captain', 'team_member', 'data_entry'].includes(userRole);

  // ---- Derived display variables (must be before early returns due to hook below) ----
  const isCurrency = ledger?.unit_type === 'INR';
  const labelIn = isCurrency ? 'Total Cash In' : 'Total In';
  const labelOut = isCurrency ? 'Total Cash Out' : 'Total Out';
  const buttonIn = isCurrency ? 'Cash In' : 'Add In';
  const buttonOut = isCurrency ? 'Cash Out' : 'Add Out';

  // ---- useMemo MUST be before any early returns ----
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const searchMatch = !deferredFilterQuery || 
        (t.note?.toLowerCase().includes(deferredFilterQuery.toLowerCase())) ||
        (t.category?.toLowerCase().includes(deferredFilterQuery.toLowerCase()));
      const typeMatch = filterType === 'all' || t.type === filterType;
      const amountNum = Number(t.amount);
      const minMatch = !filterMinAmount || amountNum >= Number(filterMinAmount);
      const maxMatch = !filterMaxAmount || amountNum <= Number(filterMaxAmount);
      const tDate = new Date(t.transaction_date);
      const startMatch = !filterDateStart || tDate >= new Date(filterDateStart);
      const endMatch = !filterDateEnd || tDate <= new Date(filterDateEnd);
      return searchMatch && typeMatch && minMatch && maxMatch && startMatch && endMatch;
    });
  }, [transactions, deferredFilterQuery, filterType, filterMinAmount, filterMaxAmount, filterDateStart, filterDateEnd]);

  // ---- Early returns after ALL hooks ----
  if (loading) {
    return (
      <Layout showBack title={ledger?.name || 'Loading...'}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (pageError || !ledger) {
    return (
      <Layout showBack title="Error">
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
          <div className="bg-red-500/10 p-4 rounded-full mb-4">
            <Plus className="w-8 h-8 text-red-500 rotate-45" />
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">Something went wrong</h2>
          <p className="text-secondary text-sm max-w-xs mb-6">
            {pageError || "We couldn't find the ledger you're looking for."}
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Retry Loading
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBack title={ledger?.name || 'Ledger'}>
      <div className={`space-y-6 animate-fade-in ${isRefreshing ? 'opacity-70 pointer-events-none' : 'opacity-100'} transition-opacity pb-24`}>
        {/* Compact Dashboard Stats */}
        {userRole !== 'data_entry' && (
          <Card variant="dark" className="overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border/30">
              <div className="p-4 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] uppercase tracking-wider text-secondary mb-1">{labelIn}</p>
                <div className="flex items-center gap-1.5" style={{ color: 'var(--tx-in)' }}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-sm sm:text-lg font-bold truncate">
                    {formatAmount(cashIn, ledger!)}
                  </span>
                </div>
              </div>
              <div className="p-4 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] uppercase tracking-wider text-secondary mb-1">{labelOut}</p>
                <div className="flex items-center gap-1.5" style={{ color: 'var(--tx-out)' }}>
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span className="text-sm sm:text-lg font-bold truncate">
                    {formatAmount(cashOut, ledger!)}
                  </span>
                </div>
              </div>
              <div className="p-4 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] uppercase tracking-wider text-secondary mb-1">Balance</p>
                <div className={`flex items-center gap-1.5 ${balance >= 0 ? 'text-primary' : 'text-red-500'}`}>
                  {ledger.unit_type === 'gm' ? <Scale className="w-3.5 h-3.5" /> : ledger.unit_type === 'pcs' ? <Package className="w-3.5 h-3.5" /> : <IndianRupee className="w-3.5 h-3.5" />}
                  <span className="text-sm sm:text-lg font-bold truncate">
                    {formatAmount(balance, ledger!)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Main Content Area: Form & History Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Section: Entry Form or Buttons */}
          <div className="lg:col-span-4 space-y-4 sticky top-6">
            {!isTransactionModalOpen ? (
              canCreateTransaction && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="success"
                    size="lg"
                    onClick={() => openTransactionModal('cash_in')}
                    className="w-full flex-col py-6 rounded-2xl border-b-4 border-[#059669]"
                  >
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-sm font-bold uppercase tracking-wide">{buttonIn}</span>
                  </Button>
                  <Button
                    variant="danger"
                    size="lg"
                    onClick={() => openTransactionModal('cash_out')}
                    className="w-full flex-col py-6 rounded-2xl border-b-4 border-[#DC2626]"
                  >
                    <Minus className="w-6 h-6 mb-1" />
                    <span className="text-sm font-bold uppercase tracking-wide">{buttonOut}</span>
                  </Button>
                </div>
              )
            ) : (
              <Card
                variant="dark"
                className="border-t-4 transition-colors"
                style={{ borderTopColor: transactionType === 'cash_in' ? 'var(--tx-in)' : 'var(--tx-out)' }}
              >
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                      {editingTransaction ? (
                        <Pencil className="w-5 h-5 text-primary" />
                      ) : transactionType === 'cash_in' ? (
                        <Plus className="w-5 h-5" style={{ color: 'var(--tx-in)' }} />
                      ) : (
                        <Minus className="w-5 h-5" style={{ color: 'var(--tx-out)' }} />
                      )}
                      {editingTransaction ? 'Edit Entry' : `Add ${transactionType === 'cash_in' ? 'Cash In' : 'Cash Out'}`}
                    </h3>
                    <button
                      onClick={() => setIsTransactionModalOpen(false)}
                      className="text-secondary hover:text-primary p-1"
                    >
                      <span className="text-2xl">&times;</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                      <Input
                        ref={amountInputRef}
                        type="text"
                        label="Amount"
                        placeholder="0.00"
                        value={displayAmount}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        className={`text-lg font-semibold ${calcError ? 'border-red-500 focus:ring-red-500' : ''}`}
                        autoFocus
                        inputMode="text"
                        disabled={creating}
                      />
                      {calcError && (
                        <p className="text-[10px] text-red-500 mt-1 italic">
                          {calcError}
                        </p>
                      )}
                      {displayAmount && !calcError && amount !== displayAmount && (
                        <p className="text-[10px] text-primary mt-1 text-right italic">
                          Calculated: {formatAmount(Number(amount), ledger!)}
                        </p>
                      )}
                    {(() => {
                      const presetCats = (ledger?.categories || []).filter(c => c.trim() !== '');
                      const showField = ledger?.category_required || presetCats.length > 0;
                      if (!showField) return null;
                      return (
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5 ml-1">
                            Category
                            {ledger?.category_required && (
                              <span className="text-[8px] font-bold text-red-500 uppercase">Required</span>
                            )}
                          </label>
                          {presetCats.length > 0 ? (
                            <select
                              className="input-dark text-sm"
                              value={category}
                              onChange={(e) => setCategory(e.target.value)}
                              required={ledger?.category_required}
                              disabled={creating}
                            >
                              <option value="">Select a category</option>
                              {presetCats.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type="text"
                              placeholder="Type a category"
                              value={category}
                              onChange={(e) => setCategory(e.target.value)}
                              maxLength={50}
                              required={ledger?.category_required}
                              disabled={creating}
                            />
                          )}
                        </div>
                      );
                    })()}

                    {ledger?.custom_fields_config && ledger.custom_fields_config.length > 0 && (
                      <div className="space-y-3 pt-2">
                        {ledger.custom_fields_config.map((field) => (
                          <div key={field.name}>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-1.5 ml-1">
                              {field.name}
                              {field.is_mandatory && (
                                <span className="text-[8px] font-bold text-red-500 uppercase">Required</span>
                              )}
                            </label>
                            {field.values && field.values.length > 0 ? (
                              <select
                                className="input-dark text-sm"
                                value={customFieldsData[field.name] || ''}
                                onChange={(e) => setCustomFieldsData({ ...customFieldsData, [field.name]: e.target.value })}
                                required={field.is_mandatory}
                              >
                                <option value="">Select {field.name}</option>
                                {field.values.map((v) => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                placeholder={`Enter ${field.name}`}
                                value={customFieldsData[field.name] || ''}
                                onChange={(e) => setCustomFieldsData({ ...customFieldsData, [field.name]: e.target.value })}
                                className="text-sm"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <Input
                      type="datetime-local"
                      label="Date & Time"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      className="text-sm"
                      disabled={creating}
                    />

                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5 ml-1">
                        Note (optional)
                      </label>
                      <textarea
                        className="input-dark resize-none text-sm"
                        rows={2}
                        placeholder="What is this for?"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        disabled={creating}
                      />
                    </div>

                    <div>
                      <input
                        type="file"
                        id="file-upload"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <label
                        htmlFor="file-upload"
                        className="flex items-center justify-center gap-2 w-full py-2 px-4 border border-dashed border-border rounded-xl cursor-pointer hover:bg-white/5 transition-colors text-xs text-secondary"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {attachment ? attachment.name : 'Upload Attachment'}
                      </label>
                    </div>

                    {engineError && (
                      <div className="pt-2">
                        <p className="text-xs text-red-500 font-medium">
                          {engineError}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => setIsTransactionModalOpen(false)}
                        className="flex-1 text-xs"
                      >
                        Close
                      </Button>
                      <Button
                        variant={transactionType === 'cash_in' ? 'success' : 'danger'}
                        onClick={handleCreateClick}
                        loading={creating}
                        disabled={!amount || Number(amount) <= 0}
                        className="flex-[2] text-xs font-bold"
                      >
                        {editingTransaction ? 'Update' : `Save ${transactionType === 'cash_in' ? 'In' : 'Out'}`}
                      </Button>
                    </div>

                    {editingTransaction && (
                      <div className="pt-2 border-t border-border mt-2">
                        <button
                          onClick={() => {
                            setTransactionToDelete(editingTransaction);
                            setIsDeleteModalOpen(true);
                          }}
                          className="flex items-center justify-center gap-2 w-full py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Transaction
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Section: History List */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-sm font-bold text-secondary uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Transaction History
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFilterVisible(!isFilterVisible)}
                  className={`p-1.5 rounded-lg transition-colors ${isFilterVisible ? 'bg-primary text-[var(--primary-contrast)]' : 'text-secondary hover:text-primary bg-white/5'}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-secondary bg-white/5 px-2 py-1 rounded-full border border-border">
                  {filteredTransactions.length} of {transactions.length} Entries
                </span>
              </div>
            </div>

            {isFilterVisible && (
              <Card variant="dark" className="border-primary/30 bg-primary/5">
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      placeholder="Search note or category..."
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      className="text-xs"
                    />
                    <select
                      className="input-dark text-xs h-10"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as any)}
                    >
                      <option value="all">All Types</option>
                      <option value="cash_in">In Only</option>
                      <option value="cash_out">Out Only</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Input
                      type="date"
                      label="From Date"
                      value={filterDateStart}
                      onChange={(e) => setFilterDateStart(e.target.value)}
                      className="text-[10px]"
                    />
                    <Input
                      type="date"
                      label="To Date"
                      value={filterDateEnd}
                      onChange={(e) => setFilterDateEnd(e.target.value)}
                      className="text-[10px]"
                    />
                    <Input
                      type="number"
                      label="Min Amount"
                      value={filterMinAmount}
                      onChange={(e) => setFilterMinAmount(e.target.value)}
                      className="text-[10px]"
                    />
                    <Input
                      type="number"
                      label="Max Amount"
                      value={filterMaxAmount}
                      onChange={(e) => setFilterMaxAmount(e.target.value)}
                      className="text-[10px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setFilterQuery('');
                        setFilterType('all');
                        setFilterDateStart('');
                        setFilterDateEnd('');
                        setFilterMinAmount('');
                        setFilterMaxAmount('');
                      }}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {filteredTransactions.length === 0 ? (
              <Card variant="dark">
                <div className="text-center py-16 opacity-50">
                  <FileText className="w-12 h-12 mx-auto mb-3" />
                  <p className="text-sm">No transactions match your filters</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    ledger={ledger!}
                    userRole={userRole}
                    handleEditTransaction={handleEditTransaction}
                    formatAmount={formatAmount}
                    formatDate={formatDate}
                    deletingTransactionId={deletingTransactionId}
                    setIsDeleteModalOpen={setIsDeleteModalOpen}
                    setTransactionToDelete={setTransactionToDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 animate-fade-in">
          <Card variant="dark" className="w-full max-w-sm border-red-500/30">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 text-red-500">
                <Trash2 className="w-6 h-6" />
                <h3 className="text-xl font-bold uppercase tracking-tight">Delete Transaction</h3>
              </div>
              
              <p className="text-sm text-secondary leading-relaxed">
                Are you sure you want to delete this entry? 
                This action is permanent and will be logged in the audit history.
              </p>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setTransactionToDelete(null);
                  }} 
                  className="flex-1 text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger" 
                  onClick={handleDeleteTransaction}
                  className="flex-1 text-xs font-bold"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
