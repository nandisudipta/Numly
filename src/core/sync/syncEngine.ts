import { db } from '../db';
import type { SyncOperation, SyncMode, SyncStatus } from '../db/schema';
import { api } from '../api';
import { supabase } from '../../database/supabase';

const UNIT_REMOTE_TO_LOCAL: Record<string, 'INR' | 'gm' | 'pcs'> = {
  INR: 'INR',
  gram: 'gm',
  pieces: 'pcs',
};

const MAX_RETRIES = 3;

export class SyncEngine {
  private isSyncing = false;
  private mode: SyncMode = 'hybrid';
  constructor() {
    // Start a periodic background sync worker just in case hooks are missed
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
      
      // Auto-process queue every 30 seconds if online
      window.setInterval(() => {
        if (this.mode !== 'offline' && navigator.onLine) {
          this.processQueue();
        }
      }, 30000);
    }
  }

  setMode(mode: SyncMode) {
    this.mode = mode;
    if (this.mode !== 'offline') {
      this.processQueue();
    }
  }

  getMode() {
    return this.mode;
  }

  /**
   * Enqueue a new operation. 
   * Provides simple Local-First Last-Write-Wins merging to keep the queue minimal.
   */
  async enqueue(
    type: SyncOperation['type'],
    entity: SyncOperation['entity'],
    entityId: string,
    payload: any
  ) {
    const timestamp = new Date().toISOString();

    // Deduplication logic for identical entities if still pending
    const existingQ = await db.syncQueue
      .where({ entityId })
      .filter(q => q.status === 'pending' || q.status === 'failed')
      .last();

    if (existingQ && existingQ.type === 'update' && type === 'update') {
      // Deterministic LWW Merging: only update if new timestamp is newer or same
      if (new Date(timestamp) >= new Date(existingQ.timestamp)) {
        await db.syncQueue.update(existingQ.id!, {
          payload: { ...existingQ.payload, ...payload },
          timestamp,
          status: 'pending',
          retryCount: 0
        });
      }
    } else {
      await db.syncQueue.add({
        entityId,
        type,
        entity,
        payload,
        timestamp,
        retryCount: 0,
        status: 'pending'
      });
    }

    // Removed non-deterministic setTimeout trigger. Process queue explicitly after atomic commits!
  }

  /**
   * Process the Sync Queue utilizing FIFO order.
   */
  async processQueue() {
    // 7. ADD NETWORK RESILIENCE
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    // 2. ADD GLOBAL SYNC LOCK guards
    if (this.isSyncing || this.mode === 'offline' || !isOnline) return;
    
    this.isSyncing = true;

    try {
      const pendingOps = await db.syncQueue
        .where('status').anyOf(['pending', 'failed'])
        .sortBy('id');

      for (const op of pendingOps) {
        if (!op.id) continue;

        if (op.retryCount >= MAX_RETRIES) {
          // Exponent/max retry exceeded - Perm Fail
          await db.syncQueue.update(op.id, { status: 'fatal' });
          await this.updateEntityStatus(op.entity, op.entityId, 'error');
          continue;
        }

        try {
          // Lock state to sending
          await db.syncQueue.update(op.id, { status: 'sending' });

          const response = await api.sendSyncOperation(op);

          if (response.success) {
            await db.syncQueue.update(op.id, { status: 'success' });
            await this.updateEntityStatus(op.entity, op.entityId, 'synced');
          } else {
            throw new Error(response.error || 'API Sync Failed');
          }

        } catch (error) {
          // Handle Exponential backoff or soft fail
          const retryCount = (op.retryCount || 0) + 1;
          console.error(`[SyncEngine] op ${op.id} (${op.type} ${op.entity}) failed, retry ${retryCount}/${MAX_RETRIES}:`, error);
          await db.syncQueue.update(op.id, {
            status: 'failed',
            retryCount
          });
        }
      }
    } finally {
      this.isSyncing = false;
      
      // Garbage collection: Clear out succeeded operations to maintain DB performance
      await db.syncQueue.where('status').equals('success').delete();
    }
  }

  /**
   * Called primarily when a user signs in.
   * 1. Push any local-only records up to the cloud
   * 2. Pull cloud records into local Dexie so multi-device + fresh-browser works
   */
  async triggerAuthSync(userId: string) {
    // ── Push: queue local-only records ────────────────────────────────
    const tables: Array<keyof typeof db> = ['spaces', 'books', 'ledgers', 'transactions'];
    for (const tableName of tables) {
      const table = db[tableName as keyof typeof db] as any;
      if (!table) continue;
      const localRecords = await table.where('syncStatus').equals('local').toArray();
      for (const record of localRecords) {
        const payload = { ...record, userId, syncStatus: 'pending' };
        await table.update(record.id, { userId, syncStatus: 'pending' });
        await this.enqueue('create', tableName as SyncOperation['entity'], record.id, payload);
      }
    }

    if (this.mode !== 'offline') {
      this.processQueue();
    }

    // ── Pull: hydrate Dexie from cloud (best-effort) ──────────────────
    try {
      await this.hydrateFromCloud(userId);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[SyncEngine] hydrate failed:', err);
    }
  }

  /**
   * Pull the user's businesses + books + ledgers + transactions into Dexie.
   */
  private async hydrateFromCloud(userId: string) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    // 1) businesses the user is a member of (RLS handles filtering)
    const { data: businesses, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, owner_id, image_url, color, created_at, updated_at');
    if (bizErr) throw bizErr;
    if (!businesses) return;

    for (const b of businesses) {
      await db.spaces.put({
        id: b.id,
        name: b.name,
        owner_id: b.owner_id,
        userId,
        logo_url: b.image_url || '🏢',
        color: b.color || '#3B82F6',
        is_deleted: false,
        created_at: b.created_at,
        updated_at: b.updated_at,
        syncStatus: 'synced',
      } as any);
    }

    if (businesses.length === 0) return;

    const businessIds = businesses.map((b: any) => b.id);

    // 2) books for those businesses
    const { data: books } = await supabase
      .from('books')
      .select('id, business_id, name, description, color, position, image_url, created_at, updated_at')
      .in('business_id', businessIds);
    if (books) {
      for (const bk of books) {
        await db.books.put({
          id: bk.id,
          business_id: bk.business_id,
          name: bk.name,
          description: bk.description || '',
          color: bk.color || '#3B82F6',
          position: bk.position ?? 0,
          userId,
          is_deleted: false,
          created_at: bk.created_at,
          updated_at: bk.updated_at,
          syncStatus: 'synced',
        } as any);
      }
    }

    if (!books || books.length === 0) return;
    const bookIds = books.map((b: any) => b.id);

    // 3) ledgers
    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, book_id, name, unit, categories, color, decimal_rule, decimal_precision, is_category_mandatory, custom_fields_config, restrict_backdated_entries, created_at, updated_at')
      .in('book_id', bookIds);
    if (ledgers) {
      for (const lg of ledgers) {
        const matchingBook = books.find((b: any) => b.id === lg.book_id);
        await db.ledgers.put({
          id: lg.id,
          book_id: lg.book_id,
          business_id: matchingBook?.business_id,
          name: lg.name,
          unit_type: UNIT_REMOTE_TO_LOCAL[lg.unit] ?? 'INR',
          color: lg.color || undefined,
          categories: lg.categories,
          decimal_rule: lg.decimal_rule,
          decimal_precision: lg.decimal_precision,
          category_required: !!lg.is_category_mandatory,
          custom_fields_config: lg.custom_fields_config || [],
          restrict_backdated_entries: lg.restrict_backdated_entries,
          userId,
          is_deleted: false,
          created_at: lg.created_at,
          updated_at: lg.updated_at,
          syncStatus: 'synced',
        } as any);
      }
    }

    if (!ledgers || ledgers.length === 0) return;
    const ledgerIds = ledgers.map((l: any) => l.id);

    // 4) transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('id, ledger_id, amount, type, category, note, attachment_url, transaction_date, custom_fields_data, created_by, created_at, updated_at')
      .in('ledger_id', ledgerIds);
    if (txns) {
      for (const tx of txns) {
        const matchingLedger = ledgers.find((l: any) => l.id === tx.ledger_id);
        const matchingBook = books.find((b: any) => b.id === matchingLedger?.book_id);
        await db.transactions.put({
          id: tx.id,
          ledger_id: tx.ledger_id,
          book_id: matchingLedger?.book_id,
          business_id: matchingBook?.business_id,
          amount: Number(tx.amount),
          type: tx.type,
          category: tx.category,
          note: tx.note,
          attachment_url: tx.attachment_url,
          transaction_date: tx.transaction_date,
          custom_fields_data: tx.custom_fields_data || {},
          userId,
          is_deleted: false,
          created_at: tx.created_at,
          updated_at: tx.updated_at,
          syncStatus: 'synced',
        } as any);
      }
    }
  }

  private async updateEntityStatus(entityName: string, entityId: string, status: SyncStatus) {
    try {
      const table = db[entityName as keyof typeof db] as any;
      if (table) {
        await table.update(entityId, { syncStatus: status });
      }
    } catch (err) {
      console.warn(`Could not update entity status for ${entityName}/${entityId}:`, err);
    }
  }
}

export const syncEngine = new SyncEngine();
