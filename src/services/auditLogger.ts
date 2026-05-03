import { supabase } from '../database/supabase';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
export type AuditEntityType = 'BOOK' | 'LEDGER' | 'TRANSACTION';

export async function logAudit(
  businessId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: { old_value?: unknown; new_value?: unknown }
) {
  // Fire and forget, don't wait for server response in the main UI thread path
  // This prevents UI hangs when the database table is missing or network is slow
  (async () => {
    try {
      const { error } = await supabase.from('activity_log').insert({
        business_id: businessId,
        performed_by: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        old_value: details.old_value || null,
        new_value: details.new_value || null,
      });
      if (error) console.error('Activity Log Error:', error);
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  })();
}
