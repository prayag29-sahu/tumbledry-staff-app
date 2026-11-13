'use client';

import React, { useState } from 'react';
import {
  X,
  Settings,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Check,
  Search,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

export interface PosSheetColumnDef {
  key: string;
  excelHeader: string;
  label: string;
  order: number;
  dataType: 'text' | 'number' | 'currency' | 'date';
  isVisibleToManager: boolean;
  isVisibleToSupervisor: boolean;
  isVisibleToOwner: boolean;
  isRequired?: boolean;
  isCustom?: boolean;
}

export interface PosSheetConfig {
  columns: PosSheetColumnDef[];
  allowManagerUpload: boolean;
  allowManagerDelete: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface PosSheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  initialConfig: PosSheetConfig;
  onSuccess: (updated: PosSheetConfig) => void;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export function PosSheetConfigModal({
  isOpen,
  onClose,
  shopId,
  initialConfig,
  onSuccess,
  onShowToast,
}: PosSheetConfigModalProps) {
  const [columns, setColumns] = useState<PosSheetColumnDef[]>(() => {
    return [...(initialConfig?.columns || [])].sort((a, b) => a.order - b.order);
  });
  const [allowManagerUpload, setAllowManagerUpload] = useState<boolean>(
    initialConfig?.allowManagerUpload ?? true
  );
  const [allowManagerDelete, setAllowManagerDelete] = useState<boolean>(
    initialConfig?.allowManagerDelete ?? false
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // New Custom Column State
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColHeader, setNewColHeader] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'currency' | 'date'>('text');
  const [newColVisibleManager, setNewColVisibleManager] = useState(true);

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;

    // Re-assign order index
    const reordered = newCols.map((col, idx) => ({ ...col, order: idx + 1 }));
    setColumns(reordered);
  };

  const handleUpdateCol = (key: string, patch: Partial<PosSheetColumnDef>) => {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
    );
  };

  const handleDeleteCol = (key: string) => {
    if (!confirm('Are you sure you want to remove this column?')) return;
    const filtered = columns.filter((c) => c.key !== key);
    const reordered = filtered.map((col, idx) => ({ ...col, order: idx + 1 }));
    setColumns(reordered);
  };

  const handleAddCustomColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColLabel.trim() || !newColHeader.trim()) {
      alert('Please provide both Display Label and Excel Header Name.');
      return;
    }

    const key = `custom_${newColLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const newCol: PosSheetColumnDef = {
      key,
      excelHeader: newColHeader.trim(),
      label: newColLabel.trim(),
      order: columns.length + 1,
      dataType: newColType,
      isVisibleToManager: newColVisibleManager,
      isVisibleToSupervisor: true,
      isVisibleToOwner: true,
      isCustom: true,
    };

    setColumns([...columns, newCol]);
    setNewColLabel('');
    setNewColHeader('');
    setNewColType('text');
    setIsAddingCustom(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: PosSheetConfig = {
        columns,
        allowManagerUpload,
        allowManagerDelete,
      };

      const res = await apiRequest<{ config: PosSheetConfig; message: string }>(
        `/api/shops/${shopId}/pos-sheet/config`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );

      if (onShowToast) onShowToast(res.message || 'Configuration saved successfully.', 'success');
      onSuccess(res.config || payload);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      if (onShowToast) onShowToast(msg, 'error');
      else alert(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredColumns = columns.filter((c) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return c.label.toLowerCase().includes(q) || c.excelHeader.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-brand-forest/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl border border-border-subtle shadow-clay-lg p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-brand-forest">
                  Daily POS Sheet Configuration
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-cream text-brand-forest border border-border-subtle">
                  {columns.length} Columns
                </span>
              </div>
              <p className="text-xs text-content-muted mt-0.5">
                Customize column display names, Excel matching headers, reorder, and control Manager visibility.
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

        {/* Manager Upload Permissions Bar */}
        <div className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-brand-forest">
              <input
                type="checkbox"
                checked={allowManagerUpload}
                onChange={(e) => setAllowManagerUpload(e.target.checked)}
                className="w-4 h-4 rounded text-brand-forest focus:ring-brand-forest"
              />
              <span>Allow Manager to Upload Excel Sheets</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-content-muted">
              <input
                type="checkbox"
                checked={allowManagerDelete}
                onChange={(e) => setAllowManagerDelete(e.target.checked)}
                className="w-4 h-4 rounded text-brand-forest focus:ring-brand-forest"
              />
              <span>Allow Manager to Delete/Rollback Batches</span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingCustom(!isAddingCustom)}
            className="px-3 py-1.5 rounded-xl bg-brand-forest text-brand-lime font-black text-xs shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Add Custom Column</span>
          </button>
        </div>

        {/* Add Custom Column Form (Toggleable) */}
        {isAddingCustom && (
          <form
            onSubmit={handleAddCustomColumn}
            className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3 shrink-0 animate-fade-in text-xs"
          >
            <h4 className="font-black text-brand-forest flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Define New Column</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">
                  Display Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ironer Name"
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border-subtle bg-white text-xs font-bold focus:ring-2 focus:ring-brand-forest focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">
                  Excel Header in File *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ironer"
                  value={newColHeader}
                  onChange={(e) => setNewColHeader(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border-subtle bg-white text-xs font-bold focus:ring-2 focus:ring-brand-forest focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">
                  Data Type
                </label>
                <select
                  value={newColType}
                  onChange={(e) => setNewColType(e.target.value as 'text' | 'number' | 'currency' | 'date')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border-subtle bg-white text-xs font-bold focus:ring-2 focus:ring-brand-forest focus:outline-none"
                >
                  <option value="text">Text / String</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency (₹)</option>
                  <option value="date">Date</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px]">
                  <input
                    type="checkbox"
                    checked={newColVisibleManager}
                    onChange={(e) => setNewColVisibleManager(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-forest"
                  />
                  <span>Show to Manager</span>
                </label>
                <button
                  type="submit"
                  className="ml-auto px-3 py-1.5 rounded-lg bg-brand-forest text-white font-black text-xs shadow-sm"
                >
                  Add
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Search Bar for Columns */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search column by label or Excel header..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border-subtle bg-surface-cream/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-forest"
          />
        </div>

        {/* Columns Table / List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          <div className="sticky top-0 bg-white z-10 grid grid-cols-12 gap-2 pb-1.5 border-b border-border-subtle text-[11px] font-black uppercase text-content-muted tracking-wider">
            <span className="col-span-1 text-center">#</span>
            <span className="col-span-4">Display Label</span>
            <span className="col-span-4">Excel Header Match</span>
            <span className="col-span-2 text-center">Manager Sees?</span>
            <span className="col-span-1 text-right">Actions</span>
          </div>

          {filteredColumns.map((col) => {
            const actualIndex = columns.findIndex((c) => c.key === col.key);
            return (
              <div
                key={col.key}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl border border-border-subtle/80 hover:border-brand-forest/40 bg-white transition-all text-xs"
              >
                {/* Reorder up/down */}
                <div className="col-span-1 flex items-center justify-center gap-0.5">
                  <span className="text-[10px] font-mono text-content-muted w-4 text-center">
                    {col.order}
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={actualIndex === 0}
                      onClick={() => handleMove(actualIndex, 'up')}
                      className="p-0.5 text-content-muted hover:text-brand-forest disabled:opacity-20"
                      title="Move up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={actualIndex === columns.length - 1}
                      onClick={() => handleMove(actualIndex, 'down')}
                      className="p-0.5 text-content-muted hover:text-brand-forest disabled:opacity-20"
                      title="Move down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Display Label (Editable) */}
                <div className="col-span-4">
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) => handleUpdateCol(col.key, { label: e.target.value })}
                    className="w-full px-2 py-1 rounded-lg border border-border-subtle bg-surface-cream/30 hover:bg-white focus:bg-white text-xs font-bold text-content-primary focus:ring-1 focus:ring-brand-forest focus:outline-none"
                  />
                </div>

                {/* Excel Header (Editable) */}
                <div className="col-span-4">
                  <input
                    type="text"
                    value={col.excelHeader}
                    onChange={(e) => handleUpdateCol(col.key, { excelHeader: e.target.value })}
                    className="w-full px-2 py-1 rounded-lg border border-border-subtle bg-surface-cream/30 hover:bg-white focus:bg-white text-xs font-mono text-content-primary focus:ring-1 focus:ring-brand-forest focus:outline-none"
                  />
                </div>

                {/* Manager Visibility Checkbox */}
                <div className="col-span-2 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateCol(col.key, {
                        isVisibleToManager: !col.isVisibleToManager,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-all ${
                      col.isVisibleToManager
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-surface-cream text-content-muted border-border-subtle'
                    }`}
                  >
                    {col.isVisibleToManager ? (
                      <>
                        <Eye className="w-3 h-3 text-emerald-600" />
                        <span>Visible</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3 text-content-muted" />
                        <span>Hidden</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Delete Column (if custom) */}
                <div className="col-span-1 flex items-center justify-end">
                  {col.isCustom ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCol(col.key)}
                      className="p-1 text-content-muted hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Delete Custom Column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-content-muted/40">SYS</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle shrink-0">
          <span className="text-[11px] text-content-muted">
            {columns.filter((c) => c.isVisibleToManager).length} of {columns.length} columns visible to Manager
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-border-subtle bg-white text-content-primary font-bold text-xs hover:bg-surface-cream"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-brand-forest text-brand-lime font-black text-xs shadow-sm hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
