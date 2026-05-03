import { SyncOperation } from '../db/schema';
import { supabase } from '../../database/supabase';

// Real sync layer: pushes local-first writes up to Supabase.
// Each entity in the local Dexie store maps to a Supabase table; some columns
// are renamed/transformed.

type Entity = SyncOperation['entity'];

const ENTITY_TO_TABLE: Record<Entity, string> = {
  spaces: 'businesses',
  books: 'books',
  ledgers: 'ledgers',
  transactions: 'transactions',
};

const UNIT_LOCAL_TO_REMOTE: Record<string, string> = {
  INR: 'INR',
  gm: 'gram',
  pcs: 'pieces',
};

function spaceRow(p: any) {
  return clean({
    id: p.id,
    name: p.name,
    owner_id: p.owner_id ?? p.userId,
    image_url: p.logo_url,
    color: p.color,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });
}

function bookRow(p: any) {
  return clean({
    id: p.id,
    business_id: p.business_id,
    name: p.name,
    description: p.description,
    color: p.color,
    position: p.position,
    image_url: p.image_url,
    created_by: p.userId ?? p.owner_id,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });
}

function ledgerRow(p: any) {
  return clean({
    id: p.id,
    book_id: p.book_id,
    name: p.name,
    unit: UNIT_LOCAL_TO_REMOTE[p.unit_type] ?? 'INR',
    categories: p.categories,
    color: p.color,
    decimal_rule: p.decimal_rule,
    decimal_precision: p.decimal_precision,
    is_category_mandatory: p.category_required,
    custom_fields_config: p.custom_fields_config,
    restrict_backdated_entries: p.restrict_backdated_entries,
    created_by: p.userId,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });
}

function transactionRow(p: any) {
  return clean({
    id: p.id,
    ledger_id: p.ledger_id,
    amount: Math.abs(Number(p.amount)),
    type: p.type,
    category: p.category,
    note: p.note,
    attachment_url: p.attachment_url,
    transaction_date: p.transaction_date,
    custom_fields_data: p.custom_fields_data,
    created_by: p.userId ?? p.created_by,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });
}

function clean<T extends Record<string, any>>(o: T): T {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out as T;
}

function toRow(entity: Entity, payload: any) {
  switch (entity) {
    case 'spaces':       return spaceRow(payload);
    case 'books':        return bookRow(payload);
    case 'ledgers':      return ledgerRow(payload);
    case 'transactions': return transactionRow(payload);
  }
}

export const api = {
  async sendSyncOperation(op: SyncOperation): Promise<{ success: boolean; error?: string }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: 'Network is offline' };
    }

    const table = ENTITY_TO_TABLE[op.entity];
    if (!table) return { success: false, error: `Unknown entity: ${op.entity}` };

    try {
      if (op.type === 'delete') {
        // Soft-deleted locally → hard delete in Supabase.
        const { error } = await supabase.from(table).delete().eq('id', op.entityId);
        if (error) throw error;
        return { success: true };
      }

      const row = toRow(op.entity, op.payload);

      if (op.type === 'create') {
        // upsert so retries are idempotent
        const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
        if (error) throw error;
        return { success: true };
      }

      if (op.type === 'update') {
        const { id, ...patch } = row as any;
        const { error } = await supabase.from(table).update(patch).eq('id', op.entityId);
        if (error) throw error;
        return { success: true };
      }

      return { success: false, error: `Unknown op type: ${op.type}` };
    } catch (err: any) {
      if (import.meta.env.DEV) console.warn(`[api] ${op.type} ${op.entity}/${op.entityId} failed:`, err);
      return { success: false, error: err?.message || String(err) };
    }
  },
};
