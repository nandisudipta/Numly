import { db } from '../db';
import { syncEngine } from '../sync/syncEngine';
import type { Space, Book, Ledger, Transaction } from '../db/schema';
import { uuidv4 } from '../../utils/uuid';

class DataService {
  private userId: string | null = null;

  setUserId(id: string | null) {
    this.userId = id;
  }

  // Deletes are durability-critical: another device installing the PWA right
  // after must NOT see the deleted row resurrect from the cloud. So when online
  // we wait for the queue to drain before resolving — but cap the wait so a
  // flaky network can't hang the UI indefinitely. Offline path is instant.
  private async flushDelete(): Promise<void> {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!this.userId || !online) {
      syncEngine.processQueue();
      return;
    }
    try {
      await Promise.race([
        syncEngine.processQueue(),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);
    } catch {
      // processQueue swallows individual op failures; any throw here is fine to ignore
    }
  }

  // --- Spaces ---
  async getSpaces(): Promise<Space[]> {
    return await db.spaces.filter(s => !s.is_deleted).toArray();
  }

  async createSpace(data: Partial<Space>): Promise<Space> {
    const spaceId = uuidv4();
    const newSpace: Space = {
      id: spaceId,
      name: data.name!,
      description: data.description || '',
      color: data.color || '#3B82F6',
      logo_url: data.logo_url || '🏢',
      owner_id: this.userId || undefined,
      userId: this.userId,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    };

    await db.transaction('rw', db.spaces, db.syncQueue, async () => {
      await db.spaces.add(newSpace);
      await syncEngine.enqueue('create', 'spaces', newSpace.id, newSpace);
    });
    syncEngine.processQueue();
    return newSpace;
  }

  async updateSpace(id: string, data: Partial<Space>): Promise<void> {
    const existing = await db.spaces.get(id);
    if (!existing) throw new Error('Space not found');
    
    const updated = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Space;

    await db.transaction('rw', db.spaces, db.syncQueue, async () => {
      await db.spaces.put(updated);
      await syncEngine.enqueue('update', 'spaces', updated.id, updated);
    });
    syncEngine.processQueue();
  }

