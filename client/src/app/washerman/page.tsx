'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { TaskAssignment, TaskSummary, TaskUnit } from '../../types';
import { ProgressRing } from '../../components/ProgressRing';
import { DamageModal } from '../../components/DamageModal';
import {
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Check,
  X,
} from 'lucide-react';

export default function WashermanPage() {
  const { user, activeShopId } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
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

  const staffMemberId = user?.staffMember?.id;

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
      // If error or empty
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
    setCompletingUnitId(unit.id);

    // 1. Instantaneous Optimistic Update in UI
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
      // Quiet background refresh to keep in sync with server without reloading DOM
      fetchTasks(false);
    } catch (err) {
      // Revert if API fails
      fetchTasks(false);
      alert(err instanceof Error ? err.message : 'Failed to complete unit.');
    } finally {
      setCompletingUnitId(null);
    }
  };

  // Robust calculation for progress ring
  const totalUnits = summary?.totalUnits ?? (summary as unknown as Record<string, number>)?.total ?? 0;
  const completedUnits = summary?.completedUnits ?? (summary as unknown as Record<string, number>)?.completed ?? 0;
  const ringPercentage = summary?.percentage ?? (summary as unknown as Record<string, number>)?.percentageComplete ?? (totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : null);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Title & Date bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight">
            Washerman Station
          </h2>
          <p className="text-xs text-content-muted">
            Independent piece-level Wash & Dry units
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
        label="Today's Wash Progress"
        sublabel={
          totalUnits > 0
            ? `${completedUnits} of ${totalUnits} units completed`
            : 'No tasks assigned for this date'
        }
      />

      {/* Task Assignments List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
            Assigned Orders ({assignments.length})
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
            Loading wash assignments...
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset mx-auto flex items-center justify-center text-content-muted mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-brand-forest">No Wash Tasks</h4>
            <p className="text-xs text-content-muted mt-1 max-w-xs mx-auto">
              You have no laundry orders assigned for {selectedDate}. Tasks assigned by your manager will appear here in real-time.
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
                {/* Order Header */}
                <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-brand-forest tracking-tight">
                        {assignment.orderId ? `Order #${assignment.orderId}` : 'Wash Assignment'}
                      </span>
                      {assignment.serviceType && (
                        <span className="px-2 py-0.5 rounded-lg clay-badge-lime text-[11px] font-bold">
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

                {/* Piece-by-Piece Rows */}
                <div className="mt-3 space-y-2.5">
                  {pieceNumbers.map((pieceNum) => {
                    const pieceUnits = assignment.taskUnits.filter(
                      (u) => u.pieceNumber === pieceNum
                    );

                    return (
                      <div
                        key={pieceNum}
                        className="bg-surface-cream/70 rounded-xl p-3 border border-border-subtle/80 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-surface-card border border-border-subtle flex items-center justify-center text-xs font-bold text-brand-forest shadow-clay-sm">
                            {pieceNum}
                          </div>
                          <span className="text-xs font-bold text-brand-forest">
                            Piece #{pieceNum}
                          </span>
                        </div>

                        {/* Activities (Wash / Dry) */}
                        <div className="flex items-center gap-2">
                          {pieceUnits.map((unit) => {
                            const isDone = unit.status === 'COMPLETED';
                            const isPending = completingUnitId === unit.id;

                            return (
                              <button
                                key={unit.id}
                                onClick={() => handleCompleteUnit(unit)}
                                disabled={isDone || isPending}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                  isDone
                                    ? 'bg-status-success/15 text-status-success border border-status-success/30 cursor-default'
                                    : 'clay-btn-secondary text-brand-forest hover:border-brand-lime'
                                }`}
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : isPending ? (
                                  <Clock className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-brand-lime" />
                                )}
                                <span>{unit.activityCode || 'Done'}</span>
                              </button>
                            );
                          })}

                          {/* Damage Button per piece */}
                          <button
                            onClick={() =>
                              setDamageTarget({
                                taskAssignmentId: assignment.id,
                                pieceNumber: pieceNum,
                                orderId: assignment.orderId || undefined,
                              })
                            }
                            className="p-1.5 rounded-xl text-content-muted hover:text-status-danger hover:bg-status-danger/10 transition-colors"
                            title="Report Damage for this piece"
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
            fetchTasks();
          }}
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
