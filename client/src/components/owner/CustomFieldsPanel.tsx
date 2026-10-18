'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Shop, PositionCategory, CustomFieldDefinition } from '../../types';
import { PlusCircle, Trash2, Pencil, X, Info, Users } from 'lucide-react';

const FIELD_TYPE_INFO: Record<CustomFieldDefinition['fieldType'], { label: string; hint: string }> = {
  TEXT: { label: 'Short text', hint: 'Any words, e.g. blood group, uniform size' },
  NUMBER: { label: 'Number', hint: 'Only numbers, e.g. years of experience' },
  DATE: { label: 'Date', hint: 'A calendar date, e.g. joining date, licence expiry' },
  DROPDOWN: { label: 'Pick from a list', hint: 'You give the choices, staff picks one' },
  YES_NO: { label: 'Yes / No', hint: 'A simple switch, e.g. has two-wheeler licence?' },
  FILE_IMAGE: { label: 'Photo / document link', hint: 'Link to a photo or document' },
};

interface Props {
  shops: Shop[];
}

export function CustomFieldsPanel({ shops }: Props) {
  const [shopId, setShopId] = useState<string>(shops[0]?.id || '');
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [roles, setRoles] = useState<PositionCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // form
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [fieldType, setFieldType] = useState<CustomFieldDefinition['fieldType']>('TEXT');
  const [options, setOptions] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!shopId && shops[0]?.id) setShopId(shops[0].id);
  }, [shops, shopId]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const [f, r] = await Promise.all([
        apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${shopId}/custom-fields`),
        apiRequest<{ categories: PositionCategory[] }>(`/api/config/shops/${shopId}/position-categories`),
      ]);
      setFields(f.fields || []);
      setRoles(r.categories || []);
    } catch {
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const resetForm = () => {
    setEditing(null);
    setLabel('');
    setKey('');
    setKeyTouched(false);
    setFieldType('TEXT');
    setOptions('');
    setIsRequired(false);
    setScopeIds([]);
  };

  const startEdit = (f: CustomFieldDefinition) => {
    setEditing(f);
    setLabel(f.label);
    setKey(f.key);
    setKeyTouched(true);
    setFieldType(f.fieldType);
    setOptions((f.dropdownOptions || []).join(', '));
    setIsRequired(f.isRequired);
    setScopeIds(f.positionCategoryIds || []);
  };

  // Auto-make the internal key from the label (owner can still change it)
  const onLabelChange = (v: string) => {
    setLabel(v);
    if (!keyTouched && !editing) {
      setKey(v.toLowerCase().trim().replace(/[^a-z\s_]/g, '').replace(/\s+/g, '_'));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopId || !label.trim()) return;
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z_]/g, '_');
    const optionsArray = fieldType === 'DROPDOWN' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [];
    if (fieldType === 'DROPDOWN' && optionsArray.length < 2) {
      alert('Please give at least 2 choices, separated by commas.');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/config/shops/${shopId}/custom-fields/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: label.trim(), isRequired, dropdownOptions: optionsArray, positionCategoryIds: scopeIds }),
        });
      } else {
        if (!cleanKey) {
          alert('Please enter an internal name.');
          setIsSaving(false);
          return;
        }
        await apiRequest(`/api/config/shops/${shopId}/custom-fields`, {
          method: 'POST',
          body: JSON.stringify({
            key: cleanKey,
            label: label.trim(),
            fieldType,
            isRequired,
            dropdownOptions: optionsArray,
            positionCategoryIds: scopeIds,
          }),
        });
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save field.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (f: CustomFieldDefinition) => {
    if (!confirm(`Delete "${f.label}"? Saved answers for this field will also be removed.`)) return;
    try {
      await apiRequest(`/api/config/shops/${shopId}/custom-fields/${f.id}`, { method: 'DELETE' });
      setFields((prev) => prev.filter((x) => x.id !== f.id));
      if (editing?.id === f.id) resetForm();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete field.');
    }
  };

  const visibleFields = fields.filter((f) => {
    if (roleFilter === 'ALL') return true;
    const scope = f.positionCategoryIds || [];
    if (roleFilter === 'EVERYONE') return scope.length === 0;
    return scope.length === 0 || scope.includes(roleFilter);
  });

  const inputCls = 'w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-brand-forest">Extra Staff Details (Custom Fields)</h2>
          <p className="text-xs text-content-muted">Add your own questions to staff profiles, e.g. blood group, uniform size, licence number</p>
        </div>
        {shops.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-content-muted">Shop:</span>
            <select
              value={shopId}
              onChange={(e) => {
                setShopId(e.target.value);
                setRoleFilter('ALL');
                resetForm();
              }}
              className="px-3 py-1.5 text-xs rounded-xl bg-surface-card border border-border-subtle font-bold text-brand-forest"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-3.5 rounded-2xl bg-brand-forest/[0.04] border border-brand-forest/15 text-[11px] text-brand-forest leading-relaxed flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>How it works:</strong> 1) Create a field here and choose which job roles it is for. 2) Open any staff member → <strong>Extra Details</strong> and fill the answer. Only staff whose job role matches will see that field.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-brand-forest">{editing ? 'Edit Field' : 'Add New Field'}</h3>
            {editing && (
              <button onClick={resetForm} className="p-1 rounded-lg hover:bg-surface-hover text-content-muted" title="Cancel edit">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <form onSubmit={save} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Question / label <span className="text-red-500">*</span></label>
              <input required value={label} onChange={(e) => onLabelChange(e.target.value)} placeholder="e.g. Blood Group" className={inputCls} />
              <p className="text-[10px] text-content-muted mt-0.5">This is what you will see on the staff profile.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Internal name</label>
              <input
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toLowerCase().replace(/[^a-z_]/g, ''));
                }}
                disabled={!!editing}
                placeholder="blood_group"
                className={`${inputCls} font-mono disabled:opacity-60`}
              />
              <p className="text-[10px] text-content-muted mt-0.5">
                {editing ? 'Cannot change after creating.' : 'Filled automatically. Small letters and _ only. Must be unique in this shop.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Answer type</label>
              <select
                value={fieldType}
                disabled={!!editing}
                onChange={(e) => setFieldType(e.target.value as CustomFieldDefinition['fieldType'])}
                className={`${inputCls} disabled:opacity-60`}
              >
                {(Object.keys(FIELD_TYPE_INFO) as CustomFieldDefinition['fieldType'][]).map((t) => (
                  <option key={t} value={t}>{FIELD_TYPE_INFO[t].label}</option>
                ))}
              </select>
              <p className="text-[10px] text-content-muted mt-0.5">{FIELD_TYPE_INFO[fieldType].hint}</p>
            </div>

            {fieldType === 'DROPDOWN' && (
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Choices (separate with commas)</label>
                <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="e.g. S, M, L, XL" className={inputCls} />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Who is this for?</label>
              <label className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer mb-1.5 ${scopeIds.length === 0 ? 'border-brand-forest bg-brand-forest/5 font-bold text-brand-forest' : 'border-border-subtle text-content-muted'}`}>
                <input type="checkbox" checked={scopeIds.length === 0} onChange={() => setScopeIds([])} />
                All staff
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {roles.map((r) => {
                  const on = scopeIds.includes(r.id);
                  return (
                    <label key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${on ? 'border-brand-forest bg-brand-forest/5 font-bold text-brand-forest' : 'border-border-subtle text-content-muted'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setScopeIds((prev) => (on ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                      />
                      <span className="truncate">{r.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-content-muted mt-0.5">Leave “All staff” ticked, or pick only the job roles that need this.</p>
            </div>

            <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-brand-forest">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              Must be filled (required)
            </label>

            <button type="submit" disabled={isSaving} className="w-full py-2.5 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm flex items-center justify-center gap-1.5">
              <PlusCircle className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Field'}</span>
            </button>
          </form>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-sm font-black text-brand-forest">Fields in this shop ({visibleFields.length})</h3>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[{ id: 'ALL', name: 'Show all' }, { id: 'EVERYONE', name: 'For all staff' }, ...roles.map((r) => ({ id: r.id, name: r.name }))].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRoleFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                    roleFilter === opt.id ? 'bg-brand-forest text-white' : 'bg-surface-cream text-content-muted border border-border-subtle hover:text-brand-forest'
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {isLoading && fields.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">Loading fields…</div>
          ) : visibleFields.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">No fields here yet.</div>
          ) : (
            <div className="space-y-2">
              {visibleFields.map((f) => {
                const scope = f.positionCategoryIds || [];
                return (
                  <div key={f.id} className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-brand-forest">{f.label}</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-card border text-[10px] font-mono text-content-muted">{f.key}</span>
                        {f.isRequired && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">Required</span>}
                      </div>
                      <p className="text-[11px] text-content-muted">
                        {FIELD_TYPE_INFO[f.fieldType]?.label || f.fieldType}
                        {f.dropdownOptions?.length > 0 && ` • ${f.dropdownOptions.join(', ')}`}
                      </p>
                      <p className="text-[10px] font-semibold text-brand-forest flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {scope.length === 0 ? 'All staff' : scope.map((id) => roleName.get(id) || 'Removed role').join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(f)} className="p-1.5 rounded-lg bg-surface-card border border-border-subtle hover:bg-surface-hover text-brand-forest" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(f)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
