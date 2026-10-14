'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Shop,
  PositionCategory,
  PermissionProfile,
  ServiceType,
  ActivityType,
  WorkflowProfile,
  CustomFieldDefinition,
  AuditLogItem,
  GlobalShopMetrics,
  PerShopMetrics,
} from '../../types';
import {
  ShieldCheck,
  Building2,
  PlusCircle,
  Sliders,
  X,
  Pencil,
  Trash2,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  Calendar,
  ChevronRight,
  SlidersHorizontal,
  FileText,
  TrendingUp,
  RefreshCw,
  Phone,
  Package,
  Truck,
  Shirt,
  UserPlus,
  KeyRound,
  Copy,
  CalendarCheck2,
} from 'lucide-react';

interface StaffMembershipItem {
  id: string;
  role: string;
  isActive: boolean;
  staffMember: {
    id: string;
    fullName: string;
    mobile?: string | null;
    profilePhotoPath?: string | null;
    employmentStatus: string;
  };
  positionCategory?: { id: string; name: string } | null;
  account?: { id: string; username: string; status: string } | null;
  attendanceEnabled?: boolean;
}

interface StaffTaskDaySummary {
  total: number;
  completed: number;
  pending: number;
  percentageComplete: number | null;
  breakdown?: {
    wash: number;
    dry: number;
    iron: number;
    fold: number;
    pack: number;
    delivery: number;
    pickup: number;
  };
  assignments?: Array<{
    id: string;
    orderId?: string | null;
    pieceCount?: number | null;
    pickupCount?: number | null;
    workflowProfile?: { workflowType: string; name: string };
    serviceType?: { name: string; code: string };
    taskUnits: Array<{ id: string; status: string; activityCode?: string; unitType: string }>;
  }>;
}

interface StaffTaskMonthlySummary {
  total: number;
  completed: number;
  pending: number;
  percentageComplete: number | null;
  breakdown?: {
    wash: number;
    dry: number;
    iron: number;
    fold: number;
    pack: number;
    delivery: number;
    pickup: number;
  };
  dailyProgress?: Array<{
    date: string;
    total: number;
    completed: number;
  }>;
}

