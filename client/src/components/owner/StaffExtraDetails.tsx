'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { ClipboardList, Save, ChevronDown } from 'lucide-react';

interface ExtraField {
  id: string;
  key: string;
  label: string;
  helpText?: string | null;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'FILE_IMAGE' | 'DROPDOWN' | 'YES_NO';
  isRequired: boolean;
  dropdownOptions: string[];
  value: string | null;
}

interface Props {
  shopId: string;
  staffMemberId: string;
  /** Whether the viewer can edit (Owner always can). */
  canEdit?: boolean;
}

/**
 * Shows the custom fields ("extra details") that apply to this staff member's job role
 * and lets the owner fill / update them. Data comes from and is saved to the database.
 */
export function StaffExtraDetails({ shopId, staffMemberId, canEdit = true }: Props) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ExtraField[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ fields: ExtraField[] }>(`/api/shops/${shopId}/staff/${staffMemberId}/custom-fields`);
      setFields(res.fields || []);
      setDraft(Object.fromEntries((res.fields || []).map((f) => [f.id, f.value ?? ''])));
    } catch {
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, staffMemberId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await apiRequest(`/api/shops/${shopId}/staff/${staffMemberId}/custom-fields`, {
        method: 'PUT',
        body: JSON.stringify({
          values: fields.map((f) => ({ fieldId: f.id, value: draft[f.id]?.trim() ? draft[f.id].trim() : null })),
        }),
      });
      setMessage('Saved.');
      setTimeout(() => setMessage(null), 2500);
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const filledCount = fields.filter((f) => f.value).length;
  const inputCls = 'w-full px-3 py-2 text-xs rounded-xl bg-white border border-border-subtle focus:ring-1 focus:ring-brand-forest disabled:opacity-70';

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-cream/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-black text-brand-forest"
      >
        <span className="flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4" />
          Extra Details (Custom Fields)
          {open && fields.length > 0 && (
            <span className="text-[10px] font-semibold text-content-muted">· {filledCount}/{fields.length} filled</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && fields.length === 0 ? (
            <p className="text-xs text-content-muted py-2">Loading…</p>
          ) : fields.length === 0 ? (
            <p className="text-xs text-content-muted py-2">
              No custom fields apply to this job role. Add them in the <strong>Custom Fields Builder</strong> tab.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <div key={f.id}>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      {f.label} {f.isRequired && <span className="text-red-500">*</span>}
                    </label>
                    {f.fieldType === 'DROPDOWN' ? (
                      <select
                        disabled={!canEdit}
                        value={draft[f.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="">— Select —</option>
                        {f.dropdownOptions.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.fieldType === 'YES_NO' ? (
                      <select
                        disabled={!canEdit}
                        value={draft[f.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="">— Select —</option>
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                    ) : (
                      <input
                        disabled={!canEdit}
                        type={f.fieldType === 'NUMBER' ? 'number' : f.fieldType === 'DATE' ? 'date' : f.fieldType === 'FILE_IMAGE' ? 'url' : 'text'}
                        placeholder={f.fieldType === 'FILE_IMAGE' ? 'Paste photo / document link' : ''}
                        value={draft[f.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                        className={inputCls}
                      />
                    )}
                    {f.helpText && <p className="text-[10px] text-content-muted mt-0.5">{f.helpText}</p>}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="flex items-center justify-end gap-2">
                  {message && <span className="text-[11px] font-semibold text-brand-forest">{message}</span>}
                  <button
                    type="button"
                    onClick={save}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving…' : 'Save Details'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
