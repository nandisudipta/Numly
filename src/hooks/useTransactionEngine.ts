import { useState, useCallback, useMemo, useRef } from 'react';
import { safeEvaluate } from '../utils/mathEngine';
import { dataService } from '../core';

export interface LedgerConfig {
  id: string;
  book_id: string;
  business_id: string;
  category_required: boolean;
  custom_fields_config?: { name: string; is_mandatory: boolean }[];
  restrict_backdated_entries?: 'always' | 'never' | 'one_day';
  ledger_locked_until_date?: string | null;
}

export type TransactionType = 'cash_in' | 'cash_out';

export interface TransactionPayload {
  amount: string;
  displayAmount: string;
  type: TransactionType;
  category: string;
  note: string;
  transaction_date: string;
  customFieldsData: Record<string, string>;
  attachmentUrl?: string | null;
}

interface SmartMemory {
  lastCategory: string;
  lastType: TransactionType;
}

export function useTransactionEngine(ledger: LedgerConfig | null, initialTransactions: any[] = []) {
  const [transactions, setTransactions] = useState<any[]>(initialTransactions);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Instantly calculating states
  const [cashIn, setCashIn] = useState(0);
  const [cashOut, setCashOut] = useState(0);

  // State hydration is executed manually via hydrateTransactions

  const balance = useMemo(() => cashIn - cashOut, [cashIn, cashOut]);

  // Smart defaults and memory
  const getSmartDefaults = useCallback((): SmartMemory => {
    if (!ledger) return { lastCategory: '', lastType: 'cash_in' };
    try {
      const memory = localStorage.getItem(`numly_memory_${ledger.id}`);
      if (memory) {
        return JSON.parse(memory);
      }
    } catch (err) {
      console.warn('Memory engine error', err);
    }
    // Deep fallback to last actual transaction if no local storage
    if (transactions.length > 0) {
      const last = transactions[0];
      return {
        lastCategory: last.category || '',
        lastType: last.type
      };
    }
    return { lastCategory: '', lastType: 'cash_in' };
  }, [ledger, transactions]);

  const saveSmartMemory = (type: TransactionType, category: string) => {
    if (!ledger) return;
    try {
      localStorage.setItem(`numly_memory_${ledger.id}`, JSON.stringify({
        lastCategory: category,
        lastType: type
      }));
    } catch (err) {
      console.warn('Memory engine save failed', err);
    }
  };

  const validateTransaction = (payload: TransactionPayload): string | null => {
    if (!ledger) return 'Ledger config missing';
    
    // Amount validation
    const evaluatedAmount = safeEvaluate(payload.displayAmount);
    if (evaluatedAmount === null || evaluatedAmount <= 0) {
      return 'Please enter a valid amount greater than 0';
    }

    // Category validation
    if (ledger.category_required && !payload.category?.trim()) {
      return 'Category is mandatory for this ledger';
    }

    // Custom Fields validation
    if (ledger.custom_fields_config) {
      for (const field of ledger.custom_fields_config) {
        if (field.is_mandatory && !payload.customFieldsData[field.name]?.trim()) {
          return `Please fill in the mandatory field: ${field.name}`;
        }
      }
    }

    // Lock validation
    if (ledger.ledger_locked_until_date) {
      const lockDate = new Date(ledger.ledger_locked_until_date);
      const selDate = new Date(payload.transaction_date);
      // Let the UI handle captain overrides. Engine strictly respects locks by default
      if (selDate <= lockDate) {
         return `This ledger is locked until ${new Date(ledger.ledger_locked_until_date).toLocaleDateString()}`;
      }
    }

    // Backdate validation
    if (ledger.restrict_backdated_entries && ledger.restrict_backdated_entries !== 'always') {
      const selectedDate = new Date(payload.transaction_date);
      selectedDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((today.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24));

      if (ledger.restrict_backdated_entries === 'never' && diffDays > 0) {
        return 'Backdated entries are not allowed for this ledger.';
      }
      if (ledger.restrict_backdated_entries === 'one_day' && diffDays > 1) {
        return 'Backdated entries are only allowed up to 1 day before today.';
      }
    }

    return null; // Valid
  };

  const processTransaction = async (
    payload: TransactionPayload,
    isEdit: boolean = false,
    existingId?: string,
    onSuccess?: (newTx: any) => void
  ) => {
    if (!ledger) return;

    const validationError = validateTransaction(payload);
    if (validationError) {
      setError(validationError);
      return false;
    }

    const calculatedAmount = safeEvaluate(payload.displayAmount) || 0;
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit && existingId) {
        // ... hook shouldn't handle DB writes for edits directly if bridging to dataService
        // But for a unified engine, we should. In this objective, I'll focus on create logic first.
        throw new Error('Edit not fully implemented in Transaction Engine yet');
      }

      // Record standard entry
      const newTx = await dataService.createTransaction({
        ledger_id: ledger.id,
        business_id: ledger.business_id,
        book_id: ledger.book_id,
        amount: calculatedAmount,
        type: payload.type,
        category: payload.category || null,
        note: payload.note || null,
        attachment_url: payload.attachmentUrl || null,
        transaction_date: new Date(payload.transaction_date).toISOString(),
        custom_fields_data: payload.customFieldsData,
      });

      // Optimistic state update without reloading DB
      setTransactions((prev) => [newTx, ...prev]);
      
      if (payload.type === 'cash_in') {
        setCashIn(prev => prev + calculatedAmount);
      } else {
        setCashOut(prev => prev + calculatedAmount);
      }

      saveSmartMemory(payload.type, payload.category);
      
      if (onSuccess) onSuccess(newTx);
      return true;

    } catch (err: any) {
      console.error('Engine processing failed', err);
      setError(err.message || 'Transaction processing failed');
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const applyOptimisticDelete = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    setTransactions(prev => prev.filter(t => t.id !== txId));
    
    if (tx.type === 'cash_in') {
      setCashIn(prev => prev - Number(tx.amount));
    } else {
      setCashOut(prev => prev - Number(tx.amount));
    }
  };

  const applyOptimisticUpdate = (txId: string, patch: Partial<any>) => {
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...patch } : t));
    // Recompute totals from the updated list
    setTransactions(updated => {
      let inTotal = 0;
      let outTotal = 0;
      updated.forEach(t => {
        if (t.is_deleted) return;
        if (t.type === 'cash_in') inTotal += Number(t.amount);
        else outTotal += Number(t.amount);
      });
      setCashIn(inTotal);
      setCashOut(outTotal);
      return updated;
    });
  };

  return {
    transactions,
    balance: { in: cashIn, out: cashOut, total: balance },
    isSubmitting,
    error,
    setError,
    getSmartDefaults,
    processTransaction,
    applyOptimisticDelete,
    applyOptimisticUpdate,
    // Provide a helper hook to sync backend changes down to the fast state
    hydrateTransactions: (txs: any[]) => {
      let inTotal = 0;
      let outTotal = 0;
      txs.forEach(t => {
        if (t.is_deleted) return;
        if (t.type === 'cash_in') inTotal += Number(t.amount);
        else outTotal += Number(t.amount);
      });
      setTransactions(txs);
      setCashIn(inTotal);
      setCashOut(outTotal);
    }
  };
}
