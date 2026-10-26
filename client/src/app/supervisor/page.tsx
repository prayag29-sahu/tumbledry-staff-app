'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { localDateKey, resolveDutyTiming, addDaysToDateKey } from '../../lib/dateUtils';
import { StaffProfileCard, ProfileAttendanceSession } from '../../components/StaffProfileCard';
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
  AlertTriangle,
  PhoneCall,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import {
  DamageIncidentViewerModal,
  DamageIncidentRecord,
} from '../../components/DamageIncidentViewerModal';
import { DamageModal } from '../../components/DamageModal';
import { AttendancePhotoViewerModal } from '../../components/AttendancePhotoViewerModal';
import { StaffExtraDetails } from '../../components/owner/StaffExtraDetails';

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (trimmed.toUpperCase().includes('AM') || trimmed.toUpperCase().includes('PM')) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  let h = parseInt(parts[0], 10);
  const m = parts[1].slice(0, 2).padStart(2, '0');
  if (isNaN(h)) return trimmed;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = String(h).padStart(2, '0');
  return `${hStr}:${m} ${ampm}`;
}

function formatISTTime12h(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

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
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  lateThreshold?: string | null;
  halfDayThreshold?: string | null;
  absentThreshold?: string | null;
  halfDayMinHours?: number | null;
  fullDayMinHours?: number | null;
  shiftSchedule?: {
    shiftStartTime: string | null;
    shiftEndTime: string | null;
    lateThreshold: string | null;
    halfDayThreshold: string | null;
    absentThreshold?: string | null;
    halfDayMinHours: number | null;
    fullDayMinHours: number | null;
  } | null;
  attendanceToday: {
    isPresent: boolean;
    isOnFloor?: boolean;
    isShiftCompleted?: boolean;
    attendanceType?: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | null;
    isLate?: boolean;
    isHalfDay?: boolean;
    delayMinutes?: number;
    statusReason?: string | null;
    checkInTimeIST?: string | null;
    checkOutTimeIST?: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    checkInPhotoPath?: string | null;
    checkOutPhotoPath?: string | null;
    status: string;
  };
  attendanceEnabled?: boolean;
}

interface SupervisorDashboardData {
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
  departmentBreakdown?: {
    wash: { name: string; total: number; completed: number; percentage: number };
    iron: { name: string; total: number; completed: number; percentage: number };
    dryClean: { name: string; total: number; completed: number; percentage: number };
    packaging: { name: string; total: number; completed: number; percentage: number };
  };
}

/** Helper to extract address / location and remaining clean notes from assignment notes */
function parseAssignmentNotes(notes?: string | null) {
  if (!notes) return { location: null, cleanNotes: null };

  // 1. Strip bracketed system rollover/shift tags including internal metadata
  let cleaned = notes
    .replace(/\[Shifted to [^\]]*\]/gi, '')
    .replace(/\[Rolled over from [^\]]*\]/gi, '')
    .replace(/\s*•\s*/g, ' | ')
    .trim();

  // 2. Strip standalone internal tokens like origin:... or target:...
  cleaned = cleaned.replace(/(origin|target):[a-f0-9-]+\]?/gi, '').trim();

  if (!cleaned) return { location: null, cleanNotes: null };

  const parts = cleaned.split(' | ');
  let location: string | null = null;
  const remainingParts: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().startsWith('location:')) {
      location = trimmed.replace(/^location:\s*/i, '').trim();
    } else if (
      trimmed.toLowerCase().startsWith('origin:') ||
      trimmed.toLowerCase().startsWith('target:') ||
      trimmed.startsWith('[Shifted to') ||
      trimmed.startsWith('[Rolled over from')
    ) {
      continue;
    } else {
      const sanitized = trimmed.replace(/^\[|\]$/g, '').trim();
      if (sanitized && !sanitized.match(/^(origin|target):/i)) {
        remainingParts.push(sanitized);
      }
    }
  }

  return {
    location: location || null,
    cleanNotes: remainingParts.length > 0 ? remainingParts.join(' | ') : null,
  };
}

/** Formats YYYY-MM-DD string into readable date (e.g. "27 Oct 2026") */
function formatShiftDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const cleanStr = dateStr.trim().split(/[|\s]/)[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
  } catch {
    // fallback
  }
  return dateStr;
}

interface StaffTaskDayResponse {
  assignments: Array<{
    id: string;
    orderId?: string | null;
    pieceCount?: number | null;
    pickupCount?: number | null;
    customerMobile?: string | null;
    notes?: string | null;
    workflowProfileId?: string | null;
    serviceTypeId?: string | null;
    workflowProfile?: { workflowType: string; name: string };
    serviceType?: { name: string; code: string };
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
  }>;
  summary: {
    total: number;
    completed: number;
    pending: number;
    percentageComplete: number | null;
  };
}

type StaffAssignment = StaffTaskDayResponse['assignments'][number];

interface AttendanceSessionItem {
  id: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  durationMinutes?: number | null;
  status: string;
  attendanceType?: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_FLOOR' | null;
  isLate?: boolean;
  isHalfDay?: boolean;
  delayMinutes?: number;
  statusReason?: string | null;
  checkInTimeIST?: string | null;
  checkOutTimeIST?: string | null;
}

