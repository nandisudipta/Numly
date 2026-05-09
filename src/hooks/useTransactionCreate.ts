import { useState } from 'react';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';

interface CreateTransactionData {
  ledgerId: string;
  amount: number;
  type: 'cash_in' | 'cash_out';
  category?: string;
  note?: string;
  transactionDate: string;
  attachmentUrls?: string[];
  customFieldsData?: Record<string, any>;
}

export function useTransactionCreate() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const create = async (data: CreateTransactionData, onSuccess?: () => void) => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate
      if (data.amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (!data.transactionDate) {
        throw new Error('Transaction date is required');
      }

      // Create transaction
      await dataService.createTransaction({
        ledger_id: data.ledgerId,
        amount: Math.abs(data.amount),
        type: data.type,
        category: data.category || null,
        note: data.note || null,
        transaction_date: data.transactionDate,
        attachment_urls: data.attachmentUrls || [],
        custom_fields_data: data.customFieldsData || {},
      });

      toast.success(`Transaction created`);
      onSuccess?.();
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create transaction';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    create,
    isLoading,
    error,
    setError,
  };
}