  async deleteSpace(id: string): Promise<void> {
    const existing = await db.spaces.get(id);
    if (!existing) throw new Error('Space not found');
    const updated = {
      ...existing,
      is_deleted: true,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Space;
    await db.transaction('rw', db.spaces, db.syncQueue, async () => {
      await db.spaces.put(updated);
      await syncEngine.enqueue('delete', 'spaces', id, updated);
    });
    await this.flushDelete();
  }

  async restoreSpace(id: string): Promise<void> {
    const existing = await db.spaces.get(id);
    if (!existing) throw new Error('Space not found');
    const updated = {
      ...existing,
      is_deleted: false,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Space;
    await db.transaction('rw', db.spaces, db.syncQueue, async () => {
      await db.spaces.put(updated);
      await syncEngine.enqueue('create', 'spaces', id, updated);
    });
    syncEngine.processQueue();
  }

  // --- Books ---
  async getBooks(businessId: string): Promise<Book[]> {
    return await db.books
      .where('business_id').equals(businessId)
      .filter(b => !b.is_deleted)
      .toArray();
  }

  async createBook(data: Partial<Book>): Promise<Book> {
    const bookId = uuidv4();
    const newBook: Book = {
      id: bookId,
      business_id: data.business_id!,
      name: data.name!,
      description: data.description || '',
      color: data.color || '#3B82F6',
      position: data.position || 0,
      userId: this.userId,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    };

    await db.transaction('rw', db.books, db.syncQueue, async () => {
      await db.books.add(newBook);
      await syncEngine.enqueue('create', 'books', newBook.id, newBook);
    });
    syncEngine.processQueue();
    return newBook;
  }

  async updateBook(id: string, data: Partial<Book>): Promise<void> {
    const existing = await db.books.get(id);
    if (!existing) throw new Error('Book not found');
    
    const updated = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Book;

    await db.transaction('rw', db.books, db.syncQueue, async () => {
      await db.books.put(updated);
      await syncEngine.enqueue('update', 'books', updated.id, updated);
    });
    syncEngine.processQueue();
  }

  async deleteBook(id: string): Promise<void> {
    const existing = await db.books.get(id);
    if (!existing) throw new Error('Book not found');
    const updated = {
      ...existing,
      is_deleted: true,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Book;
    await db.transaction('rw', db.books, db.syncQueue, async () => {
      await db.books.put(updated);
      await syncEngine.enqueue('delete', 'books', id, updated);
    });
    await this.flushDelete();
  }

  async restoreBook(id: string): Promise<void> {
    const existing = await db.books.get(id);
    if (!existing) throw new Error('Book not found');
    const updated = {
      ...existing,
      is_deleted: false,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Book;
    await db.transaction('rw', db.books, db.syncQueue, async () => {
      await db.books.put(updated);
      await syncEngine.enqueue('create', 'books', id, updated);
    });
    syncEngine.processQueue();
  }

  // --- Ledgers ---
  async getLedgers(bookId: string): Promise<Ledger[]> {
    return await db.ledgers
      .where('book_id').equals(bookId)
      .filter(l => !l.is_deleted)
      .toArray();
  }

  async getLedger(id: string): Promise<Ledger | undefined> {
    return await db.ledgers.get(id);
  }

  async createLedger(data: Partial<Ledger>): Promise<Ledger> {
    const ledgerId = uuidv4();
    const newLedger: Ledger = {
      id: ledgerId,
      book_id: data.book_id!,
      business_id: data.business_id!,
      name: data.name!,
      unit_type: data.unit_type || 'INR',
      color: data.color || '#D9E34B',
      category_required: data.category_required || false,
      categories: data.categories || [],
      custom_fields_config: data.custom_fields_config || [],
      restrict_backdated_entries: data.restrict_backdated_entries || 'never',
      ledger_locked_until_date: data.ledger_locked_until_date || null,
      decimal_precision: data.decimal_precision || 2,
      decimal_rule: data.decimal_rule || 'entry',
      balance: 0,
      cash_in: 0,
      cash_out: 0,
      userId: this.userId,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    };

    await db.transaction('rw', db.ledgers, db.syncQueue, async () => {
      await db.ledgers.add(newLedger);
      await syncEngine.enqueue('create', 'ledgers', newLedger.id, newLedger);
    });
    syncEngine.processQueue();
    return newLedger;
  }

  async updateLedger(id: string, data: Partial<Ledger>): Promise<void> {
    const existing = await db.ledgers.get(id);
    if (!existing) throw new Error('Ledger not found');
    
    const updated = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Ledger;

    await db.transaction('rw', db.ledgers, db.syncQueue, async () => {
      await db.ledgers.put(updated);
      await syncEngine.enqueue('update', 'ledgers', updated.id, updated);
    });
    syncEngine.processQueue();
  }

  async deleteLedger(id: string): Promise<void> {
    const existing = await db.ledgers.get(id);
    if (!existing) throw new Error('Ledger not found');
    const updated = {
      ...existing,
      is_deleted: true,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Ledger;
    await db.transaction('rw', db.ledgers, db.syncQueue, async () => {
      await db.ledgers.put(updated);
      await syncEngine.enqueue('delete', 'ledgers', id, updated);
    });
    await this.flushDelete();
  }

  async restoreLedger(id: string): Promise<void> {
    const existing = await db.ledgers.get(id);
    if (!existing) throw new Error('Ledger not found');
    const updated = {
      ...existing,
      is_deleted: false,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Ledger;
    await db.transaction('rw', db.ledgers, db.syncQueue, async () => {
      await db.ledgers.put(updated);
      await syncEngine.enqueue('create', 'ledgers', id, updated);
    });
    syncEngine.processQueue();
  }

  // --- Transactions ---
  async getTransactions(ledgerId: string): Promise<Transaction[]> {
    const txs = await db.transactions
      .where('ledger_id').equals(ledgerId)
      .filter(t => !t.is_deleted)
      .toArray();
    // Sort by transaction_date desc
    return txs.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }

  async createTransaction(data: Partial<Transaction>): Promise<Transaction> {
    const txId = uuidv4();
    const newTx: Transaction = {
      id: txId,
      ledger_id: data.ledger_id!,
      book_id: data.book_id!,
      business_id: data.business_id!,
      amount: data.amount!,
      type: data.type!,
      category: data.category || null,
      note: data.note || null,
      attachment_url: data.attachment_url || null,
      transaction_date: data.transaction_date || new Date().toISOString(),
      custom_fields_data: data.custom_fields_data || {},
      userId: this.userId,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    };

    // Atomic constraints guaranteed sequentially in DEXIE
    await db.transaction('rw', db.transactions, db.ledgers, db.syncQueue, async () => {
      // 1. Save Transaction
      await db.transactions.add(newTx);
      
      // 2. Update Ledger Balance (Atomic Consistency)
      const ledger = await db.ledgers.get(newTx.ledger_id);
      if (ledger) {
        if (newTx.type === 'cash_in') ledger.cash_in = (ledger.cash_in || 0) + newTx.amount;
        if (newTx.type === 'cash_out') ledger.cash_out = (ledger.cash_out || 0) + newTx.amount;
        ledger.balance = (ledger.cash_in || 0) - (ledger.cash_out || 0);
        
        // Also queue the ledger update so backend knows about cached balance
        ledger.updated_at = new Date().toISOString();
        ledger.syncStatus = this.userId ? 'pending' : 'local';
        await db.ledgers.put(ledger);
        await syncEngine.enqueue('update', 'ledgers', ledger.id, ledger);
      }

      // 3. Queue Transaction Sync
      await syncEngine.enqueue('create', 'transactions', newTx.id, newTx);
    });

    syncEngine.processQueue();
    return newTx;
  }

  async updateTransaction(id: string, data: Partial<Transaction>): Promise<void> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');
    
    const updated = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Transaction;

    await db.transaction('rw', db.transactions, db.ledgers, db.syncQueue, async () => {
      // Revert old transaction amounts, Apply new transaction amounts logically
      const ledger = await db.ledgers.get(existing.ledger_id);
      if (ledger) {
        if (existing.type === 'cash_in') ledger.cash_in = (ledger.cash_in || 0) - existing.amount;
        if (existing.type === 'cash_out') ledger.cash_out = (ledger.cash_out || 0) - existing.amount;

        const newType = data.type ?? existing.type;
        const newAmt = data.amount ?? existing.amount;
        
        // Skip adding amounts if transaction is deleted now
        if (!updated.is_deleted) {
          if (newType === 'cash_in') ledger.cash_in = (ledger.cash_in || 0) + newAmt;
          if (newType === 'cash_out') ledger.cash_out = (ledger.cash_out || 0) + newAmt;
        }

        ledger.balance = (ledger.cash_in || 0) - (ledger.cash_out || 0);
        ledger.updated_at = new Date().toISOString();
        ledger.syncStatus = this.userId ? 'pending' : 'local';
        
        await db.ledgers.put(ledger);
        await syncEngine.enqueue('update', 'ledgers', ledger.id, ledger);
      }

      await db.transactions.put(updated);
      await syncEngine.enqueue('update', 'transactions', updated.id, updated);
    });

    syncEngine.processQueue();
  }

  async deleteTransaction(id: string): Promise<void> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');
    
    const updated = {
      ...existing,
      is_deleted: true,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Transaction;

    await db.transaction('rw', db.transactions, db.ledgers, db.syncQueue, async () => {
      const ledger = await db.ledgers.get(existing.ledger_id);
      if (ledger) {
        if (existing.type === 'cash_in') ledger.cash_in = (ledger.cash_in || 0) - existing.amount;
        if (existing.type === 'cash_out') ledger.cash_out = (ledger.cash_out || 0) - existing.amount;
        ledger.balance = (ledger.cash_in || 0) - (ledger.cash_out || 0);
        ledger.updated_at = new Date().toISOString();
        ledger.syncStatus = this.userId ? 'pending' : 'local';
        await db.ledgers.put(ledger);
        await syncEngine.enqueue('update', 'ledgers', ledger.id, ledger);
      }
      await db.transactions.put(updated);
      await syncEngine.enqueue('delete', 'transactions', id, updated);
    });
    await this.flushDelete();
  }

  async restoreTransaction(id: string): Promise<void> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');
    
    const updated = {
      ...existing,
      is_deleted: false,
      updated_at: new Date().toISOString(),
      syncStatus: this.userId ? 'pending' : 'local'
    } as Transaction;

    await db.transaction('rw', db.transactions, db.ledgers, db.syncQueue, async () => {
      const ledger = await db.ledgers.get(existing.ledger_id);
      if (ledger) {
        if (existing.type === 'cash_in') ledger.cash_in = (ledger.cash_in || 0) + existing.amount;
        if (existing.type === 'cash_out') ledger.cash_out = (ledger.cash_out || 0) + existing.amount;
        ledger.balance = (ledger.cash_in || 0) - (ledger.cash_out || 0);
        ledger.updated_at = new Date().toISOString();
        ledger.syncStatus = this.userId ? 'pending' : 'local';
        await db.ledgers.put(ledger);
        await syncEngine.enqueue('update', 'ledgers', ledger.id, ledger);
      }
      await db.transactions.put(updated);
      await syncEngine.enqueue('create', 'transactions', id, updated);
    });
    syncEngine.processQueue();
  }

  // --- Aggregate & Utility Queries ---
  async getBusinessData(businessId: string): Promise<{ books: Book[], ledgers: Ledger[], transactions: Transaction[] }> {
    const books = await db.books.where('business_id').equals(businessId).filter(b => !b.is_deleted).toArray();
    const ledgers = await db.ledgers.where('business_id').equals(businessId).filter(l => !l.is_deleted).toArray();
    const transactions = await db.transactions.where('business_id').equals(businessId).filter(t => !t.is_deleted).toArray();
    
    return { books, ledgers, transactions };
  }

  async getDeletedItems(businessId: string): Promise<{ id: string, name: string, type: 'books' | 'ledgers', deleted_at: string }[]> {
    const books = await db.books.where('business_id').equals(businessId).filter(b => !!b.is_deleted).toArray();
    const ledgers = await db.ledgers.where('business_id').equals(businessId).filter(l => !!l.is_deleted).toArray();
    
    return [
      ...books.map(b => ({ id: b.id, name: b.name, type: 'books' as const, deleted_at: b.updated_at })),
      ...ledgers.map(l => ({ id: l.id, name: l.name, type: 'ledgers' as const, deleted_at: l.updated_at }))
    ];
  }

  async getPortfolioStats(): Promise<{ totalBalance: number, cashInThisMonth: number, cashOutThisMonth: number, activeLedgers: number }> {
    const allLedgers = await db.ledgers.filter(l => !l.is_deleted).toArray();
    const totalBalance = allLedgers.reduce((acc, cur) => acc + (cur.balance || 0), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thisMonthTxs = await db.transactions
      .filter(t => !t.is_deleted && t.transaction_date >= startOfMonth)
      .toArray();

    let cashInThisMonth = 0;
    let cashOutThisMonth = 0;
    for (const tx of thisMonthTxs) {
      if (tx.type === 'cash_in') cashInThisMonth += tx.amount;
      else if (tx.type === 'cash_out') cashOutThisMonth += tx.amount;
    }

    return {
      totalBalance,
      cashInThisMonth,
      cashOutThisMonth,
      activeLedgers: allLedgers.length
    };
  }

}

export const dataService = new DataService();