interface AttendanceHistoryResponse {
  sessions: AttendanceSessionItem[];
  shiftSchedule?: {
    shiftStartTime: string | null;
    shiftEndTime: string | null;
    lateThreshold: string | null;
    halfDayThreshold: string | null;
    halfDayMinHours: number | null;
    fullDayMinHours: number | null;
  } | null;
  summary: {
    presentCount: number;
    fullDayCount?: number;
    lateCount?: number;
    halfDayCount: number;
    onFloorCount?: number;
    totalPresentDays?: number;
    absentCount: number;
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
  const { user, activeShopId, activeShopName, activeRole, isLoading: isAuthLoading, logout } = useAuth();
  const router = useRouter();

  // Route Guard: Restrict non-supervisor staff from opening /supervisor
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const role = (activeRole || user.shopMemberships?.[0]?.roleName || '').toLowerCase();
    const isAllowed =
      user.isOwner ||
      role.includes('supervisor') ||
      role.includes('manager') ||
      role.includes('admin') ||
      user.shopMemberships?.some((m) =>
        m.capabilities?.some((c) =>
          ['staff.read', 'staff.create', 'tasks.assign', 'attendance.read_team'].includes(c)
        )
      );

    if (!isAllowed) {
      if (role.includes('iron')) router.replace('/ironman');
      else if (role.includes('wash')) router.replace('/washerman');
      else if (role.includes('delivery')) router.replace('/delivery');
      else router.replace('/staff');
    }
  }, [user, isAuthLoading, router]);

  // Root Navigation View: 'dashboard' (Screen 10), 'staff_list' (Screen 2), 'attendance', 'reports', 'more' (Screen 5)
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'staff' | 'attendance' | 'reports' | 'more'>('dashboard');

  // Drilldown Views: null | 'add_staff' (Screens 3&4) | 'staff_profile' (Screens 6-9) | 'supervisor_profile'
  const [activeDrilldown, setActiveDrilldown] = useState<'add_staff' | 'staff_profile' | 'supervisor_profile' | null>(null);

  const mySupervisorMembership = user?.shopMemberships?.find((m) => m.shopId === activeShopId);
  const [supervisorSession, setSupervisorSession] = useState<ProfileAttendanceSession | null>(null);
  const [isProcessingSupervisorAtt, setIsProcessingSupervisorAtt] = useState(false);

  const fetchSupervisorSession = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const data = await apiRequest<{ session: ProfileAttendanceSession | null }>(
        `/api/shops/${activeShopId}/attendance/my-session?date=${localDateKey()}`
      );
      setSupervisorSession(data.session);
    } catch {
      setSupervisorSession(null);
    }
  }, [activeShopId]);

  useEffect(() => {
    if (activeDrilldown === 'supervisor_profile') {
      fetchSupervisorSession();
    }
  }, [activeDrilldown, fetchSupervisorSession]);

  const handleSupervisorAttCapture = async (photoData: string, action: 'check-in' | 'check-out') => {
    const supervisorStaffId = user?.staffMember?.id;
    if (!activeShopId || !supervisorStaffId) return;
    setIsProcessingSupervisorAtt(true);
    try {
      const ep = action === 'check-in'
        ? `/api/shops/${activeShopId}/attendance/check-in`
        : `/api/shops/${activeShopId}/attendance/check-out`;
      await apiRequest(ep, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId: supervisorStaffId,
          photoPath: photoData,
          photoData,
        }),
      });
      await fetchSupervisorSession();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Attendance capture failed.');
    } finally {
      setIsProcessingSupervisorAtt(false);
    }
  };

  // Selected staff for Profile view
  const [selectedStaff, setSelectedStaff] = useState<EnrichedStaffItem | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'tasks' | 'attendance' | 'performance'>('overview');

  // Selected operational date (synchronized across all tabs: Dashboard, Attendance & Tasks)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Local calendar day (toISOString() is UTC → shows yesterday before 05:30 IST)
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [isDateLoading, setIsDateLoading] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const dashboardDate = selectedDate;
  const attendanceDate = selectedDate;
  const [staffTaskDate, setStaffTaskDate] = useState<string>(() => localDateKey());

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchTimeRef = useRef<number>(0);

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
  const [addCustomFieldDraft, setAddCustomFieldDraft] = useState<Record<string, string>>({});
  const [addJoiningDate, setAddJoiningDate] = useState('');
  const [addSalary, setAddSalary] = useState('');
  const [addSecurityDeposit, setAddSecurityDeposit] = useState('');
  const [addDutyTiming, setAddDutyTiming] = useState('');
  const [addIncentive, setAddIncentive] = useState('');
  const [addShiftStartTime, setAddShiftStartTime] = useState('');
  const [addShiftEndTime, setAddShiftEndTime] = useState('');
  const [addLateThreshold, setAddLateThreshold] = useState('');
  const [addHalfDayThreshold, setAddHalfDayThreshold] = useState('');
  const [addAbsentThreshold, setAddAbsentThreshold] = useState('');
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
  const [editWorkflowProfileId, setEditWorkflowProfileId] = useState('');
  const [editShiftStartTime, setEditShiftStartTime] = useState('');
  const [editShiftEndTime, setEditShiftEndTime] = useState('');
  const [editLateThreshold, setEditLateThreshold] = useState('');
  const [editHalfDayThreshold, setEditHalfDayThreshold] = useState('');
  const [editAbsentThreshold, setEditAbsentThreshold] = useState('');
  const [isSavingEditStaff, setIsSavingEditStaff] = useState(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  // Damage Incident Viewer
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);
  const [viewingAttendancePhoto, setViewingAttendancePhoto] = useState<{
    staffName: string;
    role?: string;
    checkInAt?: string | null;
    checkInPhotoPath?: string | null;
    checkOutAt?: string | null;
    checkOutPhotoPath?: string | null;
  } | null>(null);

  // ─── Assign Task Modal State ───────────────────────────────────────────────
  const [isAssignTaskModalOpen, setIsAssignTaskModalOpen] = useState(false);
  const [taskOrderId, setTaskOrderId] = useState('');
  const [taskPieces, setTaskPieces] = useState('');
  const [taskServiceTypeId, setTaskServiceTypeId] = useState('');
  const [taskSelectedActivities, setTaskSelectedActivities] = useState<string[]>(['WASH', 'DRY']);
  const [taskNotes, setTaskNotes] = useState('');
  const [taskDamage, setTaskDamage] = useState<{
    hasDamage: boolean;
    pieceNumber: number | '';
    notes: string;
    photoPath: string | null;
  }>({
    hasDamage: false,
    pieceNumber: 1,
    notes: '',
    photoPath: null,
  });
  const [isTaskDamageModalOpen, setIsTaskDamageModalOpen] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);

  // Directive task states for Manager & Non-Floor Staff
  const [directiveTitle, setDirectiveTitle] = useState('');
  const [directiveNotes, setDirectiveNotes] = useState('');
  const [directivePriority, setDirectivePriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [completingDirectiveId, setCompletingDirectiveId] = useState<string | null>(null);

  // ─── Task Reschedule / Shift Date Modal State ─────────────────────────────
  const [rescheduleTarget, setRescheduleTarget] = useState<StaffAssignment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleNotes, setRescheduleNotes] = useState<string>('');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  const handleOpenReschedule = (assignment: StaffAssignment) => {
    setRescheduleTarget(assignment);
    const today = localDateKey();
    const defaultDate = staffTaskDate < today ? today : addDaysToDateKey(staffTaskDate, 1);
    setRescheduleDate(defaultDate);
    setRescheduleNotes('');
  };

  const handleConfirmReschedule = async () => {
    if (!activeShopId || !rescheduleTarget || !rescheduleDate) return;
    if (rescheduleDate === staffTaskDate) {
      showTaskToast('Please select a different target date to shift this task.', 'error');
      return;
    }
    setIsRescheduling(true);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/shops/${activeShopId}/task-assignments/${rescheduleTarget.id}/reschedule`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            newDate: rescheduleDate,
            notes: rescheduleNotes.trim() || undefined,
          }),
        }
      );
      showTaskToast(res.message || `Task shifted to ${rescheduleDate} successfully!`, 'success');
      if (selectedStaff) {
        fetchStaffDayTasks(selectedStaff.staffMember.id, staffTaskDate);
      }
      fetchAllData(true);
      setRescheduleTarget(null);
    } catch (err) {
      showTaskToast(err instanceof Error ? err.message : 'Failed to shift task date.', 'error');
    } finally {
      setIsRescheduling(false);
    }
  };

  const [isUndoingShiftId, setIsUndoingShiftId] = useState<string | null>(null);

  const showTaskToast = (message: string, type: 'success' | 'error' = 'success') => {
    setTaskFeedback({ type, message });
    setTimeout(() => setTaskFeedback(null), 3500);
  };

  const handleUndoShift = async (assignment: StaffAssignment) => {
    if (!activeShopId) return;
    setIsUndoingShiftId(assignment.id);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/shops/${activeShopId}/task-assignments/${assignment.id}/undo-shift`,
        { method: 'PATCH' }
      );
      showTaskToast(res.message || 'Task shift undone successfully.', 'success');
      if (selectedStaff) {
        fetchStaffDayTasks(selectedStaff.staffMember.id, staffTaskDate);
      }
      fetchAllData(true);
    } catch (err) {
      showTaskToast(err instanceof Error ? err.message : 'Failed to undo shift.', 'error');
    } finally {
      setIsUndoingShiftId(null);
    }
  };

  const isSelectedStaffFloor = useCallback(() => {
    if (!selectedStaff) return true;
    const roleName = (selectedStaff.positionCategory?.name || selectedStaff.role || '').toLowerCase();
    return (
      roleName.includes('wash') ||
      roleName.includes('iron') ||
      roleName.includes('press') ||
      roleName.includes('deliver') ||
      roleName.includes('pickup')
    );
  }, [selectedStaff]);

  // Custom Fields Builder Modal State (Screen 5)
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['fieldType']>('TEXT');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [isSubmittingField, setIsSubmittingField] = useState(false);

  // ─── Attendance Section State ──────────────────────────────────────────────
  const [attendanceFilter, setAttendanceFilter] = useState<'ALL' | 'ON_FLOOR' | 'COMPLETED' | 'ABSENT'>('ALL');
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
          date: selectedDate,
        }),
      });
      setAttendanceFeedback(`Marked staff as ${status.replace('_', ' ').toLowerCase()}.`);
      await handleDateChange(selectedDate);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to record attendance.');
    } finally {
      setMarkingStaffId(null);
    }
  };

  // Staff tracked for attendance (exclude staff with attendanceEnabled === false)
  const attendanceTrackedStaff = staffList.filter((s) => s.attendanceEnabled !== false);
  const presentTrackedStaff = attendanceTrackedStaff.filter((s) => s.attendanceToday?.isPresent);
  const activeOnFloorStaff = attendanceTrackedStaff.filter(
    (s) => s.attendanceToday?.isOnFloor || (s.attendanceToday?.isPresent && !s.attendanceToday?.checkOutAt && s.attendanceToday?.status === 'OPEN')
  );
  const completedShiftStaff = attendanceTrackedStaff.filter(
    (s) => s.attendanceToday?.isShiftCompleted || (s.attendanceToday?.isPresent && (!!s.attendanceToday?.checkOutAt || s.attendanceToday?.status === 'CLOSED'))
  );
  const absentTrackedStaff = attendanceTrackedStaff.filter((s) => !s.attendanceToday?.isPresent);

  const filteredAttendanceStaff = staffList.filter((staff) => {
    if (staff.attendanceEnabled === false) return false;
    if (attendanceFilter === 'ON_FLOOR') {
      return staff.attendanceToday?.isOnFloor || (staff.attendanceToday?.isPresent && !staff.attendanceToday?.checkOutAt && staff.attendanceToday?.status === 'OPEN');
    }
    if (attendanceFilter === 'COMPLETED') {
      return staff.attendanceToday?.isShiftCompleted || (staff.attendanceToday?.isPresent && (!!staff.attendanceToday?.checkOutAt || staff.attendanceToday?.status === 'CLOSED'));
    }
    if (attendanceFilter === 'ABSENT') {
      return !staff.attendanceToday?.isPresent;
    }
    return true;
  });

  // Fast, instant date change refetch (only queries the 2 operational endpoints)
  const handleDateChange = useCallback(async (newDate: string) => {
    if (!newDate) return;
    setSelectedDate(newDate);
    if (!activeShopId) return;
    setIsDateLoading(true);
    try {
      const [dashRes, staffRes] = await Promise.all([
        apiRequest<SupervisorDashboardData>(`/api/shops/${activeShopId}/supervisor/dashboard?date=${newDate}`).catch(() => null),
        apiRequest<{ staff: EnrichedStaffItem[] }>(`/api/shops/${activeShopId}/staff?date=${newDate}`).catch(() => null),
      ]);
      if (dashRes) setDashboardData(dashRes);
      if (staffRes?.staff) setStaffList(staffRes.staff);
    } catch {
      // Ignored
    } finally {
      setIsDateLoading(false);
    }
  }, [activeShopId]);

  // Fetch Dashboard & Staff Lists
  const fetchAllData = useCallback(async (isSilent = false) => {
    if (!activeShopId || isAuthLoading || !user) return;
    const role = (activeRole || user.shopMemberships?.[0]?.roleName || '').toLowerCase();
    const isAllowed =
      user.isOwner ||
      role.includes('supervisor') ||
      role.includes('manager') ||
      role.includes('admin') ||
      user.shopMemberships?.some((m) =>
        m.capabilities?.some((c) =>
          ['staff.read', 'staff.create', 'tasks.assign', 'attendance.read_team'].includes(c)
        )
      );
    if (!isAllowed) return;

    if (!isSilent) {
      setIsLoading(true);
    }
    try {
      const [dashRes, staffRes, posRes, permRes, fieldsRes, svcRes, wfRes] = await Promise.all([
        apiRequest<SupervisorDashboardData>(`/api/shops/${activeShopId}/supervisor/dashboard?date=${selectedDate}`).catch(() => null),
        apiRequest<{ staff: EnrichedStaffItem[] }>(`/api/shops/${activeShopId}/staff?date=${selectedDate}`).catch(() => null),
        positionCategories.length > 0 ? Promise.resolve(null) : apiRequest<{ categories: PositionCategory[] }>(`/api/config/shops/${activeShopId}/position-categories`).catch(() => null),
        permissionProfiles.length > 0 ? Promise.resolve(null) : apiRequest<{ profiles: PermissionProfileItem[] }>(`/api/config/shops/${activeShopId}/permission-profiles`).catch(() => null),
        customFields.length > 0 ? Promise.resolve(null) : apiRequest<{ fields: CustomFieldDefinition[] }>(`/api/config/shops/${activeShopId}/custom-fields`).catch(() => null),
        services.length > 0 ? Promise.resolve(null) : apiRequest<{ serviceTypes: ServiceType[] }>(`/api/config/service-types`).catch(() => null),
        workflowProfiles.length > 0 ? Promise.resolve(null) : apiRequest<{ profiles: WorkflowProfile[] }>(`/api/config/workflow-profiles`).catch(() => null),
      ]);

      if (dashRes) setDashboardData(dashRes);
      if (staffRes?.staff) setStaffList(staffRes.staff);
      if (posRes?.categories) setPositionCategories(posRes.categories);
      if (permRes?.profiles) setPermissionProfiles(permRes.profiles);
      if (fieldsRes?.fields) setCustomFields(fieldsRes.fields);
      if (svcRes?.serviceTypes) {
        setServices(svcRes.serviceTypes);
        if (svcRes.serviceTypes.length > 0) {
          setTaskServiceTypeId((prev) => prev || svcRes.serviceTypes[0].id);
        }
      }
      if (wfRes?.profiles) setWorkflowProfiles(wfRes.profiles);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
      setIsDateLoading(false);
    }
  }, [activeShopId, user, activeRole, isAuthLoading, selectedDate, positionCategories.length, permissionProfiles.length, customFields.length, services.length, workflowProfiles.length]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchAllData(true);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [fetchAllData]);

  // Refetch when nav tab or dates change (silent to avoid flickering)
  useEffect(() => {
    fetchAllData(true);
  }, [fetchAllData, currentNav, selectedDate]);

  // Auto-refresh when window receives focus or returns from background tab (throttled to 30s)
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFetchTimeRef.current > 30000) {
        lastFetchTimeRef.current = now;
        fetchAllData(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastFetchTimeRef.current > 30000) {
          lastFetchTimeRef.current = now;
          fetchAllData(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
    const targetDate = selectedDate || localDateKey();
    setStaffTaskDate(targetDate);
    const [y, m] = targetDate.split('-').map(Number);
    setSelectedYear(y);
    setSelectedMonth(m);

    fetchStaffDayTasks(staff.staffMember.id, targetDate);
    fetchStaffAttendance(staff.staffMember.id, y, m);
    fetchStaffPerformance(staff.staffMember.id, y, m);
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
    setAddCustomFieldDraft({});
    setAddJoiningDate('');
    setAddSalary('');
    setAddSecurityDeposit('');
    setAddDutyTiming('');
    setAddIncentive('');
    setAddShiftStartTime('');
    setAddShiftEndTime('');
    setAddLateThreshold('');
    setAddHalfDayThreshold('');
    setAddAbsentThreshold('');
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
        shiftStartTime: addShiftStartTime || undefined,
        shiftEndTime: addShiftEndTime || undefined,
        lateThreshold: addLateThreshold || undefined,
        halfDayThreshold: addHalfDayThreshold || undefined,
        absentThreshold: addAbsentThreshold || undefined,
        customFieldValues: addCustomFieldDraft,
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
    setEditWorkflowProfileId((staff as unknown as { workflowProfileId?: string }).workflowProfileId || (staff as unknown as { workflowProfile?: { id?: string } }).workflowProfile?.id || '');
    setEditJoiningDate(staff.joiningDate ? staff.joiningDate.split('T')[0] : '');
    setEditMonthlySalary(staff.monthlySalary != null ? String(staff.monthlySalary) : '');
    setEditSecurityDeposit(staff.securityDeposit != null ? String(staff.securityDeposit) : '');
    setEditDutyTiming(staff.dutyTimingNotes || '');
    setEditIncentive(staff.incentiveAmount != null ? String(staff.incentiveAmount) : '');
    setEditShiftStartTime(staff.shiftStartTime || staff.shiftSchedule?.shiftStartTime || '');
    setEditShiftEndTime(staff.shiftEndTime || staff.shiftSchedule?.shiftEndTime || '');
    setEditLateThreshold(staff.lateThreshold || staff.shiftSchedule?.lateThreshold || '');
    setEditHalfDayThreshold(staff.halfDayThreshold || staff.shiftSchedule?.halfDayThreshold || '');
    setEditAbsentThreshold(staff.absentThreshold || staff.shiftSchedule?.absentThreshold || '');
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
        workflowProfileId: editWorkflowProfileId || null,
        joiningDate: editJoiningDate || null,
        monthlySalary: editMonthlySalary ? parseFloat(editMonthlySalary) : null,
        securityDeposit: editSecurityDeposit ? parseFloat(editSecurityDeposit) : null,
        dutyTimingNotes: editDutyTiming.trim() || null,
        incentiveAmount: editIncentive ? parseFloat(editIncentive) : null,
        shiftStartTime: editShiftStartTime || null,
        shiftEndTime: editShiftEndTime || null,
        lateThreshold: editLateThreshold || null,
        halfDayThreshold: editHalfDayThreshold || null,
        absentThreshold: editAbsentThreshold || null,
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
        shiftStartTime: editShiftStartTime || null,
        shiftEndTime: editShiftEndTime || null,
        lateThreshold: editLateThreshold || null,
        halfDayThreshold: editHalfDayThreshold || null,
        absentThreshold: editAbsentThreshold || null,
        shiftSchedule: {
          shiftStartTime: editShiftStartTime || null,
          shiftEndTime: editShiftEndTime || null,
          lateThreshold: editLateThreshold || null,
          halfDayThreshold: editHalfDayThreshold || null,
          absentThreshold: editAbsentThreshold || null,
          halfDayMinHours: null,
          fullDayMinHours: null,
        },
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
    setDirectiveTitle('');
    setDirectiveNotes('');
    setDirectivePriority('NORMAL');

    const roleName = (staff.positionCategory?.name || staff.role || '').toLowerCase();
    if (roleName.includes('iron') || roleName.includes('press')) {
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
      const isFloor = isSelectedStaffFloor();
      const idempotencyKey = `sup-task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      if (!isFloor) {
        // Managerial / Operational Directive Task (Manager, Marketing Manager, etc.)
        if (!directiveTitle.trim()) throw new Error('Please enter a directive or task title.');

        const combinedNotes = [
          directivePriority !== 'NORMAL' ? `[Priority: ${directivePriority}]` : '',
          directiveNotes.trim(),
        ].filter(Boolean).join(' | ');

        const payload = {
          assignmentDate: staffTaskDate,
          workflowProfileId: 'wfp-directive',
          orderId: directiveTitle.trim(),
          pickupCount: 1,
          selectedActivities: [],
          notes: combinedNotes || undefined,
          idempotencyKey,
        };

        await apiRequest(`/api/shops/${activeShopId}/staff/${selectedStaff.staffMember.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        setTaskFeedback({ type: 'success', message: 'Directive assigned to staff successfully!' });
        setDirectiveTitle('');
        setDirectiveNotes('');
        setDirectivePriority('NORMAL');
      } else {
        // Floor Laundry Staff (Washerman / Ironman / Delivery)
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

        const payload: Record<string, unknown> = {
          assignmentDate: staffTaskDate,
          workflowProfileId,
          orderId: taskOrderId.trim(),
          pieceCount: Number(taskPieces),
          serviceTypeId: taskServiceTypeId || undefined,
          selectedActivities: taskSelectedActivities,
          notes: taskNotes.trim() || undefined,
          idempotencyKey,
        };

        if (taskDamage.hasDamage) {
          payload.initialDamage = {
            hasDamage: true,
            pieceNumber: taskDamage.pieceNumber ? Number(taskDamage.pieceNumber) : 1,
            notes: taskDamage.notes.trim() || undefined,
            photoPath: taskDamage.photoPath || undefined,
          };
        }

        await apiRequest(`/api/shops/${activeShopId}/staff/${selectedStaff.staffMember.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        setTaskFeedback({ type: 'success', message: 'Task assigned successfully!' });
        setTaskOrderId('');
        setTaskPieces('');
        setTaskNotes('');
        setTaskDamage({
          hasDamage: false,
          pieceNumber: 1,
          notes: '',
          photoPath: null,
        });
      }

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

  if (isLoading && !dashboardData) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 bg-[#F8F9FA] text-[#1E293B] antialiased">
      {user?.isOwner && (
        <div className="mx-4 mt-2 px-3.5 py-2.5 rounded-xl bg-brand-forest text-brand-lime text-xs font-bold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span>👑</span>
            <span>Logged in as Owner (Supervisor Terminal)</span>
          </div>
          <button
            onClick={() => router.push('/owner')}
            className="px-2.5 py-1 rounded-lg bg-brand-lime text-brand-forest font-extrabold hover:opacity-90 transition-all text-[11px]"
          >
            Owner Console
          </button>
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

                    {/* Shift & Attendance Policy (IST Timings) */}
                    <div className="p-3 rounded-2xl bg-surface-cream/80 border border-emerald-900/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-brand-forest uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand-forest" />
                          Shift & Attendance Timings (IST)
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Optional
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-brand-forest mb-0.5">Shift Start (IST)</label>
                          <input
                            type="time"
                            value={addShiftStartTime}
                            onChange={(e) => setAddShiftStartTime(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-border-subtle text-xs font-semibold text-brand-forest"
                          />
                          <span className="text-[9px] text-content-muted block mt-0.5">Check-in start</span>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-800 mb-0.5">On-Time Cutoff (IST)</label>
                          <input
                            type="time"
                            value={addLateThreshold}
                            onChange={(e) => setAddLateThreshold(e.target.value)}
                            placeholder="09:35"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-300 text-xs font-semibold text-emerald-950"
                          />
                          <span className="text-[9px] text-emerald-800 block mt-0.5">Present if check-in ≤ this</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-amber-900 mb-0.5">Late Cutoff (IST)</label>
                          <input
                            type="time"
                            value={addHalfDayThreshold}
                            onChange={(e) => setAddHalfDayThreshold(e.target.value)}
                            placeholder="10:00"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-amber-50/70 border border-amber-300 text-xs font-semibold text-amber-950"
                          />
                          <span className="text-[9px] text-amber-800 block mt-0.5">Late if check-in ≤ this</span>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-rose-900 mb-0.5">Half-Day Cutoff (IST)</label>
                          <input
                            type="time"
                            value={addAbsentThreshold}
                            onChange={(e) => setAddAbsentThreshold(e.target.value)}
                            placeholder="12:00"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-rose-50/70 border border-rose-300 text-xs font-semibold text-rose-950"
                          />
                          <span className="text-[9px] text-rose-800 block mt-0.5">Half-Day if ≤ this; Absent if after</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-brand-forest mb-0.5">Shift End (IST)</label>
                        <input
                          type="time"
                          value={addShiftEndTime}
                          onChange={(e) => setAddShiftEndTime(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-border-subtle text-xs font-semibold text-brand-forest"
                        />
                        <span className="text-[9px] text-content-muted block mt-0.5">Check-out / shift end time</span>
                      </div>
                    </div>

                    {/* Dynamic Custom Fields fetched from Database */}
                    {customFields
                      .filter((cf) => cf.isActive !== false)
                      .filter((cf) => {
                        if (!cf.positionCategoryIds || cf.positionCategoryIds.length === 0) return true;
                        return addPositionId ? cf.positionCategoryIds.includes(addPositionId) : true;
                      })
                      .map((cf) => (
                        <div key={cf.id}>
                          <label className="block text-xs font-bold text-brand-forest mb-1">
                            {cf.label} {cf.isRequired && <span className="text-red-500">*</span>}
                          </label>
                          {cf.fieldType === 'DROPDOWN' ? (
                            <select
                              value={addCustomFieldDraft[cf.id] ?? ''}
                              onChange={(e) => setAddCustomFieldDraft((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                            >
                              <option value="">— Select {cf.label} —</option>
                              {(cf.dropdownOptions || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : cf.fieldType === 'YES_NO' ? (
                            <select
                              value={addCustomFieldDraft[cf.id] ?? ''}
                              onChange={(e) => setAddCustomFieldDraft((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                            >
                              <option value="">— Select —</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          ) : cf.fieldType === 'DATE' ? (
                            <input
                              type="date"
                              value={addCustomFieldDraft[cf.id] ?? ''}
                              onChange={(e) => setAddCustomFieldDraft((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                            />
                          ) : cf.fieldType === 'NUMBER' ? (
                            <input
                              type="number"
                              placeholder={cf.helpText || `Enter ${cf.label}`}
                              value={addCustomFieldDraft[cf.id] ?? ''}
                              onChange={(e) => setAddCustomFieldDraft((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder={cf.helpText || `Enter ${cf.label}`}
                              value={addCustomFieldDraft[cf.id] ?? ''}
                              onChange={(e) => setAddCustomFieldDraft((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs focus:ring-2 focus:ring-brand-forest font-semibold"
                            />
                          )}
                          {cf.helpText && (
                            <p className="text-[10px] text-content-muted mt-0.5">{cf.helpText}</p>
                          )}
                        </div>
                      ))}

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
                  <span className="font-bold text-brand-forest">
                    {resolveDutyTiming(selectedStaff.dutyTimingNotes, selectedStaff.shiftStartTime, selectedStaff.shiftEndTime)}
                  </span>
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

              {/* Shift & Attendance Timings (IST) Card */}
              {(selectedStaff.shiftStartTime || selectedStaff.shiftEndTime || selectedStaff.lateThreshold) && (
                <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-brand-forest flex items-center gap-1.5 uppercase tracking-wide">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Shift & Attendance Policy (IST)
                    </span>
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      12-Hour IST
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    {selectedStaff.shiftStartTime && (
                      <div className="p-2 rounded-lg bg-white border border-border-subtle">
                        <span className="text-[10px] text-content-muted block">Shift Start</span>
                        <span className="font-bold text-brand-forest">{formatTime12h(selectedStaff.shiftStartTime)}</span>
                      </div>
                    )}
                    {selectedStaff.lateThreshold && (
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] text-emerald-800 block">On-Time Cutoff</span>
                        <span className="font-bold text-emerald-900">{formatTime12h(selectedStaff.lateThreshold)}</span>
                      </div>
                    )}
                    {selectedStaff.halfDayThreshold && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                        <span className="text-[10px] text-amber-800 block">Late Cutoff</span>
                        <span className="font-bold text-amber-900">{formatTime12h(selectedStaff.halfDayThreshold)}</span>
                      </div>
                    )}
                    {selectedStaff.absentThreshold && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                        <span className="text-[10px] text-rose-800 block">Half-Day Cutoff</span>
                        <span className="font-bold text-rose-900">{formatTime12h(selectedStaff.absentThreshold)}</span>
                      </div>
                    )}
                    {selectedStaff.shiftEndTime && (
                      <div className="p-2 rounded-lg bg-white border border-border-subtle">
                        <span className="text-[10px] text-content-muted block">Shift End</span>
                        <span className="font-bold text-brand-forest">{formatTime12h(selectedStaff.shiftEndTime)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Fields Box matching Screen 6 & Owner Architecture */}
              <div className="mt-2">
                <StaffExtraDetails
                  shopId={activeShopId!}
                  staffMemberId={selectedStaff.staffMember.id}
                  canEdit={canEditStaff}
                />
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
                      const [y, m, d] = staffTaskDate.split('-').map(Number);
                      const prev = new Date(y, m - 1, d - 1);
                      const str = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
                      setStaffTaskDate(str);
                      fetchStaffDayTasks(selectedStaff.staffMember.id, str);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-brand-forest">
                    <Calendar className="w-3.5 h-3.5" />
                    <input
                      type="date"
                      value={staffTaskDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setStaffTaskDate(val);
                          fetchStaffDayTasks(selectedStaff.staffMember.id, val);
                        }
                      }}
                      className="bg-transparent font-bold text-xs text-brand-forest cursor-pointer focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const [y, m, d] = staffTaskDate.split('-').map(Number);
                      const next = new Date(y, m - 1, d + 1);
                      const str = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
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
                      const isDirective =
                        assignment.workflowProfile?.name?.includes('Directive') ||
                        assignment.workflowProfileId === 'wfp-directive' ||
                        (!assignment.pieceCount && !assignment.serviceTypeId);

                      if (isDirective) {
                        const unit = assignment.taskUnits[0];
                        const isDone = unit?.status === 'COMPLETED';
                        const isAlreadyShifted = !!assignment.notes?.includes('[Shifted to');
                        const shiftedToMatch = assignment.notes?.match(/\[Shifted to ([^\]]+)\]/);
                        const shiftedToDate = shiftedToMatch ? formatShiftDate(shiftedToMatch[1]) : null;
                        const isRolledOver = !!assignment.notes?.includes('[Rolled over from');
                        const rolledOverMatch = assignment.notes?.match(/\[Rolled over from ([^\]]+)\]/);
                        const rolledOverDate = rolledOverMatch ? formatShiftDate(rolledOverMatch[1]) : null;

                        return (
                          <div
                            key={assignment.id}
                            className={`rounded-2xl border shadow-clay-sm p-4 space-y-2.5 transition-all ${
                              isDone
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : 'bg-white border-border-subtle'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-[10px] uppercase tracking-wider">
                                    Directive
                                  </span>
                                  {isRolledOver && (
                                    <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-900 font-extrabold text-[10px] tracking-wider border border-blue-200">
                                      Rolled from {rolledOverDate}
                                    </span>
                                  )}
                                  <h4 className="text-sm font-extrabold text-brand-forest">
                                    {assignment.orderId || 'Operational Directive'}
                                  </h4>
                                </div>
                                {assignment.notes && (
                                  <p className="text-xs text-content-muted leading-relaxed whitespace-pre-wrap">
                                    {assignment.notes}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isAlreadyShifted ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2.5 py-1.5 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs border border-purple-200 flex items-center gap-1 shadow-sm">
                                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                      <span>Shifted to {shiftedToDate || 'New Date'}</span>
                                    </span>
                                    <button
                                      type="button"
                                      disabled={isUndoingShiftId === assignment.id}
                                      onClick={() => handleUndoShift(assignment)}
                                      className="touch-manipulation active:scale-95 px-2 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs border border-rose-200 flex items-center gap-1 transition-all shadow-sm disabled:opacity-50"
                                      title="Undo shift and restore this task"
                                    >
                                      <RotateCcw className={`w-3.5 h-3.5 text-rose-600 ${isUndoingShiftId === assignment.id ? 'animate-spin' : ''}`} />
                                      <span>Undo</span>
                                    </button>
                                  </div>
                                ) : !isDone ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReschedule(assignment)}
                                    className="touch-manipulation active:scale-95 px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 hover:bg-blue-100 flex items-center gap-1 transition-all shadow-sm"
                                    title="Shift task to another date (creates duplicate on target date & keeps history)"
                                  >
                                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Shift Date</span>
                                  </button>
                                ) : null}
                                {unit && (
                                  <span
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                                      isDone
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                                    }`}
                                  >
                                    {isDone ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>Done</span>
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                                        <span>Pending</span>
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-border-subtle/60 text-[11px] text-content-muted">
                              <span>Target Date: {staffTaskDate}</span>
                              {isDone && unit?.completedAt && (
                                <span className="text-emerald-700 font-bold">
                                  Completed at {new Date(unit.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const completedCount = assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                      const totalCount = assignment.taskUnits.length;
                      const isAlreadyShifted = !!assignment.notes?.includes('[Shifted to');
                      const shiftedToMatch = assignment.notes?.match(/\[Shifted to ([^\]]+)\]/);
                      const shiftedToDate = shiftedToMatch ? formatShiftDate(shiftedToMatch[1]) : null;
                      const isRolledOver = !!assignment.notes?.includes('[Rolled over from');
                      const rolledOverMatch = assignment.notes?.match(/\[Rolled over from ([^\]]+)\]/);
                      const rolledOverDate = rolledOverMatch ? formatShiftDate(rolledOverMatch[1]) : null;

                      // Group task units by pieceNumber
                      const pieceMap = new Map<number, typeof assignment.taskUnits>();
                      assignment.taskUnits.forEach((unit) => {
                        const pNum = unit.pieceNumber || 1;
                        if (!pieceMap.has(pNum)) pieceMap.set(pNum, []);
                        pieceMap.get(pNum)!.push(unit);
                      });

                      const parsed = parseAssignmentNotes(assignment.notes);
                      const cleanMobile = assignment.customerMobile ? assignment.customerMobile.replace(/\D/g, '') : null;

                      return (
                        <div key={assignment.id} className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-lg font-black text-xs font-mono ${
                                assignment.orderId ? 'bg-blue-100 text-blue-900 border border-blue-200' : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}>
                                {assignment.orderId ? `Order #${assignment.orderId}` : 'Pickup Request'}
                              </span>
                              {isRolledOver && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  Rolled from {rolledOverDate}
                                </span>
                              )}
                              <span className="text-xs font-bold text-brand-forest">
                                {assignment.pieceCount || totalCount} pieces • {assignment.serviceType?.name || assignment.workflowProfile?.name || 'Task Batch'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-red-600">
                                {completedCount}/{totalCount} Completed
                              </span>
                              {isAlreadyShifted ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200 flex items-center gap-1 shadow-sm">
                                    <Calendar className="w-3 h-3 text-purple-600" />
                                    <span>Shifted to {shiftedToDate || 'New Date'}</span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isUndoingShiftId === assignment.id}
                                    onClick={() => handleUndoShift(assignment)}
                                    className="touch-manipulation active:scale-95 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-[10px] border border-rose-200 flex items-center gap-1 transition-all shadow-sm disabled:opacity-50"
                                    title="Undo shift and restore this task"
                                  >
                                    <RotateCcw className={`w-3 h-3 text-rose-600 ${isUndoingShiftId === assignment.id ? 'animate-spin' : ''}`} />
                                    <span>Undo</span>
                                  </button>
                                </div>
                              ) : completedCount < totalCount ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReschedule(assignment)}
                                  className="touch-manipulation active:scale-95 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200 hover:bg-blue-100 flex items-center gap-1 transition-all shadow-sm"
                                  title="Shift task to another date (creates duplicate on target date & keeps history)"
                                >
                                  <Calendar className="w-3 h-3 text-blue-600" />
                                  <span>Shift Date</span>
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {/* Customer Contact & Call/WhatsApp Actions */}
                          {cleanMobile && (
                            <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                                  <Phone className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                                    Customer Contact
                                  </span>
                                  <span className="font-mono text-xs font-black text-emerald-950 tracking-wide">
                                    {assignment.customerMobile}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={`tel:${cleanMobile}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-forest text-brand-lime font-bold text-xs shadow-sm hover:opacity-90"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                  <span>Call</span>
                                </a>
                                <a
                                  href={`https://wa.me/91${cleanMobile}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-sm hover:opacity-90"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>WhatsApp</span>
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Location / Address Tag */}
                          {parsed.location && (
                            <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2 text-xs text-amber-950">
                              <MapPin className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block">
                                  Delivery / Pickup Location
                                </span>
                                <span className="font-semibold text-xs text-amber-950">
                                  {parsed.location}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Clean Notes if any */}
                          {parsed.cleanNotes && (
                            <p className="text-[11px] text-content-muted">
                              <strong className="text-content-default">Note:</strong> {parsed.cleanNotes}
                            </p>
                          )}

                          {/* Damage Alert Section with All Incident Evidence Cards */}
                          {assignment.damageIncidents && assignment.damageIncidents.length > 0 && (
                            <div className="space-y-2 animate-fade-in">
                              <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                                <AlertTriangle className="w-4 h-4 text-status-danger" />
                                <span>Reported Damage / Issue Incidents ({assignment.damageIncidents.length})</span>
                              </div>
                              <div className="space-y-1.5">
                                {assignment.damageIncidents.map((dmg) => (
                                  <div
                                    key={dmg.id}
                                    onClick={() => setViewingDamageIncident(dmg)}
                                    className="cursor-pointer p-2.5 rounded-xl bg-red-50/80 hover:bg-red-100/80 border border-red-200 flex items-center justify-between gap-3 transition-colors shadow-sm"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      {dmg.photoPath ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={dmg.photoPath}
                                          alt="Damage Evidence"
                                          className="w-10 h-10 rounded-lg object-cover border border-red-300 shadow-sm shrink-0"
                                        />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center text-red-700 shrink-0">
                                          <AlertTriangle className="w-4 h-4" />
                                        </div>
                                      )}
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-extrabold text-red-950 text-xs">
                                            {dmg.pieceNumber ? `Piece #${dmg.pieceNumber}` : 'Incident'}
                                          </span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-200 text-red-900 uppercase">
                                            {dmg.status}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-red-900 font-medium line-clamp-1">
                                          {dmg.notes || 'Damage reported'}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="px-2.5 py-1 rounded-lg bg-white border border-red-300 text-red-900 text-[11px] font-bold shadow-sm whitespace-nowrap"
                                    >
                                      View Photo
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Table with piece-by-piece operation breakdown matching Washerman station */}
                          <div className="overflow-x-auto pt-1">
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
                                    assignment.damageIncidents?.find((d) => d.pieceNumber === pieceNum) ||
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
                      <span className="text-[10px] font-bold text-emerald-700">Full Day</span>
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
                        const isHalfDay = (item as unknown as { isHalfDay?: boolean }).isHalfDay ?? ((item.durationMinutes || 0) > 0 && (item.durationMinutes || 0) < 240 && item.status !== 'OPEN');
                        const isOpen = item.status === 'OPEN';

                        return (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-border-subtle/40 text-xs">
                            <div>
                              <span className="font-extrabold text-brand-forest">{dateStr}</span>{' '}
                              <span className="text-content-muted text-[11px]">{dayStr}</span>
                            </div>
                            <span className="text-[11px] font-medium text-content-muted">{timeStr}</span>
                            {isHalfDay ? (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                Half Day ({durStr})
                              </span>
                            ) : isOpen ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {durStr}
                              </span>
                            )}
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

              {/* Operational Responsibilities / Workflow Profile */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">
                  Operational Responsibilities (Workflow Profile)
                </label>
                <select
                  value={editWorkflowProfileId}
                  onChange={(e) => setEditWorkflowProfileId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                >
                  <option value="">Inherit From Position</option>
                  {workflowProfiles.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.allowedActivities.join(', ')})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-content-muted mt-0.5">
                  Controls allowed operations (e.g. Washerman = WASH, DRY; Ironman = IRON, FOLD, PACK)
                </p>
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

              {/* Individual Shift & Attendance Policy (IST) */}
              <div className="p-3.5 rounded-2xl bg-surface-cream/80 border border-emerald-900/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-forest" />
                    <span className="text-xs font-black text-brand-forest uppercase tracking-wider">
                      Shift & Attendance Policy (IST)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Live Evaluation
                  </span>
                </div>
                <p className="text-[10px] text-content-muted leading-tight">
                  Evaluated strictly in Indian Standard Time (IST). Check-in on or before On-Time Cutoff is <strong>PRESENT</strong>; between On-Time & Late Cutoff is <strong>LATE</strong>; between Late & Half-Day Cutoff is <strong>HALF DAY</strong>; after Half-Day Cutoff is <strong>ABSENT</strong>.
                </p>

                {/* Timing Windows Row 1: Shift Start & On-Time Cutoff */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      Shift Start (IST)
                    </label>
                    <input
                      type="time"
                      value={editShiftStartTime}
                      onChange={(e) => setEditShiftStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-bold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                    />
                    <span className="text-[9px] text-content-muted block mt-0.5">Check-in start</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                      On-Time Cutoff (IST)
                    </label>
                    <input
                      type="time"
                      value={editLateThreshold}
                      onChange={(e) => setEditLateThreshold(e.target.value)}
                      placeholder="09:35"
                      className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-300 text-xs font-bold text-emerald-950 focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[9px] text-emerald-800/90 block mt-0.5">Present if clock-in ≤ this</span>
                  </div>
                </div>

                {/* Timing Windows Row 2: Late Cutoff & Half-Day / Absent Cutoff */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Late Cutoff (IST)
                    </label>
                    <input
                      type="time"
                      value={editHalfDayThreshold}
                      onChange={(e) => setEditHalfDayThreshold(e.target.value)}
                      placeholder="10:00"
                      className="w-full px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-300 text-xs font-bold text-amber-950 focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-[9px] text-amber-800/90 block mt-0.5">Late if clock-in ≤ this</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 mb-1">
                      Half-Day Cutoff (IST)
                    </label>
                    <input
                      type="time"
                      value={editAbsentThreshold}
                      onChange={(e) => setEditAbsentThreshold(e.target.value)}
                      placeholder="12:00"
                      className="w-full px-3 py-2 rounded-xl bg-rose-50/70 border border-rose-300 text-xs font-bold text-rose-950 focus:ring-2 focus:ring-rose-500"
                    />
                    <span className="text-[9px] text-rose-800/90 block mt-0.5">Half-Day if ≤ this; Absent if after</span>
                  </div>
                </div>

                {/* Timing Windows Row 3: Shift End */}
                <div>
                  <label className="block text-[11px] font-bold text-brand-forest mb-1">
                    Shift End (IST)
                  </label>
                  <input
                    type="time"
                    value={editShiftEndTime}
                    onChange={(e) => setEditShiftEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-bold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                  <span className="text-[9px] text-content-muted block mt-0.5">Check-out / shift end time</span>
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
              {!isSelectedStaffFloor() ? (
                /* ─── MANAGERIAL / OPERATIONAL DIRECTIVE TASK (MANAGER, MARKETING, ETC.) ─── */
                <div className="space-y-3.5 animate-fade-in">
                  <div className="p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-indigo-900 text-xs flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      ⚡
                    </div>
                    <div>
                      <p className="font-extrabold">Operational Directive Task</p>
                      <p className="text-[11px] text-indigo-700">Assign managerial or operational instructions without laundry piece counts.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1">
                      Directive / Task Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Monthly Chemical Stock Audit, Review Daily Shift Logs..."
                      value={directiveTitle}
                      onChange={(e) => setDirectiveTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1">
                      Instructions & Remarks (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Enter specific instructions, checklist items, or guidelines..."
                      value={directiveNotes}
                      onChange={(e) => setDirectiveNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1.5">
                      Priority Level
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDirectivePriority(p)}
                          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border text-center ${
                            directivePriority === p
                              ? p === 'URGENT'
                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                : p === 'HIGH'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                : 'bg-[#245431] text-white border-[#245431] shadow-sm'
                              : 'bg-surface-cream text-content-muted border-border-subtle hover:bg-surface-hover'
                          }`}
                        >
                          {p === 'NORMAL' ? 'Standard' : p === 'HIGH' ? 'Important' : 'Urgent'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* ─── FLOOR LAUNDRY TASK (WASHERMAN, IRONMAN, DELIVERY) ─── */
                <>
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

                  {/* Pre-existing Damage Reporting (Reusing Staff DamageModal) */}
                  {isSelectedStaffFloor() && (
                    <div className="rounded-2xl border border-dashed border-red-300 bg-rose-50/50 p-3.5 space-y-2.5">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={taskDamage.hasDamage}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setTaskDamage((prev) => ({ ...prev, hasDamage: checked }));
                            if (checked && !taskDamage.photoPath) {
                              setIsTaskDamageModalOpen(true);
                            }
                          }}
                          className="w-4 h-4 mt-0.5 rounded border-border-subtle text-status-danger focus:ring-status-danger cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-status-danger" />
                            <span className="text-xs font-bold text-red-950">
                              Pre-existing Garment Damage? (Report Damage)
                            </span>
                          </div>
                          <p className="text-[10px] text-content-muted mt-0.5">
                            Check if the garment already has stains, cuts, tears, or defects. The photo and note record will be saved to the database and visible to Owner, Supervisor, and Staff.
                          </p>
                        </div>
                      </label>

                      {taskDamage.hasDamage && (
                        <div className="pt-2 border-t border-red-200/80 space-y-2 animate-fade-in">
                          {taskDamage.photoPath || taskDamage.notes ? (
                            <div className="p-2.5 rounded-xl bg-white border border-red-200 flex items-center justify-between gap-3 shadow-2xs">
                              <div className="flex items-center gap-2.5">
                                {taskDamage.photoPath ? (
                                  <img
                                    src={taskDamage.photoPath}
                                    alt="Damage Evidence"
                                    className="w-12 h-12 rounded-lg object-cover border border-red-300 shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center text-status-danger shrink-0">
                                    <AlertTriangle className="w-5 h-5" />
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-red-950">
                                      Piece #{taskDamage.pieceNumber || 1}
                                    </span>
                                    {taskDamage.photoPath && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                        Photo Attached
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-red-900 font-medium line-clamp-1">
                                    {taskDamage.notes || 'Damage noted'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setIsTaskDamageModalOpen(true)}
                                  className="px-2.5 py-1.5 rounded-lg bg-surface-cream text-brand-forest hover:bg-surface-hover border border-border-subtle text-xs font-bold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTaskDamage({
                                      hasDamage: false,
                                      pieceNumber: 1,
                                      notes: '',
                                      photoPath: null,
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-red-100 text-status-danger hover:bg-red-200 text-xs font-bold"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsTaskDamageModalOpen(true)}
                              className="w-full py-2.5 px-3 rounded-xl bg-white border border-red-200 hover:border-red-300 text-xs font-bold text-red-950 flex items-center justify-center gap-2 shadow-2xs hover:bg-red-50/50 transition-all"
                            >
                              <Camera className="w-4 h-4 text-status-danger" />
                              <span>Take Photo / Describe Damage Evidence</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

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
                  disabled={
                    isSubmittingTask ||
                    (!isSelectedStaffFloor()
                      ? !directiveTitle.trim()
                      : !taskOrderId.trim() || !taskPieces || taskSelectedActivities.length === 0)
                  }
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingTask
                      ? 'Assigning...'
                      : !isSelectedStaffFloor()
                      ? 'Assign Directive'
                      : 'Create Task'}
                  </span>
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
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              className="relative p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-cream transition-all"
              title="Operational Alerts"
            >
              <Bell className="w-4 h-4 text-brand-forest" />
              {(absentTrackedStaff.length > 0 || (dashboardData?.todayTasks?.pending ?? 0) > 0) && (
                <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5 animate-pulse" />
              )}
            </button>
          </div>

          {/* Date bar */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              <Calendar className={`w-4 h-4 text-brand-forest ${isDateLoading ? 'animate-spin' : ''}`} />
              <span>{new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              {isDateLoading && <span className="text-[10px] text-content-muted font-normal animate-pulse">(updating...)</span>}
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-surface-cream"
            />
          </div>

          {/* Three Floor Metric Badges */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-xl font-black text-brand-forest block">
                {dashboardData?.totalStaff ?? attendanceTrackedStaff.length}
              </span>
              <span className="text-[11px] font-bold text-content-muted">Tracked Staff</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-sm text-center bg-emerald-50/40">
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-xl font-black text-emerald-800">
                  {dashboardData?.activeOnFloorCount ?? activeOnFloorStaff.length}
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">
                On Floor {dashboardData?.completedShiftCount ? `(${dashboardData.completedShiftCount} done)` : ''}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-red-100 shadow-sm text-center bg-red-50/20">
              <span className="text-xl font-black text-red-600 block">
                {dashboardData?.absentCount ?? absentTrackedStaff.length}
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-cream active:scale-95 flex items-center justify-center transition-all touch-manipulation"
                title="Refresh Shop Data"
                aria-label="Refresh Shop Data"
              >
                <RefreshCw className={`w-4 h-4 text-brand-forest ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(true)}
                className="relative p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-cream transition-all flex items-center justify-center"
                title="Operational Alerts"
              >
                <Bell className="w-4 h-4 text-brand-forest" />
                {(absentTrackedStaff.length > 0 || (dashboardData?.todayTasks?.pending ?? 0) > 0) && (
                  <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5 animate-pulse" />
                )}
              </button>
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
                    {staff.attendanceEnabled === false ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                        Exempt
                      </span>
                    ) : staff.attendanceToday.isOnFloor || (staff.attendanceToday.isPresent && !staff.attendanceToday.checkOutAt && staff.attendanceToday.status === 'OPEN') ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        ● On Floor
                      </span>
                    ) : staff.attendanceToday.isShiftCompleted || (staff.attendanceToday.isPresent && (!!staff.attendanceToday.checkOutAt || staff.attendanceToday.status === 'CLOSED')) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        Shift Done
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                        Absent
                      </span>
                    )}
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
                  {user?.staffMember?.fullName || 'Supervisor'} • Operational Roles & Account
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
        <div className="p-4">
          <StaffProfileCard
            title="Supervisor Profile"
            onBack={() => setActiveDrilldown(null)}
            staff={{
              fullName: user?.staffMember?.fullName || 'Supervisor',
              mobile: user?.staffMember?.mobile,
              address: user?.staffMember?.address,
              profilePhotoPath: user?.staffMember?.profilePhotoPath,
              employmentStatus: user?.staffMember?.employmentStatus || 'ACTIVE',
            }}
            membership={{
              shopId: activeShopId || undefined,
              shopName: activeShopName || mySupervisorMembership?.shopName,
              roleName: mySupervisorMembership?.roleName || 'Supervisor',
              positionCategory: mySupervisorMembership?.positionCategory,
              joiningDate: mySupervisorMembership?.joiningDate,
              dutyTimingNotes: mySupervisorMembership?.dutyTimingNotes,
              monthlySalary: mySupervisorMembership?.monthlySalary,
              incentiveAmount: mySupervisorMembership?.incentiveAmount,
              shiftStartTime: mySupervisorMembership?.shiftStartTime,
              shiftEndTime: mySupervisorMembership?.shiftEndTime,
              lateThreshold: mySupervisorMembership?.lateThreshold,
              halfDayThreshold: mySupervisorMembership?.halfDayThreshold,
              absentThreshold: mySupervisorMembership?.absentThreshold,
              attendanceEnabled: mySupervisorMembership?.attendanceEnabled,
              capabilities: mySupervisorMembership?.capabilities,
            }}
            session={supervisorSession}
            isProcessingAttendance={isProcessingSupervisorAtt}
            onCheckInWithPhoto={async (photoData) => {
              await handleSupervisorAttCapture(photoData, 'check-in');
            }}
            onCheckOutWithPhoto={async (photoData) => {
              await handleSupervisorAttCapture(photoData, 'check-out');
            }}
          />
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
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle text-brand-forest hover:bg-surface-cream active:scale-95 shadow-sm flex items-center justify-center transition-all touch-manipulation"
              title="Refresh Attendance"
              aria-label="Refresh Attendance"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              <Calendar className={`w-4 h-4 text-brand-forest ${isDateLoading ? 'animate-spin' : ''}`} />
              <span>{new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              {isDateLoading && <span className="text-[10px] text-content-muted font-normal animate-pulse">(updating...)</span>}
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
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

          {/* 4 Metric Cards: Total On Roll, On Floor, Shift Done, Absent */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
              <span className="text-lg font-black text-brand-forest block">
                {attendanceTrackedStaff.length}
              </span>
              <span className="text-[10px] font-bold text-content-muted">Tracked Staff</span>
            </div>
            <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-200 shadow-sm text-center">
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-lg font-black text-emerald-800">
                  {activeOnFloorStaff.length}
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700">On Floor</span>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-200 shadow-sm text-center">
              <span className="text-lg font-black text-blue-800 block">
                {completedShiftStaff.length}
              </span>
              <span className="text-[10px] font-bold text-blue-700">Shift Done</span>
            </div>
            <div className="bg-red-50/30 p-3 rounded-2xl border border-red-100 shadow-sm text-center">
              <span className="text-lg font-black text-red-600 block">
                {absentTrackedStaff.length}
              </span>
              <span className="text-[10px] font-bold text-red-500">Absent</span>
            </div>
          </div>

          {/* Filter Chips: All, On Floor, Shift Done, Absent */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(['ALL', 'ON_FLOOR', 'COMPLETED', 'ABSENT'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setAttendanceFilter(tab)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  attendanceFilter === tab
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'bg-white border border-border-subtle text-content-muted hover:text-brand-forest'
                }`}
              >
                {tab === 'ALL' && `All (${attendanceTrackedStaff.length})`}
                {tab === 'ON_FLOOR' && `On Floor (${activeOnFloorStaff.length})`}
                {tab === 'COMPLETED' && `Shift Done (${completedShiftStaff.length})`}
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
                const isOnFloor = staff.attendanceToday?.isOnFloor || (isPresent && !staff.attendanceToday?.checkOutAt && staff.attendanceToday?.status === 'OPEN');
                const isShiftCompleted = staff.attendanceToday?.isShiftCompleted || (isPresent && (!!staff.attendanceToday?.checkOutAt || staff.attendanceToday?.status === 'CLOSED'));
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
                          {/* Shift Timings Display */}
                          {staff.shiftSchedule?.shiftStartTime ? (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-brand-forest font-semibold flex-wrap">
                              <Clock className="w-3 h-3 text-brand-forest shrink-0" />
                              <span>Shift: {formatTime12h(staff.shiftSchedule.shiftStartTime)} – {staff.shiftSchedule.shiftEndTime ? formatTime12h(staff.shiftSchedule.shiftEndTime) : 'Flexible'} IST</span>
                              {staff.shiftSchedule.lateThreshold && (
                                <span className="text-[9px] text-amber-800 font-bold bg-amber-50 px-1 rounded border border-amber-200">
                                  Late &gt; {formatTime12h(staff.shiftSchedule.lateThreshold)}
                                </span>
                              )}
                              {staff.shiftSchedule.absentThreshold && (
                                <span className="text-[9px] text-rose-800 font-bold bg-rose-50 px-1 rounded border border-rose-200">
                                  Absent &gt; {formatTime12h(staff.shiftSchedule.absentThreshold)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-content-muted italic">No shift timings configured</span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditStaff(staff)}
                                className="text-[10px] text-emerald-800 font-bold underline hover:text-emerald-950"
                              >
                                Set Timings
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Presence Badge (DB-Evaluated Status) */}
                      <div className="text-right space-y-0.5">
                        {staff.attendanceEnabled === false ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                            Exempt
                          </span>
                        ) : staff.attendanceToday?.attendanceType === 'LATE' || staff.attendanceToday?.isLate ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-900 border border-yellow-300">
                            <Clock className="w-3 h-3 text-yellow-700" />
                            Late {staff.attendanceToday?.delayMinutes ? `(${staff.attendanceToday.delayMinutes}m)` : ''}
                          </span>
                        ) : staff.attendanceToday?.attendanceType === 'HALF_DAY' || staff.attendanceToday?.isHalfDay ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-900 border border-orange-300" title={staff.attendanceToday?.statusReason || 'Half Day'}>
                            <Clock className="w-3 h-3 text-orange-700" />
                            Half Day
                          </span>
                        ) : isOnFloor ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            ● On Floor
                          </span>
                        ) : isShiftCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                            <CheckCircle2 className="w-3 h-3 text-blue-600" />
                            Shift Done
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                            ○ Absent
                          </span>
                        )}

                        {staff.attendanceToday?.checkInAt && (
                          <span className="block text-[10px] text-content-muted font-mono">
                            In: {staff.attendanceToday.checkInTimeIST || formatISTTime12h(staff.attendanceToday.checkInAt)}
                          </span>
                        )}
                        {staff.attendanceToday?.checkOutAt && (
                          <span className="block text-[10px] text-blue-700 font-mono">
                            Out: {staff.attendanceToday.checkOutTimeIST || formatISTTime12h(staff.attendanceToday.checkOutAt)}
                          </span>
                        )}
                        {staff.attendanceToday?.statusReason && (
                          <span className="block text-[9px] text-amber-900/80 font-medium max-w-[140px] truncate" title={staff.attendanceToday.statusReason}>
                            {staff.attendanceToday.statusReason}
                          </span>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditStaff(staff)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-cream hover:bg-emerald-50 text-brand-forest border border-border-subtle text-[10px] font-bold shadow-sm"
                            title="Edit Staff & Shift Timings"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-brand-forest" />
                            <span>Shift</span>
                          </button>
                          {staff.attendanceToday?.checkInPhotoPath && (
                            <button
                              type="button"
                              onClick={() => setViewingAttendancePhoto({
                                staffName: staff.staffMember.fullName,
                                role: staff.positionCategory?.name || staff.role,
                                checkInAt: staff.attendanceToday?.checkInAt,
                                checkInPhotoPath: staff.attendanceToday?.checkInPhotoPath,
                                checkOutAt: staff.attendanceToday?.checkOutAt,
                                checkOutPhotoPath: staff.attendanceToday?.checkOutPhotoPath,
                              })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold shadow-sm"
                            >
                              <Camera className="w-3 h-3 text-emerald-700" />
                              <span>Selfie</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Attendance Action Buttons (today only — past dates are view-only) */}
                    {(() => {
                      const n = new Date();
                      const todayKey = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
                      return selectedDate !== todayKey;
                    })() ? (
                      <div className="pt-2 border-t border-border-subtle/50 text-[10px] font-bold text-content-muted text-center">
                        View only — attendance can be marked only for today.
                      </div>
                    ) : (
                    <div className="pt-2 border-t border-border-subtle/50 flex items-center gap-2">
                      {!isPresent ? (
                        <>
                          {/* Mark Present is commented out for supervisor: Staff marks attendance via self photo/check-in
                          <button
                            disabled={isMarking}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'PRESENT')}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isMarking ? 'Marking...' : 'Mark Present'}</span>
                          </button>
                          */}
                          <button
                            disabled={isMarking}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'HALF_DAY')}
                            className="flex-1 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                            <span>{isMarking ? 'Updating...' : 'Mark Half Day'}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            disabled={isMarking || isShiftCompleted}
                            onClick={() => handleMarkStaffAttendance(staff.staffMember.id, 'CHECK_OUT')}
                            className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold shadow-sm flex items-center justify-center gap-1 transition-all ${
                              isShiftCompleted
                                ? 'bg-blue-50 text-blue-800 border border-blue-200 opacity-80 cursor-default'
                                : 'bg-brand-forest hover:bg-emerald-900 text-white disabled:opacity-50'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{isShiftCompleted ? 'Shift Completed' : 'Check Out'}</span>
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
                    )}
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
                Supervisor: {user?.staffMember?.fullName || 'Supervisor'}
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
                  const summaryText = `*Tumbledry (${activeShopName || 'Branch'}) - Operations Summary*\nDate: ${attendanceDate}\nSupervisor: ${user?.staffMember?.fullName || 'Supervisor'}\nStaff on Floor: ${presentTrackedStaff.length}/${attendanceTrackedStaff.length}\nGarments Handled: ${dashboardData?.todayTasks.completed ?? 0}/${dashboardData?.todayTasks.total ?? 0} pieces\nDamages: 0 reported`;
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

      {/* Reused Staff DamageModal for Task Creation */}
      <DamageModal
        isOpen={isTaskDamageModalOpen}
        onClose={() => setIsTaskDamageModalOpen(false)}
        shopId={activeShopId || ''}
        orderId={taskOrderId || undefined}
        pieceNumber={typeof taskDamage.pieceNumber === 'number' ? taskDamage.pieceNumber : 1}
        initialPhoto={taskDamage.photoPath}
        initialNotes={taskDamage.notes}
        title="Attach Pre-existing Damage Evidence"
        allowPieceNumberChange={true}
        onCapture={(data) => {
          setTaskDamage({
            hasDamage: true,
            photoPath: data.photoPath,
            notes: data.notes,
            pieceNumber: data.pieceNumber || 1,
          });
        }}
      />

      {/* Damage Incident Evidence Viewer Modal */}
      {viewingDamageIncident && (
        <DamageIncidentViewerModal
          isOpen={true}
          onClose={() => setViewingDamageIncident(null)}
          incident={viewingDamageIncident}
          shopId={activeShopId || ''}
          canManage={true}
          onUpdated={() => {
            if (selectedStaff) {
              fetchStaffDayTasks(selectedStaff.staffMember.id, staffTaskDate);
            }
          }}
        />
      )}

      {/* Attendance Photo Viewer Modal */}
      {viewingAttendancePhoto && (
        <AttendancePhotoViewerModal
          isOpen={true}
          onClose={() => setViewingAttendancePhoto(null)}
          staffName={viewingAttendancePhoto.staffName}
          role={viewingAttendancePhoto.role}
          checkInAt={viewingAttendancePhoto.checkInAt}
          checkInPhotoPath={viewingAttendancePhoto.checkInPhotoPath}
          checkOutAt={viewingAttendancePhoto.checkOutAt}
          checkOutPhotoPath={viewingAttendancePhoto.checkOutPhotoPath}
        />
      )}

      {/* ─── Supervisor Notifications & Alerts Modal ─── */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-clay border border-border-subtle space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-brand-forest">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-forest">Shop Alerts</h3>
                  <p className="text-[10px] text-content-muted">{activeShopName || 'Branch'} • {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                </div>
              </div>
              <button
                onClick={() => setIsNotificationsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {/* Absent Staff Alert */}
              {absentTrackedStaff.length > 0 ? (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-red-900 block">{absentTrackedStaff.length} Staff Absent Today</span>
                    <p className="text-[11px] text-red-700 font-medium">
                      {absentTrackedStaff.map((s) => s.staffMember.fullName).join(', ')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-xs text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All tracked staff are present on duty!</span>
                </div>
              )}

              {/* Pending Tasks Alert */}
              {(dashboardData?.todayTasks?.pending ?? 0) > 0 ? (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-amber-900 block">Pending Task Units ({dashboardData?.todayTasks?.pending})</span>
                    <p className="text-[11px] text-amber-800 font-medium">
                      {dashboardData?.todayTasks?.completed} of {dashboardData?.todayTasks?.total} units completed so far.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle flex items-center gap-2 text-xs text-brand-forest font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No pending tasks waiting.</span>
                </div>
              )}

              {/* On Floor Presence */}
              <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-between text-xs">
                <span className="text-content-muted font-bold">Active On Floor</span>
                <span className="font-black text-emerald-800">{activeOnFloorStaff.length} Staff</span>
              </div>
            </div>

            <button
              onClick={() => setIsNotificationsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-brand-forest hover:bg-emerald-900 text-white text-xs font-black transition-all shadow-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Shift / Reschedule Task Modal ─────────────────── */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border-subtle shadow-clay p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 shadow-clay-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-brand-forest">Shift Task to Another Date</h3>
                  <p className="text-[11px] text-content-muted">Reschedule pending task to a new target date</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Task Info Summary */}
            <div className="p-3 rounded-2xl bg-surface-cream/70 border border-border-subtle space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-brand-forest">
                  {rescheduleTarget.orderId ? `Order #${rescheduleTarget.orderId}` : 'Assigned Task'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-content-muted border border-border-subtle">
                  {rescheduleTarget.serviceType?.name || rescheduleTarget.workflowProfile?.name || 'Garment Task'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-content-muted">
                <span>Staff: <strong>{selectedStaff?.staffMember.fullName || 'Staff Member'}</strong></span>
                <span>Current Date: <strong>{staffTaskDate}</strong></span>
              </div>
              <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200 font-semibold flex items-center justify-between">
                <span>Pending Units:</span>
                <span className="font-mono font-bold">
                  {rescheduleTarget.taskUnits.filter((u) => u.status !== 'COMPLETED').length} / {rescheduleTarget.taskUnits.length}
                </span>
              </div>
              <div className="text-[11px] text-indigo-900 bg-indigo-50/80 px-2.5 py-1.5 rounded-xl border border-indigo-200 leading-snug">
                <span className="font-bold">Historical Trace:</span> Original record for {staffTaskDate} will stay intact with its pending status preserved. A duplicate task with pending units will be assigned on {rescheduleDate}.
              </div>
              {rescheduleTarget?.notes?.includes('[Rolled over from') && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 leading-snug">
                  <span className="font-bold">Rollback Protection:</span> If you shift back to the origin date ({rescheduleTarget.notes.match(/\[Rolled over from ([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1]}), this shift will be rolled back cleanly and the original task will be restored without creating any duplicate tasks.
                </div>
              )}
            </div>

            {/* Target Date Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-brand-forest">
                Select New Target Date *
              </label>

              {/* Quick Date Pills */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRescheduleDate(localDateKey())}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                    rescheduleDate === localDateKey()
                      ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                      : 'bg-surface-cream text-brand-forest border-border-subtle hover:bg-surface-hover'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleDate(addDaysToDateKey(localDateKey(), 1))}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                    rescheduleDate === addDaysToDateKey(localDateKey(), 1)
                      ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                      : 'bg-surface-cream text-brand-forest border-border-subtle hover:bg-surface-hover'
                  }`}
                >
                  Tomorrow
                </button>
              </div>

              {/* Date Input */}
              <div>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest cursor-pointer"
                />
              </div>
            </div>

            {/* Optional Reschedule Reason / Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-brand-forest">
                Reason / Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Incomplete on previous date, shifted to tomorrow"
                value={rescheduleNotes}
                onChange={(e) => setRescheduleNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs text-brand-forest focus:ring-1 focus:ring-brand-forest"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle bg-surface-cream text-content-muted text-xs font-bold hover:text-brand-forest transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRescheduling || !rescheduleDate}
                onClick={handleConfirmReschedule}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isRescheduling ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Shifting...</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Confirm Shift</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Shift / Operation Feedback Toast */}
      {taskFeedback && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-clay flex items-center gap-3 animate-fade-in text-xs font-bold border ${
          taskFeedback.type === 'error'
            ? 'bg-rose-950 text-white border-rose-500'
            : 'bg-brand-forest text-white border-brand-lime'
        }`}>
          {taskFeedback.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-brand-lime shrink-0" />
          )}
          <span>{taskFeedback.message}</span>
        </div>
      )}
    </div>
  );
}
