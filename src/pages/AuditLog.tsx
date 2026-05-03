import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../database/supabase';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { User, Clock, ChevronRight } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

export function AuditLog() {
  const { businessId } = useParams();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (businessId) {
      loadLogs();
    }
  }, [businessId]);

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select(`
          *,
          profiles:performed_by (
            full_name,
            email
          )
        `)
        .eq('business_id', businessId!)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action: string) => {
    const colors = {
      CREATE: 'text-emerald-500',
      UPDATE: 'text-blue-500',
      DELETE: 'text-red-500',
      MOVE: 'text-amber-500'
    };
    return (
      <span className={`font-bold uppercase tracking-widest text-[10px] ${colors[action as keyof typeof colors] || 'text-primary'}`}>
        {action}
      </span>
    );
  };

  return (
    <Layout showBack title="Audit History">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-primary">Activity Log</h2>
          <p className="text-secondary mt-1">Track every change across this business</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-secondary mx-auto mb-3 opacity-50" />
            <p className="text-secondary">No activity logged yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id} variant="dark" className="border-l-4 border-primary/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {formatAction(log.action)}
                      <ChevronRight className="w-3 h-3 text-secondary" />
                      <span className="text-xs font-semibold text-primary uppercase tracking-tight">
                        {log.entity_type}
                      </span>
                      <span className="text-[10px] font-mono text-secondary opacity-50">
                        {log.entity_id.slice(0, 8)}...
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 text-secondary">
                        <User className="w-3.5 h-3.5" />
                        <span>{log.profiles?.full_name || log.profiles?.email || 'System'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-secondary">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {log.action === 'UPDATE' && (
                    <div className="bg-black/20 rounded-lg p-2 text-[10px] space-y-1 min-w-[200px]">
                       <div className="text-secondary">Changes detected:</div>
                       <div className="text-primary truncate">
                         {Object.keys(log.new_value || {}).join(', ')}
                       </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
