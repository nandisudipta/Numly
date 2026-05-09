import { useState } from 'react';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';

export function useLedgerDelete() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const delete_ = async (ledgerId: string, ledgerName: string, onSuccess?: () => void) => {
    setIsLoading(true);
    setError(null);

    try {
      await dataService.deleteLedger(ledgerId);
      toast.success(`"${ledgerName}" moved to Recycle Bin`);
      onSuccess?.();
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete ledger';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    delete: delete_,
    isLoading,
    error,
    setError,
  };
}
