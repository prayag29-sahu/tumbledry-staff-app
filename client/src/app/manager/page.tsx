'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  ServiceType,
  WorkflowProfile,
} from '../../types';
import { localDateKey, addDaysToDateKey, resolveDutyTiming, formatTime12h } from '../../lib/dateUtils';
import { StaffProfileCard } from '../../components/StaffProfileCard';
import {
  Users,
  Calendar,
  Phone,
  MapPin,
  Clock,
  CreditCard,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  CalendarCheck2,
  BarChart3,
  User,
  Plus,
  Camera,
  RefreshCw,
  LogOut,
  Check,
  Send,
  AlertTriangle,
  X,
  Briefcase,
  History,
  PhoneCall,
  MessageSquare,
} from 'lucide-react';
import {
  DamageIncidentViewerModal,
  DamageIncidentRecord,
} from '../../components/DamageIncidentViewerModal';
import { DamageModal } from '../../components/DamageModal';
import { LiveCameraModal } from '../../components/LiveCameraModal';
import { AttendancePhotoViewerModal } from '../../components/AttendancePhotoViewerModal';
import { StaffExtraDetails } from '../../components/owner/StaffExtraDetails';

/** Human-understandable representation of system permissions */
const HUMAN_CAPABILITIES: Record<string, { label: string; desc: string; icon: string }> = {
  'staff.read': { label: 'View Staff Team', desc: 'Can view staff directory and employee profiles', icon: '👥' },
  'staff.create': { label: 'Add New Staff', desc: 'Can register new staff members to this store', icon: '➕' },
  'staff.update': { label: 'Edit Staff Details', desc: 'Can update staff profiles and work schedules', icon: '✏️' },
  'staff.archive': { label: 'Deactivate Staff', desc: 'Can remove or deactivate staff accounts', icon: '📁' },
  'tasks.read_team': { label: 'View Team Tasks', desc: 'Can view all garment tasks across the workshop', icon: '📋' },
  'tasks.assign': { label: 'Assign Daily Tasks', desc: 'Can assign garment processing tasks to floor staff', icon: '✍️' },
  'tasks.read_self': { label: 'View Own Tasks', desc: 'Can view personal assigned tasks', icon: '👤' },
  'tasks.complete': { label: 'Complete Tasks', desc: 'Can mark tasks and garments as finished', icon: '✅' },
  'attendance.self': { label: 'Self Attendance Clock-In', desc: 'Can clock in/out with front-camera live selfie', icon: '📸' },
  'attendance.read_team': { label: 'Team Attendance', desc: 'Can view and verify staff attendance records', icon: '📅' },
  'damage.read': { label: 'View Damage Reports', desc: 'Can inspect reported garment damage with photos', icon: '🔍' },
  'damage.report': { label: 'Report Damaged Clothes', desc: 'Can file damage incident reports for review', icon: '⚠️' },
  'reports.read': { label: 'Operations & Daily Reports', desc: 'Can view daily summaries, output and store metrics', icon: '📊' },
  'custom_fields.manage': { label: 'Manage Custom Fields', desc: 'Can configure job roles and custom data fields', icon: '⚙️' },
  '*': { label: 'Full Store Administration', desc: 'Complete access to all store operations and settings', icon: '👑' },
};

/** Helper to extract address / location and remaining clean notes from assignment notes */
function parseAssignmentNotes(notes?: string | null) {
  if (!notes) return { location: null, cleanNotes: null };
  const parts = notes.split(' | ');
  let location: string | null = null;
  const remainingParts: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.toLowerCase().startsWith('location:')) {
      location = trimmed.replace(/^location:\s*/i, '').trim();
    } else if (trimmed) {
      remainingParts.push(trimmed);
    }
  }

  return {
    location: location || null,
    cleanNotes: remainingParts.length > 0 ? remainingParts.join(' | ') : null,
  };
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

interface StaffAttendance {
  isPresent: boolean;
  isOnFloor?: boolean;
  isShiftCompleted?: boolean;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  checkInPhotoPath?: string | null;
  checkOutPhotoPath?: string | null;
}

interface ManagerStaffItem {
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
  };
  positionCategory?: StaffPositionWithWorkflow | null;
  account?: { id: string; username: string; status: string } | null;
  joiningDate?: string | null;
  monthlySalary?: number | null;
  dutyTimingNotes?: string | null;
  incentiveAmount?: number | null;
  attendanceEnabled?: boolean;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  lateThreshold?: string | null;
  halfDayThreshold?: string | null;
  absentThreshold?: string | null;
  attendanceToday: StaffAttendance;
  /** Work-counting rule set directly on this staff member (Owner > Workforce) */
  workflowProfile?: WorkflowProfile | null;
}

/** Roles / capabilities that may open the Manager terminal */
const MANAGER_CAPABILITIES = ['tasks.assign', 'attendance.read_team'];

type StaffPositionWithWorkflow = { id: string; name: string; workflowProfile?: WorkflowProfile | null };

interface DashboardMetrics {
  /** YYYY-MM-DD the numbers belong to (server business-timezone day) */
  date?: string;
  totalStaff: number;
  totalEmployees?: number;
  presentCount: number;
  activeOnFloorCount?: number;
  completedShiftCount?: number;
  halfDayCount?: number;
  absentCount: number;
  todayTasks: {
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  };
  departmentBreakdown: {
    wash: { name: string; total: number; completed: number; percentage: number };
    iron: { name: string; total: number; completed: number; percentage: number };
    dryClean: { name: string; total: number; completed: number; percentage: number };
    packaging: { name: string; total: number; completed: number; percentage: number };
    pickup?: { name: string; total: number; completed: number; percentage: number };
  };
  /** Per-service KPI built from the shop's DB service catalogue */
  serviceBreakdown?: Array<{
    id: string;
    code: string;
    name: string;
    orders: number;
    pieces: number;
    totalUnits: number;
    completedUnits: number;
    percentage: number;
  }>;
  exemptCount?: number;
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

interface StaffTaskUnit {
  id: string;
  unitType: string;
  status: string;
  activityCode?: string | null;
  pieceNumber?: number | null;
  completedAt?: string | null;
  damageIncidents?: DamageIncidentRecord[];
}

interface StaffAssignment {
  id: string;
  orderId?: string | null;
  pieceCount?: number | null;
  pickupCount?: number | null;
  customerMobile?: string | null;
  notes?: string | null;
  workflowProfileId?: string | null;
  serviceTypeId?: string | null;
  workflowProfile: { workflowType: string; name: string };
  serviceType?: { name: string; code: string } | null;
  taskUnits: StaffTaskUnit[];
  damageIncidents?: DamageIncidentRecord[];
  createdAt: string;
}

function ManagerPageInner() {
  const router = useRouter();
  const { user, activeShopId, activeShopName, activeRole, isLoading: isAuthLoading, logout, hasCapability, refreshUser } = useAuth();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ─── Access control: only Owner / Manager / Supervisor (or users holding manager
  // capabilities in the ACTIVE shop) may open this terminal. Everyone else is sent
  // to their own dashboard; logged-out users go to /login.
  const isManagerAllowed = useMemo(() => {
    if (!user) return false;
    if (user.isOwner) return true;
    const role = (activeRole || '').toLowerCase();
    if (role.includes('supervisor')) return false; // Supervisor has its own console
    if (role.includes('manager')) return true;
    // Custom (Owner-created) roles: allowed when their DB permission profile grants manager capabilities
    const membership = user.shopMemberships?.find((m) => m.shopId === activeShopId);
    return !!membership?.capabilities?.some((c) => MANAGER_CAPABILITIES.includes(c));
  }, [user, activeRole, activeShopId]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isManagerAllowed) {
      const role = (activeRole || '').toLowerCase();
      if (role.includes('supervisor')) router.replace('/supervisor');
      else if (role.includes('iron')) router.replace('/ironman');
      else if (role.includes('wash')) router.replace('/washerman');
      else if (role.includes('deliver')) router.replace('/delivery');
      else router.replace('/');
    }
  }, [isAuthLoading, user, isManagerAllowed, activeRole, router]);

  // Navigation State (5 Main Screens via Bottom Nav)
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'staff' | 'attendance' | 'reports' | 'profile'>('dashboard');
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  // Damage Incident Viewer
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState<Record<string, boolean>>({});

  // Drilldown States
  // 'staff_details' | 'create_task' | null
  const [activeDrilldown, setActiveDrilldown] = useState<'staff_details' | 'create_task' | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<ManagerStaffItem | null>(null);

  // Profile Details Tab inside Staff Details (Screen 4: Overview, Tasks, Attendance, Performance)
  const [staffProfileTab, setStaffProfileTab] = useState<'overview' | 'tasks' | 'attendance' | 'performance'>('overview');

  // Manager Profile Subtab (Screen 10: Attendance vs Profile Details)
  const [managerProfileSubtab, setManagerProfileSubtab] = useState<'attendance' | 'details'>('attendance');

  // Shared Filters & Dates
  const [selectedDate, setSelectedDate] = useState<string>(localDateKey);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');

  // Data States
  const [dashboardData, setDashboardData] = useState<DashboardMetrics | null>(null);
  const [staffList, setStaffList] = useState<ManagerStaffItem[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Staff Tasks Tab State (Screen 9)
  const [staffTaskDate, setStaffTaskDate] = useState<string>(localDateKey);
  const [staffDayAssignments, setStaffDayAssignments] = useState<StaffAssignment[]>([]);
  const [staffMonthlySummary, setStaffMonthlySummary] = useState<StaffTaskMonthlySummary | null>(null);
  const [isLoadingStaffData, setIsLoadingStaffData] = useState(false);

  // Manager's Own Directives & Tasks (assigned by Supervisor or Owner)
  const [myDirectives, setMyDirectives] = useState<StaffAssignment[]>([]);
  const [isLoadingMyDirectives, setIsLoadingMyDirectives] = useState(false);
  const [completingMyDirectiveId, setCompletingMyDirectiveId] = useState<string | null>(null);

  // Create Task Wizard State (Screens 5, 6, 7, 8)
  const [taskCreateDate, setTaskCreateDate] = useState<string>(localDateKey);
  const [taskOrderId, setTaskOrderId] = useState('');
  const [taskPieces, setTaskPieces] = useState<number | ''>('');
  const [taskServiceTypeId, setTaskServiceTypeId] = useState('');
  const [taskSelectedActivities, setTaskSelectedActivities] = useState<string[]>([]);
  const [deliveryType, setDeliveryType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [taskCustomerMobile, setTaskCustomerMobile] = useState('');
  const [taskPickupLocation, setTaskPickupLocation] = useState('');
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

  // Directive task states for non-floor staff (Manager, Marketing, etc.)
  const [directiveTitle, setDirectiveTitle] = useState('');
  const [directiveNotes, setDirectiveNotes] = useState('');
  const [directivePriority, setDirectivePriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [completingDirectiveId, setCompletingDirectiveId] = useState<string | null>(null);

  // Manager Self Attendance State & Live Camera Selfie Verification
  const [managerSession, setManagerSession] = useState<{ id: string; checkInAt: string; checkOutAt: string | null; status: string; checkInPhotoPath?: string | null; checkOutPhotoPath?: string | null; attendanceType?: string | null } | null>(null);
  const [managerShiftSchedule, setManagerShiftSchedule] = useState<{ shiftStartTime?: string | null; shiftEndTime?: string | null; lateThreshold?: string | null; halfDayThreshold?: string | null; absentThreshold?: string | null } | null>(null);
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [cameraAction, setCameraAction] = useState<'check-in' | 'check-out'>('check-in');
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
  const [attendanceSuccessToast, setAttendanceSuccessToast] = useState<string | null>(null);

  // Edit Personal Details Modal State
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDutyTiming, setEditDutyTiming] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [editDetailsError, setEditDetailsError] = useState<string | null>(null);
  const [editDetailsSuccess, setEditDetailsSuccess] = useState<string | null>(null);

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
      alert('Please select a different target date to shift this task.');
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
      setTaskFeedback({
        type: 'success',
        message: res.message || `Task shifted to ${rescheduleDate} successfully!`,
      });
      if (selectedStaff) {
        fetchStaffDetails(selectedStaff.staffMember.id, staffTaskDate);
      }
      fetchData(true);
      setRescheduleTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to shift task date.');
    } finally {
      setIsRescheduling(false);
    }
  };

