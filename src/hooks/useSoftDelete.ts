import { useState } from 'react';
import { supabase } from '../database/supabase';
import { useAuth } from './AuthContext';

export type SoftDeleteTable = 'books' | 'ledgers';

export function useSoftDelete() {
  const { user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const softDelete = async (tableName: SoftDeleteTable, id: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }

    setIsDeleting(true);
    setError(null);

    try {
      // Set deleted_at and deleted_by while maintaining is_deleted=true for legacy compatibility
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          is_deleted: true 
        })
        .eq('id', id);

      if (updateError) {
        if (updateError.code === '42501') {
          throw new Error('Permission denied: You do not have rights to delete this item.');
        }
        throw updateError;
      }

      // Dispatch custom event for cross-component sync
      window.dispatchEvent(new CustomEvent('entity:soft-deleted', {
        detail: { tableName, id }
      }));

      return true;
    } catch (err: any) {
      console.error(`Error soft deleting from ${tableName}:`, err);
      setError(err.message || 'Operation failed');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  const restore = async (tableName: SoftDeleteTable, id: string) => {
    if (!user) return false;
    
    setIsDeleting(true);
    try {
      const { error: restoreError } = await supabase
        .from(tableName)
        .update({
          deleted_at: null,
          deleted_by: null,
          is_deleted: false
        })
        .eq('id', id);

      if (restoreError) throw restoreError;
      
      window.dispatchEvent(new CustomEvent('entity:restored', {
        detail: { tableName, id }
      }));
      
      return true;
    } catch (err: any) {
      console.error(`Error restoring ${tableName}:`, err);
      setError(err.message);
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { softDelete, restore, isDeleting, error };
}
