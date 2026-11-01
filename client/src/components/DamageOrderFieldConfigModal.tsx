'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import {
  X,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Settings,
} from 'lucide-react';

export interface StandardFieldConfig {
  key: string;
  label: string;
  isVisible: boolean;
  isRequired: boolean;
  type: string;
  canHide?: boolean;
}

export interface CustomFieldConfig {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'boolean';
  options?: string[];
  isRequired: boolean;
  isVisible: boolean;
}

export interface DamageOrderFieldsConfig {
  standardFields: StandardFieldConfig[];
  customFields: CustomFieldConfig[];
}

interface DamageOrderFieldConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  initialConfig?: DamageOrderFieldsConfig | null;
  onSuccess: (updatedConfig: DamageOrderFieldsConfig) => void;
}

const DEFAULT_STANDARD_FIELDS: StandardFieldConfig[] = [
  { key: 'orderDate', label: 'Order Date', isVisible: true, isRequired: true, type: 'date', canHide: false },
  { key: 'orderId', label: 'Order ID', isVisible: true, isRequired: true, type: 'text', canHide: false },
  { key: 'serviceType', label: 'Service Type', isVisible: true, isRequired: true, type: 'select', canHide: true },
  { key: 'piecesCount', label: 'Total Pieces in Order', isVisible: true, isRequired: true, type: 'number', canHide: true },
  { key: 'totalAmount', label: 'Total Order Amount (₹)', isVisible: true, isRequired: false, type: 'number', canHide: true },
  { key: 'returnPiecesCount', label: 'Return Pieces Count', isVisible: true, isRequired: false, type: 'number', canHide: true },
  { key: 'returnAmount', label: 'Return Article Amount (₹)', isVisible: true, isRequired: false, type: 'number', canHide: true },
  { key: 'finalBillingAmount', label: 'Final Billing Amount (₹)', isVisible: true, isRequired: false, type: 'number', canHide: true },
  { key: 'returnReason', label: 'Return Article Reason (Why)', isVisible: true, isRequired: false, type: 'textarea', canHide: true },
  { key: 'damageReason', label: 'Damage Reason (How)', isVisible: true, isRequired: false, type: 'textarea', canHide: true },
  { key: 'photos', label: 'Proof & Photos of Damage', isVisible: true, isRequired: false, type: 'photos', canHide: true },
];

