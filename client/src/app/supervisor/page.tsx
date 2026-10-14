'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  PositionCategory,
  CustomFieldDefinition,
  ServiceType,
  WorkflowProfile,
} from '../../types';

interface PermissionProfileItem {
  id: string;
  name: string;
}
import { useRouter } from 'next/navigation';
import {
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Calendar,
  Phone,
  MapPin,
  CreditCard,
  Gift,
  Bell,
  MoreVertical,
  LayoutDashboard,
  CalendarCheck2,
  BarChart3,
  SlidersHorizontal,
  Camera,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  LogOut,
  RefreshCw,
  Copy,
  KeyRound,
  Pencil,
  X,
  Send,
} from 'lucide-react';

interface EnrichedStaffItem {
  id: string; // membership id
  role: string;
  isActive: boolean;
  staffMemberId: string;
  staffMember: {
    id: string;
    fullName: string;
    mobile?: string | null;
    address?: string | null;
    profilePhotoPath?: string | null;
    employmentStatus: string;
    customFieldValues?: Array<{
      id: string;
      valueText?: string | null;
      valueNumber?: number | null;
      valueDate?: string | null;
      valueBoolean?: boolean | null;
      customFieldDefinition: {
        id: string;
        label: string;
        key: string;
      };
    }>;
  };
  positionCategory?: { id: string; name: string } | null;
  account?: { id: string; username: string; status: string } | null;
  joiningDate?: string | null;
  monthlySalary?: number | null;
  securityDeposit?: number | null;
  dutyTimingNotes?: string | null;
  incentiveAmount?: number | null;
  attendanceToday: {
    isPresent: boolean;
    checkInAt: string | null;
    checkOutAt: string | null;
    status: string;
  };
  attendanceEnabled?: boolean;
}

interface SupervisorDashboardData {
  date: string;
  totalStaff: number;
  presentCount: number;
  absentCount: number;
  todayTasks: {
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  };
  staffPerformance: Array<{
    staffId: string;
    fullName: string;
    position: string;
    percentage: number;
    totalUnits: number;
    completedUnits: number;
    isPresent: boolean;
  }>;
  departmentBreakdown?: {
    wash: { name: string; total: number; completed: number; percentage: number };
    iron: { name: string; total: number; completed: number; percentage: number };
    dryClean: { name: string; total: number; completed: number; percentage: number };
    packaging: { name: string; total: number; completed: number; percentage: number };
  };
}

interface StaffTaskDayResponse {
  assignments: Array<{
    id: string;
    orderId?: string | null;
    pieceCount?: number | null;
    workflowProfile?: { workflowType: string; name: string };
    serviceType?: { name: string; code: string };
    taskUnits: Array<{
      id: string;
      pieceNumber?: number | null;
      activityCode?: string | null;
      status: string;
      unitType: string;
    }>;
  }>;
  summary: {
    total: number;
    completed: number;
    pending: number;
    percentageComplete: number | null;
  };
}

interface AttendanceSessionItem {
  id: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
  status: string;
}

interface AttendanceHistoryResponse {
  sessions: AttendanceSessionItem[];
  summary: {
    presentCount: number;
    absentCount: number;
    halfDayCount: number;
  };
  year: number;
  month: number;
}

