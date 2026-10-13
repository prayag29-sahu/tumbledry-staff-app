'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Shop,
  PositionCategory,
  PermissionProfile,
  ServiceType,
  ActivityType,
  WorkflowProfile,
} from '../../types';
import {
  ShieldCheck,
  Building2,
  PlusCircle,
  Tag,
  Sliders,
  Layers,
  Sparkles,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

export default function OwnerPage() {
  const [activeTab, setActiveTab] = useState<'shops' | 'positions' | 'catalogues' | 'permissions'>('shops');
  const [shops, setShops] = useState<Shop[]>([]);
  const [positions, setPositions] = useState<PositionCategory[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Shop Modal
  const [isAddShopOpen, setIsAddShopOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopTimezone, setShopTimezone] = useState('Asia/Kolkata');
  const [isSubmittingShop, setIsSubmittingShop] = useState(false);

  // Edit Shop Modal
  const [isEditShopOpen, setIsEditShopOpen] = useState(false);
  const [editingShopId, setEditingShopId] = useState('');
  const [editShopName, setEditShopName] = useState('');
  const [editShopCode, setEditShopCode] = useState('');
  const [editShopAddress, setEditShopAddress] = useState('');
  const [editShopTimezone, setEditShopTimezone] = useState('Asia/Kolkata');
  const [editShopStatus, setEditShopStatus] = useState<'ACTIVE' | 'PAUSED' | 'ARCHIVED'>('ACTIVE');
  const [isSubmittingEditShop, setIsSubmittingEditShop] = useState(false);
  const [deletingShopId, setDeletingShopId] = useState<string | null>(null);

  // New Position Modal
  const [isAddPosOpen, setIsAddPosOpen] = useState(false);
  const [posName, setPosName] = useState('');
  const [posDescription, setPosDescription] = useState('');
  const [posWfId, setPosWfId] = useState('');
  const [isSubmittingPos, setIsSubmittingPos] = useState(false);

  const fetchAllConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shopsData, wfData, svcData, actData, permData] = await Promise.all([
        apiRequest<{ shops: Shop[] }>('/api/shops').catch(() => ({ shops: [] })),
        apiRequest<{ profiles: WorkflowProfile[] }>('/api/config/workflow-profiles').catch(() => ({ profiles: [] })),
        apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types').catch(() => ({ serviceTypes: [] })),
        apiRequest<{ activityTypes: ActivityType[] }>('/api/config/activity-types').catch(() => ({ activityTypes: [] })),
        apiRequest<{ profiles: PermissionProfile[] }>('/api/config/permission-profiles').catch(() => ({ profiles: [] })),
      ]);

      setShops(shopsData.shops);
      setWorkflowProfiles(wfData.profiles);
      setServices(svcData.serviceTypes);
      setActivities(actData.activityTypes);
      setPermissionProfiles(permData.profiles);

      // Also fetch position categories if a shop exists
      if (shopsData.shops[0]?.id) {
        const posData = await apiRequest<{ categories: PositionCategory[] }>(
          `/api/config/shops/${shopsData.shops[0].id}/position-categories`
        ).catch(() => ({ categories: [] }));
        setPositions(posData.categories);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllConfig();
  }, [fetchAllConfig]);

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim() || !shopCode.trim()) return;

    setIsSubmittingShop(true);
    try {
      await apiRequest('/api/shops', {
        method: 'POST',
        body: JSON.stringify({
          name: shopName.trim(),
          code: shopCode.trim().toLowerCase(),
          address: shopAddress.trim() || undefined,
          timezone: shopTimezone,
        }),
      });
      setIsAddShopOpen(false);
      alert('New shop branch created.');
      fetchAllConfig();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create shop.');
    } finally {
      setIsSubmittingShop(false);
    }
  };

  const openEditShop = (shop: Shop) => {
    setEditingShopId(shop.id);
    setEditShopName(shop.name);
    setEditShopCode(shop.code);
    setEditShopAddress(shop.address || '');
    setEditShopTimezone(shop.timezone || 'Asia/Kolkata');
    setEditShopStatus(shop.status || 'ACTIVE');
    setIsEditShopOpen(true);
  };

  const handleUpdateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShopId || !editShopName.trim() || !editShopCode.trim()) return;

    setIsSubmittingEditShop(true);
    try {
      await apiRequest(`/api/shops/${editingShopId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editShopName.trim(),
          code: editShopCode.trim(),
          address: editShopAddress.trim() || null,
          timezone: editShopTimezone,
          status: editShopStatus,
        }),
      });
      setIsEditShopOpen(false);
      alert('Shop branch updated.');
      fetchAllConfig();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update shop.');
    } finally {
      setIsSubmittingEditShop(false);
    }
  };

  const handleDeleteShop = async (shop: Shop) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete branch "${shop.name}" (${shop.code})?\n\nThis will remove the duplicate branch permanently.`
    );
    if (!confirmed) return;

    setDeletingShopId(shop.id);
    try {
      const res = await apiRequest<{ action?: string; message?: string }>(`/api/shops/${shop.id}`, {
        method: 'DELETE',
      });
      alert(res.message || 'Branch deleted successfully.');
      fetchAllConfig();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete shop.');
    } finally {
      setDeletingShopId(null);
    }
  };

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!posName.trim()) return;
    const targetShopId = shops[0]?.id;
    if (!targetShopId) {
      alert('Create at least one shop first.');
      return;
    }

    setIsSubmittingPos(true);
    try {
      await apiRequest(`/api/config/shops/${targetShopId}/position-categories`, {
        method: 'POST',
        body: JSON.stringify({
          name: posName.trim(),
          description: posDescription.trim() || undefined,
          workflowProfileId: posWfId || undefined,
        }),
      });
      setIsAddPosOpen(false);
      alert('Position category created.');
      fetchAllConfig();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create position.');
    } finally {
      setIsSubmittingPos(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-brand-forest text-brand-lime shadow-clay border border-white/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-brand-forest tracking-tight">
              Owner Administration
            </h2>
            <p className="text-xs text-content-muted">
              Centralized platform configuration & branch controls
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-surface-card rounded-2xl border border-border-subtle shadow-clay-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('shops')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'shops'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Shops ({shops.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('positions')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'positions'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Positions ({positions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalogues')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'catalogues'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Catalogues</span>
        </button>

        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'permissions'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Permissions</span>
        </button>
      </div>

      {/* Tab 1: Shops */}
      {activeTab === 'shops' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
              Registered Branches
            </h3>
            <button
              onClick={() => {
                setShopName('');
                setShopCode('');
                setShopAddress('');
                setIsAddShopOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Shop</span>
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs font-semibold text-content-muted">
              Loading shops...
            </div>
          ) : shops.length === 0 ? (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
              <Building2 className="w-8 h-8 text-content-muted mx-auto mb-2" />
              <p className="text-xs text-content-muted">No shops registered yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {shops.map((shop) => (
                <div
                  key={shop.id}
                  className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2 hover:border-brand-lime/50 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-extrabold text-brand-forest truncate">
                      {shop.name}
                    </h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditShop(shop)}
                        className="p-1.5 rounded-lg bg-surface-cream border border-border-subtle hover:bg-surface-hover text-brand-forest transition-colors shadow-clay-sm"
                        title="Edit Shop"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteShop(shop)}
                        disabled={deletingShopId === shop.id}
                        className="p-1.5 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 transition-colors shadow-clay-sm disabled:opacity-50"
                        title="Delete Shop"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        shop.status === 'ACTIVE'
                          ? 'clay-badge-lime'
                          : shop.status === 'PAUSED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {shop.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-content-muted font-medium">
                    Code: <strong className="text-brand-forest">{shop.code}</strong> • Timezone: {shop.timezone}
                  </p>
                  {shop.address && (
                    <p className="text-xs text-content-muted truncate">{shop.address}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Position Categories */}
      {activeTab === 'positions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
                Position Categories
              </h3>
              <p className="text-xs text-content-muted">
                Editable job titles mapped to workflow calculation rules
              </p>
            </div>
            <button
              onClick={() => {
                setPosName('');
                setPosDescription('');
                setPosWfId(workflowProfiles[0]?.id || '');
                setIsAddPosOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Position</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-brand-forest">
                    {pos.name}
                  </h4>
                  {pos.workflowProfile && (
                    <span className="px-2 py-0.5 rounded-lg clay-badge-gold text-[10px] font-bold">
                      {pos.workflowProfile.workflowType}
                    </span>
                  )}
                </div>
                {pos.description && (
                  <p className="text-xs text-content-muted">{pos.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Catalogues */}
      {activeTab === 'catalogues' && (
        <div className="space-y-5">
          {/* Services */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-brand-forest uppercase tracking-wider">
              Approved Service Types ({services.length})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {services.map((svc) => (
                <div
                  key={svc.id}
                  className="bg-surface-card rounded-xl p-3 border border-border-subtle shadow-clay-sm"
                >
                  <span className="text-[10px] font-bold text-content-muted uppercase">
                    Code: {svc.code}
                  </span>
                  <p className="text-xs font-extrabold text-brand-forest mt-0.5">
                    {svc.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Activities */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-brand-forest uppercase tracking-wider">
              Approved Activity Types ({activities.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-lime" />
                  <span className="text-xs font-bold text-brand-forest">
                    {act.name} ({act.code})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Permissions */}
      {activeTab === 'permissions' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {permissionProfiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-brand-forest">
                    {profile.name}
                  </h4>
                  <span className="text-[10px] font-bold text-content-muted">
                    {profile.capabilities?.length || 0} Grants
                  </span>
                </div>
                {profile.description && (
                  <p className="text-xs text-content-muted">{profile.description}</p>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  {profile.capabilities?.slice(0, 6).map((c) => (
                    <span
                      key={c.id}
                      className="px-2 py-0.5 rounded-md bg-surface-cream text-[10px] font-semibold text-content-muted border border-border-subtle"
                    >
                      {c.capability}
                    </span>
                  ))}
                  {(profile.capabilities?.length || 0) > 6 && (
                    <span className="text-[10px] text-content-muted font-bold self-center">
                      +{profile.capabilities.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Shop Modal */}
      {isAddShopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h3 className="text-base font-bold text-brand-forest">Add New Shop Branch</h3>
              <button
                onClick={() => setIsAddShopOpen(false)}
                className="p-1 rounded-lg text-content-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShop} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Tumbledry Indiranagar"
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Slug/Code *
                </label>
                <input
                  type="text"
                  value={shopCode}
                  onChange={(e) => setShopCode(e.target.value)}
                  placeholder="e.g. blr-indiranagar"
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  placeholder="Street and area"
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Timezone
                </label>
                <select
                  value={shopTimezone}
                  onChange={(e) => setShopTimezone(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddShopOpen(false)}
                  className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShop}
                  className="flex-1 py-2.5 rounded-xl clay-btn-forest text-xs font-bold"
                >
                  {isSubmittingShop ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Shop Modal */}
      {isEditShopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h3 className="text-base font-bold text-brand-forest">Edit Shop Branch</h3>
              <button
                onClick={() => setIsEditShopOpen(false)}
                className="p-1 rounded-lg text-content-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateShop} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  value={editShopName}
                  onChange={(e) => setEditShopName(e.target.value)}
                  placeholder="e.g. Tumbledry Indiranagar"
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Slug/Code *
                </label>
                <input
                  type="text"
                  value={editShopCode}
                  onChange={(e) => setEditShopCode(e.target.value)}
                  placeholder="e.g. TD-AZ-2026A"
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={editShopAddress}
                  onChange={(e) => setEditShopAddress(e.target.value)}
                  placeholder="Street and area"
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Timezone
                  </label>
                  <select
                    value={editShopTimezone}
                    onChange={(e) => setEditShopTimezone(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Branch Status
                  </label>
                  <select
                    value={editShopStatus}
                    onChange={(e) => setEditShopStatus(e.target.value as 'ACTIVE' | 'PAUSED' | 'ARCHIVED')}
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditShopOpen(false)}
                  className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditShop}
                  className="flex-1 py-2.5 rounded-xl clay-btn-forest text-xs font-bold"
                >
                  {isSubmittingEditShop ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Position Modal */}
      {isAddPosOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h3 className="text-base font-bold text-brand-forest">Add Position Category</h3>
              <button
                onClick={() => setIsAddPosOpen(false)}
                className="p-1 rounded-lg text-content-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePosition} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Position Title *
                </label>
                <input
                  type="text"
                  value={posName}
                  onChange={(e) => setPosName(e.target.value)}
                  placeholder="e.g. Shoe Care Specialist"
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Workflow Pattern
                </label>
                <select
                  value={posWfId}
                  onChange={(e) => setPosWfId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                >
                  {workflowProfiles.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.workflowType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddPosOpen(false)}
                  className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPos}
                  className="flex-1 py-2.5 rounded-xl clay-btn-forest text-xs font-bold"
                >
                  {isSubmittingPos ? 'Saving...' : 'Save Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
