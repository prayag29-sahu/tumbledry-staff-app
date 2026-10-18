'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  ChevronLeft,
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
  Layers,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import {
  DamageIncidentViewerModal,
  DamageIncidentRecord,
} from '../../components/DamageIncidentViewerModal';
import { AttendancePhotoViewerModal } from '../../components/AttendancePhotoViewerModal';

interface BranchDashboardData {
  date: string;
  totalStaff: number;
  totalEmployees?: number;
  presentCount: number;
  activeOnFloorCount?: number;
  completedShiftCount?: number;
  absentCount: number;
  todayTasks: {
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  };
  departmentBreakdown?: {
    wash: { name: string; total: number; completed: number; percentage: number };
    iron: { name: string; total: number; completed: number; percentage: number };
    dryClean: { name: string; total: number; completed: number; percentage: number };
    packaging: { name: string; total: number; completed: number; percentage: number };
  };
  staffPerformance: Array<{
    staffId: string;
    fullName: string;
    position?: string;
    role?: string;
    percentage: number;
    totalUnits: number;
    completedUnits: number;
    attendanceEnabled?: boolean;
    isPresent: boolean;
    isOnFloor?: boolean;
    isShiftCompleted?: boolean;
    attendanceStatus?: string;
    checkInAt?: string | null;
    checkInPhotoPath?: string | null;
    checkOutAt?: string | null;
    checkOutPhotoPath?: string | null;
  }>;
}

interface BranchTaskAssignment {
  id: string;
  orderId?: string | null;
  pieceCount?: number | null;
  pickupCount?: number | null;
  status: string;
  assignmentDate: string;
  assignedAt: string;
  notes?: string | null;
  staffMember: {
    id: string;
    fullName: string;
    mobile?: string | null;
    profilePhotoPath?: string | null;
  };
  serviceType?: { name: string; code: string } | null;
  workflowProfile?: { workflowType: string; name: string } | null;
  damageIncidents?: DamageIncidentRecord[];
  taskUnits: Array<{
    id: string;
    pieceNumber?: number | null;
    activityCode?: string | null;
    status: string;
    unitType: string;
    completedAt?: string | null;
    damageIncidents?: DamageIncidentRecord[];
  }>;
}

interface BranchAttendanceSession {
  id: string;
  staffMemberId: string;
  checkInAt: string;
  checkOutAt?: string | null;
  checkInPhotoPath?: string | null;
  checkOutPhotoPath?: string | null;
  durationMinutes?: number | null;
  status: string;
  staffMember: {
    id: string;
    fullName: string;
    mobile?: string | null;
  };
}

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
  workflowProfile?: { id: string; name: string; allowedActivities: string[] } | null;
  account?: { id: string; username: string; status: string } | null;
  attendanceEnabled?: boolean;
  attendanceToday?: {
    isPresent: boolean;
    isOnFloor?: boolean;
    isShiftCompleted?: boolean;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    checkInPhotoPath?: string | null;
    checkOutPhotoPath?: string | null;
    status: string;
  };
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
    damageIncidents?: DamageIncidentRecord[];
    taskUnits: Array<{
      id: string;
      pieceNumber?: number | null;
      status: string;
      activityCode?: string;
      unitType: string;
      damageIncidents?: DamageIncidentRecord[];
    }>;
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