interface StaffMonthlyPerfResponse {
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

export default function SupervisorPage() {
  const { user, activeShopId, activeShopName, logout } = useAuth();
  const router = useRouter();

  // Root Navigation View: 'dashboard' (Screen 10), 'staff_list' (Screen 2), 'attendance', 'reports', 'more' (Screen 5)
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'staff' | 'attendance' | 'reports' | 'more'>('dashboard');

  // Drilldown Views: null | 'add_staff' (Screens 3&4) | 'staff_profile' (Screens 6-9) | 'supervisor_profile'
  const [activeDrilldown, setActiveDrilldown] = useState<'add_staff' | 'staff_profile' | 'supervisor_profile' | null>(null);

  // Selected staff for Profile view
  const [selectedStaff, setSelectedStaff] = useState<EnrichedStaffItem | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'tasks' | 'attendance' | 'performance'>('overview');

  // Selected date for Dashboard & Daily Tasks
  const [dashboardDate, setDashboardDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffTaskDate, setStaffTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Selected month & year for Attendance & Performance
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  // Data states
  const [dashboardData, setDashboardData] = useState<SupervisorDashboardData | null>(null);
  const [staffList, setStaffList] = useState<EnrichedStaffItem[]>([]);
  const [positionCategories, setPositionCategories] = useState<PositionCategory[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfileItem[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Staff List Search & Category Filter (Screen 2)
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');

  // Staff Tasks Daily State (Screen 7)
  const [staffDayTasks, setStaffDayTasks] = useState<StaffTaskDayResponse | null>(null);
  const [isLoadingDayTasks, setIsLoadingDayTasks] = useState(false);

  // Staff Attendance History State (Screen 8)
  const [staffAttendanceData, setStaffAttendanceData] = useState<AttendanceHistoryResponse | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);

  // Staff Performance Monthly State (Screen 9)
  const [staffMonthlyPerf, setStaffMonthlyPerf] = useState<StaffMonthlyPerfResponse | null>(null);
  const [isLoadingPerf, setIsLoadingPerf] = useState(false);

  // ─── Add Staff Wizard State (Screens 3 & 4) ────────────────────────────────
  const [addStaffStep, setAddStaffStep] = useState<1 | 2>(1);
  // Step 1 — Basic
  const [addFullName, setAddFullName] = useState('');
  const [addPermissionProfileId, setAddPermissionProfileId] = useState('');  // from DB
  const [addPositionId, setAddPositionId] = useState('');                    // existing DB category
  const [addCustomPosition, setAddCustomPosition] = useState('');            // if supervisor types a new one
  const [addMobile, setAddMobile] = useState('');
  const [addAddress, setAddAddress] = useState('');
  // Step 2 — Employment & Login
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addAadhaar, setAddAadhaar] = useState('');
  const [addBankAccount, setAddBankAccount] = useState('');
  const [addJoiningDate, setAddJoiningDate] = useState('');
  const [addSalary, setAddSalary] = useState('');
  const [addSecurityDeposit, setAddSecurityDeposit] = useState('');
  const [addDutyTiming, setAddDutyTiming] = useState('');
  const [addIncentive, setAddIncentive] = useState('');
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [addStaffSuccess, setAddStaffSuccess] = useState<{ name: string; username: string; password: string } | null>(null);

  // ─── Edit Staff Modal State (Non-Self, Non-Owner) ──────────────────────────
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState(false);
  const [editStaffTarget, setEditStaffTarget] = useState<EnrichedStaffItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPositionCategoryId, setEditPositionCategoryId] = useState('');
  const [editJoiningDate, setEditJoiningDate] = useState('');
  const [editMonthlySalary, setEditMonthlySalary] = useState('');
  const [editSecurityDeposit, setEditSecurityDeposit] = useState('');
  const [editDutyTiming, setEditDutyTiming] = useState('');
  const [editIncentive, setEditIncentive] = useState('');
  const [isSavingEditStaff, setIsSavingEditStaff] = useState(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  // ─── Assign Task Modal State ───────────────────────────────────────────────
  const [isAssignTaskModalOpen, setIsAssignTaskModalOpen] = useState(false);
  const [taskOrderId, setTaskOrderId] = useState('');
  const [taskPieces, setTaskPieces] = useState('');
  const [taskServiceTypeId, setTaskServiceTypeId] = useState('');
  const [taskSelectedActivities, setTaskSelectedActivities] = useState<string[]>(['WASH', 'DRY']);
  const [taskNotes, setTaskNotes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);

  // Custom Fields Builder Modal State (Screen 5)
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['fieldType']>('TEXT');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [isSubmittingField, setIsSubmittingField] = useState(false);

  // ─── Attendance Section State ──────────────────────────────────────────────
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceFilter, setAttendanceFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [markingStaffId, setMarkingStaffId] = useState<string | null>(null);
  const [attendanceFeedback, setAttendanceFeedback] = useState<string | null>(null);

  // ─── Reports Section State ─────────────────────────────────────────────────
  const [reportRange, setReportRange] = useState<'today' | 'week' | 'month'>('today');

  const handleMarkStaffAttendance = async (staffMemberId: string, status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'CHECK_OUT') => {
    if (!activeShopId) return;
    setMarkingStaffId(staffMemberId);
    setAttendanceFeedback(null);
    try {
      await apiRequest(`/api/shops/${activeShopId}/attendance/mark-staff`, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId,
          status,
          date: attendanceDate,
        }),
      });
      setAttendanceFeedback(`Marked staff as ${status.replace('_', ' ').toLowerCase()}.`);
      await fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to record attendance.');
    } finally {
      setMarkingStaffId(null);
    }
  };

  // Staff tracked for attendance (exclude staff with attendanceEnabled === false)
  const attendanceTrackedStaff = staffList.filter((s) => s.attendanceEnabled !== false);
  const presentTrackedStaff = attendanceTrackedStaff.filter((s) => s.attendanceToday?.isPresent);
  const absentTrackedStaff = attendanceTrackedStaff.filter((s) => !s.attendanceToday?.isPresent);

  const filteredAttendanceStaff = attendanceTrackedStaff.filter((staff) => {
    if (attendanceFilter === 'PRESENT') return staff.attendanceToday?.isPresent;
    if (attendanceFilter === 'ABSENT') return !staff.attendanceToday?.isPresent;
    return true;
  });

  // Fetch Dashboard & Staff Lists
  const fetchAllData = useCallback(async () => {
    if (!activeShopId) return;
    setIsLoading(true);
    try {
      const [dashRes, staffRes, posRes, permRes, fieldsRes, svcRes, wfRes] = await Promise.all([
        apiRequest<SupervisorDashboardData>(`/api/shops/${activeShopId}/supervisor/dashboard?date=${dashboardDate}`).catch(() => null),
        apiRequest<{ staff: EnrichedStaffItem[] }>(`/api/shops/${activeShopId}/staff`).catch(() => ({ staff: [] })),
        apiRequest<{ categories: PositionCategory[] }>(`/api/config/shops/${activeShopId}/position-categories`).catch(() => ({ categories: [] })),
        apiRequest<{ profiles: PermissionProfileItem[] }>(`/api/config/shops/${activeShopId}/permission-profiles`).catch(() => ({ profiles: [] })),
        apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${activeShopId}/custom-fields`).catch(() => ({ fields: [] })),
        apiRequest<{ serviceTypes: ServiceType[] }>(`/api/config/service-types`).catch(() => ({ serviceTypes: [] })),
        apiRequest<{ profiles: WorkflowProfile[] }>(`/api/config/workflow-profiles`).catch(() => ({ profiles: [] })),
      ]);

      if (dashRes) setDashboardData(dashRes);
      setStaffList(staffRes.staff || []);
      setPositionCategories(posRes.categories || []);
      setPermissionProfiles(permRes.profiles || []);
      setCustomFields(fieldsRes.fields || []);
      if (svcRes?.serviceTypes) {
        setServices(svcRes.serviceTypes);
        if (svcRes.serviceTypes.length > 0 && !taskServiceTypeId) {
          setTaskServiceTypeId(svcRes.serviceTypes[0].id);
        }
      }
      if (wfRes?.profiles) setWorkflowProfiles(wfRes.profiles);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  }, [activeShopId, dashboardDate, taskServiceTypeId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Fetch Staff Daily Tasks (Screen 7)
  const fetchStaffDayTasks = useCallback(async (staffMemberId: string, date: string) => {
    if (!activeShopId) return;
    setIsLoadingDayTasks(true);
    try {
      const res = await apiRequest<StaffTaskDayResponse>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/tasks?date=${date}`
      );
      setStaffDayTasks(res);
    } catch {
      setStaffDayTasks(null);
    } finally {
      setIsLoadingDayTasks(false);
    }
  }, [activeShopId]);

  // Fetch Staff Monthly Attendance (Screen 8)
  const fetchStaffAttendance = useCallback(async (staffMemberId: string, year: number, month: number) => {
    if (!activeShopId) return;
    setIsLoadingAttendance(true);
    try {
      const res = await apiRequest<AttendanceHistoryResponse>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/attendance?year=${year}&month=${month}`
      );
      setStaffAttendanceData(res);
    } catch {
      setStaffAttendanceData(null);
    } finally {
      setIsLoadingAttendance(false);
    }
  }, [activeShopId]);

  // Fetch Staff Monthly Performance (Screen 9)
  const fetchStaffPerformance = useCallback(async (staffMemberId: string, year: number, month: number) => {
    if (!activeShopId) return;
    setIsLoadingPerf(true);
    try {
      const res = await apiRequest<StaffMonthlyPerfResponse>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/task-summary/monthly?year=${year}&month=${month}`
      );
      setStaffMonthlyPerf(res);
    } catch {
      setStaffMonthlyPerf(null);
    } finally {
      setIsLoadingPerf(false);
    }
  }, [activeShopId]);

  // When staff is selected, open profile and load data
  const handleOpenStaffProfile = (staff: EnrichedStaffItem) => {
    setSelectedStaff(staff);
    setActiveDrilldown('staff_profile');
    setProfileTab('overview');
    const today = new Date().toISOString().split('T')[0];
    setStaffTaskDate(today);
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);

    fetchStaffDayTasks(staff.staffMember.id, today);
    fetchStaffAttendance(staff.staffMember.id, now.getFullYear(), now.getMonth() + 1);
    fetchStaffPerformance(staff.staffMember.id, now.getFullYear(), now.getMonth() + 1);
  };

  // Reset all Add Staff form fields
  const resetAddStaffForm = () => {
    setAddStaffStep(1);
    setAddFullName('');
    setAddPermissionProfileId('');
    setAddPositionId('');
    setAddCustomPosition('');
    setAddMobile('');
    setAddAddress('');
    setAddUsername('');
    setAddPassword('');
    setAddAadhaar('');
    setAddBankAccount('');
    setAddJoiningDate('');
    setAddSalary('');
    setAddSecurityDeposit('');
    setAddDutyTiming('');
    setAddIncentive('');
    setAddStaffSuccess(null);
  };

  // Add Staff Wizard: Submit (Screens 3 & 4)
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !addFullName.trim() || !addPermissionProfileId) return;

    setIsSubmittingStaff(true);
    try {
      // If supervisor typed a custom position name that doesn't match any existing category,
      // the server will auto-create it via the role-resolution logic.
      // We send positionCategoryId when an existing DB category is selected,
      // otherwise send role name so server resolves/creates the position.
      const payload: Record<string, unknown> = {
        fullName: addFullName.trim(),
        mobile: addMobile.trim() || undefined,
        address: addAddress.trim() || undefined,
        permissionProfileId: addPermissionProfileId,
        joiningDate: addJoiningDate || undefined,
        monthlySalary: addSalary ? parseFloat(addSalary) : undefined,
        securityDeposit: addSecurityDeposit ? parseFloat(addSecurityDeposit) : undefined,
        dutyTimingNotes: addDutyTiming.trim() || undefined,
        incentiveAmount: addIncentive ? parseFloat(addIncentive) : undefined,
      };

      if (addPositionId) {
        // Existing DB position category selected
        payload.positionCategoryId = addPositionId;
      } else if (addCustomPosition.trim()) {
        // New position name — server will auto-create PositionCategory
        payload.role = addCustomPosition.trim();
      } else {
        // Fallback: use the permission profile name as the role label
        const selectedProfile = permissionProfiles.find((p) => p.id === addPermissionProfileId);
        if (selectedProfile) payload.role = selectedProfile.name;
      }

      // Credentials — only attach when supervisor fills username+password
      if (addUsername.trim() && addPassword) {
        payload.username = addUsername.trim().toLowerCase();
        payload.password = addPassword;
      }

      await apiRequest(`/api/shops/${activeShopId}/staff`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Show success panel with credentials (if provided)
      setAddStaffSuccess({
        name: addFullName.trim(),
        username: addUsername.trim().toLowerCase() || '(no login account)',
        password: addPassword || '(no login account)',
      });
      fetchAllData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add staff member.');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  // ─── Edit Staff Handlers ──────────────────────────────────────────────────
  const handleOpenEditStaff = (staff: EnrichedStaffItem) => {
    setEditStaffTarget(staff);
    setEditFullName(staff.staffMember.fullName || '');
    setEditMobile(staff.staffMember.mobile || '');
    setEditAddress(staff.staffMember.address || '');
    setEditPositionCategoryId(staff.positionCategory?.id || '');
    setEditJoiningDate(staff.joiningDate ? staff.joiningDate.split('T')[0] : '');
    setEditMonthlySalary(staff.monthlySalary != null ? String(staff.monthlySalary) : '');
    setEditSecurityDeposit(staff.securityDeposit != null ? String(staff.securityDeposit) : '');
    setEditDutyTiming(staff.dutyTimingNotes || '');
    setEditIncentive(staff.incentiveAmount != null ? String(staff.incentiveAmount) : '');
    setEditStaffError(null);
    setIsEditStaffModalOpen(true);
  };

  const handleSaveEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !editStaffTarget) return;

    if (!editFullName.trim()) {
      setEditStaffError('Full name is required.');
      return;
    }

    setIsSavingEditStaff(true);
    setEditStaffError(null);

    try {
      const payload = {
        fullName: editFullName.trim(),
        mobile: editMobile.trim() || null,
        address: editAddress.trim() || null,
        positionCategoryId: editPositionCategoryId || null,
        joiningDate: editJoiningDate || null,
        monthlySalary: editMonthlySalary ? parseFloat(editMonthlySalary) : null,
        securityDeposit: editSecurityDeposit ? parseFloat(editSecurityDeposit) : null,
        dutyTimingNotes: editDutyTiming.trim() || null,
        incentiveAmount: editIncentive ? parseFloat(editIncentive) : null,
      };

      await apiRequest(`/api/shops/${activeShopId}/staff/${editStaffTarget.staffMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const matchedPos = positionCategories.find((p) => p.id === editPositionCategoryId);
      const updatedStaff: EnrichedStaffItem = {
        ...editStaffTarget,
        staffMember: {
          ...editStaffTarget.staffMember,
          fullName: editFullName.trim(),
          mobile: editMobile.trim() || null,
          address: editAddress.trim() || null,
        },
        positionCategory: matchedPos ? { id: matchedPos.id, name: matchedPos.name } : editStaffTarget.positionCategory,
        joiningDate: editJoiningDate || null,
        monthlySalary: editMonthlySalary ? parseFloat(editMonthlySalary) : null,
        securityDeposit: editSecurityDeposit ? parseFloat(editSecurityDeposit) : null,
        dutyTimingNotes: editDutyTiming.trim() || null,
        incentiveAmount: editIncentive ? parseFloat(editIncentive) : null,
      };

      setSelectedStaff(updatedStaff);
      setStaffList((prev) => prev.map((s) => (s.id === updatedStaff.id ? updatedStaff : s)));
      setIsEditStaffModalOpen(false);
      fetchAllData();
    } catch (err: unknown) {
      setEditStaffError(err instanceof Error ? err.message : 'Failed to update staff member.');
    } finally {
      setIsSavingEditStaff(false);
    }
  };

  // ─── Assign Task Handlers ──────────────────────────────────────────────────
  const handleOpenAssignTask = (staff: EnrichedStaffItem) => {
    setTaskFeedback(null);
    setTaskOrderId('');
    setTaskPieces('');
    setTaskNotes('');
    const roleName = (staff.positionCategory?.name || staff.role || '').toLowerCase();
    if (roleName.includes('iron')) {
      setTaskSelectedActivities(['IRON', 'FOLD', 'PACK']);
    } else if (roleName.includes('deliver')) {
      setTaskSelectedActivities(['DELIVERY']);
    } else {
      setTaskSelectedActivities(['WASH', 'DRY']);
    }
    if (services.length > 0 && !taskServiceTypeId) {
      setTaskServiceTypeId(services[0].id);
    }
    setIsAssignTaskModalOpen(true);
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !selectedStaff) return;

    setIsSubmittingTask(true);
    setTaskFeedback(null);

    try {
      const roleName = (selectedStaff.positionCategory?.name || selectedStaff.role || '').toLowerCase();
      let workflowProfileId = '';

      if (roleName.includes('deliver')) {
        const wf = workflowProfiles.find((w) => w.workflowType === 'PER_ORDER');
        workflowProfileId = wf?.id || 'wfp-per-order';
      } else {
        const wf = workflowProfiles.find((w) => w.workflowType === 'PIECE_ACTIVITY');
        workflowProfileId = wf?.id || 'wfp-piece-activity';
      }

      if (!taskOrderId.trim()) throw new Error('Order ID is required.');
      if (!taskPieces || Number(taskPieces) < 1) throw new Error('Piece count must be at least 1.');
      if (taskSelectedActivities.length === 0) throw new Error('Select at least one activity.');

      const idempotencyKey = `sup-task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const payload = {
        assignmentDate: staffTaskDate,
        workflowProfileId,
        orderId: taskOrderId.trim(),
        pieceCount: Number(taskPieces),
        serviceTypeId: taskServiceTypeId || undefined,
        selectedActivities: taskSelectedActivities,
        notes: taskNotes.trim() || undefined,
        idempotencyKey,
      };

      await apiRequest(`/api/shops/${activeShopId}/staff/${selectedStaff.staffMember.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setTaskFeedback({ type: 'success', message: 'Task assigned successfully!' });
      setTaskOrderId('');
      setTaskPieces('');
      setTaskNotes('');

      fetchStaffDayTasks(selectedStaff.staffMember.id, staffTaskDate);
      fetchAllData();
      setTimeout(() => {
        setIsAssignTaskModalOpen(false);
      }, 1200);
    } catch (err: unknown) {
      setTaskFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to assign task.',
      });
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Custom Fields: Create (Screen 5)
  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !newFieldName.trim()) return;

    const formattedKey = newFieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setIsSubmittingField(true);
    try {
      await apiRequest(`/api/config/shops/${activeShopId}/custom-fields`, {
        method: 'POST',
        body: JSON.stringify({
          key: formattedKey,
          label: newFieldName.trim(),
          fieldType: newFieldType,
          isRequired: newFieldRequired,
        }),
      });
      alert('Custom field created!');
      setNewFieldName('');
      setIsAddingField(false);
      const res = await apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${activeShopId}/custom-fields`);
      setCustomFields(res.fields || []);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create field.');
    } finally {
      setIsSubmittingField(false);
    }
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this custom field?')) return;
    try {
      await apiRequest(`/api/config/shops/${activeShopId}/custom-fields/${fieldId}`, { method: 'DELETE' });
      setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch {
      alert('Failed to delete field.');
    }
  };

  // Filter staff for Directory (Screen 2)
  const filteredStaff = staffList.filter((m) => {
    const matchesQuery = !staffSearchQuery.trim() ||
      m.staffMember.fullName.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      m.positionCategory?.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      (m.staffMember.mobile && m.staffMember.mobile.includes(staffSearchQuery));

    if (!matchesQuery) return false;

    if (selectedRoleFilter === 'ALL') return true;
    return m.positionCategory?.name.toLowerCase() === selectedRoleFilter.toLowerCase();
  });

  // Calculate unique role counts for filter pills (Screen 2)
  const roleCounts: Record<string, number> = { ALL: staffList.length };
  staffList.forEach((s) => {
    const roleName = s.positionCategory?.name || 'Other';
    roleCounts[roleName] = (roleCounts[roleName] || 0) + 1;
  });

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 bg-[#F8F9FA] text-[#1E293B] antialiased">
      {isLoading && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 text-center animate-pulse">
          Refreshing shop data...
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════════════════
          DRILLDOWN VIEW 1: ADD NEW STAFF WIZARD (SCREENS 3 & 4)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeDrilldown === 'add_staff' && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (addStaffSuccess) { resetAddStaffForm(); setActiveDrilldown(null); }
                else if (addStaffStep === 2) setAddStaffStep(1);
                else { resetAddStaffForm(); setActiveDrilldown(null); }
              }}
              className="p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover"
            >
              <ChevronLeft className="w-5 h-5 text-brand-forest" />
            </button>
            <h2 className="text-lg font-black text-brand-forest">Add New Staff</h2>
          </div>

          {/* ── SUCCESS PANEL ── */}
          {addStaffSuccess && (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-clay-sm p-5 space-y-4">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="font-black text-brand-forest text-base">Staff Added!</h3>
                <p className="text-xs text-content-muted">Share these credentials with <strong>{addStaffSuccess.name}</strong></p>
              </div>
              {addStaffSuccess.username !== '(no login account)' && (
                <div className="bg-surface-cream rounded-xl p-4 space-y-2 border border-border-subtle">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-content-muted font-medium">Username</span>
                    <span className="font-black text-brand-forest">{addStaffSuccess.username}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-content-muted font-medium">Password</span>
                    <span className="font-black text-brand-forest">{addStaffSuccess.password}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { resetAddStaffForm(); }}
                  className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest"
                >
                  Add Another
                </button>
                <button
                  onClick={() => { resetAddStaffForm(); setActiveDrilldown(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── WIZARD FORM ── */}
          {!addStaffSuccess && (
            <>
              {/* Step tabs */}
              <div className="flex items-center gap-2 p-1 bg-surface-cream rounded-xl border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setAddStaffStep(1)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                    addStaffStep === 1 ? 'bg-brand-forest text-white shadow-sm' : 'bg-transparent text-content-muted'
                  }`}
                >
                  Basic Details
                </button>
                <button
                  type="button"
                  onClick={() => { if (addFullName.trim() && addPermissionProfileId) setAddStaffStep(2); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                    addStaffStep === 2 ? 'bg-brand-forest text-white shadow-sm' : 'bg-transparent text-content-muted'
                  }`}
                >
                  Employment & Login
                </button>
              </div>

              <form
                onSubmit={addStaffStep === 1
                  ? (e) => { e.preventDefault(); if (addFullName.trim() && addPermissionProfileId) setAddStaffStep(2); }
                  : handleSaveStaff
                }
                className="space-y-4"
              >
                {/* STEP 1: Basic Details */}
                {addStaffStep === 1 && (
                  <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm">
                    {/* Photo upload placeholder */}
                    <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-brand-forest/20 rounded-2xl bg-surface-cream/50">
                      <div className="w-14 h-14 rounded-full bg-[#EAF5E9] flex items-center justify-center mb-2">
                        <Camera className="w-6 h-6 text-brand-forest" />
                      </div>
                      <span className="text-xs font-bold text-brand-forest">Upload Photo</span>
                      <span className="text-[10px] text-content-muted">PNG, JPG up to 5MB</span>
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text" required
                        placeholder="e.g. Ramesh Kumar"
                        value={addFullName}
                        onChange={(e) => setAddFullName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    {/* Permission Profile / Access Role — from DB */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">
                        Access Role <span className="text-red-500">*</span>
                        <span className="ml-1 text-[10px] font-medium text-content-muted">(what this person can do in the app)</span>
                      </label>
                      <select
                        required
                        value={addPermissionProfileId}
                        onChange={(e) => setAddPermissionProfileId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      >
                        <option value="">Select access role…</option>
                        {permissionProfiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {permissionProfiles.length === 0 && (
                        <p className="mt-1 text-[10px] text-amber-600">No roles loaded — check connection.</p>
                      )}
                    </div>

                    {/* Position / Job Title — existing DB categories OR custom */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">
                        Job Title / Position
                        <span className="ml-1 text-[10px] font-medium text-content-muted">(displayed label)</span>
                      </label>
                      <select
                        value={addPositionId}
                        onChange={(e) => { setAddPositionId(e.target.value); if (e.target.value) setAddCustomPosition(''); }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      >
                        <option value="">Select existing…</option>
                        {positionCategories.map((pos) => (
                          <option key={pos.id} value={pos.id}>{pos.name}</option>
                        ))}
                        <option value="__new__">+ Create new position…</option>
                      </select>

                      {/* Custom position input */}
                      {(addPositionId === '__new__' || (!addPositionId && addCustomPosition)) && (
                        <input
                          type="text"
                          placeholder="e.g. Pressman, Helper, Counter Staff…"
                          value={addCustomPosition}
                          onChange={(e) => { setAddCustomPosition(e.target.value); setAddPositionId(''); }}
                          className="mt-2 w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-brand-forest/30 text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                          autoFocus
                        />
                      )}
                    </div>

                    {/* Mobile */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Mobile Number</label>
                      <input
                        type="tel"
                        placeholder="9876543210"
                        value={addMobile}
                        onChange={(e) => setAddMobile(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Address</label>
                      <input
                        type="text"
                        placeholder="City, State"
                        value={addAddress}
                        onChange={(e) => setAddAddress(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!addFullName.trim() || !addPermissionProfileId}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 mt-2 disabled:opacity-50"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* STEP 2: Employment & Login */}
                {addStaffStep === 2 && (
                  <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm">
                    {/* Login credentials section */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 space-y-3">
                      <p className="text-[11px] font-bold text-blue-800">
                        🔐 App Login Credentials <span className="font-normal text-blue-600">(optional — leave blank if this person won&apos;t log in)</span>
                      </p>

                      <div>
                        <label className="block text-xs font-bold text-brand-forest mb-1">Username</label>
                        <input
                          type="text"
                          placeholder="e.g. ramesh_wash"
                          value={addUsername}
                          onChange={(e) => setAddUsername(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-border-subtle text-xs focus:ring-2 focus:ring-blue-500 font-semibold"
                          autoComplete="off"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-brand-forest mb-1">
                          Password {addUsername.trim() && <span className="text-red-500">*</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="Min 6 characters"
                          value={addPassword}
                          onChange={(e) => setAddPassword(e.target.value)}
                          required={!!addUsername.trim()}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-border-subtle text-xs focus:ring-2 focus:ring-blue-500 font-semibold tracking-widest"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>

                    {/* Employment details */}
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Joining Date</label>
                      <input
                        type="date"
                        value={addJoiningDate}
                        onChange={(e) => setAddJoiningDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Monthly Salary (₹)</label>
                      <input
                        type="number" min="0"
                        placeholder="15000"
                        value={addSalary}
                        onChange={(e) => setAddSalary(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Security Deposit (₹)</label>
                      <input
                        type="number" min="0"
                        placeholder="5000"
                        value={addSecurityDeposit}
                        onChange={(e) => setAddSecurityDeposit(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Duty Timing</label>
                      <input
                        type="text"
                        placeholder="e.g. 09:00 AM – 06:00 PM"
                        value={addDutyTiming}
                        onChange={(e) => setAddDutyTiming(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Incentive Amount (₹)</label>
                      <input
                        type="number" min="0"
                        placeholder="2000"
                        value={addIncentive}
                        onChange={(e) => setAddIncentive(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Aadhaar Number</label>
                      <input
                        type="text"
                        placeholder="1234 5678 9012"
                        value={addAadhaar}
                        onChange={(e) => setAddAadhaar(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Bank Account Number</label>
                      <input
                        type="text"
                        placeholder="50100012345678"
                        value={addBankAccount}
                        onChange={(e) => setAddBankAccount(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddStaffStep(1)}
                        className="flex-1 py-3 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingStaff}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5"
                      >
                        <span>{isSubmittingStaff ? 'Saving…' : 'Save Staff'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          DRILLDOWN VIEW 2: STAFF PROFILE WITH 4 TABS (SCREENS 6, 7, 8, 9)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeDrilldown === 'staff_profile' && selectedStaff && (() => {
        const isStaffSelf = selectedStaff.staffMember.id === user?.staffMember?.id ||
          (selectedStaff.account && selectedStaff.account.id === user?.id) ||
          (selectedStaff.account && selectedStaff.account.username === user?.username);
        const isStaffOwner = (selectedStaff.role || '').toLowerCase().includes('owner') ||
          (selectedStaff.positionCategory?.name || '').toLowerCase().includes('owner') ||
          (selectedStaff.account?.username || '').toLowerCase().includes('owner');
        const canEditStaff = !isStaffSelf && !isStaffOwner;

        return (
          <div className="p-4 space-y-4 animate-fade-in">
            {/* Header with Back, Avatar, Name, Role & Status badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveDrilldown(null)}
                  className="p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover"
                >
                  <ChevronLeft className="w-5 h-5 text-brand-forest" />
                </button>
                <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center shadow-sm">
                  {selectedStaff.staffMember.fullName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-base font-black text-brand-forest">
                    {selectedStaff.staffMember.fullName}
                  </h2>
                  <p className="text-xs text-content-muted font-medium">
                    {selectedStaff.positionCategory?.name || 'Staff Employee'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canEditStaff && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditStaff(selectedStaff)}
                    className="px-3 py-1.5 rounded-xl bg-[#245431] hover:bg-[#1E4327] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    title="Edit staff details"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    selectedStaff.attendanceToday.isPresent
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {selectedStaff.attendanceToday.isPresent ? 'Present' : 'Absent'}
                </span>
              </div>
            </div>

          {/* 4 Profile Tabs (Screens 6, 7, 8, 9) */}
          <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-xl border border-border-subtle overflow-x-auto">
            <button
              onClick={() => setProfileTab('overview')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                profileTab === 'overview'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setProfileTab('tasks')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                profileTab === 'tasks'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setProfileTab('attendance')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                profileTab === 'attendance'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted'
              }`}
            >
              Attendance
            </button>
            <button
              onClick={() => setProfileTab('performance')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                profileTab === 'performance'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted'
              }`}
            >
              Performance
            </button>
          </div>

          {/* TAB 1: OVERVIEW (Screen 6) */}
          {profileTab === 'overview' && (
            <div className="space-y-3 bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm text-xs">
              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <Phone className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Mobile</span>
                  <span className="font-bold text-brand-forest">{selectedStaff.staffMember.mobile || 'Not provided'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <MapPin className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Address</span>
                  <span className="font-bold text-brand-forest">{selectedStaff.staffMember.address || 'Not provided'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <Calendar className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Joining Date</span>
                  <span className="font-bold text-brand-forest">
                    {selectedStaff.joiningDate ? new Date(selectedStaff.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not provided'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <CreditCard className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Salary</span>
                  <span className="font-bold text-brand-forest">
                    {selectedStaff.monthlySalary != null ? `₹ ${selectedStaff.monthlySalary.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <Clock className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Duty Timing</span>
                  <span className="font-bold text-brand-forest">{selectedStaff.dutyTimingNotes || 'Not specified'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                <Gift className="w-4 h-4 text-brand-forest" />
                <div>
                  <span className="text-content-muted block text-[10px]">Incentive</span>
                  <span className="font-bold text-brand-forest">
                    {selectedStaff.incentiveAmount != null ? `₹ ${selectedStaff.incentiveAmount.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
              </div>

              {/* Custom Fields Box matching Screen 6 */}
              <div className="p-3.5 rounded-xl bg-surface-cream/50 border border-border-subtle space-y-2 mt-2">
                <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">Custom Fields</h4>
                {selectedStaff.staffMember.customFieldValues && selectedStaff.staffMember.customFieldValues.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {selectedStaff.staffMember.customFieldValues.map((cf) => (
                      <div key={cf.id}>
                        <span className="text-content-muted">{cf.customFieldDefinition.label}</span>
                        <p className="font-bold text-brand-forest">
                          {cf.valueText || cf.valueNumber?.toString() || (cf.valueBoolean != null ? (cf.valueBoolean ? 'Yes' : 'No') : '—')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-content-muted font-medium italic">No custom fields assigned to this staff member.</p>
                )}
              </div>

              {canEditStaff && (
                <button
                  type="button"
                  onClick={() => handleOpenEditStaff(selectedStaff)}
                  className="w-full py-2.5 rounded-xl bg-[#245431] hover:bg-[#1E4327] text-white text-xs font-black flex items-center justify-center gap-2 shadow-clay-sm transition-all"
                >
                  <Pencil className="w-4 h-4" />
                  <span>Edit Staff Information</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 2: TASKS (Screen 7 - Piece-Level Checklist) */}
          {profileTab === 'tasks' && (
            <div className="space-y-4">
              {/* Date Navigator & Assign Task Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center justify-between flex-1 p-2 bg-white rounded-xl border border-border-subtle shadow-sm">
                  <button
                    onClick={() => {
                      const prev = new Date(staffTaskDate);
                      prev.setDate(prev.getDate() - 1);
                      const str = prev.toISOString().split('T')[0];
                      setStaffTaskDate(str);
                      fetchStaffDayTasks(selectedStaff.staffMember.id, str);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-brand-forest">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(staffTaskDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <button
                    onClick={() => {
                      const next = new Date(staffTaskDate);
                      next.setDate(next.getDate() + 1);
                      const str = next.toISOString().split('T')[0];
                      setStaffTaskDate(str);
                      fetchStaffDayTasks(selectedStaff.staffMember.id, str);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAssignTask(selectedStaff)}
                  className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black flex items-center gap-1.5 shadow-clay hover:opacity-95 transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Assign Task</span>
                </button>
              </div>

              {/* Three Metric Badges */}
              {isLoadingDayTasks ? (
                <div className="py-8 text-center text-xs font-bold text-content-muted">Loading daily tasks...</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-lg font-black text-emerald-900 block">
                        {staffDayTasks?.summary.total ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700">Total</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#245431] text-white shadow-sm">
                      <span className="text-lg font-black block">
                        {staffDayTasks?.summary.completed ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-brand-lime">Completed</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                      <span className="text-lg font-black text-red-700 block">
                        {staffDayTasks?.summary.pending ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-red-600">Pending</span>
                    </div>
                  </div>

                  {/* Task Batch Cards & Piece Checkboxes Table */}
                  {staffDayTasks?.assignments && staffDayTasks.assignments.length > 0 ? (
                    staffDayTasks.assignments.map((assignment) => {
                      const completedCount = assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                      const totalCount = assignment.taskUnits.length;

                      // Group task units by pieceNumber
                      const pieceMap = new Map<number, typeof assignment.taskUnits>();
                      assignment.taskUnits.forEach((unit) => {
                        const pNum = unit.pieceNumber || 1;
                        if (!pieceMap.has(pNum)) pieceMap.set(pNum, []);
                        pieceMap.get(pNum)!.push(unit);
                      });

                      return (
                        <div key={assignment.id} className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {assignment.orderId && (
                                <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-900 font-black text-xs font-mono">
                                  {assignment.orderId}
                                </span>
                              )}
                              <span className="text-xs font-bold text-brand-forest">
                                {assignment.pieceCount || totalCount} pieces • {assignment.serviceType?.name || assignment.workflowProfile?.name || 'Task Batch'}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-red-600">
                              {completedCount}/{totalCount} Completed
                            </span>
                          </div>

                          {/* Table matching Screen 7 */}
                          <div className="overflow-x-auto pt-1">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="border-b border-border-subtle text-content-muted text-[11px] font-bold">
                                  <th className="py-2 px-2">#</th>
                                  <th className="py-2 px-2">Piece</th>
                                  <th className="py-2 px-2 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-subtle/50">
                                {Array.from(pieceMap.entries()).map(([pieceNum, units]) => {
                                  const isPieceDone = units.every((u) => u.status === 'COMPLETED');
                                  return (
                                    <tr key={pieceNum} className="hover:bg-surface-cream/40">
                                      <td className="py-2.5 px-2 font-mono text-content-muted">{pieceNum}</td>
                                      <td className="py-2.5 px-2 font-bold text-brand-forest">Piece {pieceNum}</td>
                                      <td className="py-2.5 px-2 text-center">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                          isPieceDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {isPieceDone ? 'Completed' : 'Pending'}
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
                    })
                  ) : (
                    <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                      <p className="text-xs font-bold text-content-muted">No task batches assigned for this date.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: ATTENDANCE HISTORY (Screen 8) */}
          {profileTab === 'attendance' && (
            <div className="space-y-4">
              {/* Month Navigator */}
              <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
                <button
                  onClick={() => {
                    const newM = selectedMonth === 1 ? 12 : selectedMonth - 1;
                    const newY = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
                    setSelectedMonth(newM);
                    setSelectedYear(newY);
                    fetchStaffAttendance(selectedStaff.staffMember.id, newY, newM);
                  }}
                  className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="font-bold text-xs text-brand-forest">
                  {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <button
                  onClick={() => {
                    const newM = selectedMonth === 12 ? 1 : selectedMonth + 1;
                    const newY = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
                    setSelectedMonth(newM);
                    setSelectedYear(newY);
                    fetchStaffAttendance(selectedStaff.staffMember.id, newY, newM);
                  }}
                  className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {isLoadingAttendance ? (
                <div className="py-8 text-center text-xs font-bold text-content-muted">Loading attendance history...</div>
              ) : (
                <>
                  {/* Summary Badges (Screen 8) */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-base font-black text-emerald-900 block">
                        {staffAttendanceData?.summary.presentCount ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700">Present</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                      <span className="text-base font-black text-red-700 block">
                        {staffAttendanceData?.summary.absentCount ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-red-600">Absent</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <span className="text-base font-black text-amber-800 block">
                        {staffAttendanceData?.summary.halfDayCount ?? 0}
                      </span>
                      <span className="text-[10px] font-bold text-amber-700">Half Day</span>
                    </div>
                  </div>

                  {/* Attendance Daily List (Screen 8) */}
                  {staffAttendanceData?.sessions && staffAttendanceData.sessions.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-2">
                      {staffAttendanceData.sessions.map((item) => {
                        const checkIn = item.checkInAt ? new Date(item.checkInAt) : null;
                        const checkOut = item.checkOutAt ? new Date(item.checkOutAt) : null;
                        const dateStr = checkIn ? checkIn.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
                        const dayStr = checkIn ? checkIn.toLocaleDateString('en-IN', { weekday: 'short' }) : '—';
                        const timeStr = checkIn
                          ? `${checkIn.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${checkOut ? checkOut.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'In Progress'}`
                          : 'Absent';
                        const durStr = item.durationMinutes
                          ? `${Math.floor(item.durationMinutes / 60)}h ${item.durationMinutes % 60}m`
                          : (item.status === 'OPEN' ? 'Active' : 'Absent');
                        const isPresent = item.status === 'CLOSED' || item.status === 'OPEN';

                        return (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-border-subtle/40 text-xs">
                            <div>
                              <span className="font-extrabold text-brand-forest">{dateStr}</span>{' '}
                              <span className="text-content-muted text-[11px]">{dayStr}</span>
                            </div>
                            <span className="text-[11px] font-medium text-content-muted">{timeStr}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {durStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                      <p className="text-xs font-bold text-content-muted">No attendance sessions recorded for this month.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 4: PERFORMANCE (Screen 9) */}
          {profileTab === 'performance' && (
            <div className="space-y-4">
              {isLoadingPerf ? (
                <div className="py-8 text-center text-xs font-bold text-content-muted">Loading performance data...</div>
              ) : (
                <>
                  {/* Circular Donut Gauge Card */}
                  <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm flex flex-col items-center justify-center space-y-3">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" stroke="#E2E8F0" strokeWidth="8" fill="none" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          stroke="#245431"
                          strokeWidth="8"
                          strokeDasharray="251.2"
                          strokeDashoffset={
                            251.2 *
                            (1 -
                              ((staffMonthlyPerf?.percentageComplete != null
                                ? staffMonthlyPerf.percentageComplete
                                : 0) /
                                100))
                          }
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-2xl font-black text-brand-forest">
                          {staffMonthlyPerf?.percentageComplete != null
                            ? `${Math.round(staffMonthlyPerf.percentageComplete)}%`
                            : '0%'}
                        </span>
                        <span className="block text-[9px] font-bold text-content-muted">Task Completion</span>
                      </div>
                    </div>

                    {/* 3 Metrics: Total, Completed, Pending */}
                    <div className="grid grid-cols-3 gap-2 w-full text-center pt-2 border-t border-border-subtle">
                      <div>
                        <span className="text-sm font-black text-brand-forest block">
                          {staffMonthlyPerf?.total ?? 0}
                        </span>
                        <span className="text-[10px] text-content-muted font-bold">Total Tasks</span>
                      </div>
                      <div>
                        <span className="text-sm font-black text-emerald-700 block">
                          {staffMonthlyPerf?.completed ?? 0}
                        </span>
                        <span className="text-[10px] text-content-muted font-bold">Completed</span>
                      </div>
                      <div>
                        <span className="text-sm font-black text-red-600 block">
                          {staffMonthlyPerf?.pending ?? 0}
                        </span>
                        <span className="text-[10px] text-content-muted font-bold">Pending</span>
                      </div>
                    </div>
                  </div>

                  {/* Task Completion Trend Bar Chart */}
                  <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
                    <h4 className="text-xs font-black text-brand-forest">Task Completion Trend</h4>
                    {staffMonthlyPerf && staffMonthlyPerf.total > 0 ? (
                      <div className="flex items-end justify-between h-28 pt-4 px-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                          const dayPct = staffMonthlyPerf.dailyProgress?.[i]
                            ? Math.round((staffMonthlyPerf.dailyProgress[i].completed / Math.max(1, staffMonthlyPerf.dailyProgress[i].total)) * 100)
                            : 0;
                          return (
                            <div key={day} className="flex flex-col items-center gap-1.5">
                              <div className="w-5 bg-border-subtle/50 rounded-t-md h-20 relative flex items-end">
                                <div
                                  className="w-full bg-gradient-to-t from-[#245431] to-[#3B7A49] rounded-t-md transition-all"
                                  style={{ height: `${dayPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-content-muted">{day}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-1">
                        <p className="text-xs font-bold text-content-muted">No task records for this month</p>
                        <p className="text-[10px] text-content-muted/60">Trend bars will populate as tasks are completed</p>
                      </div>
                    )}
                  </div>

                  {/* Bottom Stat Chips */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3.5 rounded-2xl border border-border-subtle text-center shadow-sm">
                      <span className="text-lg font-black text-brand-forest block">
                        {staffMonthlyPerf && staffMonthlyPerf.total > 0 ? (staffMonthlyPerf.completed / 8).toFixed(1) : '—'}
                      </span>
                      <span className="text-[10px] font-bold text-content-muted">Avg. Tasks/Day</span>
                    </div>
                    <div className="bg-white p-3.5 rounded-2xl border border-border-subtle text-center shadow-sm">
                      <span className="text-lg font-black text-emerald-700 block">
                        {staffMonthlyPerf?.percentageComplete != null ? `${Math.round(staffMonthlyPerf.percentageComplete)}%` : '—'}
                      </span>
                      <span className="text-[10px] font-bold text-content-muted">Completion Rate</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      );
    })()}

      {/* ══════════════════════════════════════════════════════════════════════════
          EDIT STAFF DETAILS MODAL (Non-Self, Non-Owner)
      ══════════════════════════════════════════════════════════════════════════ */}
      {isEditStaffModalOpen && editStaffTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-border-subtle shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h3 className="text-base font-black text-brand-forest">Edit Staff Details</h3>
                <p className="text-xs text-content-muted">
                  Update info for <strong>{editStaffTarget.staffMember.fullName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditStaffModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editStaffError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                {editStaffError}
              </div>
            )}

            <form onSubmit={handleSaveEditStaff} className="space-y-3.5">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>

              {/* Role / Position Category */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Position / Role</label>
                <select
                  value={editPositionCategoryId}
                  onChange={(e) => setEditPositionCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                >
                  <option value="">Select Position...</option>
                  {positionCategories.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mobile */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Mobile Number</label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street, City, State"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>

              {/* Joining Date */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Joining Date</label>
                <input
                  type="date"
                  value={editJoiningDate}
                  onChange={(e) => setEditJoiningDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>

              {/* Salary & Security Deposit Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Monthly Salary (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="18000"
                    value={editMonthlySalary}
                    onChange={(e) => setEditMonthlySalary(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Security Deposit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="5000"
                    value={editSecurityDeposit}
                    onChange={(e) => setEditSecurityDeposit(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
              </div>

              {/* Duty Timing & Incentive Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Duty Timing</label>
                  <input
                    type="text"
                    placeholder="09:00 AM – 06:00 PM"
                    value={editDutyTiming}
                    onChange={(e) => setEditDutyTiming(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Incentive (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="1500"
                    value={editIncentive}
                    onChange={(e) => setEditIncentive(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsEditStaffModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditStaff || !editFullName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEditStaff ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          ASSIGN TASK MODAL FOR SUPERVISOR
      ══════════════════════════════════════════════════════════════════════════ */}
      {isAssignTaskModalOpen && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-border-subtle shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h3 className="text-base font-black text-brand-forest">
                  Assign Task to {selectedStaff.staffMember.fullName}
                </h3>
                <p className="text-xs text-content-muted">
                  {selectedStaff.positionCategory?.name || 'Staff Employee'} • Date: {staffTaskDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignTaskModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {taskFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  taskFeedback.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {taskFeedback.message}
              </div>
            )}

            <form onSubmit={handleCreateTaskSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Order ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="TD2015"
                    value={taskOrderId}
                    onChange={(e) => setTaskOrderId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    No. of Pieces <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="5"
                    value={taskPieces}
                    onChange={(e) => setTaskPieces(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Service Type</label>
                <select
                  value={taskServiceTypeId}
                  onChange={(e) => setTaskServiceTypeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                >
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1.5">Process Activities *</label>
                <div className="flex flex-wrap gap-2">
                  {['WASH', 'DRY', 'IRON', 'FOLD', 'PACK', 'DELIVERY'].map((act) => {
                    const isSelected = taskSelectedActivities.includes(act);
                    return (
                      <button
                        key={act}
                        type="button"
                        onClick={() => {
                          setTaskSelectedActivities((prev) =>
                            prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-[#245431] text-white border-[#245431] shadow-sm'
                            : 'bg-surface-cream text-content-muted border-border-subtle hover:bg-surface-hover'
                        }`}
                      >
                        {act.charAt(0) + act.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Special instructions or customer remarks"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsAssignTaskModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask || !taskOrderId.trim() || !taskPieces || taskSelectedActivities.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingTask ? 'Assigning...' : 'Create Task'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 10: SUPERVISOR DASHBOARD (WHEN currentNav === 'dashboard' & NO DRILLDOWN)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'dashboard' && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Header matching Screen 10 */}
          <div className="flex items-center justify-between">
            <div
              onClick={() => setActiveDrilldown('supervisor_profile')}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
              title="View Supervisor Profile"
            >
              <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center shadow-sm">
                {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h1 className="text-sm font-black text-brand-forest flex items-center gap-1.5">
                  <span>Supervisor Dashboard</span>
                  <span className="text-[10px] bg-brand-forest text-brand-lime px-1.5 py-0.5 rounded font-bold">Profile</span>
                </h1>
                <p className="text-xs text-content-muted font-semibold">
                  {activeShopName || 'Branch'}
                </p>
              </div>
            </div>
            <div className="relative p-2 rounded-xl bg-white border border-border-subtle shadow-sm">
              <Bell className="w-4 h-4 text-brand-forest" />
              <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5" />
            </div>
          </div>

          {/* Date bar: 15 Oct 2026 */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              <Calendar className="w-4 h-4 text-brand-forest" />
              <span>{new Date(dashboardDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            <input
              type="date"
              value={dashboardDate}
              onChange={(e) => setDashboardDate(e.target.value)}
              className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-surface-cream"
            />
          </div>

          {/* Three Metric Cards: Total Staff, Present, Absent (Screen 10) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-xl font-black text-brand-forest block">
                {dashboardData?.totalStaff ?? staffList.length}
              </span>
              <span className="text-[11px] font-bold text-content-muted">Total Staff</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-xl font-black text-emerald-700 block">
                {dashboardData?.presentCount ?? 0}
              </span>
              <span className="text-[11px] font-bold text-emerald-600">Present</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-xl font-black text-red-600 block">
                {dashboardData?.absentCount ?? 0}
              </span>
              <span className="text-[11px] font-bold text-red-500">Absent</span>
            </div>
          </div>

          {/* Today's Tasks Card (Screen 10) */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Today&apos;s Tasks</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-base font-black text-brand-forest block">
                  {dashboardData?.todayTasks.total ?? 0}
                </span>
                <span className="text-[10px] font-bold text-content-muted">Total</span>
              </div>
              <div>
                <span className="text-base font-black text-emerald-700 block">
                  {dashboardData?.todayTasks.completed ?? 0}
                </span>
                <span className="text-[10px] font-bold text-emerald-600">Completed</span>
              </div>
              <div>
                <span className="text-base font-black text-red-600 block">
                  {dashboardData?.todayTasks.pending ?? 0}
                </span>
                <span className="text-[10px] font-bold text-red-500">Pending</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1 pt-1">
              <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${dashboardData?.todayTasks.percentage ?? 0}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-content-muted block text-right">
                {dashboardData?.todayTasks.percentage ?? 0}%
              </span>
            </div>
          </div>

          {/* Staff Performance List (Screen 10) */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Staff Performance</h3>
            <div className="space-y-3">
              {dashboardData?.staffPerformance && dashboardData.staffPerformance.length > 0 ? (
                dashboardData.staffPerformance.map((st) => (
                  <div
                    key={st.staffId}
                    onClick={() => {
                      const match = staffList.find((s) => s.staffMember.id === st.staffId);
                      if (match) handleOpenStaffProfile(match);
                    }}
                    className="cursor-pointer space-y-1.5 hover:bg-surface-cream/50 p-1.5 rounded-xl transition-colors"
                  >
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-brand-forest">{st.fullName}</span>
                      <span className="text-emerald-700">{st.percentage}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${st.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-content-muted font-bold text-center py-4">
                  No staff members or performance records found for this date.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 2: STAFF DIRECTORY (WHEN currentNav === 'staff' & NO DRILLDOWN)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'staff' && (
        <div className="p-4 space-y-3.5 animate-fade-in relative">
          {/* Header matching Screen 2 */}
          <div className="flex items-center justify-between">
            <div
              onClick={() => setActiveDrilldown('supervisor_profile')}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
              title="View Supervisor Profile"
            >
              <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center shadow-sm">
                {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h1 className="text-sm font-black text-brand-forest flex items-center gap-1.5">
                  <span>Hello, {user?.staffMember?.fullName || user?.username || 'Supervisor'}</span>
                  <span className="text-[10px] bg-brand-forest text-brand-lime px-1.5 py-0.5 rounded font-bold">Profile</span>
                </h1>
                <p className="text-xs text-content-muted font-medium">Supervisor • {activeShopName || 'Branch'}</p>
              </div>
            </div>
            <div className="relative p-2 rounded-xl bg-white border border-border-subtle shadow-sm">
              <Bell className="w-4 h-4 text-brand-forest" />
              <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5" />
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff by name or role..."
              value={staffSearchQuery}
              onChange={(e) => setStaffSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-2xl bg-white border border-border-subtle shadow-sm focus:ring-2 focus:ring-brand-forest font-medium"
            />
          </div>

          {/* Filter chips (Screen 2: All, Washerman, Ironman, Delivery Boy...) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {Object.keys(roleCounts).map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRoleFilter(role)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedRoleFilter === role
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'bg-white border border-border-subtle text-content-muted hover:text-brand-forest'
                }`}
              >
                {role === 'ALL' ? `All (${roleCounts['ALL']})` : `${role} (${roleCounts[role]})`}
              </button>
            ))}
          </div>

          {/* Staff Cards List (Screen 2) */}
          <div className="space-y-2.5">
            {filteredStaff.map((staff) => (
              <div
                key={staff.id}
                onClick={() => handleOpenStaffProfile(staff)}
                className="cursor-pointer bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm flex items-center justify-between hover:border-brand-forest/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center text-sm shadow-sm">
                    {staff.staffMember.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-brand-forest">{staff.staffMember.fullName}</h3>
                    <p className="text-[11px] text-content-muted font-medium">
                      {staff.positionCategory?.name || 'Staff Employee'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        staff.attendanceToday.isPresent
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {staff.attendanceToday.isPresent ? 'Present' : 'Absent'}
                    </span>
                    {staff.attendanceToday.checkInAt && (
                      <span className="block text-[10px] text-content-muted font-mono mt-0.5">
                        {new Date(staff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <MoreVertical className="w-4 h-4 text-content-muted" />
                </div>
              </div>
            ))}
          </div>

          {/* Floating Action Button (FAB +) matching Screen 2 */}
          <button
            onClick={() => {
              setActiveDrilldown('add_staff');
              setAddStaffStep(1);
            }}
            className="fixed bottom-20 right-5 w-13 h-13 rounded-full bg-[#F5A623] hover:bg-[#E09612] text-white shadow-clay flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-30"
          >
            <Plus className="w-7 h-7 stroke-[3]" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 5: CUSTOM FIELDS BUILDER & SETTINGS (WHEN currentNav === 'more')
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'more' && (
        <div className="p-4 space-y-4 animate-fade-in pb-24">
          {/* Supervisor Profile Card Link */}
          <div
            onClick={() => setActiveDrilldown('supervisor_profile')}
            className="cursor-pointer bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm flex items-center justify-between hover:border-brand-forest/60 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-base shadow-sm">
                {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h3 className="text-xs font-black text-brand-forest">
                  My Supervisor Profile & Credentials
                </h3>
                <p className="text-[11px] text-content-muted font-medium">
                  @{user?.username} • Operational Roles & Account
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-brand-forest" />
          </div>

          <div className="flex items-center justify-between pt-2">
            <h2 className="text-base font-black text-brand-forest">Custom Fields</h2>
            <button
              onClick={() => setIsAddingField(!isAddingField)}
              className="px-3 py-1.5 rounded-xl bg-brand-forest text-white text-xs font-bold shadow-clay-sm flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Field</span>
            </button>
          </div>

          {/* Add Field Form (Screen 5) */}
          {isAddingField && (
            <form onSubmit={handleCreateCustomField} className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
              <h3 className="text-xs font-black text-brand-forest">Add Field</h3>
              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Field Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. T-Shirt Size"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border text-xs focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Field Type</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as CustomFieldDefinition['fieldType'])}
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border text-xs focus:ring-1 focus:ring-brand-forest font-medium"
                >
                  <option value="TEXT">String / Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="FILE_IMAGE">Upload / Photo</option>
                  <option value="DROPDOWN">Dropdown</option>
                  <option value="YES_NO">Yes / No</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-brand-forest">Required Field</span>
                <input
                  type="checkbox"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-forest accent-[#245431]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingField}
                className="w-full py-2.5 rounded-xl bg-[#245431] text-white text-xs font-black shadow-sm"
              >
                {isSubmittingField ? 'Adding...' : 'Add Field'}
              </button>
            </form>
          )}

          {/* List of Custom Fields (Screen 5) */}
          <div className="space-y-2">
            {customFields.length > 0 ? (
              customFields.map((field) => (
                <div
                  key={field.id}
                  className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm flex items-center justify-between text-xs"
                >
                  <div>
                    <h4 className="font-bold text-brand-forest">{field.label}</h4>
                    <span className="text-[10px] text-content-muted font-medium">{field.fieldType}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteCustomField(field.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                <p className="text-xs font-bold text-content-muted">No custom fields defined yet. Tap &apos;+ Add Field&apos; above to create one.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SCREEN: SUPERVISOR PROFILE & ROLE DETAILS
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeDrilldown === 'supervisor_profile' && (
        <div className="p-4 space-y-4 animate-fade-in max-w-md mx-auto pb-24">
          {/* Back Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveDrilldown(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:text-brand-lime transition-colors py-1.5 px-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
            <span className="text-[11px] font-bold text-content-muted">Profile Overview</span>
          </div>

          {/* Supervisor Identity Card */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-xl shadow-clay-sm border border-white/40">
                {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-brand-forest">
                  {user?.staffMember?.fullName || user?.username}
                </h3>
                <p className="text-xs text-content-muted font-medium">@{user?.username}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-brand-forest text-brand-lime uppercase tracking-wider">
                    Supervisor
                  </span>
                  <span className="text-[11px] font-medium text-content-muted flex items-center gap-1">
                    <span>🏬 {activeShopName || 'Branch'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance Status Callout */}
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-amber-900">
                <span className="flex items-center gap-1.5">
                  <CalendarCheck2 className="w-4 h-4 text-amber-700" />
                  <span>Attendance Status:</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200/80 text-amber-900">
                  Exempt from Floor Roll
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Supervisor attendance is managed at the Owner level and is not required for daily floor roster.
              </p>
            </div>
          </div>

          {/* Key Supervisor Responsibilities */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-sm space-y-3">
            <h4 className="text-xs font-black text-brand-forest uppercase tracking-wider">
              Operational Scope & Capabilities
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2 text-content-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong className="text-brand-forest">Staff Management:</strong> Register, update & configure floor staff credentials.</span>
              </div>
              <div className="flex items-start gap-2 text-content-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong className="text-brand-forest">Floor Attendance:</strong> Mark daily shifts (Present, Half Day, Check Out) for active staff.</span>
              </div>
              <div className="flex items-start gap-2 text-content-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong className="text-brand-forest">Workflow Dispatch:</strong> Monitor piece counts & operational processing stages.</span>
              </div>
              <div className="flex items-start gap-2 text-content-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong className="text-brand-forest">Quality & Damage:</strong> Log defect incidents and submit escalation tickets.</span>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-sm space-y-2.5">
            <button
              onClick={() => router.push('/profile')}
              className="w-full py-2.5 px-3 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest hover:bg-surface-hover flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Update Password & Security</span>
              </div>
              <ChevronRight className="w-4 h-4 text-content-muted" />
            </button>

            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of Portal</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN: STAFF ATTENDANCE ROSTER (WHEN currentNav === 'attendance')
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'attendance' && (
        <div className="p-4 space-y-4 animate-fade-in pb-24">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-black text-brand-forest">
                Staff Attendance
              </h1>
              <p className="text-xs text-content-muted font-medium">
                Live shop floor presence & shift recording
              </p>
            </div>
            <button
              onClick={() => fetchAllData()}
              className="p-2 rounded-xl bg-white border border-border-subtle text-brand-forest hover:bg-surface-cream shadow-sm"
              title="Refresh Attendance"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              <Calendar className="w-4 h-4 text-brand-forest" />
              <span>{new Date(attendanceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-surface-cream"
            />
          </div>

          {/* Supervisor Exemption Notice */}
          <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[11px]">
              i
            </div>
            <div className="space-y-0.5">
              <span className="font-extrabold text-amber-900 block text-[11px]">
                Supervisor Attendance Policy
              </span>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Supervisor attendance is exempt from daily shop floor marking (managed by Owner). Use this screen to record shifts for operational staff.
              </p>
            </div>
          </div>

          {/* 3 Metric Cards: Total On Roll, Present, Absent */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-lg font-black text-brand-forest block">
                {attendanceTrackedStaff.length}
              </span>
              <span className="text-[10px] font-bold text-content-muted">Tracked Staff</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-lg font-black text-emerald-700 block">
                {presentTrackedStaff.length}
              </span>
              <span className="text-[10px] font-bold text-emerald-600">Present</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-lg font-black text-red-600 block">
                {absentTrackedStaff.length}
              </span>
              <span className="text-[10px] font-bold text-red-500">Absent</span>
            </div>
          </div>

          {/* Filter Chips: All, Present, Absent */}
          <div className="flex items-center gap-2">
            {(['ALL', 'PRESENT', 'ABSENT'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setAttendanceFilter(tab)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  attendanceFilter === tab
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'bg-white border border-border-subtle text-content-muted hover:text-brand-forest'
                }`}
              >
                {tab === 'ALL' && `All (${attendanceTrackedStaff.length})`}
                {tab === 'PRESENT' && `Present (${presentTrackedStaff.length})`}
                {tab === 'ABSENT' && `Absent (${absentTrackedStaff.length})`}
              </button>
            ))}
          </div>

          {/* Feedback banner if action performed */}
          {attendanceFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center justify-between">
              <span>{attendanceFeedback}</span>
              <button onClick={() => setAttendanceFeedback(null)} className="text-emerald-600 text-xs">✕</button>
            </div>
          )}

          {/* Staff Roster Cards */}
          <div className="space-y-3">
            {filteredAttendanceStaff.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center space-y-2">
                <Users className="w-8 h-8 text-content-muted mx-auto" />
                <p className="text-xs font-bold text-content-muted">
                  {attendanceTrackedStaff.length === 0
                    ? 'No staff members currently configured for attendance tracking. Owner can enable staff in Owner portal.'
                    : `No staff matching "${attendanceFilter.toLowerCase()}" filter.`}
                </p>
              </div>
            ) : (
              filteredAttendanceStaff.map((staff) => {
                const isPresent = staff.attendanceToday?.isPresent;
                const isMarking = markingStaffId === staff.staffMember.id;

                return (
                  <div
                    key={staff.id}
                    className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm space-y-3 hover:border-brand-forest/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center text-sm shadow-sm">
                          {staff.staffMember.fullName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-brand-forest">
                            {staff.staffMember.fullName}
                          </h3>
                          <p className="text-[11px] text-content-muted font-medium">
                            {staff.positionCategory?.name || staff.role || 'Staff Employee'}
                          </p>
                          {staff.staffMember.mobile && (
                            <p className="text-[10px] text-content-muted flex items-center gap-1 mt-0.5">
                              <Phone className="w-2.5 h-2.5" />
                              <span>{staff.staffMember.mobile}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Presence Badge */}
                      <div className="text-right space-y-0.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {isPresent ? '● Present' : '○ Absent'}
                        </span>
                        {staff.attendanceToday?.checkInAt && (
                          <span className="block text-[10px] text-content-muted font-mono">
                            In: {new Date(staff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {staff.attendanceToday?.checkOutAt && (
                          <span className="block text-[10px] text-emerald-700 font-mono">
                            Out: {new Date(staff.attendanceToday.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Attendance Action Buttons */}
                    <div className="pt-2 border-t border-border-subtle/50 flex items-center gap-2">
                      {!isPresent ? (
                        <>
                          <button
                            disabled={isMarking}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'PRESENT')}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isMarking ? 'Marking...' : 'Mark Present'}</span>
                          </button>
                          <button
                            disabled={isMarking}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'HALF_DAY')}
                            className="py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold shadow-sm transition-all disabled:opacity-50"
                          >
                            <span>Half Day</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            disabled={isMarking || !!staff.attendanceToday?.checkOutAt}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'CHECK_OUT')}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-brand-forest hover:bg-emerald-900 text-white text-[11px] font-bold shadow-sm flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{staff.attendanceToday?.checkOutAt ? 'Completed Shift' : 'Check Out'}</span>
                          </button>
                          <button
                            disabled={isMarking}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'ABSENT')}
                            className="py-1.5 px-2.5 rounded-xl text-red-600 hover:bg-red-50 text-[10px] font-bold border border-red-200 transition-all disabled:opacity-50"
                            title="Reset to Absent"
                          >
                            Mark Absent
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN: BRANCH REPORTS & ANALYTICS (WHEN currentNav === 'reports')
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'reports' && (
        <div className="p-4 space-y-4 animate-fade-in pb-24">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-black text-brand-forest">
                Operations & Reports
              </h1>
              <p className="text-xs text-content-muted font-medium">
                Daily throughput, workload & shift analytics
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 bg-surface-cream text-brand-forest rounded-lg border border-border-subtle">
              {activeShopName || 'Branch'}
            </span>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center justify-between bg-white p-1 rounded-2xl border border-border-subtle shadow-sm text-xs font-bold">
            {(['today', 'week', 'month'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setReportRange(r)}
                className={`flex-1 py-1.5 rounded-xl transition-all capitalize ${
                  reportRange === r
                    ? 'bg-brand-forest text-white shadow-sm font-black'
                    : 'text-content-muted hover:text-brand-forest'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-content-muted uppercase">Garments Handled</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-brand-forest">
                  {dashboardData?.todayTasks.total ?? 0}
                </span>
                <span className="text-[10px] font-bold text-emerald-700">
                  {dashboardData?.todayTasks.completed ?? 0} done
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-border-subtle overflow-hidden mt-1">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${dashboardData?.todayTasks.percentage ?? 0}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-content-muted uppercase">Attendance Rate</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-brand-forest">
                  {attendanceTrackedStaff.length
                    ? `${Math.round((presentTrackedStaff.length / attendanceTrackedStaff.length) * 100)}%`
                    : '100%'}
                </span>
                <span className="text-[10px] font-bold text-content-muted">
                  {presentTrackedStaff.length}/{attendanceTrackedStaff.length}
                </span>
              </div>
              <span className="text-[10px] font-medium text-emerald-700 block">
                {presentTrackedStaff.length} on active shift
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-content-muted uppercase">Active Workforce</span>
              <span className="text-xl font-black text-brand-forest block">
                {presentTrackedStaff.length} <span className="text-xs font-normal text-content-muted">Staff</span>
              </span>
              <span className="text-[10px] font-medium text-content-muted block">
                Supervisor: {user?.username}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-content-muted uppercase">Damage Incidents</span>
              <span className="text-xl font-black text-emerald-700 block">
                0 <span className="text-xs font-normal text-emerald-600">Clean</span>
              </span>
              <span className="text-[10px] font-medium text-emerald-700 block">
                Zero quality flags today
              </span>
            </div>
          </div>

          {/* Department Breakdown (100% Database-Driven) */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                Departmental Floor Progress
              </h3>
              <span className="text-[10px] font-bold text-content-muted">Live DB Metrics</span>
            </div>
            <div className="space-y-3">
              {[
                {
                  key: 'wash',
                  dept: 'Washing & Cleaning',
                  color: 'bg-blue-600',
                  data: dashboardData?.departmentBreakdown?.wash,
                },
                {
                  key: 'iron',
                  dept: 'Steam Press & Ironing',
                  color: 'bg-amber-600',
                  data: dashboardData?.departmentBreakdown?.iron,
                },
                {
                  key: 'dryClean',
                  dept: 'Dry Clean & Delicate',
                  color: 'bg-purple-600',
                  data: dashboardData?.departmentBreakdown?.dryClean,
                },
                {
                  key: 'packaging',
                  dept: 'Packaging & Dispatch',
                  color: 'bg-emerald-600',
                  data: dashboardData?.departmentBreakdown?.packaging,
                },
              ].map((item) => {
                const total = item.data?.total ?? 0;
                const completed = item.data?.completed ?? 0;
                const pct = item.data?.percentage ?? 0;

                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-brand-forest">{item.dept}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-content-muted font-normal text-[10px]">
                          {completed}/{total} pcs
                        </span>
                        <span className="text-brand-forest font-black">{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Staff Efficiency Table */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest uppercase tracking-wider">
              Staff Performance Summary
            </h3>
            <div className="space-y-2.5">
              {staffList.length > 0 ? (
                staffList.slice(0, 5).map((staff) => (
                  <div key={staff.id} className="flex items-center justify-between p-2 rounded-xl bg-surface-cream/50 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center text-xs">
                        {staff.staffMember.fullName.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-brand-forest block">{staff.staffMember.fullName}</span>
                        <span className="text-[10px] text-content-muted">{staff.positionCategory?.name || staff.role}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      staff.attendanceToday.isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {staff.attendanceToday.isPresent ? 'Active on floor' : 'Off duty'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-content-muted text-center py-2">No staff records available.</p>
              )}
            </div>
          </div>

          {/* Daily Handover Note & Copy Summary Card */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-brand-forest uppercase tracking-wider">
                Shift Handover Summary
              </span>
              <button
                onClick={() => {
                  const summaryText = `*Tumbledry (${activeShopName || 'Branch'}) - Operations Summary*\nDate: ${attendanceDate}\nSupervisor: ${user?.username}\nStaff on Floor: ${presentTrackedStaff.length}/${attendanceTrackedStaff.length}\nGarments Handled: ${dashboardData?.todayTasks.completed ?? 0}/${dashboardData?.todayTasks.total ?? 0} pieces\nDamages: 0 reported`;
                  navigator.clipboard.writeText(summaryText);
                  alert('Shift summary copied to clipboard! Ready to share with Owner.');
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-forest hover:text-brand-lime bg-surface-cream px-2 py-1 rounded-lg border border-border-subtle"
              >
                <Copy className="w-3 h-3" />
                <span>Copy Summary</span>
              </button>
            </div>
            <p className="text-[11px] text-content-muted leading-relaxed font-mono bg-surface-cream/70 p-2.5 rounded-xl border border-border-subtle/50">
              {activeShopName || 'Branch'} | {presentTrackedStaff.length} Staff Present | {dashboardData?.todayTasks.completed ?? 0} Pieces Completed | 0 Incidents
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          BOTTOM NAVIGATION BAR (MATCHING SCREENS 2 & 10)
      ══════════════════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-border-subtle px-3 py-2">
        <div className="max-w-md mx-auto flex items-center justify-around text-[10px]">
          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('dashboard');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-all ${
              !activeDrilldown && currentNav === 'dashboard'
                ? 'text-[#245431] font-black'
                : 'text-content-muted'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('staff');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-all ${
              !activeDrilldown && currentNav === 'staff'
                ? 'text-[#245431] font-black'
                : 'text-content-muted'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Staff</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('attendance');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-all ${
              !activeDrilldown && currentNav === 'attendance'
                ? 'text-[#245431] font-black'
                : 'text-content-muted'
            }`}
          >
            <CalendarCheck2 className="w-5 h-5" />
            <span>Attendance</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('reports');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-all ${
              !activeDrilldown && currentNav === 'reports'
                ? 'text-[#245431] font-black'
                : 'text-content-muted'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Reports</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('more');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-all ${
              !activeDrilldown && currentNav === 'more'
                ? 'text-[#245431] font-black'
                : 'text-content-muted'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