  // ─── Monthly Attendance History States ────────────────────────────────────
  const currentNow = new Date();
  const [attendanceViewMode, setAttendanceViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState<number>(currentNow.getMonth() + 1);
  const [selectedAttendanceYear, setSelectedAttendanceYear] = useState<number>(currentNow.getFullYear());
  const [monthlyStaffId, setMonthlyStaffId] = useState<string>('manager');
  const [monthlyAttendanceData, setMonthlyAttendanceData] = useState<{
    sessions: Array<{
      id: string;
      checkInAt: string;
      checkOutAt?: string | null;
      durationMinutes?: number | null;
      status: string;
      attendanceType?: string | null;
      notes?: string | null;
      isLate?: boolean;
      isHalfDay?: boolean;
      delayMinutes?: number | null;
      statusReason?: string | null;
      checkInTimeIST?: string | null;
      checkOutTimeIST?: string | null;
      checkInPhotoPath?: string | null;
      checkOutPhotoPath?: string | null;
    }>;
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
  } | null>(null);
  const [isLoadingAttendanceHistory, setIsLoadingAttendanceHistory] = useState(false);

  // Staff Details Profile Attendance History
  const [staffDrilldownMonth, setStaffDrilldownMonth] = useState<number>(currentNow.getMonth() + 1);
  const [staffDrilldownYear, setStaffDrilldownYear] = useState<number>(currentNow.getFullYear());
  const [staffDrilldownAttendance, setStaffDrilldownAttendance] = useState<{
    sessions: Array<{
      id: string;
      checkInAt: string;
      checkOutAt?: string | null;
      durationMinutes?: number | null;
      status: string;
      attendanceType?: string | null;
      notes?: string | null;
      isLate?: boolean;
      isHalfDay?: boolean;
      delayMinutes?: number | null;
      statusReason?: string | null;
      checkInTimeIST?: string | null;
      checkOutTimeIST?: string | null;
      checkInPhotoPath?: string | null;
      checkOutPhotoPath?: string | null;
    }>;
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
  } | null>(null);
  const [isLoadingStaffDrilldownAttendance, setIsLoadingStaffDrilldownAttendance] = useState(false);

  const lastManagerFetchRef = useRef<number>(0);

  // Fetch Core Dashboard & Staff Data
  const hasLoadedStaticRef = useRef(false);
  // Latest request wins: a slow response for an old date must never overwrite a newer date
  const fetchSeqRef = useRef(0);
  // Per-date cache → switching back to a date is instant while fresh data loads in background
  const dayCacheRef = useRef<Map<string, { dash?: DashboardMetrics; staff?: ManagerStaffItem[] }>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    // Not authenticated / not allowed / no shop yet → stop the spinner (guard handles redirect)
    if (!activeShopId || !isManagerAllowed) {
      if (!isAuthLoading) setIsLoading(false);
      return;
    }
    const seq = ++fetchSeqRef.current;
    const isCurrent = () => seq === fetchSeqRef.current;
    const cacheKey = `${activeShopId}:${selectedDate}`;

    // Show cached numbers for this date immediately (if any)
    const cached = dayCacheRef.current.get(cacheKey);
    if (cached?.dash) setDashboardData(cached.dash);
    if (cached?.staff) setStaffList(cached.staff);

    if (!silent && !cached) setIsLoading(true);
    setIsRefreshing(true);
    lastManagerFetchRef.current = Date.now();

    const loadStatic = !hasLoadedStaticRef.current;
    // Each section updates as soon as ITS response arrives (no waiting for the slowest call)
    const dashP = apiRequest<DashboardMetrics>(`/api/shops/${activeShopId}/supervisor/dashboard?date=${selectedDate}`)
      .then((d) => {
        if (!isCurrent() || !d) return;
        setDashboardData(d);
        dayCacheRef.current.set(cacheKey, { ...dayCacheRef.current.get(cacheKey), dash: d });
        setIsLoading(false);
      })
      .catch(() => null);
    const staffP = apiRequest<{ staff: ManagerStaffItem[] }>(`/api/shops/${activeShopId}/staff?date=${selectedDate}`)
      .then((r) => {
        if (!isCurrent() || !r?.staff) return;
        setStaffList(r.staff);
        dayCacheRef.current.set(cacheKey, { ...dayCacheRef.current.get(cacheKey), staff: r.staff });

        const matched =
          (user?.staffMember?.id ? r.staff.find((s) => s.staffMember.id === user.staffMember?.id || s.staffMemberId === user.staffMember?.id) : null) ||
          (user?.id ? r.staff.find((s) => s.account?.id === user.id) : null) ||
          (user?.username ? r.staff.find((s) => s.account?.username?.toLowerCase() === user.username.toLowerCase()) : null) ||
          (user?.staffMember?.fullName ? r.staff.find((s) => s.staffMember.fullName.toLowerCase() === user.staffMember!.fullName.toLowerCase()) : null) ||
          r.staff.find((s) => s.role.toLowerCase().includes('manager') || s.positionCategory?.name?.toLowerCase().includes('manager'));

        const targetId = user?.staffMember?.id || matched?.staffMember.id || matched?.staffMemberId;
        if (targetId) {
          apiRequest<{ assignments: StaffAssignment[] }>(`/api/shops/${activeShopId}/staff/${targetId}/tasks?date=${selectedDate}`)
            .then((res) => {
              if (isCurrent() && res?.assignments) setMyDirectives(res.assignments);
            })
            .catch(() => null);
        }
      })
      .catch(() => null);
    const sessP = apiRequest<{
      session: { id: string; checkInAt: string; checkOutAt: string | null; status: string; checkInPhotoPath?: string | null; checkOutPhotoPath?: string | null; attendanceType?: string | null } | null;
      shiftSchedule?: { shiftStartTime?: string | null; shiftEndTime?: string | null; lateThreshold?: string | null; halfDayThreshold?: string | null; absentThreshold?: string | null } | null;
    }>(
      `/api/shops/${activeShopId}/attendance/my-session?date=${selectedDate}`
    )
      .then((r) => {
        if (isCurrent() && r) {
          if (r.session !== undefined) setManagerSession(r.session);
          if (r.shiftSchedule !== undefined) setManagerShiftSchedule(r.shiftSchedule);
        }
      })
      .catch(() => null);
    const staticP = loadStatic
      ? Promise.all([
        apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types').catch(() => null),
        apiRequest<{ profiles: WorkflowProfile[] }>('/api/config/workflow-profiles').catch(() => null),
      ]).then(([svcRes, wfRes]) => {
        if (svcRes?.serviceTypes) setServices(svcRes.serviceTypes.filter((s) => s.isActive !== false));
        if (wfRes?.profiles) setWorkflowProfiles(wfRes.profiles);
        if (svcRes && wfRes) hasLoadedStaticRef.current = true;
      })
      : Promise.resolve();

    try {
      await Promise.all([dashP, staffP, sessP, staticP]);
    } catch (err) {
      console.error('Failed to load manager workspace:', err);
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeShopId, isManagerAllowed, isAuthLoading, selectedDate]);

  // Refetch when the shop or selected date changes (tab switches reuse the loaded data)
  useEffect(() => {
    fetchData(hasLoadedStaticRef.current);
  }, [fetchData]);

