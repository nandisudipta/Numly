export type SyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'error' | 'fatal';
export type SyncMode = 'offline' | 'online' | 'hybrid';

export interface BaseEntity {
  id: string;
  userId?: string | null;
  created_at: string;
  updated_at: string;
  syncStatus: SyncStatus;
  is_deleted?: boolean;
}

export interface Space extends BaseEntity {
  name: string;
  description?: string;
  color?: string;
  logo_url?: string;
  owner_id?: string;
}

export interface Book extends BaseEntity {
  business_id: string;
  name: string;
  description?: string;
  color?: string;
  position?: number;
}

export interface Ledger extends BaseEntity {
  book_id: string;
  business_id: string;
  name: string;
  unit_type: 'INR' | 'gm' | 'pcs';
  color?: string;
  category_required?: boolean;
  custom_fields_config?: { name: string; is_mandatory: boolean }[];
  restrict_backdated_entries?: 'always' | 'never' | 'one_day';
  ledger_locked_until_date?: string | null;
  categories?: string[] | null;
  decimal_precision?: number;
  decimal_rule?: 'entry' | 'ledger';
  balance?: number;
  cash_in?: number;
  cash_out?: number;
}

export interface Transaction extends BaseEntity {
  ledger_id: string;
  book_id: string;
  business_id: string;
  amount: number;
  type: 'cash_in' | 'cash_out';
  category?: string | null;
  note?: string | null;
  attachment_url?: string | null;
  transaction_date: string;
  custom_fields_data?: Record<string, any>;
}

export interface SyncOperation {
  id?: number; // Auto-incremented by IndexedDB
  entityId: string;
  type: 'create' | 'update' | 'delete';
  entity: 'spaces' | 'books' | 'ledgers' | 'transactions';
  payload: any;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'sending' | 'failed' | 'success' | 'fatal';
}