export default function OwnerPage() {
  const { isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'custom-fields' | 'audit-logs' | 'config'>('overview');
  const [configSubTab, setConfigSubTab] = useState<'positions' | 'catalogues' | 'permissions'>('positions');

  // Core Data
  const [shops, setShops] = useState<Shop[]>([]);
  const [metrics, setMetrics] = useState<{ global: GlobalShopMetrics; shops: PerShopMetrics[] } | null>(null);
  const [positions, setPositions] = useState<PositionCategory[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Shop & Staff Performance Drill-down state
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [shopStaff, setShopStaff] = useState<StaffMembershipItem[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  // Staff Task Performance Modal
  const [selectedStaff, setSelectedStaff] = useState<StaffMembershipItem | null>(null);
  const [staffTaskDate, setStaffTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffPerfTab, setStaffPerfTab] = useState<'daily' | 'monthly'>('daily');
  const [staffDaySummary, setStaffDaySummary] = useState<StaffTaskDaySummary | null>(null);
  const [staffMonthSummary, setStaffMonthSummary] = useState<StaffTaskMonthlySummary | null>(null);
  const [isLoadingStaffPerf, setIsLoadingStaffPerf] = useState(false);
  const [monthlyYear, setMonthlyYear] = useState<number>(new Date().getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState<number>(new Date().getMonth() + 1);

  // Custom Fields Builder state
  const [customFieldsShopId, setCustomFieldsShopId] = useState<string>('');
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'YES_NO' | 'FILE_IMAGE'>('TEXT');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [isSubmittingField, setIsSubmittingField] = useState(false);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditFilterShopId, setAuditFilterShopId] = useState<string>('');
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Shop Add / Edit Modals
  const [isAddShopOpen, setIsAddShopOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopTimezone, setShopTimezone] = useState('Asia/Kolkata');
  const [isSubmittingShop, setIsSubmittingShop] = useState(false);

  const [isEditShopOpen, setIsEditShopOpen] = useState(false);
  const [editingShopId, setEditingShopId] = useState('');
  const [editShopName, setEditShopName] = useState('');
  const [editShopCode, setEditShopCode] = useState('');
  const [editShopAddress, setEditShopAddress] = useState('');
  const [editShopTimezone, setEditShopTimezone] = useState('Asia/Kolkata');
  const [editShopStatus, setEditShopStatus] = useState<'ACTIVE' | 'PAUSED' | 'ARCHIVED'>('ACTIVE');
  const [isSubmittingEditShop, setIsSubmittingEditShop] = useState(false);
  const [deletingShopId, setDeletingShopId] = useState<string | null>(null);

  // Supervisor Management State
  const [isAddSupervisorOpen, setIsAddSupervisorOpen] = useState(false);
  const [supFullName, setSupFullName] = useState('');
  const [supMobile, setSupMobile] = useState('');
  const [supUsername, setSupUsername] = useState('');
  const [supPassword, setSupPassword] = useState('');
  const [supSalary, setSupSalary] = useState('');
  const [supDutyTiming, setSupDutyTiming] = useState('09:00 AM - 06:00 PM');
  const [isSubmittingSupervisor, setIsSubmittingSupervisor] = useState(false);
  const [createdSupCredentials, setCreatedSupCredentials] = useState<{
    fullName: string;
    username: string;
    password: string;
    shopName: string;
  } | null>(null);

  // Reset Password State
  const [resetStaffTarget, setResetStaffTarget] = useState<StaffMembershipItem | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Attendance Toggle State
  const [togglingStaffId, setTogglingStaffId] = useState<string | null>(null);

  // Position Modal
  const [isAddPosOpen, setIsAddPosOpen] = useState(false);
  const [posName, setPosName] = useState('');
  const [posDescription, setPosDescription] = useState('');
  const [posWfId, setPosWfId] = useState('');
  const [isSubmittingPos, setIsSubmittingPos] = useState(false);

  // Fetch staff when selectedShopId changes
  const fetchShopStaff = useCallback(async (shopId: string) => {
    if (!shopId) return;
    setIsLoadingStaff(true);
    try {
      const res = await apiRequest<{ staff: StaffMembershipItem[] }>(`/api/shops/${shopId}/staff`);
      setShopStaff(res.staff || []);
    } catch {
      setShopStaff([]);
    } finally {
      setIsLoadingStaff(false);
    }
  }, []);

  const handleCreateSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShopId || !supFullName.trim() || !supUsername.trim() || !supPassword.trim()) return;

    setIsSubmittingSupervisor(true);
    try {
      await apiRequest(`/api/shops/${selectedShopId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: supFullName.trim(),
          mobile: supMobile.trim() || undefined,
          username: supUsername.trim().toLowerCase(),
          password: supPassword.trim(),
          role: 'Supervisor',
          monthlySalary: supSalary ? parseFloat(supSalary) : undefined,
          dutyTimingNotes: supDutyTiming.trim() || undefined,
        }),
      });

      const currentShop = shops.find((s) => s.id === selectedShopId);
      setCreatedSupCredentials({
        fullName: supFullName.trim(),
        username: supUsername.trim().toLowerCase(),
        password: supPassword.trim(),
        shopName: currentShop?.name || 'Shop',
      });

      setIsAddSupervisorOpen(false);
      setSupFullName('');
      setSupMobile('');
      setSupUsername('');
      setSupPassword('');
      setSupSalary('');
      fetchShopStaff(selectedShopId);
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create supervisor.');
    } finally {
      setIsSubmittingSupervisor(false);
    }
  };

  const handleToggleAttendance = async (staff: StaffMembershipItem) => {
    if (!selectedShopId) return;
    const nextVal = staff.attendanceEnabled === false ? true : false;
    setTogglingStaffId(staff.id);
    try {
      await apiRequest(`/api/shops/${selectedShopId}/staff/${staff.staffMember.id}/attendance-toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ attendanceEnabled: nextVal }),
      });
      setShopStaff((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, attendanceEnabled: nextVal } : s))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update attendance tracking.');
    } finally {
      setTogglingStaffId(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShopId || !resetStaffTarget || !resetNewPassword.trim()) return;

    setIsSubmittingReset(true);
    try {
      await apiRequest(`/api/shops/${selectedShopId}/staff/${resetStaffTarget.staffMember.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: resetNewPassword.trim() }),
      });
      alert(`Password updated successfully for ${resetStaffTarget.staffMember.fullName}!`);
      setResetStaffTarget(null);
      setResetNewPassword('');
      fetchShopStaff(selectedShopId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Initial Data Fetch
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shopsData, metricsData, wfData, svcData, actData, permData] = await Promise.all([
        apiRequest<{ shops: Shop[] }>('/api/shops').catch(() => ({ shops: [] })),
        apiRequest<{ global: GlobalShopMetrics; shops: PerShopMetrics[] }>('/api/shops/metrics').catch(() => null),
        apiRequest<{ profiles: WorkflowProfile[] }>('/api/config/workflow-profiles').catch(() => ({ profiles: [] })),
        apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types').catch(() => ({ serviceTypes: [] })),
        apiRequest<{ activityTypes: ActivityType[] }>('/api/config/activity-types').catch(() => ({ activityTypes: [] })),
        apiRequest<{ profiles: PermissionProfile[] }>('/api/config/permission-profiles').catch(() => ({ profiles: [] })),
      ]);

      setShops(shopsData.shops || []);
      if (metricsData) setMetrics(metricsData);
      setWorkflowProfiles(wfData.profiles || []);
      setServices(svcData.serviceTypes || []);
      setActivities(actData.activityTypes || []);
      setPermissionProfiles(permData.profiles || []);

      if (shopsData.shops?.length > 0) {
        if (!selectedShopId) {
          setSelectedShopId(shopsData.shops[0].id);
        }
        if (!customFieldsShopId) {
          setCustomFieldsShopId(shopsData.shops[0].id);
        }

        // Fetch position categories for the first shop
        const posData = await apiRequest<{ categories: PositionCategory[] }>(
          `/api/config/shops/${shopsData.shops[0].id}/position-categories`
        ).catch(() => ({ categories: [] }));
        setPositions(posData.categories || []);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  }, [selectedShopId, customFieldsShopId]);

  useEffect(() => {
    if (!authLoading) {
      fetchAllData();
    }
  }, [authLoading, fetchAllData]);

  // Fetch staff when selectedShopId changes
  useEffect(() => {
    fetchShopStaff(selectedShopId);
  }, [selectedShopId, fetchShopStaff]);

  // Fetch staff performance details (daily + monthly)
  const fetchStaffPerformance = useCallback(async (staffMemberId: string, shopId: string, date: string, year: number, month: number) => {
    setIsLoadingStaffPerf(true);
    try {
      const [dayData, monthData] = await Promise.all([
        apiRequest<{ assignments: StaffTaskDaySummary['assignments']; summary: StaffTaskDaySummary }>(
          `/api/shops/${shopId}/staff/${staffMemberId}/tasks?date=${date}`
        ).catch(() => null),
        apiRequest<StaffTaskMonthlySummary>(
          `/api/shops/${shopId}/staff/${staffMemberId}/task-summary/monthly?year=${year}&month=${month}`
        ).catch(() => null),
      ]);

      if (dayData) {
        setStaffDaySummary({
          ...dayData.summary,
          assignments: dayData.assignments,
        });
      } else {
        setStaffDaySummary(null);
      }

      setStaffMonthSummary(monthData);
    } catch {
      setStaffDaySummary(null);
      setStaffMonthSummary(null);
    } finally {
      setIsLoadingStaffPerf(false);
    }
  }, []);

  const openStaffPerformance = (staff: StaffMembershipItem) => {
    setSelectedStaff(staff);
    const today = new Date().toISOString().split('T')[0];
    setStaffTaskDate(today);
    setStaffPerfTab('daily');
    const now = new Date();
    setMonthlyYear(now.getFullYear());
    setMonthlyMonth(now.getMonth() + 1);
    fetchStaffPerformance(staff.staffMember.id, selectedShopId, today, now.getFullYear(), now.getMonth() + 1);
  };

  // Fetch custom fields when customFieldsShopId changes
  useEffect(() => {
    if (activeTab !== 'custom-fields' || !customFieldsShopId) return;
    setIsLoadingFields(true);
    apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${customFieldsShopId}/custom-fields`)
      .then((res) => setCustomFields(res.fields || []))
      .catch(() => setCustomFields([]))
      .finally(() => setIsLoadingFields(false));
  }, [activeTab, customFieldsShopId]);

  // Fetch audit logs when activeTab is 'audit-logs'
  useEffect(() => {
    if (activeTab !== 'audit-logs') return;
    setIsLoadingAudit(true);
    const query = auditFilterShopId ? `?shopId=${auditFilterShopId}` : '';
    apiRequest<{ logs: AuditLogItem[] }>(`/api/config/audit-logs${query}`)
      .then((res) => setAuditLogs(res.logs || []))
      .catch(() => setAuditLogs([]))
      .finally(() => setIsLoadingAudit(false));
  }, [activeTab, auditFilterShopId]);

  // Handle Create Shop
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
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create shop.');
    } finally {
      setIsSubmittingShop(false);
    }
  };

  // Handle Edit Shop
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
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update shop.');
    } finally {
      setIsSubmittingEditShop(false);
    }
  };

  // Handle Delete Shop
  const handleDeleteShop = async (shop: Shop) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete branch "${shop.name}" (${shop.code})?\n\nThis will remove the branch permanently.`
    );
    if (!confirmed) return;

    setDeletingShopId(shop.id);
    try {
      const res = await apiRequest<{ action?: string; message?: string }>(`/api/shops/${shop.id}`, {
        method: 'DELETE',
      });
      alert(res.message || 'Branch deleted successfully.');
      if (selectedShopId === shop.id) {
        setSelectedShopId('');
      }
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete shop.');
    } finally {
      setDeletingShopId(null);
    }
  };

  // Handle Add Custom Field
  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFieldsShopId || !newFieldKey.trim() || !newFieldLabel.trim()) return;

    const formattedKey = newFieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const optionsArray = newFieldType === 'DROPDOWN'
      ? newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean)
      : [];

    setIsSubmittingField(true);
    try {
      await apiRequest(`/api/config/shops/${customFieldsShopId}/custom-fields`, {
        method: 'POST',
        body: JSON.stringify({
          key: formattedKey,
          label: newFieldLabel.trim(),
          fieldType: newFieldType,
          isRequired: newFieldRequired,
          dropdownOptions: optionsArray,
        }),
      });
      setNewFieldKey('');
      setNewFieldLabel('');
      setNewFieldOptions('');
      setNewFieldRequired(false);
      alert('Custom field created.');
      const res = await apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${customFieldsShopId}/custom-fields`);
      setCustomFields(res.fields || []);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create custom field.');
    } finally {
      setIsSubmittingField(false);
    }
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this custom field?')) return;
    try {
      await apiRequest(`/api/config/shops/${customFieldsShopId}/custom-fields/${fieldId}`, {
        method: 'DELETE',
      });
      setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete custom field.');
    }
  };

  // Handle Add Position
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
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create position.');
    } finally {
      setIsSubmittingPos(false);
    }
  };

  const selectedShopObj = shops.find((s) => s.id === selectedShopId) || shops[0];
  const selectedShopMetrics = metrics?.shops.find((s) => s.id === selectedShopId);

  // Filter staff by search query
  const filteredStaff = shopStaff.filter((m) => {
    if (!staffSearchQuery.trim()) return true;
    const q = staffSearchQuery.toLowerCase();
    const nameMatch = m.staffMember.fullName.toLowerCase().includes(q);
    const roleMatch = m.positionCategory?.name.toLowerCase().includes(q);
    const mobileMatch = m.staffMember.mobile?.includes(q);
    return nameMatch || roleMatch || mobileMatch;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-brand-forest text-brand-lime shadow-clay border border-white/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-brand-forest tracking-tight">
              Owner Executive Console
            </h1>
            <p className="text-xs text-content-muted font-medium">
              Multi-shop operational surveillance, staff performance & platform controls
            </p>
          </div>
        </div>

        <button
          onClick={fetchAllData}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover text-xs font-bold text-brand-forest flex items-center gap-1.5 shadow-clay-sm transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-card rounded-2xl border border-border-subtle shadow-clay-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Shops & Performance</span>
        </button>

        <button
          onClick={() => setActiveTab('custom-fields')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'custom-fields'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Custom Fields Builder</span>
        </button>

        <button
          onClick={() => setActiveTab('audit-logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'audit-logs'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'config'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Catalogues & Roles</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: SHOPS & PERFORMANCE (PRIMARY EXECUTIVE VIEW)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Feature 9: Global Cross-Shop Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Active Shops */}
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between text-content-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Active Shops</span>
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-brand-forest">
                {metrics?.global.totalShops ?? shops.length}
              </div>
              <p className="text-[11px] text-content-muted">Across all city branches</p>
            </div>

            {/* Card 2: Total Active Workforce */}
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between text-content-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Staff</span>
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-brand-forest">
                {metrics?.global.totalActiveStaff ?? 0}
              </div>
              <p className="text-[11px] text-content-muted">Active registered employees</p>
            </div>

            {/* Card 3: Today's Units Output */}
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between text-content-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Today&apos;s Units</span>
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-brand-forest flex items-baseline gap-1.5">
                <span>{metrics?.global.todayCompletedUnits ?? 0}</span>
                <span className="text-xs font-semibold text-content-muted">
                  / {metrics?.global.todayTotalUnits ?? 0}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold">
                {metrics?.global.todayTotalUnits
                  ? `${Math.round(((metrics.global.todayCompletedUnits || 0) / metrics.global.todayTotalUnits) * 100)}% complete`
                  : '0% completed'}
              </p>
            </div>

            {/* Card 4: Today's Attendance Checked-In */}
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between text-content-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Checked In Today</span>
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-brand-forest">
                {metrics?.global.todayAttendanceCount ?? 0}
              </div>
              <p className="text-[11px] text-content-muted">Staff present in shops today</p>
            </div>
          </div>

          {/* Today's Activity Breakdown Mini-strip */}
          {metrics?.global.activityBreakdown && (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-brand-forest">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-forest" />
                  Today&apos;s Cross-Shop Operations Breakdown
                </span>
                <span className="text-[10px] text-content-muted font-normal">Real-time piece/unit count</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center gap-1.5">
                  <Shirt className="w-3 h-3 text-blue-600" />
                  Washed: {metrics.global.activityBreakdown.wash}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-xs font-bold flex items-center gap-1.5">
                  Ironed: {metrics.global.activityBreakdown.iron}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 text-xs font-bold flex items-center gap-1.5">
                  Dried: {metrics.global.activityBreakdown.dry}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-1.5">
                  Folded: {metrics.global.activityBreakdown.fold}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-indigo-600" />
                  Packed: {metrics.global.activityBreakdown.pack}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-1.5">
                  <Truck className="w-3 h-3 text-emerald-600" />
                  Delivered: {metrics.global.activityBreakdown.delivery}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold flex items-center gap-1.5">
                  Pickups: {metrics.global.activityBreakdown.pickup}
                </span>
              </div>
            </div>
          )}

          {/* Section: Shop Selection Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-brand-forest">
                  Your Shops (Select to Inspect)
                </h2>
                <p className="text-xs text-content-muted">
                  Click any shop to inspect its staff roster, today&apos;s output, and individual employee tasks
                </p>
              </div>
              <button
                onClick={() => {
                  setShopName('');
                  setShopCode('');
                  setShopAddress('');
                  setIsAddShopOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1.5 shadow-clay-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Shop</span>
              </button>
            </div>

            {shops.length === 0 ? (
              <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center space-y-2">
                <Building2 className="w-10 h-10 text-content-muted mx-auto" />
                <p className="text-sm font-bold text-brand-forest">No shops registered yet</p>
                <p className="text-xs text-content-muted">Create your first shop to start tracking staff and tasks.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {shops.map((shop) => {
                  const shopPerf = metrics?.shops.find((s) => s.id === shop.id);
                  const isSelected = selectedShopId === shop.id;

                  return (
                    <div
                      key={shop.id}
                      onClick={() => setSelectedShopId(shop.id)}
                      className={`cursor-pointer bg-surface-card rounded-clay border p-4 space-y-3 transition-all relative ${
                        isSelected
                          ? 'border-brand-forest ring-2 ring-brand-forest/20 shadow-clay bg-brand-forest/[0.02]'
                          : 'border-border-subtle shadow-clay-sm hover:border-brand-forest/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-extrabold text-brand-forest truncate">
                              {shop.name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                shop.status === 'ACTIVE'
                                  ? 'clay-badge-lime'
                                  : shop.status === 'PAUSED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {shop.status}
                            </span>
                          </div>
                          <p className="text-xs text-content-muted font-medium mt-0.5">
                            Code: <strong className="text-brand-forest">{shop.code}</strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                        </div>
                      </div>

                      {/* Performance Pills */}
                      <div className="grid grid-cols-3 gap-1.5 py-1 text-center bg-surface-cream/50 rounded-xl p-2 border border-border-subtle/50 text-[11px]">
                        <div>
                          <p className="text-content-muted font-medium">Staff</p>
                          <p className="font-extrabold text-brand-forest">{shopPerf?.staffCount ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-content-muted font-medium">Present</p>
                          <p className="font-extrabold text-purple-700">{shopPerf?.todayAttendance ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-content-muted font-medium">Today Units</p>
                          <p className="font-extrabold text-emerald-700">
                            {shopPerf ? `${shopPerf.todayCompletedUnits}/${shopPerf.todayTotalUnits}` : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-bold pt-1">
                        <span className={`text-[11px] flex items-center gap-1 ${isSelected ? 'text-brand-forest' : 'text-content-muted'}`}>
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-brand-forest" />
                              Currently Selected
                            </>
                          ) : (
                            'Click to view performance'
                          )}
                        </span>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-brand-forest' : 'text-content-muted'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Selected Shop Staff & Performance Drill-down */}
          {selectedShopObj && (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-brand-forest text-brand-lime text-xs font-black">
                      BRANCH INSPECTION
                    </span>
                    <h3 className="text-lg font-black text-brand-forest">
                      {selectedShopObj.name} ({selectedShopObj.code})
                    </h3>
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    Click any staff member to view their daily pieces washed/ironed/delivered and monthly consistency
                  </p>
                  {selectedShopMetrics && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-content-muted mt-1">
                      <span>Staff: <strong className="text-brand-forest">{selectedShopMetrics.staffCount}</strong></span>
                      <span>•</span>
                      <span>Present: <strong className="text-purple-700">{selectedShopMetrics.todayAttendance}</strong></span>
                      <span>•</span>
                      <span>Today Output: <strong className="text-emerald-700">{selectedShopMetrics.todayCompletedUnits} / {selectedShopMetrics.todayTotalUnits} units</strong></span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                    <input
                      type="text"
                      placeholder="Search staff or role..."
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:outline-none focus:ring-1 focus:ring-brand-forest w-36 sm:w-44"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setSupFullName('');
                      setSupMobile('');
                      setSupUsername(`sup_${selectedShopObj.code.toLowerCase()}_${Math.floor(10 + Math.random() * 90)}`);
                      setSupPassword('');
                      setSupSalary('');
                      setIsAddSupervisorOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black flex items-center gap-1.5 shadow-clay hover:opacity-95 transition-all whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Add Supervisor</span>
                  </button>
                </div>
              </div>

              {isLoadingStaff ? (
                <div className="py-12 text-center text-xs font-semibold text-content-muted">
                  Loading staff members for {selectedShopObj.name}...
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="py-8 text-center text-xs text-content-muted">
                  {staffSearchQuery ? 'No staff matching search query.' : 'No staff registered in this shop branch yet. Click "+ Add Supervisor" to create one.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredStaff.map((staff) => {
                    const isSupervisor = (staff.role || '').toLowerCase().includes('supervisor') ||
                      (staff.positionCategory?.name || '').toLowerCase().includes('supervisor');

                    return (
                      <div
                        key={staff.id}
                        onClick={() => openStaffPerformance(staff)}
                        className={`cursor-pointer p-3.5 rounded-2xl border transition-all space-y-2 group ${
                          isSupervisor
                            ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-600 shadow-sm'
                            : 'bg-surface-cream/50 border-border-subtle hover:border-brand-forest/60 hover:shadow-clay-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center shadow-sm ${
                              isSupervisor ? 'bg-brand-forest text-brand-lime' : 'bg-surface-card text-brand-forest border border-border-subtle'
                            }`}>
                              {staff.staffMember.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold text-brand-forest">
                                {staff.staffMember.fullName}
                              </h4>
                              <p className="text-[11px] font-medium text-content-muted">
                                {staff.positionCategory?.name || 'Staff Employee'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isSupervisor && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-brand-forest text-brand-lime uppercase">
                                Supervisor
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              staff.staffMember.employmentStatus === 'ACTIVE'
                                ? 'clay-badge-lime'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {staff.staffMember.employmentStatus}
                            </span>
                          </div>
                        </div>

                        {staff.staffMember.mobile && (
                          <div className="flex items-center gap-1.5 text-xs text-content-muted">
                            <Phone className="w-3 h-3" />
                            <span>{staff.staffMember.mobile}</span>
                          </div>
                        )}

                        {staff.account?.username && (
                          <div className="flex items-center justify-between text-[11px] font-mono bg-white/80 px-2 py-1 rounded-lg border border-border-subtle/60">
                            <span className="text-content-muted truncate">User: <strong className="text-brand-forest">{staff.account.username}</strong></span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setResetStaffTarget(staff);
                                setResetNewPassword('');
                              }}
                              className="p-1 rounded hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors flex items-center gap-1 font-sans text-[10px]"
                              title="Reset Login Password"
                            >
                              <KeyRound className="w-3 h-3 text-amber-600" />
                              <span>Reset Pass</span>
                            </button>
                          </div>
                        )}

                        {/* Attendance Tracking Toggle */}
                        <div className="pt-2 border-t border-border-subtle/60 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <CalendarCheck2 className={`w-3.5 h-3.5 ${staff.attendanceEnabled !== false ? 'text-emerald-700' : 'text-content-muted'}`} />
                            <span className="text-[11px] font-bold text-brand-forest">
                              Attendance Tracking:
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              staff.attendanceEnabled !== false
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {staff.attendanceEnabled !== false ? 'Required' : 'Exempt'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAttendance(staff);
                            }}
                            disabled={togglingStaffId === staff.id}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              staff.attendanceEnabled !== false ? 'bg-emerald-600' : 'bg-gray-300'
                            } ${togglingStaffId === staff.id ? 'opacity-50' : ''}`}
                            title={staff.attendanceEnabled !== false ? 'Attendance required (click to exempt)' : 'Attendance exempt (click to require)'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                staff.attendanceEnabled !== false ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="pt-1 flex items-center justify-between text-xs font-bold text-brand-forest">
                          <span className="text-[11px] text-content-muted group-hover:text-brand-forest">
                            Inspect Daily & Monthly Tasks
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STAFF PERFORMANCE DRILLDOWN MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-forest text-brand-lime font-black text-base flex items-center justify-center shadow-clay">
                  {selectedStaff.staffMember.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-black text-brand-forest">
                    {selectedStaff.staffMember.fullName}
                  </h3>
                  <p className="text-xs text-content-muted">
                    {selectedStaff.positionCategory?.name || 'Staff'} • {selectedShopObj?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1.5 rounded-lg bg-surface-cream hover:bg-surface-hover text-content-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Performance Sub-tabs */}
            <div className="flex items-center gap-2 p-1 bg-surface-cream rounded-xl border border-border-subtle">
              <button
                onClick={() => setStaffPerfTab('daily')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  staffPerfTab === 'daily'
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                Daily Task Summary
              </button>
              <button
                onClick={() => setStaffPerfTab('monthly')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  staffPerfTab === 'monthly'
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                Monthly Output History
              </button>
            </div>

            {/* Sub-tab 1: Daily Tasks */}
            {staffPerfTab === 'daily' && (
              <div className="space-y-4">
                {/* Date Picker */}
                <div className="flex items-center justify-between gap-2 bg-surface-cream/50 p-2.5 rounded-xl border border-border-subtle">
                  <span className="text-xs font-bold text-brand-forest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                    Select Date:
                  </span>
                  <input
                    type="date"
                    value={staffTaskDate}
                    onChange={(e) => {
                      setStaffTaskDate(e.target.value);
                      fetchStaffPerformance(selectedStaff.staffMember.id, selectedShopId, e.target.value, monthlyYear, monthlyMonth);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-white border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>

                {isLoadingStaffPerf ? (
                  <div className="py-8 text-center text-xs text-content-muted font-semibold">
                    Loading task details for {staffTaskDate}...
                  </div>
                ) : !staffDaySummary || staffDaySummary.total === 0 ? (
                  <div className="bg-surface-cream/40 rounded-xl p-6 text-center space-y-1">
                    <p className="text-xs font-bold text-brand-forest">No tasks recorded on this date.</p>
                    <p className="text-[11px] text-content-muted">This staff member had no assigned tasks for {staffTaskDate}.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* Units Metric Bar */}
                    <div className="grid grid-cols-3 gap-2 text-center p-3 bg-brand-forest/[0.04] rounded-xl border border-brand-forest/10">
                      <div>
                        <p className="text-[11px] text-content-muted font-semibold">Completed</p>
                        <p className="text-lg font-black text-emerald-700">{staffDaySummary.completed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-content-muted font-semibold">Pending</p>
                        <p className="text-lg font-black text-amber-700">{staffDaySummary.pending}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-content-muted font-semibold">Total Assigned</p>
                        <p className="text-lg font-black text-brand-forest">{staffDaySummary.total}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-content-muted">Completion Rate</span>
                        <span className="text-brand-forest">{staffDaySummary.percentageComplete ?? 0}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                        <div
                          className="h-full bg-brand-forest rounded-full transition-all duration-300"
                          style={{ width: `${staffDaySummary.percentageComplete ?? 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Activity Breakdown */}
                    {staffDaySummary.breakdown && (
                      <div className="space-y-2 pt-1">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                          Operations Performed
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
                            <span className="text-blue-800 font-semibold block text-[11px]">Washed</span>
                            <span className="text-sm font-black text-blue-950">{staffDaySummary.breakdown.wash} pcs</span>
                          </div>
                          <div className="p-2 rounded-lg bg-orange-50 border border-orange-200">
                            <span className="text-orange-800 font-semibold block text-[11px]">Ironed</span>
                            <span className="text-sm font-black text-orange-950">{staffDaySummary.breakdown.iron} pcs</span>
                          </div>
                          <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200">
                            <span className="text-cyan-800 font-semibold block text-[11px]">Dried</span>
                            <span className="text-sm font-black text-cyan-950">{staffDaySummary.breakdown.dry} pcs</span>
                          </div>
                          <div className="p-2 rounded-lg bg-teal-50 border border-teal-200">
                            <span className="text-teal-800 font-semibold block text-[11px]">Folded</span>
                            <span className="text-sm font-black text-teal-950">{staffDaySummary.breakdown.fold} pcs</span>
                          </div>
                          <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200">
                            <span className="text-indigo-800 font-semibold block text-[11px]">Packed</span>
                            <span className="text-sm font-black text-indigo-950">{staffDaySummary.breakdown.pack} pcs</span>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                            <span className="text-emerald-800 font-semibold block text-[11px]">Delivered</span>
                            <span className="text-sm font-black text-emerald-950">{staffDaySummary.breakdown.delivery} orders</span>
                          </div>
                          <div className="p-2 rounded-lg bg-purple-50 border border-purple-200">
                            <span className="text-purple-800 font-semibold block text-[11px]">Pickups</span>
                            <span className="text-sm font-black text-purple-950">{staffDaySummary.breakdown.pickup} pcs</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Specific Assignment Orders */}
                    {staffDaySummary.assignments && staffDaySummary.assignments.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                          Assignment Orders
                        </h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {staffDaySummary.assignments.map((asg) => (
                            <div
                              key={asg.id}
                              className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-extrabold text-brand-forest">
                                  {asg.orderId ? `Order #${asg.orderId}` : 'Daily Batch'}
                                </span>
                                <p className="text-[11px] text-content-muted">
                                  {asg.workflowProfile?.name || 'Task'} • {asg.pieceCount ?? asg.pickupCount ?? asg.taskUnits?.length} units
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {asg.taskUnits.filter((u) => u.status === 'COMPLETED').length} / {asg.taskUnits.length} done
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 2: Monthly Performance */}
            {staffPerfTab === 'monthly' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 bg-surface-cream/50 p-2.5 rounded-xl border border-border-subtle">
                  <span className="text-xs font-bold text-brand-forest">
                    Month: {new Date(monthlyYear, monthlyMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const newM = monthlyMonth === 1 ? 12 : monthlyMonth - 1;
                        const newY = monthlyMonth === 1 ? monthlyYear - 1 : monthlyYear;
                        setMonthlyMonth(newM);
                        setMonthlyYear(newY);
                        fetchStaffPerformance(selectedStaff.staffMember.id, selectedShopId, staffTaskDate, newY, newM);
                      }}
                      className="px-2 py-1 text-xs rounded bg-white border border-border-subtle font-bold"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => {
                        const newM = monthlyMonth === 12 ? 1 : monthlyMonth + 1;
                        const newY = monthlyMonth === 12 ? monthlyYear + 1 : monthlyYear;
                        setMonthlyMonth(newM);
                        setMonthlyYear(newY);
                        fetchStaffPerformance(selectedStaff.staffMember.id, selectedShopId, staffTaskDate, newY, newM);
                      }}
                      className="px-2 py-1 text-xs rounded bg-white border border-border-subtle font-bold"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {isLoadingStaffPerf ? (
                  <div className="py-8 text-center text-xs text-content-muted font-semibold">
                    Calculating monthly figures...
                  </div>
                ) : !staffMonthSummary || staffMonthSummary.total === 0 ? (
                  <div className="bg-surface-cream/40 rounded-xl p-6 text-center space-y-1">
                    <p className="text-xs font-bold text-brand-forest">No task history for this month.</p>
                    <p className="text-[11px] text-content-muted">No completed or assigned units logged for this period.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Monthly High-level Summary */}
                    <div className="grid grid-cols-3 gap-2 text-center p-3 bg-brand-forest text-white rounded-xl shadow-clay">
                      <div>
                        <p className="text-[11px] text-brand-lime font-semibold">Monthly Done</p>
                        <p className="text-xl font-black">{staffMonthSummary.completed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-brand-lime font-semibold">Pending</p>
                        <p className="text-xl font-black">{staffMonthSummary.pending}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-brand-lime font-semibold">Total Work</p>
                        <p className="text-xl font-black">{staffMonthSummary.total}</p>
                      </div>
                    </div>

                    {/* Day-by-Day Consistency Breakdown */}
                    {staffMonthSummary.dailyProgress && staffMonthSummary.dailyProgress.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                          Daily Consistency Records
                        </h4>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {staffMonthSummary.dailyProgress.map((day) => (
                            <div
                              key={day.date}
                              className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-brand-forest">{day.date}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-700">
                                  {day.completed} / {day.total} units
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    day.completed === day.total
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {Math.round((day.completed / day.total) * 100)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: CUSTOM FIELDS BUILDER
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'custom-fields' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-brand-forest">
                Shop Custom Fields Builder
              </h2>
              <p className="text-xs text-content-muted">
                Define dynamic operational inputs (e.g. stain severity, brand tags, rack locations)
              </p>
            </div>

            {/* Shop Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-content-muted">Select Branch:</span>
              <select
                value={customFieldsShopId}
                onChange={(e) => setCustomFieldsShopId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-surface-card border border-border-subtle font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Create Field Form */}
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
              <h3 className="text-sm font-black text-brand-forest">Add Dynamic Custom Field</h3>
              <form onSubmit={handleCreateCustomField} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Field Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. garment_brand or stain_tag"
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                  />
                  <p className="text-[10px] text-content-muted mt-0.5">Lowercase and underscores only</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Display Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Garment Brand"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Field Type</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as CustomFieldDefinition['fieldType'])}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                  >
                    <option value="TEXT">Short Text</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date</option>
                    <option value="DROPDOWN">Dropdown / Select</option>
                    <option value="YES_NO">Yes / No Switch</option>
                    <option value="FILE_IMAGE">Photo / File Upload</option>
                  </select>
                </div>

                {newFieldType === 'DROPDOWN' && (
                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1">
                      Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Zara, H&M, Raymond, Other"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isRequiredCheck"
                    checked={newFieldRequired}
                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                    className="rounded text-brand-forest focus:ring-brand-forest"
                  />
                  <label htmlFor="isRequiredCheck" className="text-xs font-semibold text-brand-forest">
                    Mandatory field (Required)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingField}
                  className="w-full py-2.5 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{isSubmittingField ? 'Adding...' : 'Add Custom Field'}</span>
                </button>
              </form>
            </div>

            {/* Existing Fields List */}
            <div className="lg:col-span-2 bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
              <h3 className="text-sm font-black text-brand-forest">
                Active Custom Fields ({customFields.length})
              </h3>

              {isLoadingFields ? (
                <div className="py-8 text-center text-xs text-content-muted">Loading fields...</div>
              ) : customFields.length === 0 ? (
                <div className="py-8 text-center text-xs text-content-muted">
                  No custom fields configured for this branch yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div
                      key={field.id}
                      className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-brand-forest">{field.label}</span>
                          <span className="px-1.5 py-0.5 rounded bg-surface-card border text-[10px] font-mono text-content-muted">
                            {field.key}
                          </span>
                          {field.isRequired && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-content-muted font-medium">
                          Type: <strong>{field.fieldType}</strong>
                          {field.dropdownOptions?.length > 0 && ` • [${field.dropdownOptions.join(', ')}]`}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteCustomField(field.id)}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                        title="Delete Field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 3: AUDIT LOGS VIEWER
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit-logs' && (
        <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-3">
            <div>
              <h2 className="text-base font-extrabold text-brand-forest">Platform Audit Trail</h2>
              <p className="text-xs text-content-muted">
                Immutable security and administrative record of changes across shops, configurations, and accounts
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-content-muted">Filter:</span>
              <select
                value={auditFilterShopId}
                onChange={(e) => setAuditFilterShopId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-surface-cream border border-border-subtle font-bold text-brand-forest"
              >
                <option value="">All Branches</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingAudit ? (
            <div className="py-12 text-center text-xs text-content-muted font-semibold">
              Loading audit records...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-content-muted space-y-1">
              <FileText className="w-8 h-8 text-content-muted mx-auto" />
              <p className="font-bold text-brand-forest">No audit events recorded yet</p>
              <p>Actions like branch creation, field configuration, or profile edits will be recorded here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-content-muted text-[11px] uppercase tracking-wider font-extrabold">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Entity</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-cream/50 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-content-muted font-mono text-[11px]">
                        {new Date(log.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-forest/10 text-brand-forest font-mono">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-bold text-brand-forest">
                        {log.entityType}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-content-muted">
                        {log.actor?.username || 'System'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-content-muted">
                        {log.shop?.name || 'Global'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 4: SYSTEM CONFIGURATIONS (POSITIONS, CATALOGUES, PERMISSIONS)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 p-1 bg-surface-card rounded-xl border border-border-subtle w-fit">
            <button
              onClick={() => setConfigSubTab('positions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                configSubTab === 'positions'
                  ? 'bg-brand-forest text-white'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Position Categories ({positions.length})
            </button>
            <button
              onClick={() => setConfigSubTab('catalogues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                configSubTab === 'catalogues'
                  ? 'bg-brand-forest text-white'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Catalogues ({services.length} Services • {activities.length} Activities)
            </button>
            <button
              onClick={() => setConfigSubTab('permissions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                configSubTab === 'permissions'
                  ? 'bg-brand-forest text-white'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Permissions ({permissionProfiles.length})
            </button>
          </div>

          {configSubTab === 'positions' && (
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
                      <h4 className="text-sm font-extrabold text-brand-forest">{pos.name}</h4>
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

          {configSubTab === 'catalogues' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
                Services & Activities Catalogue
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2"
                  >
                    <h4 className="text-sm font-extrabold text-brand-forest">{svc.name}</h4>
                    <div className="flex flex-wrap gap-1">
                      {svc.activityMappings.map((am) => (
                        <span
                          key={am.activityType.id}
                          className="px-2 py-0.5 rounded bg-surface-cream text-[10px] font-semibold text-brand-forest border"
                        >
                          {am.activityType.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {configSubTab === 'permissions' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
                Permission Profiles
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {permissionProfiles.map((perm) => (
                  <div
                    key={perm.id}
                    className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2"
                  >
                    <h4 className="text-sm font-extrabold text-brand-forest">{perm.name}</h4>
                    <p className="text-xs text-content-muted">{perm.description || 'Pre-configured capability set'}</p>
                    <div className="flex flex-wrap gap-1">
                      {perm.capabilities.map((c) => (
                        <span
                          key={c.id}
                          className="px-2 py-0.5 rounded bg-brand-forest/5 text-[10px] font-mono text-brand-forest"
                        >
                          {c.capability}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          ADD SHOP MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {isAddShopOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">Add New Shop Branch</h3>
              <button
                onClick={() => setIsAddShopOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-content-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateShop} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tumbledry Indiranagar"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Branch Code (slug) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. blr-indiranagar"
                  value={shopCode}
                  onChange={(e) => setShopCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Shop address details"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Timezone</label>
                <input
                  type="text"
                  value={shopTimezone}
                  onChange={(e) => setShopTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddShopOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShop}
                  className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm"
                >
                  {isSubmittingShop ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          EDIT SHOP MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {isEditShopOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">Edit Shop Branch</h3>
              <button
                onClick={() => setIsEditShopOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-content-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateShop} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Shop Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editShopName}
                  onChange={(e) => setEditShopName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Branch Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editShopCode}
                  onChange={(e) => setEditShopCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Address</label>
                <input
                  type="text"
                  value={editShopAddress}
                  onChange={(e) => setEditShopAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Status</label>
                <select
                  value={editShopStatus}
                  onChange={(e) => setEditShopStatus(e.target.value as Shop['status'])}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditShopOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditShop}
                  className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm"
                >
                  {isSubmittingEditShop ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          ADD POSITION MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {isAddPosOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-brand-forest">Add Position Category</h3>
              <button
                onClick={() => setIsAddPosOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-content-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePosition} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Title / Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Tailor"
                  value={posName}
                  onChange={(e) => setPosName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Brief role responsibilities"
                  value={posDescription}
                  onChange={(e) => setPosDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Workflow Profile
                </label>
                <select
                  value={posWfId}
                  onChange={(e) => setPosWfId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest"
                >
                  <option value="">None (Standard Role)</option>
                  {workflowProfiles.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.workflowType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddPosOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPos}
                  className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold shadow-clay-sm"
                >
                  {isSubmittingPos ? 'Creating...' : 'Create Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          ADD SUPERVISOR MODAL (OWNER CREATES SHOP SUPERVISOR)
      ══════════════════════════════════════════════════════════════════════════ */}
      {isAddSupervisorOpen && selectedShopObj && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-forest text-brand-lime">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-brand-forest">Add Branch Supervisor</h3>
                  <p className="text-xs text-content-muted">Assign and create credentials for {selectedShopObj.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSupervisorOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:bg-surface-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupervisor} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Supervisor Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Kumar"
                  value={supFullName}
                  onChange={(e) => setSupFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={supMobile}
                  onChange={(e) => setSupMobile(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Login Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. supervisor01"
                    value={supUsername}
                    onChange={(e) => setSupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Login Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. superpass123"
                    value={supPassword}
                    onChange={(e) => setSupPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Monthly Salary (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 25000"
                    value={supSalary}
                    onChange={(e) => setSupSalary(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Duty Timing
                  </label>
                  <input
                    type="text"
                    placeholder="09:00 AM - 06:00 PM"
                    value={supDutyTiming}
                    onChange={(e) => setSupDutyTiming(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsAddSupervisorOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSupervisor}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmittingSupervisor ? 'Creating Access...' : 'Create Supervisor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SUPERVISOR CREATED CREDENTIALS SUCCESS MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {createdSupCredentials && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-emerald-300 shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-brand-forest">Supervisor Access Created!</h3>
                <p className="text-xs text-content-muted">Share these branch login credentials with your supervisor</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-cream border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Branch Shop:</span>
                <span className="font-black text-brand-forest">{createdSupCredentials.shopName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Supervisor:</span>
                <span className="font-black text-brand-forest">{createdSupCredentials.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Username:</span>
                <span className="font-mono font-black text-brand-forest bg-white px-2 py-0.5 rounded border border-border-subtle">
                  {createdSupCredentials.username}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-content-muted font-medium">Password:</span>
                <span className="font-mono font-black text-emerald-800 bg-white px-2 py-0.5 rounded border border-border-subtle">
                  {createdSupCredentials.password}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  const text = `Tumbledry Supervisor Login\nBranch: ${createdSupCredentials.shopName}\nSupervisor: ${createdSupCredentials.fullName}\nUsername: ${createdSupCredentials.username}\nPassword: ${createdSupCredentials.password}\nLogin at: ${window.location.origin}/login`;
                  navigator.clipboard.writeText(text);
                  alert('Credentials copied to clipboard!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-brand-forest text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-hover"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Credentials</span>
              </button>
              <button
                onClick={() => setCreatedSupCredentials(null)}
                className="flex-1 py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black shadow-clay"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RESET STAFF / SUPERVISOR PASSWORD MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {resetStaffTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-black text-brand-forest">Reset Password</h3>
              </div>
              <button onClick={() => setResetStaffTarget(null)} className="p-1 text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-content-muted">
              Enter a new login password for <strong className="text-brand-forest">{resetStaffTarget.staffMember.fullName}</strong>
              {resetStaffTarget.account?.username && (
                <span> (Username: <strong className="font-mono text-brand-forest">{resetStaffTarget.account.username}</strong>)</span>
              )}:
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">New Password</label>
                <input
                  type="text"
                  required
                  placeholder="Min. 6 characters"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle font-mono font-bold focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetStaffTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="px-4 py-2 rounded-xl bg-brand-forest text-white text-xs font-bold shadow-clay"
                >
                  {isSubmittingReset ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