  // Auto-refresh when window receives focus or returns to view (throttled to 30s)
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastManagerFetchRef.current > 30000) {
        lastManagerFetchRef.current = now;
        fetchData(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastManagerFetchRef.current > 30000) {
          lastManagerFetchRef.current = now;
          fetchData(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData]);

  // Fetch individual staff member's tasks and monthly metrics
  const fetchStaffDetails = useCallback(async (staffMemberId: string, date: string) => {
    if (!activeShopId) return;
    setIsLoadingStaffData(true);
    try {
      const targetDate = new Date(date);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      const [dayTasksRes, monthRes] = await Promise.all([
        apiRequest<{ assignments: StaffAssignment[] }>(`/api/shops/${activeShopId}/staff/${staffMemberId}/tasks?date=${date}`).catch(() => ({ assignments: [] })),
        apiRequest<StaffTaskMonthlySummary>(`/api/shops/${activeShopId}/staff/${staffMemberId}/task-summary/monthly?year=${year}&month=${month}`).catch(() => null),
      ]);

      setStaffDayAssignments(dayTasksRes.assignments || []);
      setStaffMonthlySummary(monthRes);
    } catch {
      setStaffDayAssignments([]);
      setStaffMonthlySummary(null);
    } finally {
      setIsLoadingStaffData(false);
    }
  }, [activeShopId]);

  // When staff details drilldown is opened or staffTaskDate changes
  useEffect(() => {
    if (selectedStaff) {
      fetchStaffDetails(selectedStaff.staffMember.id, staffTaskDate);
    }
  }, [selectedStaff, staffTaskDate, fetchStaffDetails]);

  // Fetch Attendance History for Floor Attendance Screen (Screen 3)
  const fetchMonthlyAttendance = useCallback(async (targetStaffId: string, year: number, month: number) => {
    if (!activeShopId) return;
    setIsLoadingAttendanceHistory(true);
    try {
      if (targetStaffId === 'manager') {
        const res = await apiRequest<{
          year: number;
          month: number;
          summary: {
            totalSessions: number;
            presentDays: number;
            lateDays: number;
            halfDays: number;
            absentDays: number;
            totalHoursWorked: number;
          };
          records: Array<{
            id: string;
            date: string;
            checkInAt: string;
            checkOutAt?: string | null;
            durationMinutes?: number | null;
            status: string;
            attendanceType?: string | null;
            isLate?: boolean;
            isHalfDay?: boolean;
            delayMinutes?: number | null;
            statusReason?: string | null;
            checkInTimeIST?: string | null;
            checkOutTimeIST?: string | null;
            checkInPhotoPath?: string | null;
            checkOutPhotoPath?: string | null;
          }>;
        }>(`/api/shops/${activeShopId}/attendance/my-history?year=${year}&month=${month}`);

        const normalizedSessions = (res.records || []).map((r) => ({
          id: r.id,
          checkInAt: r.checkInAt,
          checkOutAt: r.checkOutAt,
          durationMinutes: r.durationMinutes,
          status: r.status,
          attendanceType: r.attendanceType,
          isLate: r.isLate,
          isHalfDay: r.isHalfDay,
          delayMinutes: r.delayMinutes,
          statusReason: r.statusReason,
          checkInTimeIST: r.checkInTimeIST,
          checkOutTimeIST: r.checkOutTimeIST,
          checkInPhotoPath: r.checkInPhotoPath,
          checkOutPhotoPath: r.checkOutPhotoPath,
        }));

        setMonthlyAttendanceData({
          sessions: normalizedSessions,
          summary: {
            presentCount: res.summary?.presentDays ?? 0,
            fullDayCount: res.summary?.presentDays ?? 0,
            lateCount: res.summary?.lateDays ?? 0,
            halfDayCount: res.summary?.halfDays ?? 0,
            absentCount: res.summary?.absentDays ?? 0,
          },
          year: res.year,
          month: res.month,
        });
      } else {
        const res = await apiRequest<{
          sessions: Array<{
            id: string;
            checkInAt: string;
            checkOutAt?: string | null;
            durationMinutes?: number | null;
            status: string;
            attendanceType?: string | null;
            notes?: string | null;
            isLate?: boolean;
            isHalfDay?: boolean;
            delayMinutes?: number | null;
            statusReason?: string | null;
            checkInTimeIST?: string | null;
            checkOutTimeIST?: string | null;
            checkInPhotoPath?: string | null;
            checkOutPhotoPath?: string | null;
          }>;
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
        }>(`/api/shops/${activeShopId}/staff/${targetStaffId}/attendance?year=${year}&month=${month}`);

        setMonthlyAttendanceData({
          sessions: res.sessions || [],
          summary: res.summary,
          year: res.year,
          month: res.month,
        });
      }
    } catch {
      setMonthlyAttendanceData(null);
    } finally {
      setIsLoadingAttendanceHistory(false);
    }
  }, [activeShopId]);

  // Fetch Attendance History for Staff Profile Drilldown
  const fetchStaffDrilldownAttendance = useCallback(async (staffMemberId: string, year: number, month: number) => {
    if (!activeShopId) return;
    setIsLoadingStaffDrilldownAttendance(true);
    try {
      const res = await apiRequest<{
        sessions: Array<{
          id: string;
          checkInAt: string;
          checkOutAt?: string | null;
          durationMinutes?: number | null;
          status: string;
          attendanceType?: string | null;
          notes?: string | null;
          isLate?: boolean;
          isHalfDay?: boolean;
          delayMinutes?: number | null;
          statusReason?: string | null;
          checkInTimeIST?: string | null;
          checkOutTimeIST?: string | null;
          checkInPhotoPath?: string | null;
          checkOutPhotoPath?: string | null;
        }>;
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
      }>(`/api/shops/${activeShopId}/staff/${staffMemberId}/attendance?year=${year}&month=${month}`);

      setStaffDrilldownAttendance({
        sessions: res.sessions || [],
        summary: res.summary,
        year: res.year,
        month: res.month,
      });
    } catch {
      setStaffDrilldownAttendance(null);
    } finally {
      setIsLoadingStaffDrilldownAttendance(false);
    }
  }, [activeShopId]);

  // Auto-fetch Monthly History for Floor Attendance when switched or target changes
  useEffect(() => {
    if (currentNav === 'attendance' && attendanceViewMode === 'monthly') {
      fetchMonthlyAttendance(monthlyStaffId, selectedAttendanceYear, selectedAttendanceMonth);
    }
  }, [currentNav, attendanceViewMode, monthlyStaffId, selectedAttendanceYear, selectedAttendanceMonth, fetchMonthlyAttendance]);

  // Auto-fetch Staff Profile Attendance when drilldown tab opens
  useEffect(() => {
    if (activeDrilldown === 'staff_details' && selectedStaff && staffProfileTab === 'attendance') {
      fetchStaffDrilldownAttendance(selectedStaff.staffMember.id, staffDrilldownYear, staffDrilldownMonth);
    }
  }, [activeDrilldown, selectedStaff, staffProfileTab, staffDrilldownYear, staffDrilldownMonth, fetchStaffDrilldownAttendance]);

  /**
   * Resolve how a staff member's work is counted — 100% from the database:
   *   1. Rule set directly on the staff membership (Owner > Workforce)
   *   2. Rule inherited from the staff member's Job Role (Owner > Catalogues)
   * No name-based guessing: if neither is set, the Create Task wizard shows a
   * banner asking the Owner to configure "How is their daily work counted?".
   */
  const resolveStaffWorkflow = useCallback((staff: ManagerStaffItem | null): WorkflowProfile | null => {
    if (!staff) return null;
    const direct = staff.workflowProfile ?? staff.positionCategory?.workflowProfile ?? null;
    if (!direct) return null;
    // Prefer the full record from the catalogue (has latest allowedActivities)
    return workflowProfiles.find((w) => w.id === direct.id) ?? direct;
  }, [workflowProfiles]);

  const selectedStaffWorkflow = useMemo(() => resolveStaffWorkflow(selectedStaff), [resolveStaffWorkflow, selectedStaff]);
  const isOrderBasedStaff =
    selectedStaffWorkflow?.workflowType === 'PER_ORDER' || selectedStaffWorkflow?.workflowType === 'COUNT_BASED';
  const perOrderProfile = useMemo(
    () => (selectedStaffWorkflow?.workflowType === 'PER_ORDER' ? selectedStaffWorkflow : workflowProfiles.find((w) => w.workflowType === 'PER_ORDER') ?? null),
    [selectedStaffWorkflow, workflowProfiles]
  );
  const countBasedProfile = useMemo(
    () => (selectedStaffWorkflow?.workflowType === 'COUNT_BASED' ? selectedStaffWorkflow : workflowProfiles.find((w) => w.workflowType === 'COUNT_BASED') ?? null),
    [selectedStaffWorkflow, workflowProfiles]
  );

  /** Work steps offered = steps allowed by the staff's rule ∩ steps of the chosen service (Owner > Catalogues). */
  const availableActivities = useMemo(() => {
    if (!selectedStaffWorkflow || isOrderBasedStaff) return [] as string[];
    const allowed = selectedStaffWorkflow.allowedActivities || [];
    const svc = services.find((s) => s.id === taskServiceTypeId);
    const svcSteps = svc?.activityMappings?.map((m) => m.activityType.code) ?? [];
    if (svcSteps.length === 0) return allowed;
    const both = allowed.filter((a) => svcSteps.includes(a));
    return both.length > 0 ? both : allowed;
  }, [selectedStaffWorkflow, isOrderBasedStaff, services, taskServiceTypeId]);

  // Pre-tick every available step whenever the staff member or service changes
  useEffect(() => {
    setTaskSelectedActivities(availableActivities);
  }, [availableActivities]);

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

  // Open Create Task drilldown for a specific staff member
  const handleOpenCreateTask = (staff: ManagerStaffItem) => {
    setSelectedStaff(staff);
    setTaskFeedback(null);
    setTaskCreateDate(selectedDate);
    setTaskOrderId('');
    setTaskPieces('');
    setTaskCustomerMobile('');
    setTaskPickupLocation('');
    setTaskNotes('');
    setDirectiveTitle('');
    setDirectiveNotes('');
    setDirectivePriority('NORMAL');

    const wf = resolveStaffWorkflow(staff);
    setDeliveryType(wf?.workflowType === 'COUNT_BASED' ? 'PICKUP' : 'DELIVERY');

    if (services.length > 0) {
      setTaskServiceTypeId(services[0].id);
    }

    setActiveDrilldown('create_task');
  };

  // Submit Task Assignment (Screens 5, 6, 7, 8)
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !selectedStaff) return;

    setTaskFeedback(null);
    setIsSubmittingTask(true);

    try {
      const isFloor = isSelectedStaffFloor();
      const idempotencyKey = `mgr-task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      if (!isFloor) {
        // Managerial / Operational Directive Task (Manager, Marketing Manager, Store Keeper, etc.)
        if (!directiveTitle.trim()) throw new Error('Please enter a directive or task title.');

        const combinedNotes = [
          directivePriority !== 'NORMAL' ? `[Priority: ${directivePriority}]` : '',
          directiveNotes.trim(),
        ].filter(Boolean).join(' | ');

        const payload = {
          assignmentDate: taskCreateDate,
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
        let workflowProfileId = '';

        if (isOrderBasedStaff) {
          const wf = deliveryType === 'DELIVERY' ? perOrderProfile : countBasedProfile;
          if (!wf) throw new Error(`No "${deliveryType === 'DELIVERY' ? 'Per Order' : 'Count Based'}" work-counting rule exists. Ask the Owner to add it in Catalogues.`);
          workflowProfileId = wf.id;
        } else {
          if (!selectedStaffWorkflow) throw new Error('This staff member has no work-counting rule. Ask the Owner to set it in Catalogues > Job Roles.');
          workflowProfileId = selectedStaffWorkflow.id;
        }

        const payload: Record<string, unknown> = {
          assignmentDate: taskCreateDate,
          workflowProfileId,
          idempotencyKey,
        };

        if (isOrderBasedStaff) {
          if (deliveryType === 'DELIVERY') {
            if (!taskOrderId.trim()) throw new Error('Order ID is required for delivery.');
            payload.orderId = taskOrderId.trim();
            if (taskPieces) payload.pieceCount = Number(taskPieces);
            const cleanMobile = taskCustomerMobile.replace(/\D/g, '');
            if (cleanMobile) payload.customerMobile = cleanMobile;
            const combinedNotes = [
              taskPickupLocation.trim() ? `Location: ${taskPickupLocation.trim()}` : '',
              taskNotes.trim(),
            ].filter(Boolean).join(' | ');
            if (combinedNotes) payload.notes = combinedNotes;
          } else {
            const cleanMobile = taskCustomerMobile.replace(/\D/g, '');
            if (!cleanMobile || cleanMobile.length < 10) throw new Error('Valid 10-digit Guest Mobile Number is required for pickup.');
            payload.customerMobile = cleanMobile;
            payload.pickupCount = 1;
            const combinedNotes = [
              taskPickupLocation.trim() ? `Location: ${taskPickupLocation.trim()}` : '',
              taskNotes.trim(),
            ].filter(Boolean).join(' | ');
            if (combinedNotes) payload.notes = combinedNotes;
          }
        } else {
          // Washerman / Ironman / Piece Activity
          if (!taskOrderId.trim()) throw new Error('Order ID is required.');
          if (!taskPieces || Number(taskPieces) < 1) throw new Error('Piece count must be at least 1.');
          if (taskSelectedActivities.length === 0) throw new Error('Select at least one activity.');

          payload.orderId = taskOrderId.trim();
          payload.pieceCount = Number(taskPieces);
          payload.serviceTypeId = taskServiceTypeId || undefined;
          payload.selectedActivities = taskSelectedActivities;
          if (taskNotes.trim()) payload.notes = taskNotes.trim();
        }

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
        setTaskCustomerMobile('');
        setTaskPickupLocation('');
        setTaskNotes('');
        setTaskDamage({
          hasDamage: false,
          pieceNumber: 1,
          notes: '',
          photoPath: null,
        });
      }

      // Refresh today's assignments for this staff
      fetchStaffDetails(selectedStaff.staffMember.id, taskCreateDate);
      fetchData();
    } catch (err: unknown) {
      setTaskFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to assign task.',
      });
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Toggle activity checkbox (Wash, Dry, Iron, Fold, Pack)
  const toggleActivity = (code: string) => {
    setTaskSelectedActivities((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Handle Direct Live Camera Selfie Capture for Manager Check-In / Check-Out
  const handleCameraPhotoCapture = async (photoBase64: string) => {
    if (!activeShopId) return;
    setIsProcessingAttendance(true);
    setAttendanceMessage(null);

    try {
      const endpoint = `/api/shops/${activeShopId}/attendance/${cameraAction}`;
      const res = await apiRequest<{ message: string; checkInAt?: string; checkOutAt?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          photoPath: photoBase64,
        }),
      });

      const msg = res.message || (cameraAction === 'check-in' ? 'Checked in successfully with live selfie!' : 'Checked out successfully with live selfie!');
      setAttendanceSuccessToast(msg);
      setTimeout(() => setAttendanceSuccessToast(null), 4000);
      setIsLiveCameraOpen(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Attendance operation failed.');
    } finally {
      setIsProcessingAttendance(false);
    }
  };


  
  // Check-in and Check-out timing window calculations (IST)
  const timingWindow = useMemo(() => {
    if (!managerShiftSchedule?.shiftEndTime) {
      return {
        isCheckInAllowed: true,
        checkInReason: '',
        isCheckOutAllowed: true,
        checkOutReason: '',
      };
    }
    const clean = managerShiftSchedule.shiftEndTime.trim().toUpperCase().replace(/[AP]M/g, '').trim();
    const [hStr, mStr] = clean.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    if (managerShiftSchedule.shiftEndTime.toUpperCase().includes('PM') && h < 12) h += 12;
    if (managerShiftSchedule.shiftEndTime.toUpperCase().includes('AM') && h === 12) h = 0;
    const shiftEndMin = h * 60 + m;
    const checkoutCloseMin = shiftEndMin + 90;

    let dispH = Math.floor(shiftEndMin / 60);
    const dispM = String(shiftEndMin % 60).padStart(2, '0');
    const ampm = dispH >= 12 ? 'PM' : 'AM';
    dispH = dispH % 12 || 12;
    const shiftEndLabel = `${String(dispH).padStart(2, '0')}:${dispM} ${ampm}`;

    const now = new Date();
    const istStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const [nowH, nowM] = istStr.split(':').map(Number);
    const currentMin = (nowH || 0) * 60 + (nowM || 0);

    const isCheckInAllowed = currentMin < shiftEndMin;
    const checkInReason = isCheckInAllowed
      ? ''
      : `Check-in closed (Shift ended at ${shiftEndLabel} IST)`;

    const isBeforeEnd = currentMin < shiftEndMin;
    const isPastClose = currentMin > checkoutCloseMin;
    const isCheckOutAllowed = !isBeforeEnd && !isPastClose;
    const checkOutReason = isBeforeEnd
      ? `Check-out opens at ${shiftEndLabel} (Shift End)`
      : isPastClose
        ? `Check-out closed (90 min past shift end expired)`
        : '';

    return {
      isCheckInAllowed,
      checkInReason,
      isCheckOutAllowed,
      checkOutReason,
    };
  }, [managerShiftSchedule]);

  // Filter staff list by search query and role filter chips (Screen 3)
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: staffList.length };
    staffList.forEach((s) => {
      const roleName = s.positionCategory?.name || s.role || 'Other';
      counts[roleName] = (counts[roleName] || 0) + 1;
    });
    return counts;
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      const matchesRole =
        selectedRoleFilter === 'ALL' ||
        (s.positionCategory?.name || s.role) === selectedRoleFilter;

      const q = staffSearchQuery.trim().toLowerCase();
      if (!q) return matchesRole;

      const matchesSearch =
        s.staffMember.fullName.toLowerCase().includes(q) ||
        (s.positionCategory?.name || '').toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.staffMember.mobile || '').includes(q);

      return matchesRole && matchesSearch;
    });
  }, [staffList, selectedRoleFilter, staffSearchQuery]);

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning!';
    if (hour < 17) return 'Good Afternoon!';
    return 'Good Evening!';
  }, []);

  // Attendance calculations (strictly for attendance-tracked staff; exempt staff like supervisor are excluded!)
  const attendanceTrackedStaff = useMemo(() => staffList.filter((s) => s.attendanceEnabled !== false), [staffList]);
  const totalStaffCount = dashboardData?.totalStaff ?? attendanceTrackedStaff.length;
  const activeOnFloorCount = dashboardData?.activeOnFloorCount ?? attendanceTrackedStaff.filter(
    (s) => s.attendanceToday.isOnFloor || (s.attendanceToday.isPresent && !s.attendanceToday.checkOutAt && s.attendanceToday.status === 'OPEN')
  ).length;
  const completedShiftCount = dashboardData?.completedShiftCount ?? attendanceTrackedStaff.filter(
    (s) => s.attendanceToday.isShiftCompleted || (s.attendanceToday.isPresent && (!!s.attendanceToday.checkOutAt || s.attendanceToday.status === 'CLOSED'))
  ).length;
  const presentCount = dashboardData?.presentCount ?? (activeOnFloorCount + completedShiftCount);
  const absentCount = dashboardData?.absentCount ?? Math.max(0, totalStaffCount - presentCount);
  const attendanceRate = totalStaffCount > 0 ? Math.round((presentCount / totalStaffCount) * 100) : 0;

  // Today / staleness flags (dates are local calendar days)
  const todayKey = localDateKey();
  const isViewingToday = selectedDate === todayKey;
  /** Numbers on screen belong to a different date than the one selected (new date still loading) */
  const isShowingStaleDate = isRefreshing && !!dashboardData?.date && dashboardData.date !== selectedDate;

  // Manager identity — straight from the logged-in account / membership in DB
  const myMembership = user?.shopMemberships.find((m) => m.shopId === activeShopId) ?? null;
  const managerDisplayName = user?.staffMember?.fullName || 'Manager';
  const managerRoleLabel = activeRole || (user?.isOwner ? 'Owner' : '');

  const myStaffRecord = useMemo(() => {
    return (
      (user?.staffMember?.id
        ? staffList.find((s) => s.staffMember.id === user.staffMember?.id || s.staffMemberId === user.staffMember?.id)
        : null) ||
      (user?.id ? staffList.find((s) => s.account?.id === user.id) : null) ||
      (user?.username ? staffList.find((s) => s.account?.username?.toLowerCase() === user.username.toLowerCase()) : null) ||
      (user?.staffMember?.fullName
        ? staffList.find((s) => s.staffMember.fullName.toLowerCase() === user.staffMember!.fullName.toLowerCase())
        : null) ||
      staffList.find((s) => s.role?.toLowerCase().includes('manager') || s.positionCategory?.name?.toLowerCase().includes('manager')) ||
      null
    );
  }, [staffList, user]);

  const myStaffId = useMemo(() => {
    return user?.staffMember?.id || myStaffRecord?.staffMember.id || myStaffRecord?.staffMemberId || '';
  }, [user, myStaffRecord]);

  const fetchMyDirectives = useCallback(async (staffIdParam?: string) => {
    const targetId = staffIdParam || myStaffId;
    if (!activeShopId || !targetId) return;
    setIsLoadingMyDirectives(true);
    try {
      const res = await apiRequest<{ assignments: StaffAssignment[] }>(
        `/api/shops/${activeShopId}/staff/${targetId}/tasks?date=${selectedDate}`
      );
      setMyDirectives(res?.assignments || []);
    } catch {
      setMyDirectives([]);
    } finally {
      setIsLoadingMyDirectives(false);
    }
  }, [activeShopId, myStaffId, selectedDate]);

  useEffect(() => {
    if (activeShopId && myStaffId) {
      fetchMyDirectives(myStaffId);
    }
  }, [activeShopId, myStaffId, selectedDate, fetchMyDirectives]);
  const managerMobile = user?.staffMember?.mobile || myStaffRecord?.staffMember?.mobile || 'Not provided';
  const managerAddress = user?.staffMember?.address || myStaffRecord?.staffMember?.address || 'Not provided';
  const managerRole = myStaffRecord?.positionCategory?.name || myMembership?.positionCategory || managerRoleLabel || 'Store Manager';
  const managerJoiningDate = myStaffRecord?.joiningDate || myMembership?.joiningDate;
  const managerDutyTiming = resolveDutyTiming(
    myStaffRecord?.dutyTimingNotes || myMembership?.dutyTimingNotes,
    myStaffRecord?.shiftStartTime ?? myMembership?.shiftStartTime,
    myStaffRecord?.shiftEndTime ?? myMembership?.shiftEndTime
  );
  const managerSalary = myStaffRecord?.monthlySalary ?? myMembership?.monthlySalary ?? null;
  const myCapabilities = myMembership?.capabilities ?? [];

  const handleSavePersonalDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDetails(true);
    setEditDetailsError(null);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editFullName.trim(),
          mobile: editMobile.trim() || null,
          address: editAddress.trim() || null,
          dutyTimingNotes: editDutyTiming.trim() || null,
          shopId: activeShopId || undefined,
        }),
      });
      await refreshUser();
      await fetchData(true);
      setEditDetailsSuccess('Personal details updated successfully!');
      setTimeout(() => {
        setEditDetailsSuccess(null);
        setIsEditDetailsOpen(false);
      }, 1200);
    } catch (err: unknown) {
      setEditDetailsError(err instanceof Error ? err.message : 'Failed to save personal details.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const reportDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const departmentRows = dashboardData
    ? (Object.values(dashboardData.departmentBreakdown).filter(Boolean) as Array<{ name: string; total: number; completed: number; percentage: number }>)
    : [];
  const serviceRows = (dashboardData?.serviceBreakdown ?? []).filter((s) => s.orders > 0 || s.totalUnits > 0);

  const absentStaffList = attendanceTrackedStaff.filter((s) => !s.attendanceToday.isPresent);
  const halfDayCount = dashboardData?.halfDayCount ?? 0;
  const pendingUnits = dashboardData?.todayTasks?.pending ?? 0;
  const hasAlerts = absentStaffList.length > 0 || pendingUnits > 0;

  // Auth still resolving, redirecting an unauthorized user, or first data load
  if (!isMounted || isAuthLoading || !user || !isManagerAllowed || (isLoading && !dashboardData)) {
    return (
      <div className="min-h-screen bg-surface-cream flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 bg-[#F8F9FA] text-[#1E293B] antialiased">
      {/* Global refresh indicator (date change / background refresh) */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-brand-forest/10" role="progressbar" aria-label="Loading">
          <div className="h-full w-1/3 bg-brand-forest rounded-full animate-[managerLoadingBar_1s_ease-in-out_infinite]" />
          <style>{`@keyframes managerLoadingBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
        </div>
      )}
      {user?.isOwner && (
        <div className="mx-4 mt-2 px-3.5 py-2.5 rounded-xl bg-brand-forest text-brand-lime text-xs font-bold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span>👑</span>
            <span>Logged in as Owner (Manager Terminal)</span>
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
          DRILLDOWN VIEW: CREATE TASK (SCREENS 5, 6, 7, 8)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeDrilldown === 'create_task' && selectedStaff && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveDrilldown('staff_details')}
              className="p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover"
            >
              <ChevronLeft className="w-5 h-5 text-brand-forest" />
            </button>
            <div className="truncate">
              <h2 className="text-base font-black text-brand-forest truncate">
                Create Task for {selectedStaff.staffMember.fullName}
              </h2>
              <p className="text-[11px] text-content-muted font-semibold">
                {selectedStaff.positionCategory?.name || selectedStaff.role}
              </p>
            </div>
          </div>

          {/* Feedback banner */}
          {taskFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${taskFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
                }`}
            >
              {taskFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              )}
              <span>{taskFeedback.message}</span>
            </div>
          )}

          {/* Create Task Form */}
          <form onSubmit={handleCreateTaskSubmit} className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            {/* Date Selector Row */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-cream/70 border border-border-subtle">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
                <Calendar className="w-4 h-4 text-brand-forest" />
                <span>
                  {new Date(taskCreateDate).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <input
                type="date"
                value={taskCreateDate}
                onChange={(e) => setTaskCreateDate(e.target.value)}
                className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-white cursor-pointer"
              />
            </div>

            {/* OPERATIONAL / MANAGERIAL DIRECTIVE TASK VARIANT */}
            {!isSelectedStaffFloor() ? (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs">
                  <span className="font-extrabold block">Operational Directive / Assigned Task</span>
                  <span className="text-[11px] opacity-80">
                    Assign a direct operational task, instruction, or responsibility with simple text instructions. No laundry piece checklists.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Task / Directive Message *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Inspect chemical inventory, Review store accounts, Client follow-up"
                    value={directiveTitle}
                    onChange={(e) => setDirectiveTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Priority Level (Optional)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDirectivePriority(p)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all capitalize ${
                          directivePriority === p
                            ? p === 'URGENT'
                              ? 'bg-red-600 text-white shadow-sm'
                              : p === 'HIGH'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-brand-forest text-white shadow-sm'
                            : 'bg-surface-cream text-content-muted border border-border-subtle'
                        }`}
                      >
                        {p.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Special Instructions / Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Add details, target deadlines, or reference links (Optional)"
                    value={directiveNotes}
                    onChange={(e) => setDirectiveNotes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                  />
                </div>
              </div>
            ) : isOrderBasedStaff ? (
              <>
                {/* Service Type Radio: Delivery vs Pickup */}
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-2">Service Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('DELIVERY')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${deliveryType === 'DELIVERY'
                          ? 'bg-brand-forest text-white shadow-sm'
                          : 'bg-surface-cream text-content-muted border border-border-subtle'
                        }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${deliveryType === 'DELIVERY' ? 'border-white bg-white' : 'border-content-muted'}`}>
                        {deliveryType === 'DELIVERY' && <span className="w-1.5 h-1.5 rounded-full bg-brand-forest" />}
                      </span>
                      <span>Delivery</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryType('PICKUP')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${deliveryType === 'PICKUP'
                          ? 'bg-brand-forest text-white shadow-sm'
                          : 'bg-surface-cream text-content-muted border border-border-subtle'
                        }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${deliveryType === 'PICKUP' ? 'border-white bg-white' : 'border-content-muted'}`}>
                        {deliveryType === 'PICKUP' && <span className="w-1.5 h-1.5 rounded-full bg-brand-forest" />}
                      </span>
                      <span>Pickup</span>
                    </button>
                  </div>
                </div>

                {deliveryType === 'DELIVERY' ? (
                  /* Screen 7: Delivery Sub-form */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-brand-forest mb-1">Order ID *</label>
                        <input
                          type="text"
                          placeholder="e.g. TD1280"
                          value={taskOrderId}
                          onChange={(e) => setTaskOrderId(e.target.value)}
                          required
                          className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-brand-forest mb-1">No. of Pieces *</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="10"
                          value={taskPieces}
                          onChange={(e) => setTaskPieces(e.target.value ? parseInt(e.target.value) : '')}
                          required
                          className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Customer Mobile Number (Optional)</label>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9876543210 (For 1-Tap Call & WhatsApp)"
                        value={taskCustomerMobile}
                        onChange={(e) => setTaskCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest tracking-wider"
                      />
                      <p className="text-[10px] text-content-muted mt-1">
                        Delivery boy and managers can call or WhatsApp customer directly from the app.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Delivery Address / Location (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Flat 402, Sunshine Apts, MG Road"
                        value={taskPickupLocation}
                        onChange={(e) => setTaskPickupLocation(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                      />
                    </div>
                  </div>
                ) : (
                  /* Screen 8: Pickup Sub-form */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Guest Mobile Number *</label>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={taskCustomerMobile}
                        onChange={(e) => setTaskCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        required
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest tracking-wider"
                      />
                      <p className="text-[10px] text-content-muted mt-1">
                        Delivery boy will see this mobile number directly to coordinate the guest pickup.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Pickup Location / Address (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Hotel Grand, Chandmari / Client Residence (Optional)"
                        value={taskPickupLocation}
                        onChange={(e) => setTaskPickupLocation(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* SCREEN 5 & 6: WASHERMAN & IRONMAN VARIANT */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1">Order ID *</label>
                    <input
                      type="text"
                      placeholder="e.g. TD1268"
                      value={taskOrderId}
                      onChange={(e) => setTaskOrderId(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1">No. of Pieces *</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="25"
                      value={taskPieces}
                      onChange={(e) => setTaskPieces(e.target.value ? parseInt(e.target.value) : '')}
                      required
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">Service Type *</label>
                  <select
                    value={taskServiceTypeId}
                    onChange={(e) => setTaskServiceTypeId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest cursor-pointer"
                  >
                    <option value="">Select service type</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Work steps — loaded from DB: staff's work-counting rule ∩ selected service's steps */}
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-2">
                    Process Activities *
                    {selectedStaffWorkflow && (
                      <span className="ml-1 text-[10px] font-semibold text-content-muted">({selectedStaffWorkflow.name})</span>
                    )}
                  </label>
                  {availableActivities.length === 0 ? (
                    <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      No work steps are configured for this staff member. Ask the Owner to set a work-counting rule in Catalogues &gt; Job Roles.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {availableActivities.map((act) => {
                        const isChecked = taskSelectedActivities.includes(act);
                        return (
                          <button
                            key={act}
                            type="button"
                            onClick={() => toggleActivity(act)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${isChecked
                                ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                                : 'bg-surface-cream text-content-muted border-border-subtle'
                              }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${isChecked ? 'bg-brand-lime text-brand-forest' : 'border border-content-muted'}`}>
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            <span className="capitalize">{act.toLowerCase()}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Notes (Optional) */}
            {isSelectedStaffFloor() && (
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Add any notes..."
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                />
              </div>
            )}

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

            {/* Create Task Button */}
            <button
              type="submit"
              disabled={isSubmittingTask}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmittingTask ? 'Creating Task...' : 'Create Task'}</span>
            </button>
          </form>

          {/* Today's Tasks List for this staff member (Screens 5, 6, 7, 8) */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-brand-forest">
                Today&apos;s Tasks ({new Date(taskCreateDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
              </h3>
              <span className="text-[10px] font-bold text-content-muted">
                {staffDayAssignments.length} Assigned
              </span>
            </div>

            {isLoadingStaffData ? (
              <p className="text-xs text-content-muted text-center py-4">Loading assigned tasks...</p>
            ) : staffDayAssignments.length > 0 ? (
              <div className="space-y-2.5">
                {staffDayAssignments.map((a) => {
                  const activities = a.taskUnits.map((u) => u.activityCode).filter(Boolean);
                  const uniqueActs = Array.from(new Set(activities)).join(', ') || a.workflowProfile.name;
                  const completedCount = a.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                  const isAllDone = a.taskUnits.length > 0 && completedCount === a.taskUnits.length;
                  const parsed = parseAssignmentNotes(a.notes);
                  const cleanMobile = a.customerMobile ? a.customerMobile.replace(/\D/g, '') : null;

                  return (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-xs font-black ${
                              a.orderId ? 'bg-blue-100 text-blue-900 border border-blue-200' : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}
                          >
                            {a.orderId ? `Order #${a.orderId}` : 'Pickup Request'}
                          </span>
                          <span className="text-[11px] font-bold text-brand-forest bg-white px-2 py-0.5 rounded border border-border-subtle">
                            {a.pieceCount ? `${a.pieceCount} pcs` : a.pickupCount ? `${a.pickupCount} pickups` : `${a.taskUnits.length} pcs`}
                          </span>
                          {a.damageIncidents && a.damageIncidents.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewingDamageIncident(a.damageIncidents![0])}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 text-status-danger text-[10px] font-black hover:bg-red-200 transition-colors"
                              title="View Damage Evidence"
                            >
                              <AlertTriangle className="w-3 h-3 text-status-danger" />
                              <span>{a.damageIncidents.length} Dmg</span>
                            </button>
                          )}
                        </div>

                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                            isAllDone
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isAllDone ? 'Done' : `${completedCount}/${a.taskUnits.length}`}
                        </span>
                      </div>

                      {/* Guest Contact & Call/WhatsApp Actions */}
                      {cleanMobile && (
                        <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Phone className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span className="font-mono text-[11px] font-bold text-emerald-950 truncate">
                              {a.customerMobile}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={`tel:${cleanMobile}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-forest text-brand-lime font-bold text-[10px] hover:opacity-90 transition-opacity"
                              title="Call Guest"
                            >
                              <PhoneCall className="w-2.5 h-2.5" />
                              <span>Call</span>
                            </a>
                            <a
                              href={`https://wa.me/91${cleanMobile}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px] hover:opacity-90 transition-opacity"
                              title="WhatsApp Guest"
                            >
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Location Badge */}
                      {parsed.location && (
                        <div className="flex items-start gap-1.5 p-1.5 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-950">
                          <MapPin className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                          <span className="font-medium break-words leading-tight">{parsed.location}</span>
                        </div>
                      )}

                      {/* Clean Notes or Activity breakdown */}
                      {(parsed.cleanNotes || uniqueActs) && (
                        <p className="text-[11px] text-content-muted leading-tight">
                          {parsed.cleanNotes || uniqueActs}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-4 font-medium">
                No tasks assigned to this member for this date yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          DRILLDOWN VIEW: STAFF DETAILS (SCREEN 4 & SCREEN 9)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeDrilldown === 'staff_details' && selectedStaff && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Top Bar with Back Arrow */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveDrilldown(null)}
              className="p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover"
            >
              <ChevronLeft className="w-5 h-5 text-brand-forest" />
            </button>
            <span className="text-xs font-bold text-content-muted">Staff Details</span>
          </div>

          {/* Profile Header Card */}
          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-base shadow-sm">
                {selectedStaff.staffMember.fullName.charAt(0)}
              </div>
              <div>
                <h2 className="text-base font-black text-brand-forest">
                  {selectedStaff.staffMember.fullName}
                </h2>
                <p className="text-xs text-content-muted font-semibold">
                  {selectedStaff.positionCategory?.name || selectedStaff.role}
                </p>
              </div>
            </div>

            <div className="text-right">
              {selectedStaff.attendanceEnabled === false ? (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Exempt
                </span>
              ) : selectedStaff.attendanceToday.isOnFloor || (selectedStaff.attendanceToday.isPresent && !selectedStaff.attendanceToday.checkOutAt && selectedStaff.attendanceToday.status === 'OPEN') ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  ● On Floor
                </span>
              ) : selectedStaff.attendanceToday.isShiftCompleted || (selectedStaff.attendanceToday.isPresent && (!!selectedStaff.attendanceToday.checkOutAt || selectedStaff.attendanceToday.status === 'CLOSED')) ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                  Shift Done
                </span>
              ) : (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  Absent
                </span>
              )}
              {selectedStaff.attendanceToday.checkInAt && (
                <span className="block text-[10px] text-content-muted font-mono mt-0.5">
                  Checked in: {new Date(selectedStaff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* 4 Tabs: Overview, Tasks, Attendance, Performance */}
          <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-xl border border-border-subtle overflow-x-auto">
            {(['overview', 'tasks', 'attendance', 'performance'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStaffProfileTab(tab)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${staffProfileTab === tab
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'text-content-muted hover:text-brand-forest'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW (Screen 4) */}
          {staffProfileTab === 'overview' && (
            <div className="space-y-4">
              <div className="space-y-3 bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm text-xs">
                <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                  <Phone className="w-4 h-4 text-brand-forest" />
                  <div>
                    <span className="text-content-muted block text-[10px]">Mobile</span>
                    <span className="font-bold text-brand-forest">
                      {selectedStaff.staffMember.mobile || 'Not provided'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                  <MapPin className="w-4 h-4 text-brand-forest" />
                  <div>
                    <span className="text-content-muted block text-[10px]">Address</span>
                    <span className="font-bold text-brand-forest">
                      {selectedStaff.staffMember.address || 'Not provided'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                  <Calendar className="w-4 h-4 text-brand-forest" />
                  <div>
                    <span className="text-content-muted block text-[10px]">Joining Date</span>
                    <span className="font-bold text-brand-forest">
                      {selectedStaff.joiningDate
                        ? new Date(selectedStaff.joiningDate).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                        : 'Not provided'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                  <CreditCard className="w-4 h-4 text-brand-forest" />
                  <div>
                    <span className="text-content-muted block text-[10px]">Salary</span>
                    <span className="font-bold text-brand-forest">
                      {selectedStaff.monthlySalary != null
                        ? `₹ ${selectedStaff.monthlySalary.toLocaleString('en-IN')}`
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 border-b border-border-subtle/50">
                  <Clock className="w-4 h-4 text-brand-forest" />
                  <div>
                    <span className="text-content-muted block text-[10px]">Duty Timing</span>
                    <span className="font-bold text-brand-forest">
                      {selectedStaff.dutyTimingNotes || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extra details (Owner-defined custom fields, DB-driven; hidden fields never sent) */}
              {activeShopId && (
                <StaffExtraDetails
                  key={selectedStaff.staffMember.id}
                  shopId={activeShopId}
                  staffMemberId={selectedStaff.staffMember.id}
                  canEdit={hasCapability('staff.update')}
                />
              )}

              {/* Monthly Summary Card (Screen 4 Donut) */}
              <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
                <h3 className="text-xs font-black text-brand-forest">
                  Monthly Summary ({new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})
                </h3>

                <div className="flex items-center justify-around gap-4">
                  {/* Circular Donut Ring */}
                  <div className="relative w-24 h-24 flex items-center justify-center">
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
                            ((staffMonthlySummary?.percentageComplete != null
                              ? staffMonthlySummary.percentageComplete
                              : 0) /
                              100))
                        }
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-lg font-black text-brand-forest">
                        {staffMonthlySummary?.percentageComplete != null
                          ? `${Math.round(staffMonthlySummary.percentageComplete)}%`
                          : '0%'}
                      </span>
                      <span className="block text-[8px] font-bold text-content-muted">Completed</span>
                    </div>
                  </div>

                  {/* 3 Metric Counts */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-content-muted font-medium">Total Tasks:</span>
                      <span className="font-extrabold text-brand-forest">
                        {staffMonthlySummary?.total ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-content-muted font-medium">Completed:</span>
                      <span className="font-extrabold text-emerald-700">
                        {staffMonthlySummary?.completed ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-content-muted font-medium">Pending:</span>
                      <span className="font-extrabold text-red-600">
                        {staffMonthlySummary?.pending ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TASKS VIEW (Screen 9) */}
          {staffProfileTab === 'tasks' && (
            <div className="space-y-4">
              {/* Date Navigator + Create Task Button */}
              <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setStaffTaskDate(addDaysToDateKey(staffTaskDate, -1))}
                    className="p-1 rounded-lg hover:bg-surface-cream text-brand-forest"
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
                        if (val) setStaffTaskDate(val);
                      }}
                      className="bg-transparent font-bold text-xs text-brand-forest cursor-pointer focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setStaffTaskDate(addDaysToDateKey(staffTaskDate, 1))}
                    className="p-1 rounded-lg hover:bg-surface-cream text-brand-forest"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => handleOpenCreateTask(selectedStaff)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Task</span>
                </button>
              </div>

              {/* Task Counters: Total, Completed, Pending */}
              {(() => {
                const totalUnits = staffDayAssignments.reduce((acc, a) => acc + a.taskUnits.length, 0);
                const completedUnits = staffDayAssignments.reduce(
                  (acc, a) => acc + a.taskUnits.filter((u) => u.status === 'COMPLETED').length,
                  0
                );
                const pendingUnits = Math.max(0, totalUnits - completedUnits);

                return (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                      <span className="text-lg font-black text-brand-forest block">{totalUnits}</span>
                      <span className="text-[10px] font-bold text-content-muted">Total</span>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                      <span className="text-lg font-black text-emerald-700 block">{completedUnits}</span>
                      <span className="text-[10px] font-bold text-emerald-600">Completed</span>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                      <span className="text-lg font-black text-red-600 block">{pendingUnits}</span>
                      <span className="text-[10px] font-bold text-red-500">Pending</span>
                    </div>
                  </div>
                );
              })()}

              {/* Tasks List */}
              <div className="space-y-2">
                {isLoadingStaffData ? (
                  <p className="text-xs text-content-muted text-center py-6">Loading tasks...</p>
                ) : staffDayAssignments.length > 0 ? (
                  staffDayAssignments.map((assignment) => {
                    const isDirective =
                      assignment.workflowProfile?.name?.includes('Directive') ||
                      assignment.workflowProfileId === 'wfp-directive' ||
                      (!assignment.pieceCount && !assignment.serviceTypeId);

                    if (isDirective) {
                      const unit = assignment.taskUnits[0];
                      const isDone = unit?.status === 'COMPLETED';
                      const isAlreadyShifted = !!assignment.notes?.includes('[Shifted to');
                      const shiftedToMatch = assignment.notes?.match(/\[Shifted to ([^\]\s-]+)/);
                      const shiftedToDate = shiftedToMatch ? shiftedToMatch[1] : null;
                      const isRolledOver = !!assignment.notes?.includes('[Rolled over from');
                      const rolledOverMatch = assignment.notes?.match(/\[Rolled over from ([^\]\s-]+)/);
                      const rolledOverDate = rolledOverMatch ? rolledOverMatch[1] : null;

                      return (
                        <div
                          key={assignment.id}
                          className={`rounded-2xl border shadow-clay-sm p-4 space-y-2.5 transition-all ${
                            isDone ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-border-subtle'
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
                                {isAlreadyShifted && (
                                  <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 font-extrabold text-[10px] tracking-wider border border-purple-200">
                                    Shifted to {shiftedToDate}
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
                                <span className="px-2.5 py-1.5 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs border border-purple-200 flex items-center gap-1 shadow-sm">
                                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                  <span>Shifted to {shiftedToDate || 'New Date'}</span>
                                </span>
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
                                <button
                                  type="button"
                                  disabled={completingDirectiveId === unit.id}
                                  onClick={async () => {
                                    if (completingDirectiveId === unit.id) return;
                                    setCompletingDirectiveId(unit.id);
                                    // Instant optimistic update (<10ms)
                                    setStaffDayAssignments((prev) =>
                                      prev.map((a) =>
                                        a.id !== assignment.id
                                          ? a
                                          : {
                                              ...a,
                                              taskUnits: a.taskUnits.map((u) =>
                                                u.id === unit.id
                                                  ? {
                                                      ...u,
                                                      status: isDone ? 'PENDING' : 'COMPLETED',
                                                      completedAt: isDone ? null : new Date().toISOString(),
                                                    }
                                                  : u
                                              ),
                                            }
                                      )
                                    );
                                    try {
                                      await apiRequest(`/api/shops/${activeShopId}/task-units/${unit.id}/toggle`, {
                                        method: 'PATCH',
                                      });
                                      if (selectedStaff) fetchStaffDetails(selectedStaff.staffMember.id, staffTaskDate);
                                      fetchData(true);
                                    } catch (err) {
                                      alert(err instanceof Error ? err.message : 'Failed to update task.');
                                      if (selectedStaff) fetchStaffDetails(selectedStaff.staffMember.id, staffTaskDate);
                                    } finally {
                                      setCompletingDirectiveId(null);
                                    }
                                  }}
                                  className={`touch-manipulation active:scale-95 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    isDone
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                      : 'clay-btn-lime'
                                  }`}
                                >
                                  {isDone ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                      <span>Done</span>
                                    </>
                                  ) : (
                                    <span>Mark Done</span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const acts = assignment.taskUnits.map((u) => u.activityCode).filter(Boolean);
                    const label = Array.from(new Set(acts)).join(', ') || assignment.workflowProfile.name;
                    const completedCount = assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                    const isAllCompleted = assignment.taskUnits.length > 0 && completedCount === assignment.taskUnits.length;
                    const lastCompletedAt = assignment.taskUnits.find((u) => u.completedAt)?.completedAt;
                    const isExpanded = !!expandedAssignmentIds[assignment.id];
                    const isAlreadyShifted = !!assignment.notes?.includes('[Shifted to');
                    const shiftedToMatch = assignment.notes?.match(/\[Shifted to ([^\]\s-]+)/);
                    const shiftedToDate = shiftedToMatch ? shiftedToMatch[1] : null;
                    const isRolledOver = !!assignment.notes?.includes('[Rolled over from');
                    const rolledOverMatch = assignment.notes?.match(/\[Rolled over from ([^\]\s-]+)/);
                    const rolledOverDate = rolledOverMatch ? rolledOverMatch[1] : null;

                    // Group task units by pieceNumber
                    const pieceMap = new Map<number, typeof assignment.taskUnits>();
                    assignment.taskUnits.forEach((unit) => {
                      const pNum = unit.pieceNumber || 1;
                      if (!pieceMap.has(pNum)) pieceMap.set(pNum, []);
                      pieceMap.get(pNum)!.push(unit);
                    });

                    const parsedNotes = parseAssignmentNotes(assignment.notes);
                    const cleanMobile = assignment.customerMobile ? assignment.customerMobile.replace(/\D/g, '') : null;

                    return (
                      <div
                        key={assignment.id}
                        className="bg-white p-4 rounded-2xl border border-border-subtle shadow-sm space-y-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                isAllCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-cream text-content-muted border border-border-subtle'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2.5 py-0.5 rounded-lg font-mono text-xs font-black ${
                                  assignment.orderId ? 'bg-blue-100 text-blue-900 border border-blue-200' : 'bg-amber-100 text-amber-900 border border-amber-200'
                                }`}>
                                  {assignment.orderId ? `Order #${assignment.orderId}` : 'Pickup Request'}
                                </span>
                                {isRolledOver && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                    Rolled from {rolledOverDate}
                                  </span>
                                )}
                                {isAlreadyShifted && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                    Shifted to {shiftedToDate}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-surface-cream text-brand-forest border border-border-subtle">
                                  {assignment.pieceCount ? `${assignment.pieceCount} pcs` : assignment.pickupCount ? `${assignment.pickupCount} pickups` : `${assignment.taskUnits.length} pcs`}
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-content-muted border border-border-subtle">
                                  {assignment.serviceType?.name || assignment.workflowProfile?.name || 'Garment Task'}
                                </span>
                              </div>

                              {/* Target / Completed timing */}
                              <p className="text-[11px] text-content-muted">
                                {isAllCompleted && lastCompletedAt
                                  ? `Completed at ${new Date(lastCompletedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                                  : `Assigned: ${new Date(assignment.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black ${
                                isAllCompleted ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isAllCompleted
                                ? 'Completed'
                                : `${completedCount}/${assignment.taskUnits.length} Done`}
                            </span>
                            {isAlreadyShifted ? (
                              <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200 flex items-center gap-1 shadow-sm">
                                <Calendar className="w-3 h-3 text-purple-600" />
                                <span>Shifted to {shiftedToDate || 'New Date'}</span>
                              </span>
                            ) : !isAllCompleted ? (
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
                            {assignment.taskUnits.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedAssignmentIds((prev) => ({ ...prev, [assignment.id]: !prev[assignment.id] }))}
                                className="px-2.5 py-1 rounded-lg bg-surface-cream text-brand-forest font-bold text-[10px] border border-border-subtle hover:bg-surface-hover transition-colors"
                              >
                                {isExpanded ? 'Hide' : 'Pieces'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Customer Mobile & 1-Tap Call & WhatsApp Direct Actions */}
                        {cleanMobile && (
                          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-wrap items-center justify-between gap-2.5">
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
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={`tel:${cleanMobile}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-forest text-brand-lime font-bold text-xs shadow-sm hover:opacity-90 active:scale-95 transition-all"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                                <span>Call</span>
                              </a>
                              <a
                                href={`https://wa.me/91${cleanMobile}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm hover:opacity-90 active:scale-95 transition-all"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Location / Address Tag */}
                        {parsedNotes.location && (
                          <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2 text-amber-950">
                            <MapPin className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="space-y-0.5 min-w-0">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block">
                                Delivery / Pickup Address
                              </span>
                              <p className="font-semibold text-xs text-amber-950 leading-snug break-words">
                                {parsedNotes.location}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Remaining Notes */}
                        {parsedNotes.cleanNotes && (
                          <div className="text-[11px] text-content-muted bg-surface-cream/50 p-2 rounded-lg border border-border-subtle">
                            <strong className="text-content-default">Note:</strong> {parsedNotes.cleanNotes}
                          </div>
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

                        {/* Expandable Piece-Level Checklist */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-border-subtle/50 space-y-1.5">
                            {Array.from(pieceMap.entries()).map(([pieceNum, units]) => {
                              const completedInPiece = units.filter((u) => u.status === 'COMPLETED').length;
                              const isPieceDone = units.length > 0 && completedInPiece === units.length;
                              const pieceDamage =
                                assignment.damageIncidents?.find((d) => d.pieceNumber === pieceNum) ||
                                units.flatMap((u) => u.damageIncidents || []).find(Boolean);

                              return (
                                <div
                                  key={pieceNum}
                                  className="flex items-center justify-between p-2 rounded-xl bg-surface-cream/50 border border-border-subtle/60 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-brand-forest">Piece #{pieceNum}</span>
                                    {pieceDamage && (
                                      <button
                                        type="button"
                                        onClick={() => setViewingDamageIncident(pieceDamage)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-900 text-[10px] font-bold border border-red-300"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-red-600" />
                                        <span>Damage</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {units.map((u) => {
                                      const isUnitDone = u.status === 'COMPLETED';
                                      return (
                                        <span
                                          key={u.id}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isUnitDone
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
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isPieceDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                      {isPieceDone ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" /> : null}
                                      <span>{isPieceDone ? 'Done' : `${completedInPiece}/${units.length}`}</span>
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                    <p className="text-xs font-bold text-content-muted">No task assignments on this date.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE (FULL MONTHLY ATTENDANCE HISTORY) */}
          {staffProfileTab === 'attendance' && (
            <div className="space-y-4 animate-fade-in">
              {/* Today's Live Status Card */}
              <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-brand-forest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                    <span>Today&apos;s Attendance Status</span>
                  </h4>
                  {selectedStaff.attendanceEnabled === false ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Attendance Exempt
                    </span>
                  ) : selectedStaff.attendanceToday.isOnFloor || (selectedStaff.attendanceToday.isPresent && !selectedStaff.attendanceToday.checkOutAt && selectedStaff.attendanceToday.status === 'OPEN') ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      On Floor
                    </span>
                  ) : selectedStaff.attendanceToday.isShiftCompleted || (selectedStaff.attendanceToday.isPresent && (!!selectedStaff.attendanceToday.checkOutAt || selectedStaff.attendanceToday.status === 'CLOSED')) ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      Shift Completed
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                      Absent
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border-subtle/50">
                  <div className="p-2 rounded-xl bg-surface-cream/50 border border-border-subtle/50">
                    <span className="text-[10px] text-content-muted block">Check In</span>
                    <span className="font-bold text-brand-forest font-mono">
                      {selectedStaff.attendanceToday.checkInAt
                        ? new Date(selectedStaff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-cream/50 border border-border-subtle/50">
                    <span className="text-[10px] text-content-muted block">Check Out</span>
                    <span className="font-bold text-brand-forest font-mono">
                      {selectedStaff.attendanceToday.checkOutAt
                        ? new Date(selectedStaff.attendanceToday.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : selectedStaff.attendanceToday.status === 'OPEN' ? 'In Progress' : '—'}
                    </span>
                  </div>
                </div>

                {selectedStaff.attendanceToday.checkInPhotoPath && (
                  <button
                    type="button"
                    onClick={() => setViewingAttendancePhoto({
                      staffName: selectedStaff.staffMember.fullName,
                      role: selectedStaff.positionCategory?.name || selectedStaff.role,
                      photoUrl: selectedStaff.attendanceToday.checkInPhotoPath!,
                      checkOutPhotoUrl: selectedStaff.attendanceToday.checkOutPhotoPath || undefined,
                      timestamp: selectedStaff.attendanceToday.checkInAt || undefined,
                      checkOutTimestamp: selectedStaff.attendanceToday.checkOutAt || undefined,
                      status: selectedStaff.attendanceToday.status,
                    })}
                    className="w-full py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-700" />
                    <span>View Today&apos;s Verification Selfie</span>
                  </button>
                )}
              </div>

              {/* Month Navigator */}
              <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    const newM = staffDrilldownMonth === 1 ? 12 : staffDrilldownMonth - 1;
                    const newY = staffDrilldownMonth === 1 ? staffDrilldownYear - 1 : staffDrilldownYear;
                    setStaffDrilldownMonth(newM);
                    setStaffDrilldownYear(newY);
                    fetchStaffDrilldownAttendance(selectedStaff.staffMember.id, newY, newM);
                  }}
                  className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest transition-colors"
                  aria-label="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="font-bold text-xs text-brand-forest flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-brand-forest" />
                  <span>
                    {new Date(staffDrilldownYear, staffDrilldownMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newM = staffDrilldownMonth === 12 ? 1 : staffDrilldownMonth + 1;
                    const newY = staffDrilldownMonth === 12 ? staffDrilldownYear + 1 : staffDrilldownYear;
                    setStaffDrilldownMonth(newM);
                    setStaffDrilldownYear(newY);
                    fetchStaffDrilldownAttendance(selectedStaff.staffMember.id, newY, newM);
                  }}
                  className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest transition-colors"
                  aria-label="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Summary Badges */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-base font-black text-emerald-900 block">
                    {staffDrilldownAttendance?.summary.presentCount ?? 0}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">Full Day</span>
                </div>
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                  <span className="text-base font-black text-red-700 block">
                    {staffDrilldownAttendance?.summary.absentCount ?? 0}
                  </span>
                  <span className="text-[10px] font-bold text-red-600">Absent</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-base font-black text-amber-800 block">
                    {staffDrilldownAttendance?.summary.halfDayCount ?? 0}
                  </span>
                  <span className="text-[10px] font-bold text-amber-700">Half Day</span>
                </div>
              </div>

              {/* Attendance Daily List */}
              {isLoadingStaffDrilldownAttendance ? (
                <div className="py-8 text-center text-xs font-bold text-content-muted flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
                  <span>Loading attendance history...</span>
                </div>
              ) : staffDrilldownAttendance?.sessions && staffDrilldownAttendance.sessions.length > 0 ? (
                <div className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-2">
                  {staffDrilldownAttendance.sessions.map((item) => {
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
                    const isHalfDay = item.isHalfDay ?? ((item.durationMinutes || 0) > 0 && (item.durationMinutes || 0) < 240 && item.status !== 'OPEN');
                    const isOpen = item.status === 'OPEN';

                    return (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-border-subtle/40 text-xs last:border-b-0">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-brand-forest">{dateStr}</span>
                            <span className="text-content-muted text-[11px]">({dayStr})</span>
                          </div>
                          <span className="text-[11px] font-medium text-content-muted block">{timeStr}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {(item.checkInPhotoPath || item.checkOutPhotoPath) && (
                            <button
                              type="button"
                              onClick={() => setViewingAttendancePhoto({
                                staffName: selectedStaff.staffMember.fullName,
                                role: selectedStaff.positionCategory?.name || selectedStaff.role,
                                photoUrl: item.checkInPhotoPath || undefined,
                                checkOutPhotoUrl: item.checkOutPhotoPath || undefined,
                                timestamp: item.checkInAt,
                                checkOutTimestamp: item.checkOutAt || undefined,
                                status: item.status,
                              })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold shadow-sm transition-colors"
                              title="View Attendance Selfie"
                            >
                              <Camera className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Selfie</span>
                            </button>
                          )}

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
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                  <p className="text-xs font-bold text-content-muted">No attendance sessions recorded for this month.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PERFORMANCE */}
          {staffProfileTab === 'performance' && (
            <div className="space-y-4">
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
                          ((staffMonthlySummary?.percentageComplete != null
                            ? staffMonthlySummary.percentageComplete
                            : 0) /
                            100))
                      }
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-2xl font-black text-brand-forest">
                      {staffMonthlySummary?.percentageComplete != null
                        ? `${Math.round(staffMonthlySummary.percentageComplete)}%`
                        : '0%'}
                    </span>
                    <span className="block text-[9px] font-bold text-content-muted">Task Completion</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 w-full text-center pt-2 border-t border-border-subtle">
                  <div>
                    <span className="text-sm font-black text-brand-forest block">
                      {staffMonthlySummary?.total ?? 0}
                    </span>
                    <span className="text-[10px] text-content-muted font-bold">Total Tasks</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-emerald-700 block">
                      {staffMonthlySummary?.completed ?? 0}
                    </span>
                    <span className="text-[10px] text-content-muted font-bold">Completed</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-red-600 block">
                      {staffMonthlySummary?.pending ?? 0}
                    </span>
                    <span className="text-[10px] text-content-muted font-bold">Pending</span>
                  </div>
                </div>
              </div>

              {/* Real Performance Chart or Clean Empty State */}
              <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
                <h4 className="text-xs font-black text-brand-forest">Task Completion Trend</h4>
                {staffMonthlySummary && staffMonthlySummary.total > 0 ? (
                  <div className="flex items-end justify-between h-28 pt-4 px-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                      const dayPct = staffMonthlySummary.dailyProgress?.[i]
                        ? Math.round(
                          (staffMonthlySummary.dailyProgress[i].completed /
                            Math.max(1, staffMonthlySummary.dailyProgress[i].total)) *
                          100
                        )
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
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 1: MANAGER DASHBOARD (SCREEN 2)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'dashboard' && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Header matching Screen 2 */}
          <div className="flex items-center justify-between">
            <div
              onClick={() => setCurrentNav('profile')}
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity"
            >
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-base shadow-sm border border-white/40">
                {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'M'}
              </div>
              <div>
                <h1 className="text-base font-black text-brand-forest leading-tight">
                  Hello, {user?.staffMember?.fullName || 'Manager'}
                </h1>
                <p className="text-xs text-content-muted font-medium">{greeting}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchData(true)}
                disabled={isRefreshing}
                className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-cream active:scale-95 flex items-center justify-center transition-all touch-manipulation"
                title="Refresh Dashboard"
                aria-label="Refresh Dashboard"
              >
                <RefreshCw className={`w-4 h-4 text-brand-forest ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsAlertsOpen(true)}
                className="relative p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-cream transition-all flex items-center justify-center"
                title="Shop Alerts"
              >
                <Bell className="w-4 h-4 text-brand-forest" />
                {hasAlerts && <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5 animate-pulse" />}
              </button>
            </div>
          </div>

          {/* Date Selector Row matching Screen 2 */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              {isRefreshing ? (
                <span className="w-4 h-4 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" aria-label="Loading" />
              ) : (
                <Calendar className="w-4 h-4 text-brand-forest" />
              )}
              <span>
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  weekday: 'long',
                })}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {!isViewingToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey)}
                  className="text-[10px] font-black px-2 py-1 rounded-lg bg-brand-forest text-white"
                >
                  Today
                </button>
              )}
              <input
                type="date"
                value={selectedDate}
                max={todayKey}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-surface-cream cursor-pointer"
              />
            </div>
          </div>

          {isShowingStaleDate && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 text-center">
              Loading data for {reportDateLabel}…
            </div>
          )}

          <div className={`space-y-4 transition-opacity duration-200 ${isShowingStaleDate ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>

            {/* Stat Row 1: Staff status matching Screen 2 */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-brand-forest block">{totalStaffCount}</span>
                <span className="text-[11px] font-bold text-content-muted">Total Staff</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-emerald-700 block">{presentCount}</span>
                <span className="text-[11px] font-bold text-emerald-600">Present</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-red-600 block">{absentCount}</span>
                <span className="text-[11px] font-bold text-red-500">Absent</span>
              </div>
            </div>

            {/* Stat Row 2: Task units for the selected date (1 unit = 1 piece × 1 work step) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-[#2563EB] block">
                  {dashboardData?.todayTasks?.total ?? 0}
                </span>
                <span className="text-[11px] font-bold text-[#2563EB]/80">Total Tasks</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-emerald-700 block">
                  {dashboardData?.todayTasks?.completed ?? 0}
                </span>
                <span className="text-[11px] font-bold text-emerald-600">Completed</span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-sm text-center">
                <span className="text-xl font-black text-red-600 block">
                  {dashboardData?.todayTasks?.pending ?? 0}
                </span>
                <span className="text-[11px] font-bold text-red-500">Pending</span>
              </div>
            </div>
            <p className="-mt-2 text-[10px] text-content-muted text-center font-medium">
              Task count = pieces × work steps (e.g. 10 shirts × Wash + Iron = 20). Completed = steps staff have ticked done.
            </p>

            {/* Supervisor Directives & Tasks Assigned to Manager */}
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-brand-forest" />
                  <h3 className="text-xs font-black text-brand-forest">Supervisor Directives & Assigned Tasks</h3>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    myDirectives.filter((d) => d.taskUnits.some((u) => u.status === 'PENDING')).length > 0
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {myDirectives.length === 0
                    ? 'No Directives'
                    : `${myDirectives.filter((d) => d.taskUnits.every((u) => u.status === 'COMPLETED')).length}/${myDirectives.length} Done`}
                </span>
              </div>

              {isLoadingMyDirectives ? (
                <p className="text-xs text-content-muted text-center py-4">Checking assigned directives...</p>
              ) : myDirectives.length === 0 ? (
                <div className="py-4 text-center rounded-xl bg-surface-cream/50 border border-border-subtle/50 space-y-1">
                  <p className="text-xs font-bold text-brand-forest">No operational directives assigned for this date</p>
                  <p className="text-[10px] text-content-muted">Directives assigned by Supervisor or Owner will appear here</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {myDirectives.map((directive) => {
                    const unit = directive.taskUnits[0];
                    const isDone = unit?.status === 'COMPLETED';
                    const parsed = parseAssignmentNotes(directive.notes);
                    const cleanMobile = directive.customerMobile ? directive.customerMobile.replace(/\D/g, '') : null;

                    return (
                      <div
                        key={directive.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                          isDone
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-surface-cream/40 border-border-subtle hover:border-brand-forest/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 font-extrabold text-[10px] uppercase tracking-wider">
                                Directive
                              </span>
                              <h4 className="text-xs font-extrabold text-brand-forest">
                                {directive.orderId || 'Operational Task'}
                              </h4>
                            </div>

                            {/* Customer Mobile & Call/WhatsApp if attached */}
                            {cleanMobile && (
                              <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-2 mt-1">
                                <span className="font-mono text-[11px] font-bold text-emerald-950">
                                  📞 {directive.customerMobile}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={`tel:${cleanMobile}`}
                                    className="px-2 py-0.5 rounded bg-brand-forest text-brand-lime font-bold text-[10px]"
                                    title="Call"
                                  >
                                    Call
                                  </a>
                                  <a
                                    href={`https://wa.me/91${cleanMobile}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]"
                                    title="WhatsApp"
                                  >
                                    WhatsApp
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Location tag if attached */}
                            {parsed.location && (
                              <div className="flex items-start gap-1 p-1.5 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-950 mt-1">
                                <MapPin className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                                <span>{parsed.location}</span>
                              </div>
                            )}

                            {parsed.cleanNotes && (
                              <p className="text-[11px] text-content-muted font-medium leading-relaxed whitespace-pre-wrap">
                                {parsed.cleanNotes}
                              </p>
                            )}
                            <div className="flex items-center gap-3 pt-1 text-[10px] text-content-muted">
                              <span>Target Date: {directive.createdAt ? localDateKey(new Date(directive.createdAt)) : selectedDate}</span>
                              {unit?.completedAt && (
                                <span className="text-emerald-700 font-bold flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  Completed at {new Date(unit.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>

                          {unit && (
                            <button
                              type="button"
                              disabled={completingMyDirectiveId === unit.id}
                              onClick={async () => {
                                if (completingMyDirectiveId === unit.id) return;
                                setCompletingMyDirectiveId(unit.id);
                                // Instant optimistic update (<10ms)
                                setMyDirectives((prev) =>
                                  prev.map((d) =>
                                    d.id !== directive.id
                                      ? d
                                      : {
                                          ...d,
                                          taskUnits: d.taskUnits.map((u) =>
                                            u.id === unit.id
                                              ? {
                                                  ...u,
                                                  status: isDone ? 'PENDING' : 'COMPLETED',
                                                  completedAt: isDone ? null : new Date().toISOString(),
                                                }
                                              : u
                                          ),
                                        }
                                  )
                                );
                                try {
                                  await apiRequest(`/api/shops/${activeShopId}/task-units/${unit.id}/toggle`, {
                                    method: 'PATCH',
                                  });
                                  await fetchMyDirectives();
                                  fetchData(true);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Failed to update directive status.');
                                  await fetchMyDirectives();
                                } finally {
                                  setCompletingMyDirectiveId(null);
                                }
                              }}
                              className={`touch-manipulation active:scale-95 shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                isDone
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-[#245431] text-white hover:bg-[#1E4327] shadow-sm'
                              }`}
                            >
                              {isDone ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Done</span>
                                </>
                              ) : (
                                <span>Mark Done</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Attendance Overview Card with Donut Ring (Screen 2) */}
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
              <h3 className="text-xs font-black text-brand-forest">Attendance Overview</h3>
              <div className="flex items-center justify-around gap-4 pt-1">
                {/* Circular Gauge */}
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#F1F5F9" strokeWidth="9" fill="none" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#245431"
                      strokeWidth="9"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 * (1 - attendanceRate / 100)}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-xl font-black text-brand-forest">{attendanceRate}%</span>
                    <span className="block text-[8px] font-bold text-content-muted">Present</span>
                  </div>
                </div>

                {/* Legend matching Screen 2 */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span className="text-content-muted font-medium">Present</span>
                    <span className="font-extrabold text-brand-forest ml-auto">{presentCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-content-muted font-medium">Absent</span>
                    <span className="font-extrabold text-brand-forest ml-auto">{absentCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-content-muted font-medium">Half Day</span>
                    <span className="font-extrabold text-brand-forest ml-auto">{halfDayCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Services for the selected date — one card per active service in the DB catalogue */}
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-brand-forest">
                  {isViewingToday ? 'Today\'s Tasks by Service' : `Tasks by Service — ${reportDateLabel}`}
                </h3>
                <span className="text-[10px] font-bold text-content-muted">done / total</span>
              </div>
              {(dashboardData?.serviceBreakdown ?? []).length === 0 ? (
                <p className="text-xs text-content-muted text-center py-2">No services configured. Owner can add services in Owner › Services.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(dashboardData?.serviceBreakdown ?? []).map((s) => (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border ${s.totalUnits > 0 ? 'bg-[#EEF5EF] border-emerald-100' : 'bg-surface-cream/40 border-border-subtle'}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-brand-forest truncate" title={s.name}>{s.name}</span>
                        <span className="text-[9px] font-mono font-bold text-content-muted shrink-0">{s.code}</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-lg font-black text-brand-forest">{s.completedUnits}</span>
                        <span className="text-xs font-bold text-content-muted">/ {s.totalUnits}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-border-subtle overflow-hidden mt-1">
                        <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${s.percentage}%` }} />
                      </div>
                      <span className="text-[10px] text-content-muted font-medium block mt-1">
                        {s.orders} orders • {s.pieces} pcs
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity Stream matching Screen 2 */}
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
              <h3 className="text-xs font-black text-brand-forest">Recent Activity</h3>
              <div className="space-y-2.5 text-xs">
                {staffList.filter((s) => s.attendanceToday.checkInAt).length > 0 ? (
                  staffList
                    .filter((s) => s.attendanceToday.checkInAt)
                    .sort((a, b) => new Date(b.attendanceToday.checkInAt!).getTime() - new Date(a.attendanceToday.checkInAt!).getTime())
                    .slice(0, 3)
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-border-subtle/40 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-brand-forest">
                            <strong>{s.staffMember.fullName}</strong> checked in
                          </span>
                        </div>
                        <span className="text-[10px] text-content-muted font-mono font-medium">
                          {new Date(s.attendanceToday.checkInAt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-content-muted text-center py-2 font-medium">
                    No check-ins recorded for {isViewingToday ? 'today' : reportDateLabel}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 2: ALL STAFF DIRECTORY (SCREEN 3)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'staff' && (
        <div className="p-4 space-y-3.5 animate-fade-in">
          {/* Header matching Screen 3 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentNav('dashboard')}
                className="p-1.5 rounded-xl hover:bg-surface-cream"
              >
                <ChevronLeft className="w-5 h-5 text-brand-forest" />
              </button>
              <h1 className="text-base font-black text-brand-forest">
                All Staff ({staffList.length})
              </h1>
            </div>

            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover active:scale-95 flex items-center justify-center transition-all touch-manipulation"
              title="Refresh staff"
              aria-label="Refresh staff"
            >
              <RefreshCw className={`w-4 h-4 text-brand-forest ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Bar matching Screen 3 */}
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

          {/* Dynamic Role Filter Chips matching Screen 3 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {Object.keys(roleCounts).map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRoleFilter(role)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedRoleFilter === role
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'bg-white border border-border-subtle text-content-muted hover:text-brand-forest'
                  }`}
              >
                {role === 'ALL' ? `All (${roleCounts['ALL']})` : `${role} (${roleCounts[role]})`}
              </button>
            ))}
          </div>

          {/* Staff Cards List matching Screen 3 */}
          <div className="space-y-2.5">
            {filteredStaff.length > 0 ? (
              filteredStaff.map((staff) => (
                <div
                  key={staff.id}
                  onClick={() => {
                    setSelectedStaff(staff);
                    setStaffProfileTab('overview');
                    setStaffTaskDate(selectedDate);
                    setActiveDrilldown('staff_details');
                  }}
                  className="cursor-pointer bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm flex items-center justify-between hover:border-brand-forest/40 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center text-sm shadow-sm">
                      {staff.staffMember.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-brand-forest">{staff.staffMember.fullName}</h3>
                      <p className="text-[11px] text-content-muted font-medium">
                        {staff.positionCategory?.name || staff.role}
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
              ))
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
                <p className="text-xs font-bold text-content-muted">No staff members found matching your search.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 3: ATTENDANCE OVERVIEW (FROM BOTTOM NAV)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'attendance' && (
        <div className="p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-black text-brand-forest flex items-center gap-2">
              Floor Attendance
              {isRefreshing && <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" aria-label="Loading" />}
            </h1>
            {attendanceViewMode === 'daily' ? (
              <div className="flex items-center gap-1.5">
                {!isViewingToday && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayKey)}
                    className="text-[10px] font-black px-2 py-1 rounded-lg bg-brand-forest text-white"
                  >
                    Today
                  </button>
                )}
                <input
                  type="date"
                  value={selectedDate}
                  max={todayKey}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-white"
                />
              </div>
            ) : (
              <span className="text-xs font-bold text-content-muted">Monthly History</span>
            )}
          </div>

          {/* Sub-Tab Navigation: Daily Floor Attendance vs Monthly History */}
          <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-xl border border-border-subtle shadow-2xs">
            <button
              type="button"
              onClick={() => setAttendanceViewMode('daily')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                attendanceViewMode === 'daily'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Daily Floor Attendance
            </button>
            <button
              type="button"
              onClick={() => {
                setAttendanceViewMode('monthly');
                fetchMonthlyAttendance(monthlyStaffId, selectedAttendanceYear, selectedAttendanceMonth);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                attendanceViewMode === 'monthly'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Monthly History</span>
            </button>
          </div>

          {attendanceViewMode === 'daily' ? (
            <div className="space-y-4">

          {!isViewingToday && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 text-center">
              Viewing {reportDateLabel} — past attendance is view-only. Attendance can be marked only for today.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-200 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-xl font-black text-emerald-800">{activeOnFloorCount}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700">On Floor</span>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-200 text-center shadow-sm">
              <span className="text-xl font-black text-blue-800 block">{completedShiftCount}</span>
              <span className="text-[10px] font-bold text-blue-700">Shift Done</span>
            </div>
            <div className="bg-red-50/30 p-3 rounded-2xl border border-red-100 text-center shadow-sm">
              <span className="text-xl font-black text-red-600 block">{absentCount}</span>
              <span className="text-[10px] font-bold text-red-500">Absent</span>
            </div>
          </div>

          {/* Manager Self Attendance Card (Direct Live Camera Biometric Verification) */}
          <div className="bg-gradient-to-br from-brand-forest to-[#1A3F24] p-4 rounded-2xl text-white shadow-clay space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-black text-sm text-brand-lime shadow-inner">
                  {managerDisplayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-brand-lime uppercase tracking-wider block">{managerRoleLabel}</span>
                  <h3 className="text-sm font-black">{managerDisplayName}</h3>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                managerSession?.attendanceType === 'ABSENT'
                  ? 'bg-red-400 text-red-950'
                  : managerSession?.status === 'OPEN'
                    ? 'bg-emerald-400 text-emerald-950'
                    : managerSession?.checkOutAt
                      ? 'bg-blue-300 text-blue-950'
                      : 'bg-amber-400 text-amber-950'
              }`}>
                {managerSession?.attendanceType === 'ABSENT'
                  ? (managerSession.status === 'OPEN' ? 'Absent (On Floor)' : 'Absent')
                  : managerSession?.status === 'OPEN'
                    ? 'Checked In'
                    : managerSession?.checkOutAt
                      ? 'Completed Shift'
                      : 'Not Marked'}
              </span>
            </div>

            {/* Time & Selfie Status details */}
            <div className="bg-white/10 rounded-xl p-3 flex items-center justify-between text-xs backdrop-blur-sm">
              <div className="space-y-0.5">
                {managerSession?.checkInAt ? (
                  <div className="text-[11px] text-white">
                    <span>In: <strong>{new Date(managerSession.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                    {managerSession.checkOutAt && (
                      <span className="ml-2">• Out: <strong>{new Date(managerSession.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-emerald-100/90 font-medium">Direct live front-camera selfie required</span>
                )}
              </div>

              {managerSession?.checkInPhotoPath && (
                <button
                  type="button"
                  onClick={() => setViewingAttendancePhoto({
                    staffName: managerDisplayName,
                    role: managerRoleLabel,
                    photoUrl: managerSession.checkInPhotoPath!,
                    checkOutPhotoUrl: managerSession.checkOutPhotoPath || undefined,
                    timestamp: managerSession.checkInAt,
                    checkOutTimestamp: managerSession.checkOutAt || undefined,
                    status: managerSession.status,
                  })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold transition-colors shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5 text-brand-lime" />
                  <span>View My Selfie</span>
                </button>
              )}
            </div>

            {/* Action Buttons for Manager Self-Attendance with Live Camera (today only) */}
            {!isViewingToday ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 p-2.5 text-[11px] font-bold">
                <span>Attendance can be marked only for today.</span>
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey)}
                  className="px-2.5 py-1 rounded-lg bg-brand-lime text-brand-forest font-black shrink-0"
                >
                  Go to Today
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {managerSession?.status === 'OPEN' ? (
                  <button
                    type="button"
                    disabled={isProcessingAttendance || !timingWindow.isCheckOutAllowed}
                    onClick={() => {
                      if (!timingWindow.isCheckOutAllowed) return;
                      setCameraAction('check-out');
                      setIsLiveCameraOpen(true);
                    }}
                    title={timingWindow.checkOutReason}
                    className={`w-full py-2.5 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2 transition-all ${
                      timingWindow.isCheckOutAllowed
                        ? 'bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white cursor-pointer'
                        : 'bg-white/20 text-white/60 cursor-not-allowed border border-white/20'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>
                      {isProcessingAttendance
                        ? 'Processing...'
                        : timingWindow.isCheckOutAllowed
                          ? 'Check Out with Live Camera'
                          : timingWindow.checkOutReason}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isProcessingAttendance || !timingWindow.isCheckInAllowed}
                    onClick={() => {
                      if (!timingWindow.isCheckInAllowed) return;
                      setCameraAction('check-in');
                      setIsLiveCameraOpen(true);
                    }}
                    title={timingWindow.checkInReason}
                    className={`w-full py-2.5 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2 transition-all ${
                      timingWindow.isCheckInAllowed
                        ? 'bg-brand-lime hover:bg-[#8fd033] active:scale-[0.99] text-brand-forest cursor-pointer'
                        : 'bg-white/20 text-white/60 cursor-not-allowed border border-white/20'
                    }`}
                  >
                    <Camera className="w-4 h-4 text-brand-forest" />
                    <span>
                      {isProcessingAttendance
                        ? 'Verifying...'
                        : timingWindow.isCheckInAllowed
                          ? 'Check In with Live Camera'
                          : timingWindow.checkInReason}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Staff Shift Roster</h3>
            <div className="space-y-2">
              {staffList.map((staff) => (
                <div key={staff.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-cream/50 border border-border-subtle text-xs hover:border-brand-forest/30 transition-colors">
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-brand-forest block">{staff.staffMember.fullName}</span>
                    <div className="flex items-center gap-2 text-[10px] text-content-muted">
                      <span>{staff.positionCategory?.name || staff.role}</span>
                      {staff.attendanceToday.checkInAt && (
                        <span>• In: <strong>{new Date(staff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      )}
                      {staff.attendanceToday.checkOutAt && (
                        <span>• Out: <strong>{new Date(staff.attendanceToday.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {staff.attendanceToday.checkInPhotoPath && (
                      <button
                        type="button"
                        onClick={() => setViewingAttendancePhoto({
                          staffName: staff.staffMember.fullName,
                          role: staff.positionCategory?.name || staff.role,
                          photoUrl: staff.attendanceToday.checkInPhotoPath!,
                          checkOutPhotoUrl: staff.attendanceToday.checkOutPhotoPath || undefined,
                          timestamp: staff.attendanceToday.checkInAt || undefined,
                          checkOutTimestamp: staff.attendanceToday.checkOutAt || undefined,
                          status: staff.attendanceToday.status,
                        })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold shadow-sm transition-colors"
                        title="View Attendance Check-in Selfie"
                      >
                        <Camera className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Selfie</span>
                      </button>
                    )}
                    {staff.attendanceEnabled === false || staff.attendanceToday.status === 'EXEMPT' ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                        Exempt
                      </span>
                    ) : staff.attendanceToday.isOnFloor || (staff.attendanceToday.isPresent && !staff.attendanceToday.checkOutAt && staff.attendanceToday.status === 'OPEN') ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        ● On Floor
                      </span>
                    ) : staff.attendanceToday.isShiftCompleted || (staff.attendanceToday.isPresent && (!!staff.attendanceToday.checkOutAt || staff.attendanceToday.status === 'CLOSED')) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        Shift Done
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700">
                        Absent
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* Staff Member Selector Bar */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-content-muted block">Select Staff Member:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setMonthlyStaffId('manager');
                  fetchMonthlyAttendance('manager', selectedAttendanceYear, selectedAttendanceMonth);
                }}
                className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                  monthlyStaffId === 'manager'
                    ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                    : 'bg-white text-content-body border-border-subtle hover:border-brand-forest/40'
                }`}
              >
                👑 My Own Attendance
              </button>
              {staffList.map((staff) => (
                <button
                  key={staff.staffMember.id}
                  type="button"
                  onClick={() => {
                    setMonthlyStaffId(staff.staffMember.id);
                    fetchMonthlyAttendance(staff.staffMember.id, selectedAttendanceYear, selectedAttendanceMonth);
                  }}
                  className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                    monthlyStaffId === staff.staffMember.id
                      ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                      : 'bg-white text-content-body border-border-subtle hover:border-brand-forest/40'
                  }`}
                >
                  {staff.staffMember.fullName} ({staff.positionCategory?.name || staff.role})
                </button>
              ))}
            </div>
          </div>

          {/* Month Navigator */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <button
              type="button"
              onClick={() => {
                const newM = selectedAttendanceMonth === 1 ? 12 : selectedAttendanceMonth - 1;
                const newY = selectedAttendanceMonth === 1 ? selectedAttendanceYear - 1 : selectedAttendanceYear;
                setSelectedAttendanceMonth(newM);
                setSelectedAttendanceYear(newY);
                fetchMonthlyAttendance(monthlyStaffId, newY, newM);
              }}
              className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest transition-colors"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-bold text-xs text-brand-forest flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-brand-forest" />
              <span>
                {new Date(selectedAttendanceYear, selectedAttendanceMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const newM = selectedAttendanceMonth === 12 ? 1 : selectedAttendanceMonth + 1;
                const newY = selectedAttendanceMonth === 12 ? selectedAttendanceYear + 1 : selectedAttendanceYear;
                setSelectedAttendanceMonth(newM);
                setSelectedAttendanceYear(newY);
                fetchMonthlyAttendance(monthlyStaffId, newY, newM);
              }}
              className="p-1.5 rounded-lg hover:bg-surface-cream text-brand-forest transition-colors"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Summary Badges */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-base font-black text-emerald-900 block">
                {monthlyAttendanceData?.summary.presentCount ?? 0}
              </span>
              <span className="text-[10px] font-bold text-emerald-700">Full Day</span>
            </div>
            <div className="p-2 rounded-xl bg-red-50 border border-red-200">
              <span className="text-base font-black text-red-700 block">
                {monthlyAttendanceData?.summary.absentCount ?? 0}
              </span>
              <span className="text-[10px] font-bold text-red-600">Absent</span>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-base font-black text-amber-800 block">
                {monthlyAttendanceData?.summary.halfDayCount ?? 0}
              </span>
              <span className="text-[10px] font-bold text-amber-700">Half Day</span>
            </div>
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-base font-black text-blue-800 block">
                {monthlyAttendanceData?.summary.lateCount ?? 0}
              </span>
              <span className="text-[10px] font-bold text-blue-700">Late</span>
            </div>
          </div>

          {/* Attendance Daily List */}
          {isLoadingAttendanceHistory ? (
            <div className="py-12 text-center text-xs font-bold text-content-muted flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
              <span>Loading attendance records...</span>
            </div>
          ) : monthlyAttendanceData?.sessions && monthlyAttendanceData.sessions.length > 0 ? (
            <div className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-2">
              {monthlyAttendanceData.sessions.map((item) => {
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
                const isHalfDay = item.isHalfDay ?? ((item.durationMinutes || 0) > 0 && (item.durationMinutes || 0) < 240 && item.status !== 'OPEN');
                const isOpen = item.status === 'OPEN';

                const staffInfo = monthlyStaffId === 'manager'
                  ? { name: managerDisplayName, role: managerRoleLabel }
                  : staffList.find((s) => s.staffMember.id === monthlyStaffId)
                    ? {
                        name: staffList.find((s) => s.staffMember.id === monthlyStaffId)!.staffMember.fullName,
                        role: staffList.find((s) => s.staffMember.id === monthlyStaffId)!.positionCategory?.name || staffList.find((s) => s.staffMember.id === monthlyStaffId)!.role,
                      }
                    : { name: 'Staff Member', role: 'Staff' };

                return (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-border-subtle/40 text-xs last:border-b-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-brand-forest">{dateStr}</span>
                        <span className="text-content-muted text-[11px]">({dayStr})</span>
                      </div>
                      <span className="text-[11px] font-medium text-content-muted block">{timeStr}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {(item.checkInPhotoPath || item.checkOutPhotoPath) && (
                        <button
                          type="button"
                          onClick={() => setViewingAttendancePhoto({
                            staffName: staffInfo.name,
                            role: staffInfo.role,
                            photoUrl: item.checkInPhotoPath || undefined,
                            checkOutPhotoUrl: item.checkOutPhotoPath || undefined,
                            timestamp: item.checkInAt,
                            checkOutTimestamp: item.checkOutAt || undefined,
                            status: item.status,
                          })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold shadow-sm transition-colors"
                          title="View Attendance Selfie"
                        >
                          <Camera className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Selfie</span>
                        </button>
                      )}

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
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-2xl border border-border-subtle shadow-sm text-center">
              <p className="text-xs font-bold text-content-muted">No attendance sessions recorded for this month.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 4: REPORTS OVERVIEW (FROM BOTTOM NAV)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'reports' && (
        <div className="p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-black text-brand-forest">Operations Reports</h1>
            <span className="text-xs font-bold text-content-muted">{reportDateLabel}</span>
          </div>

          {/* Overall completion for the selected day */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-clay-sm text-center">
              <span className="text-[10px] font-bold text-content-muted block">Total Units</span>
              <span className="text-lg font-black text-brand-forest">{dashboardData?.todayTasks?.total ?? 0}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-clay-sm text-center">
              <span className="text-[10px] font-bold text-content-muted block">Completed</span>
              <span className="text-lg font-black text-emerald-700">{dashboardData?.todayTasks?.completed ?? 0}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-border-subtle shadow-clay-sm text-center">
              <span className="text-[10px] font-bold text-content-muted block">Pending</span>
              <span className="text-lg font-black text-amber-600">{dashboardData?.todayTasks?.pending ?? 0}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            <h3 className="text-xs font-black text-brand-forest">Department Progress</h3>
            <div className="space-y-3 text-xs">
              {departmentRows.filter((d) => d.total > 0).length === 0 && (
                <p className="text-content-muted text-center py-3">No task units recorded for this day.</p>
              )}
              {departmentRows.filter((d) => d.total > 0).map((d) => (
                <div key={d.name}>
                  <div className="flex justify-between mb-1 font-bold">
                    <span className="text-brand-forest">{d.name}</span>
                    <span>{d.completed}/{d.total} units • {d.percentage}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${d.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            <h3 className="text-xs font-black text-brand-forest">Service-wise Summary</h3>
            <div className="space-y-3 text-xs">
              {serviceRows.length === 0 && (
                <p className="text-content-muted text-center py-3">No orders assigned for this day.</p>
              )}
              {serviceRows.map((s) => (
                <div key={s.id}>
                  <div className="flex justify-between mb-1 font-bold">
                    <span className="text-brand-forest">{s.name}</span>
                    <span>{s.orders} orders • {s.pieces} pcs • {s.percentage}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full bg-[#84C42C] rounded-full transition-all" style={{ width: `${s.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 5: MANAGER PROFILE & ATTENDANCE (SCREEN 10)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'profile' && (
        <div className="p-4">
          <StaffProfileCard
            title="Manager Profile"
            onBack={() => setCurrentNav('dashboard')}
            staff={{
              fullName: user?.staffMember?.fullName || 'Manager',
              mobile: managerMobile,
              address: managerAddress,
              profilePhotoPath: user?.staffMember?.profilePhotoPath,
              employmentStatus: user?.staffMember?.employmentStatus || 'ACTIVE',
            }}
            membership={{
              shopId: activeShopId || undefined,
              shopName: activeShopName || undefined,
              roleName: managerRole,
              positionCategory: myStaffRecord?.positionCategory?.name || myMembership?.positionCategory,
              joiningDate: managerJoiningDate,
              dutyTimingNotes: myStaffRecord?.dutyTimingNotes || myMembership?.dutyTimingNotes,
              monthlySalary: managerSalary,
              incentiveAmount: myStaffRecord?.incentiveAmount ?? myMembership?.incentiveAmount,
              shiftStartTime: myStaffRecord?.shiftStartTime ?? myMembership?.shiftStartTime,
              shiftEndTime: myStaffRecord?.shiftEndTime ?? myMembership?.shiftEndTime,
              lateThreshold: myStaffRecord?.lateThreshold ?? myMembership?.lateThreshold,
              halfDayThreshold: myStaffRecord?.halfDayThreshold ?? myMembership?.halfDayThreshold,
              absentThreshold: myStaffRecord?.absentThreshold ?? myMembership?.absentThreshold,
              capabilities: myCapabilities,
            }}
            session={{
              id: managerSession?.id,
              status: managerSession?.status || 'CLOSED',
              attendanceType: managerSession?.attendanceType || undefined,
              checkInAt: managerSession?.checkInAt,
              checkOutAt: managerSession?.checkOutAt,
              checkInPhotoPath: managerSession?.checkInPhotoPath,
              checkOutPhotoPath: managerSession?.checkOutPhotoPath,
            }}
            isProcessingAttendance={isProcessingAttendance}
            onCheckInWithPhoto={async (photoData) => {
              setCameraAction('check-in');
              await handleCameraPhotoCapture(photoData);
            }}
            onCheckOutWithPhoto={async (photoData) => {
              setCameraAction('check-out');
              await handleCameraPhotoCapture(photoData);
            }}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          BOTTOM NAVIGATION BAR (5 TABS MATCHING MOCKUP COLLAGE)
      ══════════════════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-border-subtle shadow-[0_-4px_16px_rgba(0,0,0,0.04)] px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('dashboard');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${currentNav === 'dashboard' && !activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
          >
            <LayoutDashboard className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('staff');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${currentNav === 'staff' || activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
          >
            <Users className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Staff</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('attendance');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${currentNav === 'attendance' && !activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
          >
            <CalendarCheck2 className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Attendance</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('reports');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${currentNav === 'reports' && !activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
          >
            <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Reports</span>
          </button>

          <button
            onClick={() => {
              setActiveDrilldown(null);
              setCurrentNav('profile');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${currentNav === 'profile' && !activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
          >
            <User className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Profile</span>
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
              fetchStaffDetails(selectedStaff.staffMember.id, staffTaskDate);
            }
          }}
        />
      )}

      {/* Toast Alert */}
      {attendanceSuccessToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-brand-forest text-white px-5 py-3 rounded-2xl shadow-clay flex items-center gap-3 animate-fade-in text-xs font-bold border border-brand-lime">
          <CheckCircle2 className="w-5 h-5 text-brand-lime shrink-0" />
          <span>{attendanceSuccessToast}</span>
        </div>
      )}

      {/* Live Front Camera Biometric Modal */}
      {isLiveCameraOpen && (
        <LiveCameraModal
          isOpen={isLiveCameraOpen}
          onClose={() => setIsLiveCameraOpen(false)}
          onCapture={handleCameraPhotoCapture}
          title={cameraAction === 'check-in' ? 'Manager Check-In Selfie' : 'Manager Check-Out Selfie'}
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

      {/* Live Shop Alerts (all values from DB for the selected date) */}
      {isAlertsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsAlertsOpen(false)}>
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-clay border border-border-subtle space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-brand-forest"><Bell className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-sm font-black text-brand-forest">Shop Alerts</h3>
                  <p className="text-[10px] text-content-muted">
                    {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsAlertsOpen(false)} className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {absentStaffList.length > 0 ? (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-red-900 block">{absentStaffList.length} staff absent</span>
                    <p className="text-[11px] text-red-700 font-medium">{absentStaffList.map((s) => s.staffMember.fullName).join(', ')}</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-xs text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> All tracked staff are present.
                </div>
              )}

              {pendingUnits > 0 ? (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-amber-900 block">{pendingUnits} task units pending</span>
                    <p className="text-[11px] text-amber-800 font-medium">
                      {dashboardData?.todayTasks?.completed ?? 0} of {dashboardData?.todayTasks?.total ?? 0} completed.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle flex items-center gap-2 text-xs text-brand-forest font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No pending tasks.
                </div>
              )}

              <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-between text-xs">
                <span className="text-content-muted font-bold">On floor now</span>
                <span className="font-black text-emerald-800">{activeOnFloorCount}</span>
              </div>
              {halfDayCount > 0 && (
                <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-between text-xs">
                  <span className="text-content-muted font-bold">Half day</span>
                  <span className="font-black text-amber-700">{halfDayCount}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => { setIsAlertsOpen(false); setCurrentNav('attendance'); }}
              className="w-full py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black"
            >
              Open Attendance
            </button>
          </div>
        </div>
      )}

      {/* Edit Personal Details Modal */}
      {isEditDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-border-subtle max-w-sm w-full p-5 space-y-4 shadow-clay-lg">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h3 className="text-sm font-black text-brand-forest">Edit Personal Details</h3>
                <p className="text-[10px] text-content-muted">Update your contact &amp; shift information</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDetailsOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-brand-forest hover:bg-surface-cream"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editDetailsError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {editDetailsError}
              </div>
            )}

            {editDetailsSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {editDetailsSuccess}
              </div>
            )}

            <form onSubmit={handleSavePersonalDetails} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Mobile Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Residential Address</label>
                <textarea
                  rows={2}
                  placeholder="Street, City, Pincode"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">Duty Timings / Working Hours</label>
                <input
                  type="text"
                  placeholder="e.g. 09:30 AM - 07:30 PM"
                  value={editDutyTiming}
                  onChange={(e) => setEditDutyTiming(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditDetailsOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border-subtle bg-surface-cream text-content-muted text-xs font-bold hover:text-brand-forest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDetails}
                  className="flex-1 py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black shadow-clay hover:opacity-95 disabled:opacity-50"
                >
                  {isSavingDetails ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
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
              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 leading-snug">
                <span className="font-bold">Historical Trace:</span> Original record for {staffTaskDate} will stay intact with its pending status preserved. A duplicate task with pending units will be assigned on {rescheduleDate}.
              </div>
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
    </div>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface-cream flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
      </div>
    }>
      <ManagerPageInner />
    </Suspense>
  );
}