function OwnerPageInner() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
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
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Branch Operational Inspection State
  const [branchDate, setBranchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [branchSubTab, setBranchSubTab] = useState<'workforce' | 'tasks' | 'attendance' | 'leaderboard'>('workforce');
  const [branchDashboard, setBranchDashboard] = useState<BranchDashboardData | null>(null);
  const [isLoadingBranchDashboard, setIsLoadingBranchDashboard] = useState(false);
  const [branchTasks, setBranchTasks] = useState<BranchTaskAssignment[]>([]);
  const [isLoadingBranchTasks, setIsLoadingBranchTasks] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [branchAttendance, setBranchAttendance] = useState<BranchAttendanceSession[]>([]);
  const [isLoadingBranchAttendance, setIsLoadingBranchAttendance] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});

  // Staff Task Performance Modal
  const [selectedStaff, setSelectedStaff] = useState<StaffMembershipItem | null>(null);
  const [staffTaskDate, setStaffTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffPerfTab, setStaffPerfTab] = useState<'daily' | 'monthly' | 'attendance'>('daily');
  const [staffAttendanceSession, setStaffAttendanceSession] = useState<BranchAttendanceSession | null>(null);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [attendanceActionMessage, setAttendanceActionMessage] = useState<string | null>(null);
  const [staffDaySummary, setStaffDaySummary] = useState<StaffTaskDaySummary | null>(null);
  const [staffMonthSummary, setStaffMonthSummary] = useState<StaffTaskMonthlySummary | null>(null);
  const [isLoadingStaffPerf, setIsLoadingStaffPerf] = useState(false);
  const [monthlyYear, setMonthlyYear] = useState<number>(new Date().getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState<number>(new Date().getMonth() + 1);
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);
  const [viewingAttendancePhoto, setViewingAttendancePhoto] = useState<{
    staffName: string;
    role: string;
    photoUrl?: string;
    checkInPhotoPath?: string;
    checkOutPhotoUrl?: string;
    timestamp?: string;
    checkInAt?: string;
    checkOutTimestamp?: string;
    checkOutAt?: string;
    status?: string;
  } | null>(null);

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

  // General Staff Creation State (Supports any role)
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffRole, setNewStaffRole] = useState<'Supervisor' | 'Manager' | 'Washerman' | 'Ironman' | 'Delivery Boy' | 'Other'>('Supervisor');
  const [newStaffCustomRole, setNewStaffCustomRole] = useState('');
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffMobile, setNewStaffMobile] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffSalary, setNewStaffSalary] = useState('');
  const [newStaffDutyTiming, setNewStaffDutyTiming] = useState('');
  const [newStaffAttendanceEnabled, setNewStaffAttendanceEnabled] = useState(true);
  const [isSubmittingNewStaff, setIsSubmittingNewStaff] = useState(false);
  const [createdStaffCredentials, setCreatedStaffCredentials] = useState<{
    fullName: string;
    role: string;
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

  const lastOwnerFetchRef = useRef<number>(0);

  // Fetch staff when selectedShopId changes
  const fetchShopStaff = useCallback(async (shopId: string, silent = false, date?: string) => {
    if (!shopId) return;
    if (!silent) setIsLoadingStaff(true);
    try {
      const activeDate = date || branchDate;
      const res = await apiRequest<{ staff: StaffMembershipItem[] }>(`/api/shops/${shopId}/staff?date=${activeDate}`);
      setShopStaff(res.staff || []);
    } catch {
      setShopStaff([]);
    } finally {
      if (!silent) setIsLoadingStaff(false);
    }
  }, [branchDate]);

  // Fetch Branch Operational Data (Supervisor Dashboard, Tasks, Attendance)
  const fetchBranchData = useCallback(async (shopId: string, date: string, silent = false) => {
    if (!shopId) return;
    if (!silent) {
      setIsLoadingBranchDashboard(true);
      setIsLoadingBranchTasks(true);
      setIsLoadingBranchAttendance(true);
    }
    try {
      const [dashRes, tasksRes, attRes] = await Promise.all([
        apiRequest<BranchDashboardData>(`/api/shops/${shopId}/supervisor/dashboard?date=${date}`).catch(() => null),
        apiRequest<{ assignments: BranchTaskAssignment[] }>(`/api/shops/${shopId}/tasks?date=${date}`).catch(() => ({ assignments: [] })),
        apiRequest<{ sessions: BranchAttendanceSession[] }>(`/api/shops/${shopId}/attendance/today?date=${date}`).catch(() => ({ sessions: [] })),
      ]);

      if (dashRes) setBranchDashboard(dashRes);
      setBranchTasks(tasksRes.assignments || []);
      setBranchAttendance(attRes.sessions || []);
    } finally {
      if (!silent) {
        setIsLoadingBranchDashboard(false);
        setIsLoadingBranchTasks(false);
        setIsLoadingBranchAttendance(false);
      }
    }
  }, []);

  // Date Navigation Helpers
  const handlePrevDay = () => {
    const d = new Date(branchDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setBranchDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(branchDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setBranchDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setBranchDate(new Date().toISOString().split('T')[0]);
  };

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Create Staff Member (Supervisor, Manager, Washerman, etc.)
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShopId || !newStaffFullName.trim()) return;

    const roleName = newStaffRole === 'Other' ? newStaffCustomRole.trim() : newStaffRole;
    if (!roleName) {
      alert('Please specify a role.');
      return;
    }

    setIsSubmittingNewStaff(true);
    try {
      await apiRequest(`/api/shops/${selectedShopId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: newStaffFullName.trim(),
          mobile: newStaffMobile.trim() || undefined,
          username: newStaffUsername.trim() ? newStaffUsername.trim().toLowerCase() : undefined,
          password: newStaffPassword.trim() || undefined,
          role: roleName,
          monthlySalary: newStaffSalary ? parseFloat(newStaffSalary) : undefined,
          dutyTimingNotes: newStaffDutyTiming.trim() || undefined,
          attendanceEnabled: newStaffAttendanceEnabled,
        }),
      });

      const currentShop = shops.find((s) => s.id === selectedShopId);
      if (newStaffUsername.trim() && newStaffPassword.trim()) {
        setCreatedStaffCredentials({
          fullName: newStaffFullName.trim(),
          role: roleName,
          username: newStaffUsername.trim().toLowerCase(),
          password: newStaffPassword.trim(),
          shopName: currentShop?.name || 'Shop',
        });
      } else {
        alert(`Staff member ${newStaffFullName.trim()} created successfully!`);
      }

      setIsAddStaffOpen(false);
      setNewStaffFullName('');
      setNewStaffMobile('');
      setNewStaffUsername('');
      setNewStaffPassword('');
      setNewStaffSalary('');
      setNewStaffDutyTiming('');
      setNewStaffAttendanceEnabled(true);
      fetchShopStaff(selectedShopId);
      fetchBranchData(selectedShopId, branchDate);
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create staff member.');
    } finally {
      setIsSubmittingNewStaff(false);
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

  // Fetch staff and branch operational data when selectedShopId, branchDate, or activeTab changes
  useEffect(() => {
    if (selectedShopId) {
      fetchShopStaff(selectedShopId, false, branchDate);
      fetchBranchData(selectedShopId, branchDate);
    }
  }, [selectedShopId, branchDate, activeTab, fetchShopStaff, fetchBranchData]);

  // Auto-refresh on window focus / visibility change without manual page reload (throttled to 30s)
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastOwnerFetchRef.current > 30000 && selectedShopId && activeTab === 'overview') {
        lastOwnerFetchRef.current = now;
        fetchShopStaff(selectedShopId, true, branchDate);
        fetchBranchData(selectedShopId, branchDate, true);
      }
    };
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastOwnerFetchRef.current > 30000 && selectedShopId && activeTab === 'overview') {
          lastOwnerFetchRef.current = now;
          fetchShopStaff(selectedShopId, true, branchDate);
          fetchBranchData(selectedShopId, branchDate, true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedShopId, branchDate, activeTab, fetchShopStaff, fetchBranchData]);

  // Synchronize view query parameter from URL (e.g. from BottomNav 'workforce' or 'tasks')
  useEffect(() => {
    if (viewParam === 'workforce') {
      setActiveTab('overview');
      setBranchSubTab('workforce');
    } else if (viewParam === 'tasks') {
      setActiveTab('overview');
      setBranchSubTab('tasks');
    } else if (viewParam === 'attendance') {
      setActiveTab('overview');
      setBranchSubTab('attendance');
    }
  }, [viewParam]);

  // Fetch staff performance details (daily + monthly + attendance)
  const fetchStaffPerformance = useCallback(async (staffMemberId: string, shopId: string, date: string, year: number, month: number) => {
    setIsLoadingStaffPerf(true);
    try {
      const [dayData, monthData, attData] = await Promise.all([
        apiRequest<{ assignments: StaffTaskDaySummary['assignments']; summary: StaffTaskDaySummary }>(
          `/api/shops/${shopId}/staff/${staffMemberId}/tasks?date=${date}`
        ).catch(() => null),
        apiRequest<StaffTaskMonthlySummary>(
          `/api/shops/${shopId}/staff/${staffMemberId}/task-summary/monthly?year=${year}&month=${month}`
        ).catch(() => null),
        apiRequest<{ sessions: BranchAttendanceSession[] }>(
          `/api/shops/${shopId}/attendance/today?date=${date}`
        ).catch(() => ({ sessions: [] })),
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

      const matchedSession = (attData?.sessions || []).find((s) => s.staffMemberId === staffMemberId);
      setStaffAttendanceSession(matchedSession || null);
    } catch {
      setStaffDaySummary(null);
      setStaffMonthSummary(null);
      setStaffAttendanceSession(null);
    } finally {
      setIsLoadingStaffPerf(false);
    }
  }, []);

  const openStaffPerformance = (staff: StaffMembershipItem, initialTab: 'daily' | 'monthly' | 'attendance' = 'daily') => {
    setSelectedStaff(staff);
    const today = new Date().toISOString().split('T')[0];
    setStaffTaskDate(today);
    setStaffPerfTab(initialTab);
    const now = new Date();
    setMonthlyYear(now.getFullYear());
    setMonthlyMonth(now.getMonth() + 1);
    fetchStaffPerformance(staff.staffMember.id, selectedShopId, today, now.getFullYear(), now.getMonth() + 1);
  };

  const handleOwnerMarkAttendance = async (status: 'PRESENT' | 'CHECK_OUT' | 'HALF_DAY' | 'ABSENT') => {
    if (!selectedStaff || !selectedShopId) return;
    setIsMarkingAttendance(true);
    setAttendanceActionMessage(null);
    try {
      await apiRequest(`/api/shops/${selectedShopId}/attendance/mark-staff`, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId: selectedStaff.staffMember.id,
          status,
          date: staffTaskDate,
        }),
      });
      setAttendanceActionMessage(
        status === 'PRESENT'
          ? 'Marked as Present (Check-In).'
          : status === 'CHECK_OUT'
          ? 'Marked as Checked Out.'
          : status === 'HALF_DAY'
          ? 'Marked as Half Day.'
          : 'Marked as Absent.'
      );
      setTimeout(() => setAttendanceActionMessage(null), 3500);
      fetchStaffPerformance(selectedStaff.staffMember.id, selectedShopId, staffTaskDate, monthlyYear, monthlyMonth);
      fetchBranchData(selectedShopId, branchDate);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update attendance.');
    } finally {
      setIsMarkingAttendance(false);
    }
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

  // Filter staff by search query and role filter
  const filteredStaff = shopStaff.filter((m) => {
    if (roleFilter !== 'ALL') {
      const staffRole = (m.role || m.positionCategory?.name || '').toLowerCase();
      if (!staffRole.includes(roleFilter.toLowerCase())) return false;
    }
    if (!staffSearchQuery.trim()) return true;
    const q = staffSearchQuery.toLowerCase();
    const nameMatch = m.staffMember.fullName.toLowerCase().includes(q);
    const roleMatch = (m.role || m.positionCategory?.name || '').toLowerCase().includes(q);
    const mobileMatch = m.staffMember.mobile?.includes(q);
    const userMatch = m.account?.username?.toLowerCase().includes(q);
    return nameMatch || roleMatch || mobileMatch || userMatch;
  });

  // Filter tasks by status and search query
  const filteredTasks = branchTasks.filter((t) => {
    if (taskStatusFilter === 'COMPLETED') {
      const allUnitsDone = t.taskUnits.length > 0 && t.taskUnits.every((u) => u.status === 'COMPLETED');
      if (!allUnitsDone && t.status !== 'COMPLETED') return false;
    } else if (taskStatusFilter === 'PENDING') {
      const hasPendingUnits = t.taskUnits.some((u) => u.status !== 'COMPLETED');
      if (!hasPendingUnits && t.status === 'COMPLETED') return false;
    }

    if (!taskSearchQuery.trim()) return true;
    const q = taskSearchQuery.toLowerCase();
    const orderMatch = (t.orderId || '').toLowerCase().includes(q);
    const staffMatch = t.staffMember.fullName.toLowerCase().includes(q);
    const svcMatch = (t.serviceType?.name || '').toLowerCase().includes(q);
    return orderMatch || staffMatch || svcMatch;
  });

  // Attendance breakdown lists
  const presentStaffMemberIds = new Set(branchAttendance.map((s) => s.staffMemberId));
  const absentStaffList = shopStaff.filter((s) => s.attendanceEnabled !== false && !presentStaffMemberIds.has(s.staffMember.id));
  const exemptStaffList = shopStaff.filter((s) => s.attendanceEnabled === false);

  return (
    <div className="space-y-6 animate-fade-in pb-36 sm:pb-32">
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
                {metrics?.global?.totalActiveStaff && metrics.global.totalActiveStaff > 0
                  ? metrics.global.totalActiveStaff
                  : (shopStaff.length > 0 ? shopStaff.length : 0)}
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
                {metrics?.global?.todayAttendanceCount && metrics.global.todayAttendanceCount > 0
                  ? metrics.global.todayAttendanceCount
                  : shopStaff.filter((s) => s.attendanceToday?.isPresent).length}
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
                          <p className="font-extrabold text-brand-forest">
                            {shopPerf?.staffCount && shopPerf.staffCount > 0
                              ? shopPerf.staffCount
                              : (shop.id === selectedShopId && shopStaff.length > 0 ? shopStaff.length : (shopPerf?.staffCount ?? '-'))}
                          </p>
                        </div>
                        <div>
                          <p className="text-content-muted font-medium">Present</p>
                          <p className="font-extrabold text-purple-700">
                            {shopPerf?.todayAttendance ?? (shop.id === selectedShopId ? shopStaff.filter((s) => s.attendanceToday?.isPresent).length : '-')}
                          </p>
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
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 sm:p-5 space-y-5">
              {/* Branch Header & Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border-subtle pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg bg-brand-forest text-brand-lime text-xs font-black">
                      BRANCH SURVEILLANCE
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-brand-forest">
                      {selectedShopObj.name} ({selectedShopObj.code})
                    </h3>
                    <select
                      value={selectedShopId}
                      onChange={(e) => setSelectedShopId(e.target.value)}
                      className="px-2.5 py-1 text-xs rounded-xl bg-surface-cream border border-border-subtle font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                    >
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          Switch to: {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-content-muted mt-1">
                    Multi-tier floor operations, workforce surveillance, live piece-level tasks & branch attendance
                  </p>
                </div>

                {/* Date Navigator Bar & Add Staff */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-surface-cream p-1 rounded-xl border border-border-subtle shadow-clay-sm">
                    <button
                      onClick={handlePrevDay}
                      title="Previous Day"
                      className="p-1.5 rounded-lg hover:bg-surface-card text-brand-forest transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1 px-1">
                      <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                      <input
                        type="date"
                        value={branchDate}
                        onChange={(e) => setBranchDate(e.target.value)}
                        className="px-1.5 py-0.5 text-xs font-bold text-brand-forest bg-transparent border-0 focus:ring-0 cursor-pointer"
                      />
                    </div>
                    <button
                      onClick={handleNextDay}
                      title="Next Day"
                      className="p-1.5 rounded-lg hover:bg-surface-card text-brand-forest transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleToday}
                      className="px-2 py-1 text-[11px] font-bold bg-white text-brand-forest rounded-lg border border-border-subtle hover:bg-surface-card shadow-sm"
                    >
                      Today
                    </button>
                    {isLoadingBranchDashboard && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-forest shrink-0" />
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setNewStaffRole('Supervisor');
                      setNewStaffCustomRole('');
                      setNewStaffFullName('');
                      setNewStaffMobile('');
                      setNewStaffUsername(`staff_${selectedShopObj.code.toLowerCase()}_${Math.floor(10 + Math.random() * 90)}`);
                      setNewStaffPassword('');
                      setNewStaffSalary('');
                      setNewStaffDutyTiming('');
                      setNewStaffAttendanceEnabled(true);
                      setIsAddStaffOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black flex items-center gap-1.5 shadow-clay hover:opacity-95 transition-all whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Add Staff Member</span>
                  </button>
                </div>
              </div>

              {/* 4 Floor Metric Badges */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Total Staff */}
                <div className="p-3.5 rounded-2xl bg-surface-cream/50 border border-border-subtle space-y-1">
                  <div className="flex items-center justify-between text-xs text-content-muted font-bold">
                    <span>Total Staff</span>
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-brand-forest">
                    {branchDashboard?.totalStaff ?? shopStaff.length}
                  </div>
                  <p className="text-[11px] text-content-muted font-medium">Registered in branch</p>
                </div>

                {/* Present / Active On Floor */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/60 space-y-1">
                  <div className="flex items-center justify-between text-xs text-emerald-800 font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      Active On Floor
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-black text-emerald-800">
                      {branchDashboard?.activeOnFloorCount ?? branchAttendance.filter((s) => s.status === 'OPEN' && !s.checkOutAt).length}
                    </div>
                    <span className="text-xs font-bold text-blue-700">
                      + {branchDashboard?.completedShiftCount ?? branchAttendance.filter((s) => s.status === 'CLOSED' || !!s.checkOutAt).length} completed
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Total {branchDashboard?.presentCount ?? branchAttendance.length} checked-in today
                  </p>
                </div>

                {/* Absent Today */}
                <div className="p-3.5 rounded-2xl bg-red-50/50 border border-red-200/60 space-y-1">
                  <div className="flex items-center justify-between text-xs text-red-800 font-bold">
                    <span>Absent</span>
                    <Clock className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-2xl font-black text-red-700">
                    {branchDashboard?.absentCount ?? absentStaffList.length}
                  </div>
                  <p className="text-[11px] text-red-600 font-medium">Expected on floor today</p>
                </div>

                {/* Floor Units Output */}
                <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 space-y-1">
                  <div className="flex items-center justify-between text-xs text-amber-900 font-bold">
                    <span>Floor Units Output</span>
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-black text-brand-forest flex items-baseline gap-1.5">
                    <span>{branchDashboard?.todayTasks.completed ?? 0}</span>
                    <span className="text-xs font-bold text-content-muted">
                      / {branchDashboard?.todayTasks.total ?? 0}
                    </span>
                    <span className="text-xs font-black text-emerald-700 ml-auto">
                      {branchDashboard?.todayTasks.percentage ?? 0}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-amber-200 overflow-hidden">
                    <div
                      className="h-full bg-brand-forest rounded-full transition-all duration-300"
                      style={{ width: `${branchDashboard?.todayTasks.percentage ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 4 Live Department Breakdown Cards */}
              {branchDashboard?.departmentBreakdown && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-brand-forest">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-brand-forest" />
                      Live Floor Departments Progress
                    </span>
                    <span className="text-[10px] text-content-muted font-normal">
                      Real-time piece/unit completion breakdown
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {/* Wash */}
                    <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-blue-950 flex items-center gap-1.5">
                          <Shirt className="w-3.5 h-3.5 text-blue-600" />
                          Washing & Cleaning
                        </span>
                        <span className="text-[11px] font-black text-blue-800">
                          {branchDashboard.departmentBreakdown.wash.percentage}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-lg font-black text-blue-950">
                          {branchDashboard.departmentBreakdown.wash.completed} <span className="text-xs font-semibold text-blue-700">/ {branchDashboard.departmentBreakdown.wash.total} pcs</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-blue-200 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${branchDashboard.departmentBreakdown.wash.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Iron */}
                    <div className="p-3 rounded-2xl bg-orange-50/60 border border-orange-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-orange-950 flex items-center gap-1.5">
                          Steam Press & Iron
                        </span>
                        <span className="text-[11px] font-black text-orange-800">
                          {branchDashboard.departmentBreakdown.iron.percentage}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-lg font-black text-orange-950">
                          {branchDashboard.departmentBreakdown.iron.completed} <span className="text-xs font-semibold text-orange-700">/ {branchDashboard.departmentBreakdown.iron.total} pcs</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-orange-200 overflow-hidden">
                        <div
                          className="h-full bg-orange-600 rounded-full transition-all"
                          style={{ width: `${branchDashboard.departmentBreakdown.iron.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Dry Clean */}
                    <div className="p-3 rounded-2xl bg-cyan-50/60 border border-cyan-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-cyan-950 flex items-center gap-1.5">
                          Dry Clean & Delicate
                        </span>
                        <span className="text-[11px] font-black text-cyan-800">
                          {branchDashboard.departmentBreakdown.dryClean.percentage}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-lg font-black text-cyan-950">
                          {branchDashboard.departmentBreakdown.dryClean.completed} <span className="text-xs font-semibold text-cyan-700">/ {branchDashboard.departmentBreakdown.dryClean.total} pcs</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-cyan-200 overflow-hidden">
                        <div
                          className="h-full bg-cyan-600 rounded-full transition-all"
                          style={{ width: `${branchDashboard.departmentBreakdown.dryClean.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Packaging */}
                    <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-indigo-600" />
                          Packaging & Dispatch
                        </span>
                        <span className="text-[11px] font-black text-indigo-800">
                          {branchDashboard.departmentBreakdown.packaging.percentage}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-lg font-black text-indigo-950">
                          {branchDashboard.departmentBreakdown.packaging.completed} <span className="text-xs font-semibold text-indigo-700">/ {branchDashboard.departmentBreakdown.packaging.total} pcs</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-indigo-200 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${branchDashboard.departmentBreakdown.packaging.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Branch Sub-Tabs Navigation */}
              <div className="flex items-center gap-2 p-1 bg-surface-cream rounded-2xl border border-border-subtle overflow-x-auto">
                <button
                  onClick={() => setBranchSubTab('workforce')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    branchSubTab === 'workforce'
                      ? 'bg-brand-forest text-white shadow-sm'
                      : 'text-content-muted hover:text-brand-forest'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Staff Workforce ({shopStaff.length})</span>
                </button>

                <button
                  onClick={() => setBranchSubTab('tasks')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    branchSubTab === 'tasks'
                      ? 'bg-brand-forest text-white shadow-sm'
                      : 'text-content-muted hover:text-brand-forest'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Live Floor Tasks ({branchTasks.length})</span>
                </button>

                <button
                  onClick={() => setBranchSubTab('attendance')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    branchSubTab === 'attendance'
                      ? 'bg-brand-forest text-white shadow-sm'
                      : 'text-content-muted hover:text-brand-forest'
                  }`}
                >
                  <CalendarCheck2 className="w-4 h-4" />
                  <span>Attendance Register ({branchAttendance.length})</span>
                </button>

                <button
                  onClick={() => setBranchSubTab('leaderboard')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    branchSubTab === 'leaderboard'
                      ? 'bg-brand-forest text-white shadow-sm'
                      : 'text-content-muted hover:text-brand-forest'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Staff Leaderboard ({branchDashboard?.staffPerformance?.length ?? 0})</span>
                </button>
              </div>

              {/* ═════════════════════════════════════════════════════════════════
                  SUB-TAB 1: STAFF WORKFORCE
              ═════════════════════════════════════════════════════════════════ */}
              {branchSubTab === 'workforce' && (
                <div className="space-y-4">
                  {/* Search and Role Filter Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {['ALL', 'Supervisor', 'Manager', 'Washerman', 'Ironman', 'Delivery Boy'].map((role) => (
                        <button
                          key={role}
                          onClick={() => setRoleFilter(role)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            roleFilter === role
                              ? 'bg-brand-forest text-white shadow-sm'
                              : 'bg-surface-cream text-content-muted hover:text-brand-forest border border-border-subtle'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                      <input
                        type="text"
                        placeholder="Search staff, role or user..."
                        value={staffSearchQuery}
                        onChange={(e) => setStaffSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:outline-none focus:ring-1 focus:ring-brand-forest w-full sm:w-56 font-medium"
                      />
                    </div>
                  </div>

                  {isLoadingStaff ? (
                    <div className="py-12 text-center text-xs font-semibold text-content-muted">
                      Loading staff members for {selectedShopObj.name}...
                    </div>
                  ) : filteredStaff.length === 0 ? (
                    <div className="py-8 text-center text-xs text-content-muted bg-surface-cream/40 rounded-2xl border border-border-subtle p-6 space-y-2">
                      <p className="font-bold text-brand-forest">No staff members found.</p>
                      <p className="text-[11px]">
                        {staffSearchQuery || roleFilter !== 'ALL'
                          ? 'Try clearing your search or role filters.'
                          : 'No staff registered in this branch yet. Click "+ Add Staff Member" to add supervisors, managers, or operators.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredStaff.map((staff) => {
                        const isSupervisor = (staff.role || '').toLowerCase().includes('supervisor') ||
                          (staff.positionCategory?.name || '').toLowerCase().includes('supervisor');
                        const isManager = (staff.role || '').toLowerCase().includes('manager');

                        // Staff performance on branchDate
                        const perfData = branchDashboard?.staffPerformance?.find((p) => p.staffId === staff.staffMember.id);

                        return (
                          <div
                            key={staff.id}
                            onClick={() => openStaffPerformance(staff)}
                            className={`cursor-pointer p-4 rounded-2xl border transition-all space-y-2.5 group ${
                              isSupervisor
                                ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-600 shadow-sm'
                                : isManager
                                ? 'bg-blue-50/30 border-blue-200 hover:border-blue-400 shadow-sm'
                                : 'bg-surface-cream/50 border-border-subtle hover:border-brand-forest/60 hover:shadow-clay-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center shadow-sm ${
                                  isSupervisor
                                    ? 'bg-brand-forest text-brand-lime'
                                    : isManager
                                    ? 'bg-blue-700 text-white'
                                    : 'bg-surface-card text-brand-forest border border-border-subtle'
                                }`}>
                                  {staff.staffMember.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <h4 className="text-sm font-extrabold text-brand-forest">
                                    {staff.staffMember.fullName}
                                  </h4>
                                  <p className="text-[11px] font-medium text-content-muted">
                                    {staff.positionCategory?.name || staff.role || 'Staff Employee'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  staff.staffMember.employmentStatus === 'ACTIVE'
                                    ? 'clay-badge-lime'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {staff.staffMember.employmentStatus}
                                </span>
                              </div>
                            </div>

                            {/* Real-time Presence & Floor Output on Date */}
                            <div className="flex items-center justify-between gap-1.5 text-xs">
                              {staff.attendanceEnabled === false ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Attendance Exempt
                                </span>
                              ) : staff.attendanceToday?.isOnFloor ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                  ● On Floor {staff.attendanceToday.checkInAt ? `(${new Date(staff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})` : ''}
                                </span>
                              ) : staff.attendanceToday?.isShiftCompleted ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1 border border-blue-300">
                                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                  Shift Done {staff.attendanceToday.checkOutAt ? `(${new Date(staff.attendanceToday.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})` : ''}
                                </span>
                              ) : staff.attendanceToday?.isPresent ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Present
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                  Absent Today
                                </span>
                              )}

                              {perfData && perfData.totalUnits > 0 ? (
                                <span className="text-[11px] font-bold text-brand-forest">
                                  {perfData.completedUnits}/{perfData.totalUnits} units ({perfData.percentage}%)
                                </span>
                              ) : (
                                <span className="text-[10px] text-content-muted">0 assigned</span>
                              )}
                            </div>

                            {/* Two Dedicated Action Buttons: Tasks & Output + Shift Attendance */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStaffPerformance(staff, 'daily');
                                }}
                                className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-2 rounded-xl bg-surface-card border border-border-subtle hover:border-brand-forest text-brand-forest font-bold transition-all shadow-sm"
                                title="Inspect daily & monthly tasks"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-brand-forest shrink-0" />
                                <span className="truncate">Tasks & Output</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStaffPerformance(staff, 'attendance');
                                }}
                                className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-2 rounded-xl bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-950 font-bold transition-all shadow-sm"
                                title="View shift attendance, clock times, selfies & mark attendance"
                              >
                                <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span className="truncate">Shift Attendance</span>
                              </button>
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
                                  Attendance:
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════════
                  SUB-TAB 2: LIVE FLOOR TASKS & BATCHES
              ═════════════════════════════════════════════════════════════════ */}
              {branchSubTab === 'tasks' && (
                <div className="space-y-4">
                  {/* Task Filters */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {(['ALL', 'COMPLETED', 'PENDING'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setTaskStatusFilter(filter)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                            taskStatusFilter === filter
                              ? 'bg-brand-forest text-white shadow-sm'
                              : 'bg-surface-cream text-content-muted hover:text-brand-forest border border-border-subtle'
                          }`}
                        >
                          {filter === 'ALL' ? 'All Tasks' : filter === 'COMPLETED' ? 'Completed' : 'In Progress'}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                      <input
                        type="text"
                        placeholder="Search order ID or staff..."
                        value={taskSearchQuery}
                        onChange={(e) => setTaskSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:outline-none focus:ring-1 focus:ring-brand-forest w-full sm:w-56 font-medium"
                      />
                    </div>
                  </div>

                  {isLoadingBranchTasks ? (
                    <div className="py-12 text-center text-xs font-semibold text-content-muted">
                      Loading live tasks for {branchDate}...
                    </div>
                  ) : filteredTasks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-content-muted bg-surface-cream/40 rounded-2xl border border-border-subtle p-6 space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-content-muted mx-auto" />
                      <p className="font-bold text-brand-forest">No task assignments found for this date.</p>
                      <p className="text-[11px]">Tasks assigned by supervisors or managers for this branch will appear here live.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredTasks.map((task) => {
                        const totalUnits = task.taskUnits.length;
                        const completedUnits = task.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                        const pct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
                        const isExpanded = !!expandedTaskIds[task.id];

                        return (
                          <div
                            key={task.id}
                            className="p-4 rounded-2xl bg-surface-cream/50 border border-border-subtle hover:border-brand-forest/50 transition-all space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-brand-forest text-brand-lime shadow-clay-sm">
                                  <Layers className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-brand-forest">
                                      {task.orderId ? `Order #${task.orderId}` : 'Batch Assignment'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-border-subtle text-content-muted">
                                      {task.serviceType?.name || 'Standard Service'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-content-muted">
                                      {task.workflowProfile?.name || task.workflowProfile?.workflowType || 'Workflow'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-content-muted mt-0.5 flex items-center gap-1.5">
                                    <span>Assigned to: <strong className="text-brand-forest">{task.staffMember.fullName}</strong></span>
                                    {task.staffMember.mobile && <span>({task.staffMember.mobile})</span>}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                                    pct === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {completedUnits} / {totalUnits} done ({pct}%)
                                  </span>
                                </div>
                                <button
                                  onClick={() => toggleTaskExpansion(task.id)}
                                  className="px-2.5 py-1 text-xs rounded-xl bg-surface-card border border-border-subtle font-bold text-brand-forest hover:bg-surface-hover transition-colors"
                                >
                                  {isExpanded ? 'Hide Pieces' : 'View Pieces'}
                                </button>
                              </div>
                            </div>

                            {/* Damage Alert Banner if incident reported */}
                            {task.damageIncidents && task.damageIncidents.length > 0 && (
                              <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs animate-fade-in">
                                <div className="flex items-center gap-2 text-red-950 font-extrabold">
                                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                  <span>{task.damageIncidents.length} Damage Incident(s) reported</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setViewingDamageIncident(task.damageIncidents![0])}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1"
                                >
                                  <span>Inspect Evidence</span>
                                </button>
                              </div>
                            )}

                            {/* Progress bar */}
                            <div className="w-full h-1.5 rounded-full bg-border-subtle overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-emerald-600' : 'bg-brand-forest'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>

                            {/* Expandable Piece-Level Checklist matching Supervisor station */}
                            {isExpanded && (() => {
                              const pieceMap = new Map<number, typeof task.taskUnits>();
                              task.taskUnits.forEach((unit) => {
                                const pNum = unit.pieceNumber || 1;
                                if (!pieceMap.has(pNum)) pieceMap.set(pNum, []);
                                pieceMap.get(pNum)!.push(unit);
                              });

                              return (
                                <div className="pt-2 border-t border-border-subtle/60 space-y-2 animate-fade-in">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                      <thead>
                                        <tr className="border-b border-border-subtle text-content-muted text-[11px] font-bold">
                                          <th className="py-2 px-2">#</th>
                                          <th className="py-2 px-2">Piece</th>
                                          <th className="py-2 px-2">Operations Progress</th>
                                          <th className="py-2 px-2 text-right">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border-subtle/50">
                                        {Array.from(pieceMap.entries()).map(([pieceNum, units]) => {
                                          const completedInPiece = units.filter((u) => u.status === 'COMPLETED').length;
                                          const isPieceDone = units.length > 0 && completedInPiece === units.length;
                                          const pieceDamage =
                                            task.damageIncidents?.find((d) => d.pieceNumber === pieceNum) ||
                                            units.flatMap((u) => u.damageIncidents || []).find(Boolean);

                                          return (
                                            <tr key={pieceNum} className="hover:bg-surface-cream/40 transition-colors">
                                              <td className="py-2.5 px-2 font-mono text-content-muted font-bold">{pieceNum}</td>
                                              <td className="py-2.5 px-2">
                                                <span className="font-extrabold text-brand-forest block">Piece #{pieceNum}</span>
                                                {pieceDamage && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setViewingDamageIncident(pieceDamage)}
                                                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-red-100 hover:bg-red-200 text-red-900 text-[10px] font-extrabold border border-red-300 shadow-sm"
                                                  >
                                                    <AlertTriangle className="w-3 h-3 text-red-600" />
                                                    <span>Damage ({pieceDamage.status})</span>
                                                  </button>
                                                )}
                                              </td>
                                              <td className="py-2.5 px-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                  {units.map((u) => {
                                                    const isUnitDone = u.status === 'COMPLETED';
                                                    return (
                                                      <span
                                                        key={u.id}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                                                          isUnitDone
                                                            ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-sm'
                                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                        }`}
                                                        title={`${u.activityCode || 'Task'}: ${isUnitDone ? 'Completed' : 'Pending'}`}
                                                      >
                                                        {isUnitDone ? (
                                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                                        ) : (
                                                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                        )}
                                                        <span>{u.activityCode || 'Done'}</span>
                                                      </span>
                                                    );
                                                  })}
                                                </div>
                                              </td>
                                              <td className="py-2.5 px-2 text-right">
                                                <span
                                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                                                    isPieceDone
                                                      ? 'bg-emerald-100 text-emerald-800'
                                                      : 'bg-amber-100 text-amber-800'
                                                  }`}
                                                >
                                                  {isPieceDone ? <CheckCircle2 className="w-3 h-3 text-emerald-700" /> : null}
                                                  <span>{isPieceDone ? 'Done' : `${completedInPiece}/${units.length}`}</span>
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════════
                  SUB-TAB 3: ATTENDANCE REGISTER
              ═════════════════════════════════════════════════════════════════ */}
              {branchSubTab === 'attendance' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Checked-in sessions */}
                    <div className="p-4 rounded-2xl bg-surface-cream/50 border border-border-subtle space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Checked In Present ({branchAttendance.length})
                        </h4>
                        <span className="text-[10px] text-content-muted font-bold">
                          {branchDate}
                        </span>
                      </div>

                      {isLoadingBranchAttendance ? (
                        <div className="py-6 text-center text-xs text-content-muted">Loading attendance...</div>
                      ) : branchAttendance.length === 0 ? (
                        <div className="py-6 text-center text-xs text-content-muted">
                          No check-ins recorded for this branch on {branchDate}.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {branchAttendance.map((session) => (
                            <div
                              key={session.id}
                              className="p-3 rounded-xl bg-white border border-border-subtle flex items-center justify-between text-xs hover:border-brand-forest/30 transition-colors"
                            >
                              <div className="space-y-0.5">
                                <span className="font-extrabold text-brand-forest">
                                  {session.staffMember.fullName}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-content-muted">
                                  <span>In: <strong>{new Date(session.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                                  {session.checkOutAt && (
                                    <span>• Out: <strong>{new Date(session.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                                  )}
                                  {session.durationMinutes && (
                                    <span>• Duration: {Math.round(session.durationMinutes / 60)}h {session.durationMinutes % 60}m</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {session.checkInPhotoPath && (
                                  <button
                                    type="button"
                                    onClick={() => setViewingAttendancePhoto({
                                      staffName: session.staffMember.fullName,
                                      role: 'Staff Employee',
                                      photoUrl: session.checkInPhotoPath!,
                                      checkOutPhotoUrl: session.checkOutPhotoPath || undefined,
                                      timestamp: session.checkInAt,
                                      checkOutTimestamp: session.checkOutAt || undefined,
                                      status: session.status,
                                    })}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold shadow-sm transition-colors"
                                    title="View Attendance Check-in Selfie"
                                  >
                                    <Camera className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>View Selfie</span>
                                  </button>
                                )}
                                {session.status === 'OPEN' && !session.checkOutAt ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                    On Floor
                                  </span>
                                ) : session.status === 'CLOSED' || session.checkOutAt ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                    Shift Completed
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    {session.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Absent Staff List */}
                    <div className="p-4 rounded-2xl bg-surface-cream/50 border border-border-subtle space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-red-500" />
                          Not Checked In ({absentStaffList.length})
                        </h4>
                        <span className="text-[10px] text-red-700 font-bold">
                          Attendance Required
                        </span>
                      </div>

                      {absentStaffList.length === 0 ? (
                        <div className="py-6 text-center text-xs text-emerald-800 font-bold">
                          🎉 100% staff attendance! All required employees are present.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {absentStaffList.map((staff) => (
                            <div
                              key={staff.id}
                              className="p-3 rounded-xl bg-white border border-red-100 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-extrabold text-brand-forest">
                                  {staff.staffMember.fullName}
                                </span>
                                <p className="text-[11px] text-content-muted">
                                  {staff.positionCategory?.name || staff.role} • {staff.staffMember.mobile || 'No mobile'}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700">
                                ABSENT
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {exemptStaffList.length > 0 && (
                        <div className="pt-2 border-t border-border-subtle/50 text-xs">
                          <p className="text-[11px] text-content-muted font-bold mb-1">
                            Attendance Exempt ({exemptStaffList.length}):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {exemptStaffList.map((s) => (
                              <span key={s.id} className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[10px] font-semibold">
                                {s.staffMember.fullName} ({s.positionCategory?.name || s.role})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════════
                  SUB-TAB 4: STAFF PRODUCTIVITY LEADERBOARD
              ═════════════════════════════════════════════════════════════════ */}
              {branchSubTab === 'leaderboard' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-surface-cream/50 border border-border-subtle space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-brand-forest" />
                        Branch Productivity Rankings on {branchDate}
                      </h4>
                      <span className="text-[10px] text-content-muted">
                        Ranked by completion rate & units handled
                      </span>
                    </div>

                    {!branchDashboard?.staffPerformance || branchDashboard.staffPerformance.length === 0 ? (
                      <div className="py-8 text-center text-xs text-content-muted">
                        No task data recorded for any staff member on {branchDate}.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {branchDashboard.staffPerformance.map((item, idx) => (
                          <div
                            key={item.staffId}
                            className="p-3.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs ${
                                idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-gray-200 text-gray-800' : idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-surface-cream text-content-muted'
                              }`}>
                                #{idx + 1}
                              </div>
                              <div>
                                <span className="font-extrabold text-brand-forest text-sm">
                                  {item.fullName}
                                </span>
                                <p className="text-[11px] text-content-muted">
                                  {item.position} • {item.isPresent ? '🟢 Present' : '⚪ Absent'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className="text-sm font-black text-brand-forest">
                                  {item.completedUnits} / {item.totalUnits} units
                                </span>
                                <div className="w-24 h-1.5 rounded-full bg-border-subtle overflow-hidden mt-1">
                                  <div
                                    className="h-full bg-brand-forest rounded-full"
                                    style={{ width: `${item.percentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-brand-forest text-brand-lime">
                                {item.percentage}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
            <div className="flex items-center gap-1.5 p-1 bg-surface-cream rounded-xl border border-border-subtle">
              <button
                onClick={() => setStaffPerfTab('daily')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  staffPerfTab === 'daily'
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                Daily Tasks
              </button>
              <button
                onClick={() => setStaffPerfTab('monthly')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  staffPerfTab === 'monthly'
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                Monthly Output
              </button>
              <button
                onClick={() => setStaffPerfTab('attendance')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  staffPerfTab === 'attendance'
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                Shift Attendance
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

                    {/* Activity Breakdown - Filtered by role so Washerman only sees Wash/Dry, etc. */}
                    {staffDaySummary.breakdown && (() => {
                      const roleNameLower = (selectedStaff?.positionCategory?.name || selectedStaff?.role || selectedStaff?.staffMember?.fullName || '').toLowerCase();
                      const allowedActs = (selectedStaff?.workflowProfile?.allowedActivities || []).map((a) => a.toUpperCase());

                      const opsList = [
                        { key: 'wash', label: 'Washed', unit: 'pcs', count: staffDaySummary.breakdown.wash, bg: 'bg-blue-50 border-blue-200 text-blue-800 text-blue-950', isMatch: allowedActs.includes('WASH') || roleNameLower.includes('wash') },
                        { key: 'dry', label: 'Dried', unit: 'pcs', count: staffDaySummary.breakdown.dry, bg: 'bg-cyan-50 border-cyan-200 text-cyan-800 text-cyan-950', isMatch: allowedActs.includes('DRY') || roleNameLower.includes('wash') },
                        { key: 'iron', label: 'Ironed', unit: 'pcs', count: staffDaySummary.breakdown.iron, bg: 'bg-orange-50 border-orange-200 text-orange-800 text-orange-950', isMatch: allowedActs.includes('IRON') || roleNameLower.includes('iron') },
                        { key: 'fold', label: 'Folded', unit: 'pcs', count: staffDaySummary.breakdown.fold, bg: 'bg-teal-50 border-teal-200 text-teal-800 text-teal-950', isMatch: allowedActs.includes('FOLD') || roleNameLower.includes('iron') },
                        { key: 'pack', label: 'Packed', unit: 'pcs', count: staffDaySummary.breakdown.pack, bg: 'bg-indigo-50 border-indigo-200 text-indigo-800 text-indigo-950', isMatch: allowedActs.includes('PACK') || roleNameLower.includes('iron') },
                        { key: 'delivery', label: 'Delivered', unit: 'orders', count: staffDaySummary.breakdown.delivery, bg: 'bg-emerald-50 border-emerald-200 text-emerald-800 text-emerald-950', isMatch: allowedActs.includes('DELIVERY') || roleNameLower.includes('delivery') },
                        { key: 'pickup', label: 'Pickups', unit: 'pcs', count: staffDaySummary.breakdown.pickup, bg: 'bg-purple-50 border-purple-200 text-purple-800 text-purple-950', isMatch: allowedActs.includes('PICKUP') || roleNameLower.includes('delivery') || roleNameLower.includes('pickup') },
                      ];

                      // Show operations assigned to this role OR where units were actually processed
                      const visibleOps = opsList.filter((op) => op.isMatch || op.count > 0);
                      const displayOps = visibleOps.length > 0 ? visibleOps : opsList.filter((op) => op.count > 0);

                      if (displayOps.length === 0) return null;

                      return (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                              Operations Performed
                            </h4>
                            <span className="text-[10px] text-content-muted font-bold">
                              Role: {selectedStaff?.positionCategory?.name || selectedStaff?.role || 'Staff Operator'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {displayOps.map((op) => {
                              const [bgCls, borderCls, textLblCls, textValCls] = op.bg.split(' ');
                              return (
                                <div key={op.key} className={`p-2 rounded-xl ${bgCls} border ${borderCls} shadow-clay-sm`}>
                                  <span className={`${textLblCls} font-semibold block text-[11px]`}>{op.label}</span>
                                  <span className={`text-sm font-black ${textValCls}`}>{op.count} {op.unit}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Specific Assignment Orders */}
                    {staffDaySummary.assignments && staffDaySummary.assignments.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                          Assignment Orders
                        </h4>
                        <div className="space-y-2">
                          {staffDaySummary.assignments.map((asg) => {
                            const isAsgExpanded = !!expandedTaskIds[asg.id];
                            const asgTotal = asg.taskUnits.length;
                            const asgDone = asg.taskUnits.filter((u) => u.status === 'COMPLETED').length;

                            // Group units by pieceNumber
                            const pieceMap = new Map<number, typeof asg.taskUnits>();
                            asg.taskUnits.forEach((unit) => {
                              const pNum = unit.pieceNumber || 1;
                              if (!pieceMap.has(pNum)) pieceMap.set(pNum, []);
                              pieceMap.get(pNum)!.push(unit);
                            });

                            return (
                              <div
                                key={asg.id}
                                className="p-3 rounded-xl bg-white border border-border-subtle shadow-sm space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-brand-forest">
                                        {asg.orderId ? `Order #${asg.orderId}` : 'Daily Batch'}
                                      </span>
                                      <span className="text-[10px] text-content-muted font-bold">
                                        • {asg.pieceCount ?? asg.pickupCount ?? asg.taskUnits?.length} pieces
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-content-muted">
                                      {asg.workflowProfile?.name || 'Task Batch'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      {asgDone} / {asgTotal} done
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleTaskExpansion(asg.id)}
                                      className="px-2 py-0.5 rounded-lg bg-surface-cream text-brand-forest font-bold text-[10px] border border-border-subtle hover:bg-surface-hover"
                                    >
                                      {isAsgExpanded ? 'Hide' : 'Pieces'}
                                    </button>
                                  </div>
                                </div>

                                {isAsgExpanded && (
                                  <div className="pt-2 border-t border-border-subtle/50 space-y-1.5">
                                    {Array.from(pieceMap.entries()).map(([pieceNum, units]) => {
                                      const pieceDone = units.filter((u) => u.status === 'COMPLETED').length;
                                      const isPieceAllDone = units.length > 0 && pieceDone === units.length;
                                      const pieceDmg = asg.damageIncidents?.find((d) => d.pieceNumber === pieceNum);

                                      return (
                                        <div
                                          key={pieceNum}
                                          className="flex items-center justify-between p-2 rounded-xl bg-surface-cream/50 border border-border-subtle/60 text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-brand-forest">Piece #{pieceNum}</span>
                                            {pieceDmg && (
                                              <button
                                                type="button"
                                                onClick={() => setViewingDamageIncident(pieceDmg)}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-900 text-[10px] font-bold border border-red-300"
                                              >
                                                <AlertTriangle className="w-3 h-3 text-red-600" />
                                                <span>Damage ({pieceDmg.status})</span>
                                              </button>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {units.map((u) => {
                                              const isUnitDone = u.status === 'COMPLETED';
                                              return (
                                                <span
                                                  key={u.id}
                                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                    isUnitDone
                                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                  }`}
                                                  title={`${u.activityCode || 'Task'}: ${isUnitDone ? 'Completed' : 'Pending'}`}
                                                >
                                                  {isUnitDone ? <CheckCircle2 className="w-3 h-3 text-emerald-700" /> : <Clock className="w-3 h-3 text-amber-500" />}
                                                  <span>{u.activityCode || 'Done'}</span>
                                                </span>
                                              );
                                            })}
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isPieceAllDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                              {isPieceAllDone ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" /> : null}
                                              <span>{isPieceAllDone ? 'Done' : `${pieceDone}/${units.length}`}</span>
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reported Damage Incidents for this Staff Member */}
                    {(() => {
                      const staffDamages = (staffDaySummary.assignments || []).flatMap((asg) => asg.damageIncidents || []);
                      if (staffDamages.length === 0) return null;

                      return (
                        <div className="space-y-2 pt-2 border-t border-border-subtle">
                          <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                            <AlertTriangle className="w-4 h-4 text-status-danger" />
                            <span>Reported Damage / Issue Incidents ({staffDamages.length})</span>
                          </div>
                          <div className="space-y-2">
                            {staffDamages.map((dmg) => (
                              <div
                                key={dmg.id}
                                onClick={() => setViewingDamageIncident(dmg)}
                                className="cursor-pointer p-3 rounded-xl bg-red-50/80 hover:bg-red-100/80 border border-red-200 flex items-center justify-between gap-3 transition-colors shadow-sm"
                              >
                                <div className="flex items-center gap-2.5">
                                  {dmg.photoPath ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={dmg.photoPath}
                                      alt="Damage Evidence"
                                      className="w-10 h-10 rounded-lg object-cover border border-red-300 shadow-sm"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center text-red-700">
                                      <AlertTriangle className="w-5 h-5" />
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-extrabold text-red-950 text-xs">
                                        {dmg.pieceNumber ? `Piece #${dmg.pieceNumber}` : 'Incident'}
                                      </span>
                                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-red-200 text-red-900 uppercase">
                                        {dmg.status}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-red-900 font-medium line-clamp-1">
                                      {dmg.notes || 'Damage reported'}
                                    </p>
                                  </div>
                                </div>
                                <button className="px-2.5 py-1 rounded-lg bg-white border border-red-300 text-red-900 text-[11px] font-bold shadow-sm whitespace-nowrap">
                                  View Photo
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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

            {/* Sub-tab 3: Shift Attendance & Overrides */}
            {staffPerfTab === 'attendance' && (
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
                    className="text-xs font-bold text-brand-forest bg-white px-2.5 py-1 rounded-lg border border-border-subtle focus:outline-none focus:ring-1 focus:ring-brand-forest"
                  />
                </div>

                {attendanceActionMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center animate-fade-in">
                    {attendanceActionMessage}
                  </div>
                )}

                {/* Current Presence Card */}
                <div className="p-4 rounded-2xl bg-surface-cream/40 border border-border-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider block">Shift Status</span>
                      <h4 className="text-sm font-extrabold text-brand-forest">
                        {staffAttendanceSession ? (
                          staffAttendanceSession.checkOutAt ? (
                            <span className="text-blue-800">Shift Completed</span>
                          ) : (
                            <span className="text-emerald-700">On Floor (Active Duty)</span>
                          )
                        ) : selectedStaff.attendanceEnabled === false ? (
                          <span className="text-amber-800">Exempt (Managed by Owner)</span>
                        ) : (
                          <span className="text-red-700">Absent / Not Checked In</span>
                        )}
                      </h4>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      staffAttendanceSession?.checkOutAt
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : staffAttendanceSession
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : selectedStaff.attendanceEnabled === false
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {staffAttendanceSession?.checkOutAt
                        ? 'Completed'
                        : staffAttendanceSession
                        ? 'Active Shift'
                        : selectedStaff.attendanceEnabled === false
                        ? 'Exempt'
                        : 'Absent'}
                    </span>
                  </div>

                  {/* Timing Details */}
                  {staffAttendanceSession && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border-subtle text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-border-subtle">
                        <span className="text-[10px] text-content-muted block font-medium">Clock In</span>
                        <strong className="text-brand-forest font-bold">
                          {new Date(staffAttendanceSession.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-border-subtle">
                        <span className="text-[10px] text-content-muted block font-medium">Clock Out</span>
                        <strong className="text-brand-forest font-bold">
                          {staffAttendanceSession.checkOutAt
                            ? new Date(staffAttendanceSession.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                            : 'In Progress'}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-border-subtle col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-content-muted block font-medium">Duration</span>
                        <strong className="text-brand-forest font-bold">
                          {staffAttendanceSession.durationMinutes
                            ? `${Math.round(staffAttendanceSession.durationMinutes / 60)}h ${staffAttendanceSession.durationMinutes % 60}m`
                            : 'Active Duty'}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Selfie Evidences */}
                  <div className="pt-2 border-t border-border-subtle space-y-2">
                    <span className="text-[10px] font-black text-brand-forest uppercase tracking-wider block">
                      Photographic Verification
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {staffAttendanceSession?.checkInPhotoPath ? (
                        <div className="p-2.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={staffAttendanceSession.checkInPhotoPath}
                              alt="Check-in Selfie"
                              className="w-10 h-10 rounded-lg object-cover border border-emerald-300"
                            />
                            <div>
                              <span className="font-extrabold text-brand-forest text-xs block">Check-In Selfie</span>
                              <span className="text-[10px] text-emerald-700 font-bold">Verified Capture</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setViewingAttendancePhoto({
                              staffName: selectedStaff.staffMember.fullName,
                              role: selectedStaff.positionCategory?.name || selectedStaff.role,
                              photoUrl: staffAttendanceSession.checkInPhotoPath!,
                              checkOutPhotoUrl: staffAttendanceSession.checkOutPhotoPath || undefined,
                              timestamp: staffAttendanceSession.checkInAt,
                              checkOutTimestamp: staffAttendanceSession.checkOutAt || undefined,
                              status: staffAttendanceSession.status,
                            })}
                            className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold"
                          >
                            View
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 bg-white/60 rounded-xl border border-border-subtle text-xs text-content-muted">
                          No check-in selfie captured
                        </div>
                      )}

                      {staffAttendanceSession?.checkOutPhotoPath ? (
                        <div className="p-2.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={staffAttendanceSession.checkOutPhotoPath}
                              alt="Check-out Photo"
                              className="w-10 h-10 rounded-lg object-cover border border-blue-300"
                            />
                            <div>
                              <span className="font-extrabold text-brand-forest text-xs block">Check-Out Photo</span>
                              <span className="text-[10px] text-blue-700 font-bold">Verified Capture</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setViewingAttendancePhoto({
                              staffName: selectedStaff.staffMember.fullName,
                              role: selectedStaff.positionCategory?.name || selectedStaff.role,
                              photoUrl: staffAttendanceSession.checkInPhotoPath || staffAttendanceSession.checkOutPhotoPath!,
                              checkOutPhotoUrl: staffAttendanceSession.checkOutPhotoPath || undefined,
                              timestamp: staffAttendanceSession.checkInAt,
                              checkOutTimestamp: staffAttendanceSession.checkOutAt || undefined,
                              status: staffAttendanceSession.status,
                            })}
                            className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-bold"
                          >
                            View
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 bg-white/60 rounded-xl border border-border-subtle text-xs text-content-muted">
                          No check-out photo captured
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Owner Override & Marking Actions */}
                  <div className="pt-3 border-t border-border-subtle space-y-2">
                    <span className="text-[10px] font-black text-brand-forest uppercase tracking-wider block">
                      Owner Shift & Attendance Controls
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        disabled={isMarkingAttendance}
                        onClick={() => handleOwnerMarkAttendance('PRESENT')}
                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Present</span>
                      </button>

                      <button
                        type="button"
                        disabled={isMarkingAttendance || !staffAttendanceSession || !!staffAttendanceSession.checkOutAt}
                        onClick={() => handleOwnerMarkAttendance('CHECK_OUT')}
                        className="py-2 px-3 rounded-xl bg-brand-forest hover:bg-emerald-900 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Check Out</span>
                      </button>

                      <button
                        type="button"
                        disabled={isMarkingAttendance}
                        onClick={() => handleOwnerMarkAttendance('HALF_DAY')}
                        className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black shadow-sm transition-all disabled:opacity-50"
                      >
                        <span>Half Day</span>
                      </button>

                      <button
                        type="button"
                        disabled={isMarkingAttendance}
                        onClick={() => handleOwnerMarkAttendance('ABSENT')}
                        className="py-2 px-3 rounded-xl bg-white hover:bg-red-50 text-red-700 border border-red-200 text-xs font-black shadow-sm transition-all disabled:opacity-50"
                      >
                        <span>Mark Absent</span>
                      </button>
                    </div>
                  </div>
                </div>
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
          ADD STAFF / SUPERVISOR / MANAGER MODAL (OWNER CREATES ANY ROLE)
      ══════════════════════════════════════════════════════════════════════════ */}
      {isAddStaffOpen && selectedShopObj && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg w-full max-w-lg p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-forest text-brand-lime">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-brand-forest">Add Branch Staff Member</h3>
                  <p className="text-xs text-content-muted">Register and create credentials for {selectedShopObj.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddStaffOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5">
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1.5">
                  Designation / Role <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Supervisor', 'Manager', 'Washerman', 'Ironman', 'Delivery Boy', 'Other'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setNewStaffRole(r);
                        if (!newStaffUsername) {
                          const prefix = r.toLowerCase().substring(0, 4);
                          setNewStaffUsername(`${prefix}_${selectedShopObj.code.toLowerCase()}_${Math.floor(10 + Math.random() * 90)}`);
                        }
                      }}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                        newStaffRole === r
                          ? 'bg-brand-forest text-white shadow-sm ring-2 ring-brand-forest/20'
                          : 'bg-surface-cream text-content-muted hover:text-brand-forest border border-border-subtle'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {newStaffRole === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Custom Role Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Dry Cleaner, Store Assistant"
                    value={newStaffCustomRole}
                    onChange={(e) => setNewStaffCustomRole(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Kumar"
                  value={newStaffFullName}
                  onChange={(e) => setNewStaffFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newStaffMobile}
                  onChange={(e) => setNewStaffMobile(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                />
              </div>

              {/* Login Credentials */}
              <div className="p-3.5 rounded-2xl bg-brand-forest/[0.03] border border-brand-forest/10 space-y-2.5">
                <p className="text-xs font-black text-brand-forest flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-brand-forest" />
                  App Login Credentials (Optional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. staff_td01"
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-border-subtle focus:ring-1 focus:ring-brand-forest font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      placeholder="Min. 6 chars"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-border-subtle focus:ring-1 focus:ring-brand-forest font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Monthly Salary (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 20000"
                    value={newStaffSalary}
                    onChange={(e) => setNewStaffSalary(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Duty Timing
                  </label>
                  <input
                    type="text"
                    placeholder="09:00 AM - 06:00 PM"
                    value={newStaffDutyTiming}
                    onChange={(e) => setNewStaffDutyTiming(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface-cream border border-border-subtle focus:ring-1 focus:ring-brand-forest font-semibold"
                  />
                </div>
              </div>

              {/* Attendance Tracking Requirement */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-cream/50 border border-border-subtle">
                <div>
                  <p className="text-xs font-bold text-brand-forest">Attendance Tracking</p>
                  <p className="text-[10px] text-content-muted">Require this employee to check-in/out on app</p>
                </div>
                <input
                  type="checkbox"
                  checked={newStaffAttendanceEnabled}
                  onChange={(e) => setNewStaffAttendanceEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-forest focus:ring-brand-forest"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-content-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewStaff}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmittingNewStaff ? 'Registering Staff...' : 'Register Staff Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STAFF CREATED CREDENTIALS SUCCESS MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {createdStaffCredentials && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-card rounded-clay border border-emerald-300 shadow-clay-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-brand-forest">Staff Account Created!</h3>
                <p className="text-xs text-content-muted">Share these branch login credentials with your employee</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-cream border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Branch:</span>
                <span className="font-black text-brand-forest">{createdStaffCredentials.shopName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Employee Name:</span>
                <span className="font-black text-brand-forest">{createdStaffCredentials.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Designation:</span>
                <span className="font-bold text-brand-forest">{createdStaffCredentials.role}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/50">
                <span className="text-content-muted font-medium">Username:</span>
                <span className="font-mono font-black text-brand-forest bg-white px-2 py-0.5 rounded border border-border-subtle">
                  {createdStaffCredentials.username}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-content-muted font-medium">Password:</span>
                <span className="font-mono font-black text-emerald-800 bg-white px-2 py-0.5 rounded border border-border-subtle">
                  {createdStaffCredentials.password}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  const text = `Tumbledry Staff Login\nBranch: ${createdStaffCredentials.shopName}\nRole: ${createdStaffCredentials.role}\nName: ${createdStaffCredentials.fullName}\nUsername: ${createdStaffCredentials.username}\nPassword: ${createdStaffCredentials.password}\nLogin at: ${window.location.origin}/login`;
                  navigator.clipboard.writeText(text);
                  alert('Credentials copied to clipboard!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-brand-forest text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-hover"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Credentials</span>
              </button>
              <button
                onClick={() => setCreatedStaffCredentials(null)}
                className="flex-1 py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black shadow-clay"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RESET STAFF PASSWORD MODAL
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

      {/* Damage Incident Evidence Viewer Modal */}
      {viewingDamageIncident && (
        <DamageIncidentViewerModal
          isOpen={true}
          onClose={() => setViewingDamageIncident(null)}
          incident={viewingDamageIncident}
          shopId={selectedShopId || ''}
          canManage={true}
          onUpdated={() => {
            if (selectedShopId) {
              fetchBranchData(selectedShopId, branchDate);
              if (selectedStaff) {
                fetchStaffPerformance(selectedStaff.staffMember.id, selectedShopId, staffTaskDate, monthlyYear, monthlyMonth);
              }
            }
          }}
        />
      )}

      {/* Staff Attendance Selfie Viewer Modal */}
      {viewingAttendancePhoto && (
        <AttendancePhotoViewerModal
          isOpen={!!viewingAttendancePhoto}
          onClose={() => setViewingAttendancePhoto(null)}
          staffName={viewingAttendancePhoto.staffName}
          role={viewingAttendancePhoto.role}
          photoUrl={viewingAttendancePhoto.photoUrl || viewingAttendancePhoto.checkInPhotoPath}
          checkOutPhotoUrl={viewingAttendancePhoto.checkOutPhotoUrl}
          timestamp={viewingAttendancePhoto.timestamp || viewingAttendancePhoto.checkInAt}
          checkOutTimestamp={viewingAttendancePhoto.checkOutTimestamp || viewingAttendancePhoto.checkOutAt}
          status={viewingAttendancePhoto.status}
        />
      )}
    </div>
  );
}

export default function OwnerPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-xs text-content-muted">Loading Owner Executive Console...</div>}>
      <OwnerPageInner />
    </Suspense>
  );
}