export function DamageOrderFieldConfigModal({
  isOpen,
  onClose,
  shopId,
  initialConfig,
  onSuccess,
}: DamageOrderFieldConfigModalProps) {
  const [standardFields, setStandardFields] = useState<StandardFieldConfig[]>(DEFAULT_STANDARD_FIELDS);
  const [customFields, setCustomFields] = useState<CustomFieldConfig[]>([]);
  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('standard');

  // New custom field form state
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<CustomFieldConfig['type']>('text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.standardFields && initialConfig.standardFields.length > 0) {
        // Merge with default to guarantee all keys exist
        const merged = DEFAULT_STANDARD_FIELDS.map((def) => {
          const found = initialConfig.standardFields.find((f) => f.key === def.key);
          return found ? { ...def, ...found } : def;
        });
        setStandardFields(merged);
      } else {
        setStandardFields(DEFAULT_STANDARD_FIELDS);
      }
      setCustomFields(initialConfig.customFields || []);
    } else {
      setStandardFields(DEFAULT_STANDARD_FIELDS);
      setCustomFields([]);
    }
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const handleUpdateStandardLabel = (key: string, newLabelVal: string) => {
    setStandardFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, label: newLabelVal } : f))
    );
  };

  const handleToggleStandardVisibility = (key: string) => {
    setStandardFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, isVisible: !f.isVisible } : f))
    );
  };

  const handleAddCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = newLabel.trim();
    if (!trimmed) {
      setError('Field label cannot be empty.');
      return;
    }

    const key = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 30);

    const existingKey =
      standardFields.some((f) => f.key.toLowerCase() === key) ||
      customFields.some((f) => f.key.toLowerCase() === key);

    const finalKey = existingKey ? `${key}_${Date.now().toString().slice(-4)}` : key;

    const parsedOptions =
      newType === 'select'
        ? newOptions
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;

    const newField: CustomFieldConfig = {
      id: `cf_${Date.now()}`,
      key: finalKey,
      label: trimmed,
      type: newType,
      options: parsedOptions,
      isRequired: newRequired,
      isVisible: true,
    };

    setCustomFields((prev) => [...prev, newField]);
    setNewLabel('');
    setNewOptions('');
    setNewRequired(false);
  };

  const handleDeleteCustomField = (id: string) => {
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleToggleCustomVisibility = (id: string) => {
    setCustomFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isVisible: !f.isVisible } : f))
    );
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    const configPayload: DamageOrderFieldsConfig = {
      standardFields,
      customFields,
    };

    try {
      await apiRequest<{ config: DamageOrderFieldsConfig; message: string }>(
        `/api/shops/${shopId}/special-damage-orders/config`,
        {
          method: 'PUT',
          body: JSON.stringify(configPayload),
        }
      );

      onSuccess(configPayload);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving configuration';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all field names and visibility to system defaults?')) {
      setStandardFields(DEFAULT_STANDARD_FIELDS);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-brand-forest/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-surface-card rounded-2xl sm:rounded-clay border border-border-subtle shadow-clay-lg p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-forest/10 text-brand-forest flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-brand-forest flex items-center gap-2">
                Configure Damage Order Fields
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-brand-forest/15 text-brand-forest">
                  Owner Admin
                </span>
              </h2>
              <p className="text-xs text-content-muted">
                Rename labels, toggle visibility, and create custom order fields
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full bg-surface-cream hover:bg-red-50 text-content-muted hover:text-red-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex items-center gap-2 p-1 bg-surface-cream rounded-xl border border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab('standard')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
              activeTab === 'standard'
                ? 'bg-brand-forest text-white shadow-sm'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            Standard Fields ({standardFields.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
              activeTab === 'custom'
                ? 'bg-brand-forest text-white shadow-sm'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            Custom Fields ({customFields.length})
          </button>
        </div>

        {/* TAB 1: STANDARD FIELDS */}
        {activeTab === 'standard' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-content-muted">
              <span>Rename any field or hide unneeded ones</span>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-brand-forest font-bold hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>

            <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
              {standardFields.map((field) => (
                <div
                  key={field.key}
                  className={`p-3 rounded-xl border transition-all ${
                    field.isVisible
                      ? 'bg-white border-border-subtle shadow-sm'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-content-muted font-bold">
                      {field.key}
                      {field.isRequired && <span className="text-red-500 ml-1">*required</span>}
                    </span>

                    {field.canHide !== false ? (
                      <button
                        type="button"
                        onClick={() => handleToggleStandardVisibility(field.key)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                          field.isVisible
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {field.isVisible ? (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>Visible</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-content-muted bg-surface-cream px-2 py-0.5 rounded-full">
                        Always Visible
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => handleUpdateStandardLabel(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-border-subtle bg-white text-content-primary focus:ring-1 focus:ring-brand-forest focus:outline-none"
                    placeholder="Field Display Label..."
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOM FIELDS */}
        {activeTab === 'custom' && (
          <div className="space-y-3">
            {/* Form to add a new custom field */}
            <form
              onSubmit={handleAddCustomField}
              className="p-3.5 rounded-xl bg-surface-cream/50 border border-brand-forest/20 space-y-2.5"
            >
              <h4 className="text-xs font-black text-brand-forest flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add New Custom Field
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-content-muted mb-0.5">
                    Field Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Customer Phone, Tag No..."
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border-subtle bg-white focus:ring-1 focus:ring-brand-forest focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-content-muted mb-0.5">
                    Field Type
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as CustomFieldConfig['type'])}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border-subtle bg-white focus:ring-1 focus:ring-brand-forest focus:outline-none"
                  >
                    <option value="text">Single-line Text</option>
                    <option value="textarea">Multi-line Text</option>
                    <option value="number">Number</option>
                    <option value="select">Dropdown Options</option>
                    <option value="date">Date Picker</option>
                    <option value="boolean">Yes / No Switch</option>
                  </select>
                </div>
              </div>

              {newType === 'select' && (
                <div>
                  <label className="block text-[11px] font-bold text-content-muted mb-0.5">
                    Dropdown Options (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. In Repair, Re-wash, Customer Return, Scrap"
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border-subtle bg-white focus:ring-1 focus:ring-brand-forest focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-content-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRequired}
                    onChange={(e) => setNewRequired(e.target.checked)}
                    className="rounded text-brand-forest focus:ring-brand-forest"
                  />
                  <span>Mandatory / Required Field</span>
                </label>

                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-brand-forest text-white text-xs font-black shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Field</span>
                </button>
              </div>
            </form>

            {/* List of custom fields */}
            <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
              {customFields.length === 0 ? (
                <div className="p-6 text-center text-content-muted bg-white rounded-xl border border-dashed border-border-subtle text-xs">
                  No custom fields added yet. Use the form above to add custom fields like Customer Mobile, Storage Bin, or Tag Numbers.
                </div>
              ) : (
                customFields.map((field) => (
                  <div
                    key={field.id}
                    className="p-3 rounded-xl bg-white border border-border-subtle shadow-sm flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-brand-forest">{field.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-cream text-content-muted">
                          {field.type}
                        </span>
                        {field.isRequired && (
                          <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded">
                            Required
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-content-muted">key: {field.key}</span>
                      {field.options && field.options.length > 0 && (
                        <p className="text-[10px] text-content-muted mt-0.5">
                          Options: {field.options.join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleCustomVisibility(field.id)}
                        className={`p-1.5 rounded-lg text-xs font-bold ${
                          field.isVisible
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                        title={field.isVisible ? 'Hide Field' : 'Show Field'}
                      >
                        {field.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCustomField(field.id)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete custom field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-content-muted hover:text-content-primary rounded-xl hover:bg-surface-cream transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2.5 text-xs font-black text-white bg-brand-forest hover:bg-brand-forest/90 active:scale-95 rounded-xl shadow-clay-sm flex items-center gap-2 transition-all disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Field Schema...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

