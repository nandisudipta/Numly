import Dexie, { type Table } from 'dexie';
import type { Space, Book, Ledger, Transaction, SyncOperation } from './schema';

export class AppDatabase extends Dexie {
  spaces!: Table<Space, string>;
  books!: Table<Book, string>;
  ledgers!: Table<Ledger, string>;
  transactions!: Table<Transaction, string>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super('NumlyAppDB');
    
    // Define the schema. Indexed keys are for querying.
    this.version(1).stores({
      spaces: 'id, userId, syncStatus, is_deleted, updated_at',
      books: 'id, business_id, userId, syncStatus, is_deleted, updated_at',
      ledgers: 'id, book_id, business_id, userId, syncStatus, is_deleted, updated_at',
      transactions: 'id, ledger_id, book_id, business_id, userId, syncStatus, is_deleted, updated_at',
      syncQueue: '++id, entityId, type, entity, status, timestamp, retryCount'
    });
  }
}

export const db = new AppDatabase();
