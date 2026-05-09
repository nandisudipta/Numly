import { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useLedgerCreate } from '../../hooks/useLedgerCreate';
import { X, Plus } from 'lucide-react';

interface CreateLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  businessId: string;
  bookId: string;
  existingLedgerNames: string[];
}

type UnitType = 'INR' | 'gm' | 'pcs';

export function CreateLedgerModal({
  isOpen,
  onClose,
  onSuccess,
  businessId,
  bookId,
  existingLedgerNames,
}: CreateLedgerModalProps) {
  const { create, isLoading, error, setError } = useLedgerCreate();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('INR');
  const [decimalPrecision, setDecimalPrecision] = useState(2);
  const [color, setColor] = useState('#3B82F6');

  // Categories
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryRequired, setCategoryRequired] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');

  // Custom fields
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldMandatory, setCustomFieldMandatory] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<string[]>([]);

  // Restrictions
  const [restrictBackdated, setRestrictBackdated] = useState<'always' | 'never' | 'one_day'>('always');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm();
      setTimeout(() => nameInputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setUnitType('INR');
    setDecimalPrecision(2);
    setColor('#3B82F6');
    setCategories([]);
    setCategoryRequired(false);
    setCategoryInput('');
    setCustomFieldName('');
    setCustomFieldMandatory(false);
    setCustomFieldValues([]);
    setRestrictBackdated('always');
    setError(null);
  };

  const addCategory = () => {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
      setCategoryInput('');
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
  };


  const handleCreateClick = async () => {
    // Validate name uniqueness
    if (existingLedgerNames.some(n => n.toLowerCase() === name.trim().toLowerCase())) {
      setError('A ledger with this name already exists in this book');
      return;
    }

    const customFields = customFieldName.trim()
      ? [{
          name: customFieldName.trim(),
          isMandatory: customFieldMandatory,
          values: customFieldValues,
        }]
      : [];

    const success = await create({
      businessId,
      bookId,
      name: name.trim(),
      unitType,
      decimalPrecision,
      categoryRequired,
      categories,
      customFields,
      restrictBackdated,
      color,
    });

    if (success) {
      onSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Ledger">
      <div className="space-y-5">
        {/* Basic Info */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-primary">Basic Information</h3>

          <Input
            ref={nameInputRef}
            type="text"
            label="Ledger Name"
            placeholder="e.g., Cash Flow, Inventory, etc."
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            maxLength={100}
            disabled={isLoading}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary">Unit Type</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as UnitType)}
                disabled={isLoading}
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-gold/50"
              >
                <option value="INR">₹ Indian Rupee (INR)</option>
                <option value="gm">⚖️ Grams (gm)</option>
                <option value="pcs">📦 Pieces (pcs)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-secondary">Decimal Precision</label>
              <input
                type="number"
                min={0}
                max={4}
                value={decimalPrecision}
                onChange={(e) => setDecimalPrecision(parseInt(e.target.value) || 2)}
                disabled={isLoading || unitType === 'pcs'}
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary">Color</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 ${color === c ? 'border-gold' : 'border-border'}`}
                  style={{ backgroundColor: c }}
                  disabled={isLoading}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="categoryRequired"
              checked={categoryRequired}
              onChange={(e) => setCategoryRequired(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="categoryRequired" className="text-sm font-medium text-primary">
              Require Categories
            </label>
          </div>

          {categoryRequired && (
            <div className="pl-6 space-y-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add category"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  disabled={isLoading}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={addCategory}
                  disabled={!categoryInput.trim() || isLoading}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat}
                    className="px-3 py-1 bg-gold/10 text-gold text-xs rounded-full flex items-center gap-2"
                  >
                    {cat}
                    <button
                      onClick={() => removeCategory(cat)}
                      className="hover:opacity-70"
                      disabled={isLoading}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Custom Fields */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasCustomField"
              checked={!!customFieldName}
              onChange={(e) => {
                if (!e.target.checked) {
                  setCustomFieldName('');
                  setCustomFieldValues([]);
                  setCustomFieldMandatory(false);
                }
              }}
              disabled={isLoading}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="hasCustomField" className="text-sm font-medium text-primary">
              Add Custom Field
            </label>
          </div>

          {customFieldName && (
            <div className="pl-6 space-y-2">
              <Input
                type="text"
                label="Field Name"
                placeholder="e.g., Department, Project, etc."
                value={customFieldName}
                onChange={(e) => setCustomFieldName(e.target.value)}
                disabled={isLoading}
                maxLength={50}
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fieldMandatory"
                  checked={customFieldMandatory}
                  onChange={(e) => setCustomFieldMandatory(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="fieldMandatory" className="text-xs font-medium text-secondary">
                  Make mandatory
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Restrictions */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">Backdated Entries</label>
          <select
            value={restrictBackdated}
            onChange={(e) => setRestrictBackdated(e.target.value as any)}
            disabled={isLoading}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="always">Restrict Always</option>
            <option value="never">Allow Always</option>
            <option value="one_day">Allow up to 1 day ago</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleCreateClick}
            loading={isLoading}
          >
            Create Ledger
          </Button>
        </div>
      </div>
    </Modal>
  );
}
