'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { TaskAssignment, TaskSummary, TaskUnit } from '../../types';
import { ProgressRing } from '../../components/ProgressRing';
import { DamageModal } from '../../components/DamageModal';
import { DamageIncidentViewerModal, DamageIncidentRecord } from '../../components/DamageIncidentViewerModal';
import { localDateKey } from '../../lib/dateUtils';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Flame,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';

export default function IronmanPage() {
  const { user, activeShopId } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateKey());
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [completingUnitId, setCompletingUnitId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Damage modal state
  const [damageTarget, setDamageTarget] = useState<{
    taskAssignmentId: string;
    taskUnitId?: string;
    pieceNumber?: number;
    orderId?: string;
  } | null>(null);
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);

  const staffMemberId = user?.staffMember?.id;
  const [todayAttendance, setTodayAttendance] = useState<{ id: string; checkInAt: string | null } | null>(null);

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

  const membership = user?.shopMemberships?.find((m) => m.shopId === activeShopId);

  const fetchTasks = useCallback(async (showLoading = true) => {
    if (!activeShopId || !staffMemberId) return;
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
      alert('Attendance check-in is required before you can complete tasks today. Please clock in under Attendance first.');
      return;
    }
    setCompletingUnitId(unit.id);

    // 1. Optimistic Update in UI
    setAssignments((prev) =>
      prev.map((asg) => {
        if (asg.id !== unit.taskAssignmentId) return asg;
        return {
          ...asg,
          taskUnits: asg.taskUnits.map((u) =>
            u.id === unit.id
              ? { ...u, status: 'COMPLETED' as const, completedAt: new Date().toISOString() }
              : u
          ),
        };
      })
    );

    setSummary((prev) => {
      if (!prev) return prev;
      const anyPrev = prev as unknown as Record<string, number>;
      const currentCompleted = prev.completedUnits ?? anyPrev.completed ?? 0;
      const currentTotal = prev.totalUnits ?? anyPrev.total ?? 1;
      const nextCompleted = currentCompleted + 1;
      const nextPending = Math.max(0, currentTotal - nextCompleted);
      const nextPct = Math.min(100, Math.round((nextCompleted / currentTotal) * 100));

      return {
        ...prev,
        completedUnits: nextCompleted,
        completed: nextCompleted,
        pendingUnits: nextPending,
        pending: nextPending,
        percentage: nextPct,
        percentageComplete: nextPct,
      };
    });

    try {
      await apiRequest(
        `/api/shops/${activeShopId}/task-units/${unit.id}/complete`,
        { method: 'PATCH' }
      );
      fetchTasks(false);
    } catch (err) {
      fetchTasks(false);
      alert(err instanceof Error ? err.message : 'Failed to complete unit.');
    } finally {
      setCompletingUnitId(null);
    }
  };

  const totalUnits = summary?.totalUnits ?? (summary as unknown as Record<string, number>)?.total ?? 0;
  const completedUnits = summary?.completedUnits ?? (summary as unknown as Record<string, number>)?.completed ?? 0;
  const ringPercentage = summary?.percentage ?? (summary as unknown as Record<string, number>)?.percentageComplete ?? (totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : null);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Station Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            Steam Iron & Fold
          </h2>
          <p className="text-xs text-content-muted">
            {user?.staffMember?.fullName || 'Staff'} &#183; {membership?.shopName || 'Shop'}
          </p>
        </div>

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

      {/* Daily Progress Card */}
          <ProgressRing
            percentage={ringPercentage}
            label="Today's Ironing Progress"
            sublabel={
              totalUnits > 0
                ? `${completedUnits} of ${totalUnits} finishing units completed`
                : 'No tasks assigned for this date'
            }
          />

          {/* Task Assignments List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
                Ironing Orders ({assignments.length})
              </h3>
              <button
                onClick={() => fetchTasks(true)}
                className="p-1 rounded-lg text-content-muted hover:text-brand-forest"
                title="Refresh Tasks"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-content-muted">
            Loading finishing orders...
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset mx-auto flex items-center justify-center text-content-muted mb-3">
              <Flame className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-brand-forest">No Ironing Tasks</h4>
            <p className="text-xs text-content-muted mt-1 max-w-xs mx-auto">
              You have no finishing tasks assigned for {selectedDate}.
            </p>
          </div>
        ) : (
          assignments.map((assignment) => {
            const pieceNumbers = Array.from(
              new Set(assignment.taskUnits.map((u) => u.pieceNumber).filter(Boolean))
            ).sort((a, b) => (a as number) - (b as number)) as number[];

            return (
              <div
                key={assignment.id}
                className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 sm:p-5 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-brand-forest tracking-tight">
                        {assignment.orderId ? `Order #${assignment.orderId}` : 'Ironing Assignment'}
                      </span>
                      {assignment.serviceType && (
                        <span className="px-2 py-0.5 rounded-lg clay-badge-gold text-[11px] font-bold">
                          {assignment.serviceType.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">
                      {assignment.pieceCount ? `${assignment.pieceCount} Pieces` : ''}{' '}
                      {assignment.notes ? `• ${assignment.notes}` : ''}
                    </p>
                  </div>

                  <span className="text-[11px] font-semibold text-content-muted bg-surface-cream px-2 py-0.5 rounded-lg border border-border-subtle">
                    {assignment.taskUnits.filter((u) => u.status === 'COMPLETED').length} /{' '}
                    {assignment.taskUnits.length} Done
                  </span>
                </div>

                {/* Reported Damage Banner */}
                {assignment.damageIncidents && assignment.damageIncidents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-subtle/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reported Damage Evidence ({assignment.damageIncidents.length})</span>
                    </div>
                    {assignment.damageIncidents.map((dmg) => (
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
                            {dmg.pieceNumber ? `Piece #${dmg.pieceNumber}` : 'Damage Report'}
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

                {/* Pieces */}
                <div className="mt-3 space-y-2.5">
                  {pieceNumbers.map((pieceNum) => {
                    const pieceUnits = assignment.taskUnits.filter(
                      (u) => u.pieceNumber === pieceNum
                    );
                    const pieceDmg =
                      assignment.damageIncidents?.find((d) => d.pieceNumber === pieceNum) ||
                      pieceUnits.flatMap((u) => u.damageIncidents || []).find(Boolean);

                    return (
                      <div
                        key={pieceNum}
                        className={`rounded-xl p-3 border flex flex-wrap items-center justify-between gap-2 transition-all ${
                          pieceDmg
                            ? 'bg-red-50/70 border-red-200 shadow-sm'
                            : 'bg-surface-cream/70 border-border-subtle/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-6 h-6 rounded-lg bg-surface-card border border-border-subtle flex items-center justify-center text-xs font-bold text-brand-forest shadow-clay-sm">
                            {pieceNum}
                          </div>
                          <span className="text-xs font-bold text-brand-forest">
                            Piece #{pieceNum}
                          </span>
                          {pieceDmg && (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingDamageIncident({
                                  ...(pieceDmg as unknown as DamageIncidentRecord),
                                  taskAssignment: {
                                    orderId: assignment.orderId,
                                    serviceType: assignment.serviceType ? { name: assignment.serviceType.name } : undefined,
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 text-[10px] font-extrabold border border-red-300 transition-colors shadow-sm"
                            >
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              <span>Damage ({pieceDmg.status})</span>
                              {pieceDmg.photoPath && <span className="text-[9px] bg-red-200 px-1 rounded">📷 Photo</span>}
                            </button>
                          )}
                        </div>

                        {/* Activities (Iron / Fold / Pack) */}
                        <div className="flex items-center gap-2">
                          {pieceUnits.map((unit) => {
                            const isDone = unit.status === 'COMPLETED';
                            const isPending = completingUnitId === unit.id;

                            return (
                              <button
                                key={unit.id}
                                onClick={() => handleCompleteUnit(unit)}
                                disabled={isDone || isPending || !hasCheckedInToday || !isViewingToday}
                                title={isDone ? 'Already done' : !isViewingToday ? 'Cannot complete past/future tasks' : !hasCheckedInToday ? 'Attendance check-in required to complete tasks' : `Mark ${unit.activityCode || 'Done'}`}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                  isDone
                                    ? 'bg-status-success/15 text-status-success border border-status-success/30 cursor-default'
                                    : 'clay-btn-secondary text-brand-forest hover:border-brand-gold'
                                }`}
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : isPending ? (
                                  <Clock className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-brand-gold" />
                                )}
                                <span>{unit.activityCode || 'Done'}</span>
                              </button>
                            );
                          })}

                          {/* Damage Button */}
                          <button
                            type="button"
                            onClick={() =>
                              setDamageTarget({
                                taskAssignmentId: assignment.id,
                                pieceNumber: pieceNum,
                                orderId: assignment.orderId || undefined,
                              })
                            }
                            className={`p-1.5 rounded-xl transition-colors ${
                              pieceDmg
                                ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
                                : 'text-content-muted hover:text-status-danger hover:bg-status-danger/10'
                            }`}
                            title={pieceDmg ? 'Damage reported. Click to report another issue' : 'Report Damage for this piece'}
                          >
                            <AlertTriangle className="w-4 h-4" />
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
