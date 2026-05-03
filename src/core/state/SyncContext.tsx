import { createContext, useContext, useState, ReactNode } from 'react';
import { syncEngine } from '../sync/syncEngine';
import { db } from '../db';
import type { SyncMode } from '../db/schema';
import { useLiveQuery } from 'dexie-react-hooks';

interface SyncContextType {
  mode: SyncMode;
  setMode: (mode: SyncMode) => void;
  pendingItemsCount: number;
  failedItemsCount: number;
  syncing: boolean;
  triggerManualSync: () => Promise<void>;
  triggerAuthSync: (userId: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SyncMode>('hybrid');
  const [syncing, setSyncing] = useState(false);

  // Use dexie's live querying to perfectly sync queue counts with UI without manual triggers
  const pendingItemsCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('pending').count(),
    []
  ) || 0;

  const failedItemsCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('failed').count(),
    []
  ) || 0;

  const setMode = (newMode: SyncMode) => {
    setModeState(newMode);
    syncEngine.setMode(newMode);
  };

  const triggerManualSync = async () => {
    if (mode === 'offline') return;
    setSyncing(true);
    await syncEngine.processQueue();
    setSyncing(false);
  };

  const triggerAuthSync = async (userId: string) => {
    setSyncing(true);
    await syncEngine.triggerAuthSync(userId);
    setSyncing(false);
  };

  return (
    <SyncContext.Provider
      value={{
        mode,
        setMode,
        pendingItemsCount,
        failedItemsCount,
        syncing,
        triggerManualSync,
        triggerAuthSync
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
