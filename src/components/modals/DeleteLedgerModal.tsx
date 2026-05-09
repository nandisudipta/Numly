import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLedgerDelete } from '../../hooks/useLedgerDelete';
import { AlertCircle } from 'lucide-react';

interface DeleteLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ledgerId: string;
  ledgerName: string;
  transactionCount: number;
}

export function DeleteLedgerModal({
  isOpen,
  onClose,
  onSuccess,
  ledgerId,
  ledgerName,
  transactionCount,
}: DeleteLedgerModalProps) {
  const { delete: deleteLedger, isLoading, error } = useLedgerDelete();
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = async () => {
    const success = await deleteLedger(ledgerId, ledgerName, () => {
      onSuccess();
      onClose();
    });

    if (success) {
      setConfirmed(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Ledger"
      destructive
    >
      <div className="space-y-4">
        {/* Warning Icon */}
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-primary">
            Delete "{ledgerName}"?
          </h3>
          <p className="text-sm text-secondary">
            This ledger will be moved to Recycle Bin. You can restore it later.
          </p>
          {transactionCount > 0 && (
            <p className="text-xs text-gold bg-gold/10 px-3 py-2 rounded-lg">
              ⚠️ This ledger has {transactionCount} transaction{transactionCount !== 1 ? 's' : ''} that will also be deleted.
            </p>
          )}
        </div>

        {/* Confirmation Checkbox */}
        <div className="flex items-center gap-2 p-3 bg-surface rounded-lg">
          <input
            type="checkbox"
            id="confirm-delete"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="confirm-delete" className="text-sm text-secondary">
            Yes, delete this ledger
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={handleDelete}
            loading={isLoading}
            disabled={!confirmed || isLoading}
          >
            Delete Ledger
          </Button>
        </div>

        {/* Info */}
        <p className="text-xs text-secondary text-center">
          💡 Deleted ledgers can be recovered from Recycle Bin
        </p>
      </div>
    </Modal>
  );
}
