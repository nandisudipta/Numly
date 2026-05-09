import { useState } from 'react';
import { dataService } from '../core';
import { useToast } from '../components/ui/Toast';

interface CreateLedgerData {
  businessId: string;
  bookId: string;
  name: string;
  unitType: 'INR' | 'gm' | 'pcs';
  decimalPrecision: number;
  categoryRequired: boolean;
  categories: string[];
  customFields: Array<{
    name: string;
    isMandatory: boolean;
    values: string[];
  }>;
  restrictBackdated: 'always' | 'never' | 'one_day';
  color: string;
}

export function useLedgerCreate() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const create = async (data: CreateLedgerData, onSuccess?: () => void) => {
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

      // Validate decimal precision based on unit type
      const decimalPrecision =
        data.unitType === 'gm'
          ? data.decimalPrecision
          : data.unitType === 'pcs'
            ? 0
            : 2;

      // Create ledger
      await dataService.createLedger({
        business_id: data.businessId,
        book_id: data.bookId,
        name: data.name.trim(),
        unit_type: data.unitType,
        decimal_precision: decimalPrecision,
        category_required: data.categoryRequired,
        categories: data.categories,
        custom_fields_config: data.customFields.length > 0 ? data.customFields : undefined,
        restrict_backdated_entries: data.restrictBackdated,
        color: data.color,
      });

      toast.success(`Ledger "${data.name}" created successfully`);
      onSuccess?.();
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create ledger';
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
