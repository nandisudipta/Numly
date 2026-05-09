import { useState } from 'react';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';

interface RenameLedgerData {
  ledgerId: string;
  name: string;
  color: string;
  categoryRequired: boolean;
  categories: string[];
  restrictBackdated: 'always' | 'never' | 'one_day';
  decimalPrecision: number;
}

export function useLedgerRename() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const rename = async (data: RenameLedgerData, onSuccess?: () => void) => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!data.name.trim()) {
        throw new Error('Ledger name is required');
      }

      if (data.name.length < 2) {
        throw new Error('Ledger name must be at least 2 characters');
      }

      // Update ledger
      await dataService.updateLedger(data.ledgerId, {
        name: data.name.trim(),
        color: data.color,
        category_required: data.categoryRequired,
        categories: data.categories,
        restrict_backdated_entries: data.restrictBackdated,
        decimal_precision: data.decimalPrecision,
      });

      toast.success(`Ledger updated successfully`);
      onSuccess?.();
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update ledger';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    rename,
    isLoading,
    error,
    setError,
  };
}
