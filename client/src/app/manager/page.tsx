'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  ServiceType,
  WorkflowProfile,
} from '../../types';
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
} from 'lucide-react';

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
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
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
  positionCategory?: { id: string; name: string } | null;
  account?: { id: string; username: string; status: string } | null;
  joiningDate?: string | null;
  monthlySalary?: number | null;
  dutyTimingNotes?: string | null;
  incentiveAmount?: number | null;
  attendanceToday: StaffAttendance;
}

interface DashboardMetrics {
  totalStaff: number;
  presentCount: number;
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
}

interface StaffTaskUnit {
  id: string;
  unitType: string;
  status: string;
  activityCode?: string | null;
  pieceNumber?: number | null;
  completedAt?: string | null;
}

interface StaffAssignment {
  id: string;
  orderId?: string | null;
  pieceCount?: number | null;
  pickupCount?: number | null;
  notes?: string | null;
  workflowProfile: { workflowType: string; name: string };
  serviceType?: { name: string; code: string } | null;
  taskUnits: StaffTaskUnit[];
  createdAt: string;
}

export default function ManagerPage() {
  const router = useRouter();
  const { user, activeShopId, logout } = useAuth();

  // Navigation State (5 Main Screens via Bottom Nav)
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'staff' | 'attendance' | 'reports' | 'profile'>('dashboard');

  // Drilldown States
  // 'staff_details' | 'create_task' | null
  const [activeDrilldown, setActiveDrilldown] = useState<'staff_details' | 'create_task' | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<ManagerStaffItem | null>(null);

  // Profile Details Tab inside Staff Details (Screen 4: Overview, Tasks, Attendance, Performance)
  const [staffProfileTab, setStaffProfileTab] = useState<'overview' | 'tasks' | 'attendance' | 'performance'>('overview');

  // Manager Profile Subtab (Screen 10: Attendance vs Profile Details)
  const [managerProfileSubtab, setManagerProfileSubtab] = useState<'attendance' | 'details'>('attendance');

  // Shared Filters & Dates
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');

  // Data States
  const [dashboardData, setDashboardData] = useState<DashboardMetrics | null>(null);
  const [staffList, setStaffList] = useState<ManagerStaffItem[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Staff Tasks Tab State (Screen 9)
  const [staffTaskDate, setStaffTaskDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffDayAssignments, setStaffDayAssignments] = useState<StaffAssignment[]>([]);
  const [staffMonthlySummary, setStaffMonthlySummary] = useState<StaffTaskMonthlySummary | null>(null);
  const [isLoadingStaffData, setIsLoadingStaffData] = useState(false);

  // Create Task Wizard State (Screens 5, 6, 7, 8)
  const [taskCreateDate, setTaskCreateDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [taskOrderId, setTaskOrderId] = useState('');
  const [taskPieces, setTaskPieces] = useState<number | ''>('');
  const [taskServiceTypeId, setTaskServiceTypeId] = useState('');
  const [taskSelectedActivities, setTaskSelectedActivities] = useState<string[]>(['WASH', 'DRY']);
  const [deliveryType, setDeliveryType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [taskPickupCount, setTaskPickupCount] = useState<number | ''>('');
  const [taskPickupLocation, setTaskPickupLocation] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manager Self Attendance State (Screen 10)
  const [managerSession, setManagerSession] = useState<{ id: string; checkInAt: string; checkOutAt: string | null; status: string; checkInPhotoPath?: string | null } | null>(null);
  const [managerPhotoPreview, setManagerPhotoPreview] = useState<string | null>(null);
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);

  // Fetch Core Dashboard & Staff Data
  const fetchData = useCallback(async () => {
    if (!activeShopId) return;
    setIsLoading(true);
    try {
      const [dashRes, staffRes, svcRes, wfRes, sessRes] = await Promise.all([
        apiRequest<DashboardMetrics>(`/api/shops/${activeShopId}/supervisor/dashboard?date=${selectedDate}`).catch(() => null),
        apiRequest<{ staff: ManagerStaffItem[] }>(`/api/shops/${activeShopId}/staff`).catch(() => ({ staff: [] })),
        apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types').catch(() => ({ serviceTypes: [] })),
        apiRequest<{ profiles: WorkflowProfile[] }>('/api/config/workflow-profiles').catch(() => ({ profiles: [] })),
        apiRequest<{ session: { id: string; checkInAt: string; checkOutAt: string | null; status: string; checkInPhotoPath?: string | null } | null }>(`/api/shops/${activeShopId}/attendance/my-session`).catch(() => ({ session: null })),
      ]);

      if (dashRes) setDashboardData(dashRes);
      if (staffRes) setStaffList(staffRes.staff || []);
      if (svcRes) setServices(svcRes.serviceTypes || []);
      if (wfRes) setWorkflowProfiles(wfRes.profiles || []);
      if (sessRes) setManagerSession(sessRes.session);
    } catch (err) {
      console.error('Failed to load manager workspace:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeShopId, selectedDate]);

  useEffect(() => {
    fetchData();
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

  // Open Create Task drilldown for a specific staff member
  const handleOpenCreateTask = (staff: ManagerStaffItem) => {
    setSelectedStaff(staff);
    setTaskFeedback(null);
    setTaskCreateDate(selectedDate);
    setTaskOrderId('');
    setTaskPieces('');
    setTaskPickupCount('');
    setTaskPickupLocation('');
    setTaskNotes('');

    const roleName = (staff.positionCategory?.name || staff.role || '').toLowerCase();
    if (roleName.includes('iron')) {
      setTaskSelectedActivities(['IRON', 'FOLD', 'PACK']);
      setDeliveryType('DELIVERY');
    } else if (roleName.includes('deliver')) {
      setDeliveryType('DELIVERY');
      setTaskSelectedActivities(['DELIVERY']);
    } else {
      // Default Washerman
      setTaskSelectedActivities(['WASH', 'DRY']);
      setDeliveryType('DELIVERY');
    }

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
      const roleName = (selectedStaff.positionCategory?.name || selectedStaff.role || '').toLowerCase();
      let workflowProfileId = '';

      if (roleName.includes('deliver')) {
        if (deliveryType === 'DELIVERY') {
          const wf = workflowProfiles.find((w) => w.workflowType === 'PER_ORDER');
          workflowProfileId = wf?.id || 'wfp-per-order';
        } else {
          const wf = workflowProfiles.find((w) => w.workflowType === 'COUNT_BASED');
          workflowProfileId = wf?.id || 'wfp-count-based';
        }
      } else {
        const wf = workflowProfiles.find((w) => w.workflowType === 'PIECE_ACTIVITY');
        workflowProfileId = wf?.id || 'wfp-piece-activity';
      }

      const idempotencyKey = `mgr-task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      const payload: Record<string, unknown> = {
        assignmentDate: taskCreateDate,
        workflowProfileId,
        idempotencyKey,
      };

      if (roleName.includes('deliver')) {
        if (deliveryType === 'DELIVERY') {
          if (!taskOrderId.trim()) throw new Error('Order ID is required for delivery.');
          payload.orderId = taskOrderId.trim();
          if (taskPieces) payload.pieceCount = Number(taskPieces);
          if (taskNotes.trim()) payload.notes = taskNotes.trim();
        } else {
          if (!taskPickupCount || Number(taskPickupCount) < 1) throw new Error('Pickup count must be at least 1.');
          payload.pickupCount = Number(taskPickupCount);
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

      await apiRequest(`/api/shops/${activeShopId}/staff/${selectedStaff.staffMember.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setTaskFeedback({ type: 'success', message: 'Task assigned successfully!' });
      setTaskOrderId('');
      setTaskPieces('');
      setTaskPickupCount('');
      setTaskPickupLocation('');
      setTaskNotes('');

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

  // Handle Photo File Selection for Manager Self-Attendance (Screen 10)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setManagerPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle Manager Self Attendance Check-In / Check-Out
  const handleSelfAttendance = async (action: 'check-in' | 'check-out') => {
    if (!activeShopId) return;
    if (!managerPhotoPreview && action === 'check-in') {
      alert('Please snap or upload a photo to verify your check-in.');
      return;
    }

    setIsProcessingAttendance(true);
    setAttendanceMessage(null);

    try {
      const endpoint = `/api/shops/${activeShopId}/attendance/${action}`;
      const res = await apiRequest<{ message: string; checkInAt?: string; checkOutAt?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          photoPath: managerPhotoPreview || 'selfie_captured_verified.jpg',
        }),
      });

      setAttendanceMessage(res.message || (action === 'check-in' ? 'Checked in successfully!' : 'Checked out successfully!'));
      setManagerPhotoPreview(null);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Attendance operation failed.');
    } finally {
      setIsProcessingAttendance(false);
    }
  };

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

  // Attendance donut calculations
  const totalStaffCount = dashboardData?.totalStaff ?? staffList.length;
  const presentCount = dashboardData?.presentCount ?? staffList.filter((s) => s.attendanceToday.isPresent).length;
  const absentCount = dashboardData?.absentCount ?? Math.max(0, totalStaffCount - presentCount);
  const attendanceRate = totalStaffCount > 0 ? Math.round((presentCount / totalStaffCount) * 100) : 0;

  // Task breakdown numbers
  const washCount = dashboardData?.departmentBreakdown?.wash?.total ?? 0;
  const ironCount = dashboardData?.departmentBreakdown?.iron?.total ?? 0;
  const deliveryCount = dashboardData?.departmentBreakdown?.packaging?.total ?? 0;
  const pickupCount = dashboardData?.departmentBreakdown?.dryClean?.total ?? 0;

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 bg-[#F8F9FA] text-[#1E293B] antialiased">
      {isLoading && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 text-center animate-pulse">
          Refreshing shop workspace...
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
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                taskFeedback.type === 'success'
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

            {/* SCREEN 7 & 8: DELIVERY BOY VARIANT */}
            {(selectedStaff.positionCategory?.name || selectedStaff.role || '').toLowerCase().includes('deliver') ? (
              <>
                {/* Service Type Radio: Delivery vs Pickup */}
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-2">Service Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('DELIVERY')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        deliveryType === 'DELIVERY'
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
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        deliveryType === 'PICKUP'
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
                ) : (
                  /* Screen 8: Pickup Sub-form */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">No. of Pieces *</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Enter pickup count"
                        value={taskPickupCount}
                        onChange={(e) => setTaskPickupCount(e.target.value ? parseInt(e.target.value) : '')}
                        required
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-2 focus:ring-brand-forest"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-forest mb-1">Pickup Location / Address *</label>
                      <input
                        type="text"
                        placeholder="e.g. Hotel Grand, Chandmari / Client Residence"
                        value={taskPickupLocation}
                        onChange={(e) => setTaskPickupLocation(e.target.value)}
                        required
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

                {/* Role Specific Checkboxes */}
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-2">Process Activities *</label>
                  {(selectedStaff.positionCategory?.name || selectedStaff.role || '').toLowerCase().includes('iron') ? (
                    /* Screen 6 Ironman Checkboxes: Iron, Fold, Pack */
                    <div className="flex items-center gap-3">
                      {['IRON', 'FOLD', 'PACK'].map((act) => {
                        const isChecked = taskSelectedActivities.includes(act);
                        return (
                          <button
                            key={act}
                            type="button"
                            onClick={() => toggleActivity(act)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                              isChecked
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
                  ) : (
                    /* Screen 5 Washerman Checkboxes: Wash, Dry */
                    <div className="flex items-center gap-3">
                      {['WASH', 'DRY'].map((act) => {
                        const isChecked = taskSelectedActivities.includes(act);
                        return (
                          <button
                            key={act}
                            type="button"
                            onClick={() => toggleActivity(act)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                              isChecked
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
              <div className="space-y-2">
                {staffDayAssignments.map((a) => {
                  const activities = a.taskUnits.map((u) => u.activityCode).filter(Boolean);
                  const uniqueActs = Array.from(new Set(activities)).join(', ') || a.workflowProfile.name;
                  const completedCount = a.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                  const isAllDone = a.taskUnits.length > 0 && completedCount === a.taskUnits.length;

                  return (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-brand-forest">
                            {a.orderId ? a.orderId : 'Pickup'}
                          </span>
                          <span className="text-content-muted font-medium">
                            {a.pieceCount ? `${a.pieceCount} pcs` : a.pickupCount ? `${a.pickupCount} pcs` : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-content-muted truncate max-w-[200px]">
                          {a.notes ? a.notes : uniqueActs}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isAllDone
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isAllDone ? 'Done' : `${completedCount}/${a.taskUnits.length}`}
                        </span>
                      </div>
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
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                  selectedStaff.attendanceToday.isPresent
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {selectedStaff.attendanceToday.isPresent ? 'Present' : 'Absent'}
              </span>
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
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
                  staffProfileTab === tab
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
                    onClick={() => {
                      const prev = new Date(staffTaskDate);
                      prev.setDate(prev.getDate() - 1);
                      setStaffTaskDate(prev.toISOString().split('T')[0]);
                    }}
                    className="p-1 rounded-lg hover:bg-surface-cream"
                  >
                    <ChevronLeft className="w-4 h-4 text-brand-forest" />
                  </button>
                  <span className="text-xs font-black text-brand-forest">
                    {new Date(staffTaskDate).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Date(staffTaskDate);
                      next.setDate(next.getDate() + 1);
                      setStaffTaskDate(next.toISOString().split('T')[0]);
                    }}
                    className="p-1 rounded-lg hover:bg-surface-cream"
                  >
                    <ChevronRight className="w-4 h-4 text-brand-forest" />
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
                    const acts = assignment.taskUnits.map((u) => u.activityCode).filter(Boolean);
                    const label = Array.from(new Set(acts)).join(', ') || assignment.workflowProfile.name;
                    const completedCount = assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length;
                    const isAllCompleted = assignment.taskUnits.length > 0 && completedCount === assignment.taskUnits.length;
                    const lastCompletedAt = assignment.taskUnits.find((u) => u.completedAt)?.completedAt;

                    return (
                      <div
                        key={assignment.id}
                        className="bg-white p-3.5 rounded-2xl border border-border-subtle shadow-sm flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center ${
                              isAllCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-cream text-content-muted'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-brand-forest">
                                {assignment.orderId ? assignment.orderId : 'Pickup'}
                              </span>
                              <span className="text-[11px] text-content-muted font-bold">
                                {assignment.pieceCount ? `${assignment.pieceCount} pcs` : assignment.pickupCount ? `${assignment.pickupCount} pcs` : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted font-medium truncate max-w-[180px]">
                              {assignment.notes || label}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                              isAllCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isAllCompleted
                              ? lastCompletedAt
                                ? `Completed ${new Date(lastCompletedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                                : 'Completed'
                              : 'Pending'}
                          </span>
                        </div>
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

          {/* TAB 3: ATTENDANCE */}
          {staffProfileTab === 'attendance' && (
            <div className="space-y-3">
              <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
                <h4 className="text-xs font-black text-brand-forest">Attendance Record</h4>
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-subtle">
                  <span className="text-content-muted">Status Today:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedStaff.attendanceToday.isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                    {selectedStaff.attendanceToday.isPresent ? 'Present' : 'Absent'}
                  </span>
                </div>
                {selectedStaff.attendanceToday.checkInAt && (
                  <div className="flex items-center justify-between text-xs py-2 border-b border-border-subtle">
                    <span className="text-content-muted">Check In Time:</span>
                    <span className="font-bold text-brand-forest font-mono">
                      {new Date(selectedStaff.attendanceToday.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {selectedStaff.attendanceToday.checkOutAt && (
                  <div className="flex items-center justify-between text-xs py-2 border-b border-border-subtle">
                    <span className="text-content-muted">Check Out Time:</span>
                    <span className="font-bold text-brand-forest font-mono">
                      {new Date(selectedStaff.attendanceToday.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
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
                onClick={() => setCurrentNav('profile')}
                className="relative p-2 rounded-xl bg-white border border-border-subtle shadow-sm"
              >
                <Bell className="w-4 h-4 text-brand-forest" />
                <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5" />
              </button>
            </div>
          </div>

          {/* Date Selector Row matching Screen 2 */}
          <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-forest">
              <Calendar className="w-4 h-4 text-brand-forest" />
              <span>
                {new Date(selectedDate).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  weekday: 'long',
                })}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-surface-cream cursor-pointer"
              />
            </div>
          </div>

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

          {/* Stat Row 2: Tasks status matching Screen 2 */}
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
                  <span className="text-content-muted font-medium">On Leave</span>
                  <span className="font-extrabold text-brand-forest ml-auto">0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Today's Tasks Breakdown Chips matching Screen 2 */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Today&apos;s Tasks</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-[#EEF5EF] p-2.5 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-bold text-brand-forest block truncate">Wash & Dry</span>
                <span className="text-lg font-black text-brand-forest mt-0.5 block">{washCount}</span>
              </div>
              <div className="bg-[#E8F5E9] p-2.5 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-bold text-emerald-800 block truncate">Iron</span>
                <span className="text-lg font-black text-emerald-800 mt-0.5 block">{ironCount}</span>
              </div>
              <div className="bg-[#E3F2FD] p-2.5 rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-blue-800 block truncate">Delivery</span>
                <span className="text-lg font-black text-blue-800 mt-0.5 block">{deliveryCount}</span>
              </div>
              <div className="bg-[#FFEBEE] p-2.5 rounded-xl border border-red-100">
                <span className="text-[10px] font-bold text-red-800 block truncate">Pickup</span>
                <span className="text-lg font-black text-red-800 mt-0.5 block">{pickupCount}</span>
              </div>
            </div>
          </div>

          {/* Recent Activity Stream matching Screen 2 */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Recent Activity</h3>
            <div className="space-y-2.5 text-xs">
              {staffList.filter((s) => s.attendanceToday.checkInAt).length > 0 ? (
                staffList
                  .filter((s) => s.attendanceToday.checkInAt)
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
                  No activity recorded for this shop branch yet today.
                </p>
              )}
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
              onClick={fetchData}
              className="p-2 rounded-xl bg-white border border-border-subtle shadow-sm hover:bg-surface-hover"
              title="Refresh staff"
            >
              <RefreshCw className="w-4 h-4 text-brand-forest" />
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

          {/* Staff Cards List matching Screen 3 */}
          <div className="space-y-2.5">
            {filteredStaff.length > 0 ? (
              filteredStaff.map((staff) => (
                <div
                  key={staff.id}
                  onClick={() => {
                    setSelectedStaff(staff);
                    setStaffProfileTab('overview');
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
            <h1 className="text-base font-black text-brand-forest">Floor Attendance</h1>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-brand-forest border rounded-lg px-2 py-1 bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle text-center shadow-sm">
              <span className="text-xl font-black text-emerald-700 block">{presentCount}</span>
              <span className="text-[10px] font-bold text-emerald-600">Present on Floor</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-border-subtle text-center shadow-sm">
              <span className="text-xl font-black text-red-600 block">{absentCount}</span>
              <span className="text-[10px] font-bold text-red-500">Absent / Off Duty</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3">
            <h3 className="text-xs font-black text-brand-forest">Staff Shift Roster</h3>
            <div className="space-y-2">
              {staffList.map((staff) => (
                <div key={staff.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle text-xs">
                  <div>
                    <span className="font-extrabold text-brand-forest block">{staff.staffMember.fullName}</span>
                    <span className="text-[10px] text-content-muted">{staff.positionCategory?.name || staff.role}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${staff.attendanceToday.isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                    {staff.attendanceToday.isPresent ? 'Present' : 'Absent'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 4: REPORTS OVERVIEW (FROM BOTTOM NAV)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'reports' && (
        <div className="p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-black text-brand-forest">Operations Reports</h1>
            <span className="text-xs font-bold text-content-muted">Today&apos;s Summary</span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            <h3 className="text-xs font-black text-brand-forest">Department Piece Counts</h3>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between mb-1 font-bold">
                  <span className="text-brand-forest">Washing & Cleaning</span>
                  <span>{washCount} units</span>
                </div>
                <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, washCount * 2)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-bold">
                  <span className="text-brand-forest">Steam Press & Ironing</span>
                  <span>{ironCount} units</span>
                </div>
                <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full bg-[#84C42C] rounded-full" style={{ width: `${Math.min(100, ironCount * 2)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-bold">
                  <span className="text-brand-forest">Delivery Orders</span>
                  <span>{deliveryCount} orders</span>
                </div>
                <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, deliveryCount * 5)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-bold">
                  <span className="text-brand-forest">Pickups Collected</span>
                  <span>{pickupCount} pickups</span>
                </div>
                <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, pickupCount * 5)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN SCREEN 5: MANAGER PROFILE & ATTENDANCE (SCREEN 10)
      ══════════════════════════════════════════════════════════════════════════ */}
      {!activeDrilldown && currentNav === 'profile' && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Header matching Screen 10 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentNav('dashboard')}
                className="p-1.5 rounded-xl hover:bg-surface-cream"
              >
                <ChevronLeft className="w-5 h-5 text-brand-forest" />
              </button>
              <h1 className="text-base font-black text-brand-forest">Manager Profile</h1>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="p-2 rounded-xl bg-white border border-border-subtle text-red-600 hover:bg-red-50"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Profile Identity Card matching Screen 10 */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-2xl shadow-clay-sm border-2 border-white">
              {user?.staffMember?.fullName?.charAt(0) || user?.username?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div>
              <h2 className="text-lg font-black text-brand-forest">
                {user?.staffMember?.fullName || 'Manager'}
              </h2>
              <p className="text-xs text-content-muted font-mono font-medium">@{user?.username}</p>
            </div>

            {/* Contact details row matching Screen 10 */}
            <div className="grid grid-cols-2 gap-2 w-full pt-3 border-t border-border-subtle text-left text-xs">
              <div className="p-2.5 rounded-xl bg-surface-cream/50">
                <span className="text-[10px] text-content-muted block">Mobile</span>
                <span className="font-bold text-brand-forest">
                  {user?.staffMember?.mobile || 'Not provided'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50">
                <span className="text-[10px] text-content-muted block">Email</span>
                <span className="font-bold text-brand-forest truncate block">
                  Not provided
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50">
                <span className="text-[10px] text-content-muted block">Joining Date</span>
                <span className="font-bold text-brand-forest">
                  {user?.staffMember?.id ? 'Not provided' : 'Not provided'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50">
                <span className="text-[10px] text-content-muted block">Duty Timing</span>
                <span className="font-bold text-brand-forest">Not specified</span>
              </div>
            </div>
          </div>

          {/* Subtabs: Attendance vs Profile Details matching Screen 10 */}
          <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-xl border border-border-subtle">
            <button
              onClick={() => setManagerProfileSubtab('attendance')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                managerProfileSubtab === 'attendance'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Attendance
            </button>
            <button
              onClick={() => setManagerProfileSubtab('details')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                managerProfileSubtab === 'details'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'text-content-muted hover:text-brand-forest'
              }`}
            >
              Profile Details
            </button>
          </div>

          {/* SUBTAB 1: ATTENDANCE & PHOTO VERIFICATION (Screen 10) */}
          {managerProfileSubtab === 'attendance' && (
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-brand-forest">Mark Attendance</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    managerSession?.status === 'OPEN'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-surface-cream text-content-muted'
                  }`}
                >
                  {managerSession?.status === 'OPEN'
                    ? `Checked In: ${new Date(managerSession.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not Checked In'}
                </span>
              </div>

              {attendanceMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center">
                  {attendanceMessage}
                </div>
              )}

              {/* Photo Upload Area */}
              <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border-subtle rounded-2xl bg-surface-cream/40 space-y-2">
                {managerPhotoPreview ? (
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border-subtle shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={managerPhotoPreview} alt="Selfie preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setManagerPhotoPreview(null)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center space-y-1 py-4">
                    <div className="w-12 h-12 rounded-full bg-[#EAF5E9] text-brand-forest flex items-center justify-center shadow-sm">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-brand-forest">Snap / Upload Photo</span>
                    <span className="text-[10px] text-content-muted">Required for manager biometric roll verification</span>
                  </div>
                )}

                <label className="cursor-pointer px-4 py-1.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest hover:bg-surface-hover">
                  <span>{managerPhotoPreview ? 'Change Photo' : 'Select Photo'}</span>
                  <input type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" />
                </label>
              </div>

              {/* Check-In / Check-Out Actions */}
              {managerSession?.status === 'OPEN' ? (
                <button
                  type="button"
                  disabled={isProcessingAttendance}
                  onClick={() => handleSelfAttendance('check-out')}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white text-xs font-black shadow-clay hover:opacity-95 transition-opacity"
                >
                  {isProcessingAttendance ? 'Processing...' : 'Check Out Now'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessingAttendance}
                  onClick={() => handleSelfAttendance('check-in')}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay hover:opacity-95 transition-opacity"
                >
                  {isProcessingAttendance ? 'Verifying...' : 'Check In with Photo'}
                </button>
              )}
            </div>
          )}

          {/* SUBTAB 2: PROFILE DETAILS */}
          {managerProfileSubtab === 'details' && (
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3 text-xs">
              <h3 className="text-xs font-black text-brand-forest">Operational Responsibilities</h3>
              <div className="space-y-2 text-content-muted">
                <p>• Task dispatching for Washerman, Ironman, and Delivery workforce.</p>
                <p>• Floor monitoring of piece completion checklists.</p>
                <p>• Shift presence oversight across branch departments.</p>
              </div>
            </div>
          )}
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
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${
              currentNav === 'dashboard' && !activeDrilldown
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
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${
              currentNav === 'staff' || activeDrilldown
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
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${
              currentNav === 'attendance' && !activeDrilldown
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
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${
              currentNav === 'reports' && !activeDrilldown
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
            className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 transition-all ${
              currentNav === 'profile' && !activeDrilldown
                ? 'text-brand-forest font-bold scale-105'
                : 'text-content-muted hover:text-brand-forest font-medium'
            }`}
          >
            <User className="w-5 h-5 stroke-[2.2]" />
            <span className="text-[10px]">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
