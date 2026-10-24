'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { TaskAssignment, TaskSummary, TaskUnit } from '../../types';
import { ProgressRing } from '../../components/ProgressRing';
import { DamageModal } from '../../components/DamageModal';
import { DamageIncidentViewerModal, DamageIncidentRecord } from '../../components/DamageIncidentViewerModal';
import { localDateKey } from '../../lib/dateUtils';
import {
  Calendar,
  Truck,
  PhoneCall,
  MessageSquare,
  PackageCheck,
  CheckCircle2,
  Clock,
  RotateCcw,
  Navigation,
  AlertTriangle,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';

export default function DeliveryPage() {
  const router = useRouter();
  const { user, activeShopId, isLoading: isAuthLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [selectedDate, setSelectedDate] = useState<string>(() => localDateKey());
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'delivery' | 'pickup'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completingUnitId, setCompletingUnitId] = useState<string | null>(null);

  // Damage modal & viewer state
  const [damageTarget, setDamageTarget] = useState<{
    taskAssignmentId: string;
    taskUnitId?: string;
    pieceNumber?: number;
    orderId?: string;
  } | null>(null);
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const staffMemberId = user?.staffMember?.id;
  const membership = user?.shopMemberships?.find((m) => m.shopId === activeShopId);
  const [todayAttendance, setTodayAttendance] = useState<{ id: string; checkInAt: string | null } | null>(null);

  // Redirect to login if user session is expired
  useEffect(() => {
    if (isAuthLoading || !isMounted) return;
    if (!user) {
      router.replace('/login');
    }
  }, [isAuthLoading, isMounted, user, router]);

  const fetchAttendanceStatus = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const res = await apiRequest<{ session: { id: string; checkInAt: string | null } | null }>(
        `/api/shops/${activeShopId}/attendance/my-session`
      );
      setTodayAttendance(res.session);
    } catch {
      setTodayAttendance(null);
    }
  }, [activeShopId]);

  useEffect(() => {
    fetchAttendanceStatus();
  }, [fetchAttendanceStatus]);

  const todayKey = localDateKey();
  const isViewingToday = selectedDate === todayKey;
  const hasCheckedInToday = Boolean(todayAttendance?.checkInAt);

  const fetchTasks = useCallback(async (showLoading = true) => {
    if (!activeShopId || !staffMemberId) {
      if (showLoading) setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiRequest<{
        assignments: TaskAssignment[];
        summary: TaskSummary;
      }>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/tasks?date=${selectedDate}`
      );
      setAssignments(data.assignments);
      setSummary(data.summary);
    } catch {
      setAssignments([]);
      setSummary(null);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [activeShopId, staffMemberId, selectedDate]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchTasks(false),
        fetchAttendanceStatus(),
      ]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [fetchTasks, fetchAttendanceStatus]);

  useEffect(() => {
    fetchTasks(true);
  }, [fetchTasks]);

  const handleCompleteUnit = async (unit: TaskUnit) => {
    if (!activeShopId || unit.status === 'COMPLETED' || completingUnitId) return;
    if (!isViewingToday) {
      alert('Tasks can only be marked as completed on their assigned date (today).');
      return;
    }
    if (!hasCheckedInToday) {
      alert('Attendance check-in is required before completing tasks today. Please clock in under Attendance first.');
      return;
    }
    setCompletingUnitId(unit.id);

    try {
      await apiRequest(
        `/api/shops/${activeShopId}/task-units/${unit.id}/complete`,
        { method: 'PATCH' }
      );
      await fetchTasks(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete task.');
    } finally {
      setCompletingUnitId(null);
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    const isPerOrder = a.workflowProfile?.workflowType === 'PER_ORDER';
    const isCountBased = a.workflowProfile?.workflowType === 'COUNT_BASED';

    if (activeTab === 'delivery') return isPerOrder;
    if (activeTab === 'pickup') return isCountBased;
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Station Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-brand-lime" />
            Delivery & Pickup
          </h2>
          <p className="text-xs text-content-muted">
            {user?.staffMember?.fullName || 'Staff'} &#183; {membership?.shopName || 'Shop'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest hover:bg-surface-hover active:scale-95 flex items-center justify-center transition-all touch-manipulation"
            title="Refresh Runs"
            aria-label="Refresh Runs"
          >
            <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-forest' : ''}`} />
          </button>
          <div className="flex items-center gap-1.5 bg-surface-card px-3 py-1.5 rounded-xl border border-border-subtle shadow-clay-sm">
            <Calendar className="w-3.5 h-3.5 text-brand-forest" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-brand-forest focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

            {/* Attendance Check-in Required Banner */}
      {!hasCheckedInToday && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-950 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Attendance check-in is required before you can complete tasks today.</span>
          </div>
          <a
            href="/attendance"
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-sm transition-all"
          >
            Clock In
          </a>
        </div>
      )}

      {!isViewingToday && (
        <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold text-center shadow-sm">
          Viewing {selectedDate} — past/future tasks are view-only. Only today&apos;s tasks can be marked complete.
        </div>
      )}

      {/* Progress Ring */}
          <ProgressRing
            percentage={summary?.percentage ?? null}
            label="Today's Logistics"
            sublabel={
              summary
                ? `${summary.completedUnits} of ${summary.totalUnits} stops completed`
                : 'No runs assigned for this date'
            }
          />

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-card rounded-2xl border border-border-subtle shadow-clay-sm">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'all'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          All Runs
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'delivery'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Deliveries</span>
        </button>
        <button
          onClick={() => setActiveTab('pickup')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'pickup'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5" />
          <span>Pickups</span>
        </button>
      </div>

      {/* Assignment Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
            Assigned Runs ({filteredAssignments.length})
          </h3>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2 min-w-[36px] min-h-[36px] rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-content-muted hover:text-brand-forest active:scale-95 flex items-center justify-center transition-all touch-manipulation"
            title="Refresh Runs"
            aria-label="Refresh Runs"
          >
            <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-forest' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-content-muted">
            Loading logistics runs...
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset mx-auto flex items-center justify-center text-content-muted mb-3">
              <Truck className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-brand-forest">No Scheduled Runs</h4>
            <p className="text-xs text-content-muted mt-1 max-w-xs mx-auto">
              No deliveries or pickups scheduled for {selectedDate}.
            </p>
          </div>
        ) : (
          filteredAssignments.map((assignment) => {
            const isDelivery = assignment.workflowProfile?.workflowType === 'PER_ORDER';

            if (isDelivery) {
              // 1 unit per order
              const unit = assignment.taskUnits[0];
              const isDone = unit?.status === 'COMPLETED';
              const isPending = completingUnitId === unit?.id;
              const hasDamage = !!(assignment.damageIncidents && assignment.damageIncidents.length > 0);
              const primaryDmg = assignment.damageIncidents?.[0];

              return (
                <div
                  key={assignment.id}
                  className={`bg-surface-card rounded-clay border shadow-clay p-4 sm:p-5 transition-all ${
                    hasDamage ? 'border-red-200 bg-red-50/20' : 'border-border-subtle'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 rounded-2xl bg-[#EBF5FB] border border-[#AED6F1]/50 text-[#2980B9] shadow-clay-sm shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-extrabold text-brand-forest tracking-tight">
                            {assignment.orderId ? `Order #${assignment.orderId}` : 'Delivery'}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase">
                            Delivery
                          </span>
                          {hasDamage && primaryDmg && (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingDamageIncident({
                                  ...(primaryDmg as unknown as DamageIncidentRecord),
                                  taskAssignment: {
                                    orderId: assignment.orderId,
                                    serviceType: assignment.serviceType ? { name: assignment.serviceType.name } : undefined,
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 text-[10px] font-extrabold border border-red-300 transition-colors shadow-sm"
                            >
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              <span>Damage ({primaryDmg.status})</span>
                              {assignment.damageIncidents?.some((d) => d.photoPath) && (
                                <span className="text-[9px] bg-red-200 px-1 rounded">📷 Photo</span>
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-content-muted mt-1">
                          {assignment.pieceCount ? `${assignment.pieceCount} items to deliver` : 'Standard package'}{' '}
                          {assignment.notes ? `• ${assignment.notes}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {/* Report Damage / Issue Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setDamageTarget({
                            taskAssignmentId: assignment.id,
                            orderId: assignment.orderId || undefined,
                          })
                        }
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 text-xs font-bold ${
                          hasDamage
                            ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                            : 'bg-surface-cream text-content-muted border-border-subtle hover:text-status-danger hover:border-red-200 hover:bg-red-50/50'
                        }`}
                        title={
                          hasDamage
                            ? 'Damage reported. Click to report another issue'
                            : 'Report damage or issue with this delivery'
                        }
                      >
                        <AlertTriangle className="w-4 h-4 text-status-danger" />
                        <span className="hidden sm:inline">Report Issue</span>
                      </button>

                      {unit && (
                        <button
                          onClick={() => handleCompleteUnit(unit)}
                          disabled={isDone || isPending || !hasCheckedInToday || !isViewingToday} title={isDone ? 'Completed' : !isViewingToday ? 'Cannot complete past/future tasks' : !hasCheckedInToday ? 'Attendance check-in required to complete tasks' : 'Deliver Order'}
                          className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                            isDone
                              ? 'bg-status-success/15 text-status-success border border-status-success/30 cursor-default'
                              : 'clay-btn-forest'
                          }`}
                        >
                          {isDone ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Delivered</span>
                            </>
                          ) : isPending ? (
                            <>
                              <Clock className="w-4 h-4 animate-spin" />
                              <span>Updating...</span>
                            </>
                          ) : (
                            <>
                              <Navigation className="w-4 h-4" />
                              <span>Mark Delivered</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reported Damage Banner */}
                  {hasDamage && (
                    <div className="mt-3 pt-3 border-t border-border-subtle/80 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Reported Damage Evidence ({assignment.damageIncidents!.length})</span>
                      </div>
                      {assignment.damageIncidents!.map((dmg) => (
                        <div
                          key={dmg.id}
                          onClick={() =>
                            setViewingDamageIncident({
                              ...(dmg as unknown as DamageIncidentRecord),
                              taskAssignment: {
                                orderId: assignment.orderId,
                                serviceType: assignment.serviceType ? { name: assignment.serviceType.name } : undefined,
                              },
                            })
                          }
                          className="cursor-pointer p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-red-900 shrink-0">
                              {dmg.pieceNumber ? `Piece #${dmg.pieceNumber}` : assignment.orderId ? `Order #${assignment.orderId}` : 'Damage Report'}
                            </span>
                            <span className="text-[11px] text-red-700 truncate font-medium">
                              {dmg.notes || 'Damage reported'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {dmg.photoPath && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                📷 Photo
                              </span>
                            )}
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200">
                              {dmg.status}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-red-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Pickups: Count-based sequence 1..N
            const hasBatchDamage = !!(assignment.damageIncidents && assignment.damageIncidents.length > 0);

            return (
              <div
                key={assignment.id}
                className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 sm:p-5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 shadow-clay-sm">
                      <PackageCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-brand-forest">
                        {assignment.customerMobile ? `Pickup • Guest: ${assignment.customerMobile}` : `Pickup Batch (${assignment.pickupCount || assignment.taskUnits.length} Pickups)`}
                      </h4>
                      <p className="text-xs text-content-muted">
                        {assignment.notes || 'Guest pickup request'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-content-muted bg-surface-cream px-2 py-0.5 rounded-lg border border-border-subtle">
                      {assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length} /{' '}
                      {assignment.taskUnits.length} Picked
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDamageTarget({
                          taskAssignmentId: assignment.id,
                        })
                      }
                      className={`p-1.5 rounded-xl border transition-colors ${
                        hasBatchDamage
                          ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                          : 'text-content-muted hover:text-status-danger hover:bg-status-danger/10 border-transparent'
                      }`}
                      title="Report issue with pickup batch"
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                                {/* Guest Contact Actions for Delivery Boy */}
                {assignment.customerMobile && (
                  <div className="mt-3 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                        Guest Mobile Number
                      </span>
                      <strong className="text-sm font-black text-brand-forest tracking-wide block">
                        {assignment.customerMobile}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`tel:${assignment.customerMobile.replace(/\D/g, '')}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-forest text-white font-bold text-xs shadow-sm hover:opacity-95 transition-all"
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-brand-lime" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/91${assignment.customerMobile.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm hover:opacity-95 transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-white" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Reported Damage Banner for Pickups */}
                {hasBatchDamage && (
                  <div className="mt-3 pt-3 border-t border-border-subtle/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reported Damage Evidence ({assignment.damageIncidents!.length})</span>
                    </div>
                    {assignment.damageIncidents!.map((dmg) => (
                      <div
                        key={dmg.id}
                        onClick={() =>
                          setViewingDamageIncident({
                            ...(dmg as unknown as DamageIncidentRecord),
                            taskAssignment: { orderId: assignment.orderId },
                          })
                        }
                        className="cursor-pointer p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-red-900 shrink-0">
                            {dmg.pieceNumber ? `Pickup #${dmg.pieceNumber}` : 'Damage Report'}
                          </span>
                          <span className="text-[11px] text-red-700 truncate font-medium">
                            {dmg.notes || 'Damage reported'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {dmg.photoPath && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              📷 Photo
                            </span>
                          )}
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200">
                            {dmg.status}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-red-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {assignment.taskUnits.map((unit) => {
                    const isDone = unit.status === 'COMPLETED';
                    const isPending = completingUnitId === unit.id;
                    const seqNum = unit.sequenceNumber || 1;
                    const unitDmg = assignment.damageIncidents?.find(
                      (d) => d.taskUnitId === unit.id || d.pieceNumber === seqNum
                    );

                    return (
                      <div
                        key={unit.id}
                        className={`rounded-xl p-3 border flex items-center justify-between transition-all ${
                          unitDmg
                            ? 'bg-red-50/70 border-red-200'
                            : 'bg-surface-cream/70 border-border-subtle'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-surface-card border border-border-subtle flex items-center justify-center text-xs font-bold text-brand-forest shadow-clay-sm">
                            {seqNum}
                          </span>
                          <span className="text-xs font-bold text-brand-forest">
                            {assignment.customerMobile ? `Guest: ${assignment.customerMobile}` : `Pickup #${seqNum}`}
                          </span>
                          {unitDmg && (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingDamageIncident({
                                  ...(unitDmg as unknown as DamageIncidentRecord),
                                  taskAssignment: { orderId: assignment.orderId },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 text-[10px] font-extrabold border border-red-300 transition-colors shadow-sm"
                            >
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              <span>Damage ({unitDmg.status})</span>
                              {unitDmg.photoPath && <span className="text-[9px] bg-red-200 px-1 rounded">📷 Photo</span>}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDamageTarget({
                                taskAssignmentId: assignment.id,
                                taskUnitId: unit.id,
                                pieceNumber: seqNum,
                              })
                            }
                            className={`p-1.5 rounded-xl transition-colors ${
                              unitDmg
                                ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
                                : 'text-content-muted hover:text-status-danger hover:bg-status-danger/10'
                            }`}
                            title={unitDmg ? 'Damage reported. Click to report another issue' : 'Report Damage for this pickup'}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleCompleteUnit(unit)}
                            disabled={isDone || isPending || !hasCheckedInToday || !isViewingToday}
                            title={isDone ? 'Completed' : !isViewingToday ? 'Cannot complete past/future tasks' : !hasCheckedInToday ? 'Attendance check-in required to complete tasks' : 'Pick Up'}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                              isDone
                                ? 'bg-status-success/15 text-status-success border border-status-success/30 cursor-default'
                                : 'clay-btn-lime'
                            }`}
                          >
                            {isDone ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Done</span>
                              </>
                            ) : (
                              <span>Pick Up</span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>


      {/* Damage Incident Modal */}
      {damageTarget && (
        <DamageModal
          isOpen={true}
          onClose={() => setDamageTarget(null)}
          shopId={activeShopId || ''}
          staffMemberId={staffMemberId || ''}
          taskAssignmentId={damageTarget.taskAssignmentId}
          taskUnitId={damageTarget.taskUnitId}
          pieceNumber={damageTarget.pieceNumber}
          orderId={damageTarget.orderId}
          onSuccess={() => {
            setSuccessToast('Damage incident reported to Supervisor.');
            setTimeout(() => setSuccessToast(null), 4000);
            fetchTasks(false);
          }}
        />
      )}

      {/* Damage Incident Evidence Viewer Modal */}
      {viewingDamageIncident && (
        <DamageIncidentViewerModal
          isOpen={true}
          onClose={() => setViewingDamageIncident(null)}
          incident={viewingDamageIncident}
          shopId={activeShopId || ''}
          canManage={false}
          onUpdated={() => fetchTasks(false)}
        />
      )}

      {/* Floating In-App Success Toast */}
      {successToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-[#1E4327] text-white rounded-2xl shadow-clay-lg flex items-center gap-2.5 text-xs font-bold animate-fade-in border border-emerald-500/30">
          <div className="w-5 h-5 rounded-full bg-brand-lime text-brand-forest flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="ml-2 text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
