'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Shop,
  PositionCategory,
  PermissionProfile,
  ServiceType,
  ActivityType,
  WorkflowProfile,
} from '../../types';
import { PlusCircle, Pencil, X, Check, Power, ShieldCheck, Briefcase, Shirt, Info } from 'lucide-react';

/** Plain-language meaning of each work-counting rule (keyed by DB workflowType). */
export const WORKFLOW_PLAIN_LABEL: Record<string, { title: string; hint: string }> = {
  PIECE_ACTIVITY: {
    title: 'Counts pieces × work steps',
    hint: 'For washerman / ironman. 5 shirts × (Wash + Iron) = 10 units.',
  },
  PER_ORDER: {
    title: 'Counts delivery orders',
    hint: 'For delivery boys. 1 order delivered = 1 unit.',
  },
  COUNT_BASED: {
    title: 'Counts pickups',
    hint: 'For pickup staff. 1 pickup = 1 unit.',
  },
};

export function workflowLabel(wf?: { workflowType: string; name?: string } | null): string {
  if (!wf) return 'No work counting';
  return WORKFLOW_PLAIN_LABEL[wf.workflowType]?.title || wf.name || wf.workflowType;
}

interface Capability {
  key: string;
  label: string;
  group: string;
}

interface Props {
  shops: Shop[];
  activities: ActivityType[];
  workflowProfiles: WorkflowProfile[];
  /** Called after any change so the parent can refresh shared lists. */
  onChanged?: () => void;
}

type SubTab = 'roles' | 'services' | 'access';

