import { useState, useEffect } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  Clock, 
  AlertTriangle, 
  BookOpen, 
  Layers,
  RefreshCw
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { triggerHaptic } from '../utils/haptics';
import { dataService } from '../core';

interface DeletedItem {
  id: string;
  name: string;
  type: 'books' | 'ledgers';
  deleted_at: string;
  color?: string;
}

interface RecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  onRefresh: () => void;
}

export function RecycleBin({ isOpen, onClose, businessId, onRefresh }: RecycleBinProps) {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'books' | 'ledgers' | 'all'>('all');
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDeletedItems();
    }
  }, [isOpen, businessId]);

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      const allItems = await dataService.getDeletedItems(businessId);
      setItems(allItems);
    } catch (err) {
      console.error('Error fetching trash:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: DeletedItem) => {
    setIsRestoring(true);
    try {
      if (item.type === 'books') {
        await dataService.restoreBook(item.id);
      } else {
        await dataService.restoreLedger(item.id);
      }
      triggerHaptic('medium');
      loadDeletedItems();
      onRefresh();
    } catch (err) {
      console.error('Error restoring item:', err);
    } finally {
      setIsRestoring(false);
    }
  };

  const activeItems = activeTab === 'all' 
    ? items 
    : items.filter(item => item.type === activeTab);

  const formatDeletedDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDay < 30) return `${diffDay}d ago`;
      return date.toLocaleDateString();
    } catch (err) {
      return 'Recently';
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recycle Bin"
    >
      <div className="space-y-6">
        {/* Header Tabs */}
        <div className="flex p-1 bg-input/50 rounded-2xl border border-border/40">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'books', label: 'Books' },
            { id: 'ledgers', label: 'Ledgers' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                activeTab === tab.id 
                ? 'bg-primary text-primary-contrast shadow-lg' 
                : 'text-secondary hover:text-primary'
              }`}
            >
              {tab.label}
              {tab.id === 'all' && items.length > 0 && ` (${items.length})`}
            </button>
          ))}
        </div>

        {/* List Content */}
        <div className="min-h-[400px] max-h-[60vh] overflow-y-auto space-y-3 pr-2 scrollbar-numly">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 animate-pulse">
              <RefreshCw className="w-10 h-10 text-primary mb-3 animate-spin" />
              <p className="text-secondary text-xs font-black uppercase tracking-widest">Searching the trash...</p>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center mb-6 border border-border/40 shadow-2xl">
                <Trash2 className="w-10 h-10 text-secondary opacity-20" />
              </div>
              <h3 className="text-xl font-black text-primary uppercase tracking-tight">Trash is Empty</h3>
              <p className="text-secondary text-xs max-w-[240px] mt-2 leading-relaxed">
                Items you delete will appear here for recovery. Currently, your workspace is clean.
              </p>
            </div>
          ) : (
            activeItems.map((item) => (
              <div 
                key={`${item.type}-${item.id}`} 
                className="group p-4 rounded-[2rem] flex items-center gap-4 transition-all hover:bg-input/50 border border-border/30 hover:border-primary/20 backdrop-blur-xl"
              >
                {/* Visual Identity */}
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xl transition-transform group-hover:scale-110"
                  style={{
                    background: `${item.color || '#3B82F6'}15`,
                    border: `1.5px solid ${item.color || '#3B82F6'}40`,
                    color: item.color || '#3B82F6'
                  }}
                >
                  {item.type === 'books' ? <BookOpen className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-black text-primary truncate uppercase leading-tight">{item.name}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-input border border-border/40 text-secondary">
                      {item.type === 'books' ? 'Book' : 'Ledger'}
                    </span>
                    <p className="text-[10px] text-secondary font-bold flex items-center gap-1.5 opacity-60">
                      <Clock className="w-3 h-3" />
                      Deleted {formatDeletedDate(item.deleted_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestore(item)}
                    loading={isRestoring}
                    className="!px-4 !py-2 rounded-xl text-[9px] font-black uppercase tracking-widest !bg-emerald-500 !text-white shadow-lg shadow-emerald-500/20 hover:scale-105"
                  >
                    <RotateCcw className="w-3 h-3 mr-2" />
                    Restore
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        {items.length > 0 && (
          <div className="flex items-start gap-4 p-5 rounded-[2rem] bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <h4 className="text-[11px] font-black uppercase text-amber-500 tracking-wider">Storage Policy</h4>
              <p className="text-[10px] text-amber-500/70 mt-1 font-medium leading-relaxed">
                Deleted data is retained for 30 days. Restoring an item will place it back into its original book or space with all transactions intact.
              </p>
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button variant="secondary" onClick={onClose} className="w-full rounded-2xl font-black uppercase tracking-widest py-4">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