export function CatalogueRolesPanel({ shops, activities, workflowProfiles, onChanged }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('roles');

  // ── Job Roles ─────────────────────────────────────────────
  const [roleShopId, setRoleShopId] = useState<string>(shops[0]?.id || '');
  const [roles, setRoles] = useState<PositionCategory[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [roleModal, setRoleModal] = useState<null | { mode: 'add' | 'edit'; role?: PositionCategory }>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleWfId, setRoleWfId] = useState('');
  const [isSavingRole, setIsSavingRole] = useState(false);

  // ── Services ──────────────────────────────────────────────
  const [services, setServices] = useState<ServiceType[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [svcModal, setSvcModal] = useState<null | { mode: 'add' | 'edit'; svc?: ServiceType }>(null);
  const [svcName, setSvcName] = useState('');
  const [svcCode, setSvcCode] = useState('');
  const [svcSteps, setSvcSteps] = useState<string[]>([]);
  const [isSavingSvc, setIsSavingSvc] = useState(false);

  // ── Access Levels ─────────────────────────────────────────
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [accessModal, setAccessModal] = useState<null | { mode: 'add' | 'edit'; profile?: PermissionProfile }>(null);
  const [accName, setAccName] = useState('');
  const [accDesc, setAccDesc] = useState('');
  const [accCaps, setAccCaps] = useState<string[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  useEffect(() => {
    if (!roleShopId && shops[0]?.id) setRoleShopId(shops[0].id);
  }, [shops, roleShopId]);

  const fetchRoles = useCallback(async () => {
    if (!roleShopId) return;
    setIsLoadingRoles(true);
    try {
      const res = await apiRequest<{ categories: PositionCategory[] }>(`/api/config/shops/${roleShopId}/position-categories?includeInactive=1`);
      setRoles(res.categories || []);
    } catch {
      setRoles([]);
    } finally {
      setIsLoadingRoles(false);
    }
  }, [roleShopId]);

  const fetchServices = useCallback(async () => {
    setIsLoadingServices(true);
    try {
      const res = await apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types?includeInactive=1');
      setServices(res.serviceTypes || []);
    } catch {
      setServices([]);
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  const fetchAccess = useCallback(async () => {
    setIsLoadingAccess(true);
    try {
      const [p, c] = await Promise.all([
        apiRequest<{ profiles: PermissionProfile[] }>('/api/config/permission-profiles'),
        apiRequest<{ capabilities: Capability[] }>('/api/config/capabilities'),
      ]);
      setProfiles(p.profiles || []);
      setCapabilities(c.capabilities || []);
    } catch {
      setProfiles([]);
    } finally {
      setIsLoadingAccess(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'roles') fetchRoles();
    else if (subTab === 'services') fetchServices();
    else fetchAccess();
  }, [subTab, fetchRoles, fetchServices, fetchAccess]);

  const capLabel = useMemo(() => new Map(capabilities.map((c) => [c.key, c.label])), [capabilities]);
  const capGroups = useMemo(() => {
    const groups: Record<string, Capability[]> = {};
    for (const c of capabilities) (groups[c.group] ||= []).push(c);
    return groups;
  }, [capabilities]);

  // ── Role handlers ─────────────────────────────────────────
  const openRoleModal = (mode: 'add' | 'edit', role?: PositionCategory) => {
    setRoleName(role?.name || '');
    setRoleDesc(role?.description || '');
    setRoleWfId(role?.workflowProfileId || role?.workflowProfile?.id || '');
    setRoleModal({ mode, role });
  };

  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim() || !roleShopId) return;
    setIsSavingRole(true);
    try {
      if (roleModal?.mode === 'edit' && roleModal.role) {
        await apiRequest(`/api/config/shops/${roleShopId}/position-categories/${roleModal.role.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: roleName.trim(), description: roleDesc.trim() || null, workflowProfileId: roleWfId || null }),
        });
      } else {
        await apiRequest(`/api/config/shops/${roleShopId}/position-categories`, {
          method: 'POST',
          body: JSON.stringify({ name: roleName.trim(), description: roleDesc.trim() || undefined, workflowProfileId: roleWfId || undefined }),
        });
      }
      setRoleModal(null);
      await fetchRoles();
      onChanged?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save job role.');
    } finally {
      setIsSavingRole(false);
    }
  };

  const toggleRoleActive = async (role: PositionCategory) => {
    const next = role.isActive === false;
    try {
      await apiRequest(`/api/config/shops/${roleShopId}/position-categories/${role.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      });
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, isActive: next } : r)));
      onChanged?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update job role status.');
    }
  };

  // ── Service handlers ──────────────────────────────────────
  const openSvcModal = (mode: 'add' | 'edit', svc?: ServiceType) => {
    setSvcName(svc?.name || '');
    setSvcCode(svc?.code || '');
    setSvcSteps(svc?.activityMappings.map((m) => m.activityType.code) || []);
    setSvcModal({ mode, svc });
  };

  const saveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcName.trim()) return;
    setIsSavingSvc(true);
    try {
      if (svcModal?.mode === 'edit' && svcModal.svc) {
        await apiRequest(`/api/config/service-types/${svcModal.svc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: svcName.trim(), activityCodes: svcSteps }),
        });
      } else {
        if (!svcCode.trim()) {
          alert('Please enter a short code for the service.');
          setIsSavingSvc(false);
          return;
        }
        await apiRequest('/api/config/service-types', {
          method: 'POST',
          body: JSON.stringify({ name: svcName.trim(), code: svcCode.trim().toUpperCase(), activityCodes: svcSteps }),
        });
      }
      setSvcModal(null);
      await fetchServices();
      onChanged?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save service.');
    } finally {
      setIsSavingSvc(false);
    }
  };

  const toggleService = async (svc: ServiceType) => {
    const next = svc.isActive === false;
    try {
      await apiRequest(`/api/config/service-types/${svc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      });
      setServices((prev) => prev.map((s) => (s.id === svc.id ? { ...s, isActive: next } : s)));
      onChanged?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update service.');
    }
  };

  // ── Access handlers ───────────────────────────────────────
  const openAccessModal = (mode: 'add' | 'edit', profile?: PermissionProfile) => {
    setAccName(profile?.name || '');
    setAccDesc(profile?.description || '');
    setAccCaps(profile?.capabilities.map((c) => c.capability) || []);
    setAccessModal({ mode, profile });
  };

  const saveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    if (accCaps.length === 0) {
      alert('Tick at least one permission.');
      return;
    }
    setIsSavingAccess(true);
    try {
      if (accessModal?.mode === 'edit' && accessModal.profile) {
        await apiRequest(`/api/config/permission-profiles/${accessModal.profile.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: accName.trim(), description: accDesc.trim() || null, capabilities: accCaps }),
        });
      } else {
        await apiRequest('/api/config/permission-profiles', {
          method: 'POST',
          body: JSON.stringify({ name: accName.trim(), description: accDesc.trim() || undefined, capabilities: accCaps }),
        });
      }
      setAccessModal(null);
      await fetchAccess();
      onChanged?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save access level.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  const tabBtn = (id: SubTab, label: string) => (
    <button
      onClick={() => setSubTab(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
        subTab === id ? 'bg-brand-forest text-white' : 'text-content-muted hover:text-brand-forest'
      }`}
    >
      {label}
    </button>
  );

  const inputCls = 'w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest';

  return (
    <div className="space-y-4">
      {/* How it fits together */}
      <div className="p-3.5 rounded-2xl bg-brand-forest/[0.04] border border-brand-forest/15 text-[11px] text-brand-forest leading-relaxed flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Every staff member has <strong>two settings</strong>: a <strong>Job Role</strong> (their title and how their work is counted) and an{' '}
          <strong>Access Level</strong> (what they can open and do in the app). <strong>Services</strong> are what your shop sells; each service lists the work steps it needs.
          Everything here is saved in the database and shows up for all staff right away.
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-1 bg-surface-card rounded-xl border border-border-subtle w-fit overflow-x-auto max-w-full">
        {tabBtn('roles', `Job Roles${subTab === 'roles' ? ` (${roles.length})` : ''}`)}
        {tabBtn('services', `Services${subTab === 'services' ? ` (${services.length})` : ''}`)}
        {tabBtn('access', `Access Levels${subTab === 'access' ? ` (${profiles.length})` : ''}`)}
      </div>

      {/* ── JOB ROLES ─────────────────────────────────────── */}
      {subTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">Job Roles</h3>
              <p className="text-xs text-content-muted">Titles like Senior Washerman or Marketing Manager, and how their daily work is counted</p>
            </div>
            <div className="flex items-center gap-2">
              {shops.length > 1 && (
                <select
                  value={roleShopId}
                  onChange={(e) => setRoleShopId(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-surface-card border border-border-subtle font-bold text-brand-forest"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => openRoleModal('add')}
                className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Job Role</span>
              </button>
            </div>
          </div>

          {isLoadingRoles && roles.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">Loading job roles…</div>
          ) : roles.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">No job roles yet. Click “Add Job Role”.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roles.map((role) => {
                const isInactive = role.isActive === false;
                return (
                  <div key={role.id} className={`bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2 transition-all ${isInactive ? 'opacity-65 bg-surface-cream/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Briefcase className="w-4 h-4 text-brand-forest shrink-0" />
                        <h4 className="text-sm font-extrabold text-brand-forest truncate">{role.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider shrink-0 ${isInactive ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                          {isInactive ? 'Inactive' : 'Active'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => openRoleModal('edit', role)} title="Edit" className="p-1.5 rounded-lg bg-surface-cream border border-border-subtle hover:bg-surface-hover text-brand-forest">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleRoleActive(role)}
                          title={isInactive ? 'Activate role' : 'Deactivate role'}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            isInactive
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          {isInactive ? 'Activate' : 'Deactivate'}
                        </button>
                      </div>
                    </div>
                    <span className="inline-block px-2 py-0.5 rounded-lg clay-badge-gold text-[10px] font-bold">
                      {workflowLabel(role.workflowProfile)}
                    </span>
                    {role.description && <p className="text-xs text-content-muted">{role.description}</p>}
                    {isInactive ? (
                      <p className="text-[10px] font-bold text-amber-800">Deactivated — hidden from new staff role selection</p>
                    ) : !role.shopId ? (
                      <p className="text-[10px] text-content-muted">Shared by all shops</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SERVICES ──────────────────────────────────────── */}
      {subTab === 'services' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">Services</h3>
              <p className="text-xs text-content-muted">What customers can order. Work steps decide which tasks get created per piece.</p>
            </div>
            <button
              onClick={() => openSvcModal('add')}
              className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1 self-start"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Service</span>
            </button>
          </div>

          {isLoadingServices && services.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">Loading services…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.map((svc) => {
                const off = svc.isActive === false;
                return (
                  <div key={svc.id} className={`bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2 ${off ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-brand-forest shrink-0" />
                          <h4 className="text-sm font-extrabold text-brand-forest truncate">{svc.name}</h4>
                        </div>
                        <p className="text-[10px] text-content-muted font-mono mt-0.5">Code: {svc.code}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openSvcModal('edit', svc)} title="Edit" className="p-1.5 rounded-lg bg-surface-cream border border-border-subtle hover:bg-surface-hover text-brand-forest">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleService(svc)}
                          title={off ? 'Turn on' : 'Turn off'}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${off ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
                        >
                          {off ? 'Turn On' : 'Turn Off'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {svc.activityMappings.length === 0 ? (
                        <span className="text-[10px] text-content-muted">No work steps set</span>
                      ) : (
                        svc.activityMappings.map((am) => (
                          <span key={am.activityType.id} className="px-2 py-0.5 rounded bg-surface-cream text-[10px] font-semibold text-brand-forest border">
                            {am.activityType.name}
                          </span>
                        ))
                      )}
                    </div>
                    {off && <p className="text-[10px] font-bold text-amber-800">Turned off — not shown for new tasks</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ACCESS LEVELS ─────────────────────────────────── */}
      {subTab === 'access' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">Access Levels</h3>
              <p className="text-xs text-content-muted">Decide what each type of staff can see and do in the app</p>
            </div>
            <button
              onClick={() => openAccessModal('add')}
              className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1 self-start"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Access Level</span>
            </button>
          </div>

          {isLoadingAccess && profiles.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">Loading access levels…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profiles.map((p) => (
                <div key={p.id} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-brand-forest shrink-0" />
                      <h4 className="text-sm font-extrabold text-brand-forest truncate">{p.name}</h4>
                    </div>
                    {p.isOwnerOnly ? (
                      <span className="text-[10px] font-bold text-content-muted">Locked</span>
                    ) : (
                      <button onClick={() => openAccessModal('edit', p)} title="Edit" className="p-1.5 rounded-lg bg-surface-cream border border-border-subtle hover:bg-surface-hover text-brand-forest">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-content-muted">{p.description}</p>}
                  <ul className="space-y-0.5">
                    {p.capabilities.map((c) => (
                      <li key={c.id} className="text-[11px] text-brand-forest flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        {capLabel.get(c.capability) || c.capability}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ROLE MODAL ────────────────────────────────────── */}
      {roleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <form onSubmit={saveRole} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">{roleModal.mode === 'edit' ? 'Edit Job Role' : 'Add Job Role'}</h3>
              <button type="button" onClick={() => setRoleModal(null)} className="p-1 rounded-lg hover:bg-surface-hover text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Job title <span className="text-red-500">*</span></label>
              <input required value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. Senior Washerman, Marketing Manager" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Short description</label>
              <input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="What does this person do?" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-forest">How is their daily work counted?</label>
              <label className={`flex gap-2 p-2.5 rounded-xl border cursor-pointer ${roleWfId === '' ? 'border-brand-forest bg-brand-forest/5' : 'border-border-subtle'}`}>
                <input type="radio" name="wf" checked={roleWfId === ''} onChange={() => setRoleWfId('')} className="mt-0.5" />
                <span>
                  <span className="block text-xs font-bold text-brand-forest">No work counting</span>
                  <span className="block text-[10px] text-content-muted">For supervisor, manager, marketing or office staff. Only attendance is tracked.</span>
                </span>
              </label>
              {workflowProfiles.map((wf) => {
                const plain = WORKFLOW_PLAIN_LABEL[wf.workflowType];
                return (
                  <label key={wf.id} className={`flex gap-2 p-2.5 rounded-xl border cursor-pointer ${roleWfId === wf.id ? 'border-brand-forest bg-brand-forest/5' : 'border-border-subtle'}`}>
                    <input type="radio" name="wf" checked={roleWfId === wf.id} onChange={() => setRoleWfId(wf.id)} className="mt-0.5" />
                    <span>
                      <span className="block text-xs font-bold text-brand-forest">{plain?.title || wf.name}</span>
                      <span className="block text-[10px] text-content-muted">{plain?.hint || wf.description || ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-content-muted">
              Tip: what this person can open in the app is set separately under <strong>Access Levels</strong>, and picked when you add the staff member.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setRoleModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover">Cancel</button>
              <button type="submit" disabled={isSavingRole} className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm">
                {isSavingRole ? 'Saving…' : roleModal.mode === 'edit' ? 'Save Changes' : 'Create Job Role'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── SERVICE MODAL ─────────────────────────────────── */}
      {svcModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <form onSubmit={saveService} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">{svcModal.mode === 'edit' ? 'Edit Service' : 'Add Service'}</h3>
              <button type="button" onClick={() => setSvcModal(null)} className="p-1 rounded-lg hover:bg-surface-hover text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Service name <span className="text-red-500">*</span></label>
              <input required value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="e.g. Curtain Cleaning" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Short code {svcModal.mode === 'add' && <span className="text-red-500">*</span>}</label>
              <input
                value={svcCode}
                onChange={(e) => setSvcCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                disabled={svcModal.mode === 'edit'}
                placeholder="e.g. CURTAIN"
                className={`${inputCls} font-mono disabled:opacity-60`}
              />
              <p className="text-[10px] text-content-muted mt-0.5">
                {svcModal.mode === 'edit' ? 'Code cannot change (old records use it).' : 'Capital letters / numbers only. Used inside the system.'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Work steps for this service</label>
              <div className="grid grid-cols-2 gap-1.5">
                {activities.map((a) => {
                  const on = svcSteps.includes(a.code);
                  return (
                    <label key={a.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${on ? 'border-brand-forest bg-brand-forest/5 font-bold text-brand-forest' : 'border-border-subtle text-content-muted'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setSvcSteps((prev) => (on ? prev.filter((c) => c !== a.code) : [...prev, a.code]))}
                      />
                      {a.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setSvcModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover">Cancel</button>
              <button type="submit" disabled={isSavingSvc} className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm">
                {isSavingSvc ? 'Saving…' : svcModal.mode === 'edit' ? 'Save Changes' : 'Create Service'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── ACCESS MODAL ──────────────────────────────────── */}
      {accessModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <form onSubmit={saveAccess} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">{accessModal.mode === 'edit' ? 'Edit Access Level' : 'Add Access Level'}</h3>
              <button type="button" onClick={() => setAccessModal(null)} className="p-1 rounded-lg hover:bg-surface-hover text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Name <span className="text-red-500">*</span></label>
              <input required value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. Senior Washerman, Marketing" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1">Description</label>
              <input value={accDesc} onChange={(e) => setAccDesc(e.target.value)} placeholder="Who should get this access?" className={inputCls} />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-brand-forest">What can they do?</label>
              {Object.entries(capGroups).map(([group, caps]) => (
                <div key={group} className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-content-muted">{group}</p>
                  {caps.map((c) => {
                    const on = accCaps.includes(c.key);
                    return (
                      <label key={c.key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${on ? 'border-brand-forest bg-brand-forest/5 text-brand-forest font-semibold' : 'border-border-subtle text-content-muted'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setAccCaps((prev) => (on ? prev.filter((k) => k !== c.key) : [...prev, c.key]))}
                        />
                        {c.label}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            {accessModal.mode === 'edit' && (
              <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">
                Changes apply to every staff member with this access level the next time they open the app.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAccessModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover">Cancel</button>
              <button type="submit" disabled={isSavingAccess} className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm">
                {isSavingAccess ? 'Saving…' : accessModal.mode === 'edit' ? 'Save Changes' : 'Create Access Level'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
