'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  StaffMemberListItem,
  ServiceType,
  WorkflowProfile,
} from '../../types';
import {
  Users,
  PlusCircle,
  Calendar,
  Sparkles,
  CheckCircle2,
  X,
  AlertCircle,
  Send,
} from 'lucide-react';

export default function ManagerPage() {
  const { activeShopId } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [staffList, setStaffList] = useState<StaffMemberListItem[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [workflowProfiles, setWorkflowProfiles] = useState<WorkflowProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Assignment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [pieceCount, setPieceCount] = useState<number | ''>('');
  const [pickupCount, setPickupCount] = useState<number | ''>('');
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!activeShopId) return;
    setIsLoading(true);
    try {
      const data = await apiRequest<{ staff: StaffMemberListItem[] }>(
        `/api/shops/${activeShopId}/staff`
      );
      setStaffList(data.staff);
    } catch {
      setStaffList([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeShopId]);

  const fetchConfig = useCallback(async () => {
    try {
      const [svcData, wfData] = await Promise.all([
        apiRequest<{ serviceTypes: ServiceType[] }>('/api/config/service-types'),
        apiRequest<{ profiles: WorkflowProfile[] }>('/api/config/workflow-profiles'),
      ]);
      setServices(svcData.serviceTypes);
      setWorkflowProfiles(wfData.profiles);
    } catch {
      // Configuration fallback
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchConfig();
  }, [fetchStaff, fetchConfig]);

  // Open modal with pre-selected staff
  const handleOpenAssignModal = (staffId?: string) => {
    setSubmitError(null);
    setSelectedStaffId(staffId || staffList[0]?.id || '');
    const firstWf = workflowProfiles[0]?.id || '';
    setSelectedWorkflowId(firstWf);
    setSelectedServiceId('');
    setOrderId('');
    setPieceCount('');
    setPickupCount('');
    setSelectedActivities(['WASH', 'DRY']);
    setNotes('');
    setIsModalOpen(true);
  };

  const currentWorkflow = workflowProfiles.find((w) => w.id === selectedWorkflowId);

  // Live calculation preview
  const calculateTotalUnits = (): number => {
    if (!currentWorkflow) return 0;
    if (currentWorkflow.workflowType === 'PIECE_ACTIVITY') {
      const pieces = typeof pieceCount === 'number' ? pieceCount : 0;
      return pieces * selectedActivities.length;
    }
    if (currentWorkflow.workflowType === 'PER_ORDER') {
      return 1;
    }
    if (currentWorkflow.workflowType === 'COUNT_BASED') {
      return typeof pickupCount === 'number' ? pickupCount : 0;
    }
    return 0;
  };

  const handleToggleActivity = (act: string) => {
    setSelectedActivities((prev) =>
      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
    );
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !selectedStaffId || !selectedWorkflowId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const idempotencyKey = `mgr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await apiRequest(
        `/api/shops/${activeShopId}/staff/${selectedStaffId}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify({
            assignmentDate: selectedDate,
            workflowProfileId: selectedWorkflowId,
            serviceTypeId: selectedServiceId || undefined,
            orderId: orderId.trim() || undefined,
            pieceCount: typeof pieceCount === 'number' ? pieceCount : undefined,
            pickupCount: typeof pickupCount === 'number' ? pickupCount : undefined,
            selectedActivities:
              currentWorkflow?.workflowType === 'PIECE_ACTIVITY'
                ? selectedActivities
                : undefined,
            notes: notes.trim() || undefined,
            idempotencyKey,
          }),
        }
      );

      setIsModalOpen(false);
      alert('Task assignment created successfully.');
      fetchStaff();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create task assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight">
            Manager Operations
          </h2>
          <p className="text-xs text-content-muted">
            Staff roster and task assignment station
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-card px-3 py-1.5 rounded-xl border border-border-subtle shadow-clay-sm">
            <Calendar className="w-3.5 h-3.5 text-brand-forest" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-brand-forest focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => handleOpenAssignModal()}
            className="px-4 py-2 rounded-xl clay-btn-lime text-xs font-bold flex items-center gap-1.5 shadow-clay-btn"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Assign Tasks</span>
          </button>
        </div>
      </div>

      {/* Staff Overview Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-brand-forest uppercase tracking-wider">
          Shop Workforce ({staffList.length})
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-content-muted">
            Loading team roster...
          </div>
        ) : staffList.length === 0 ? (
          <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
            <Users className="w-8 h-8 text-content-muted mx-auto mb-2" />
            <p className="text-xs text-content-muted">No staff members in this shop.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {staffList.map((staff) => {
              const membership = staff.shopMemberships?.[0];
              const posName = membership?.positionCategory?.name || membership?.permissionProfile?.name || 'Staff';

              return (
                <div
                  key={staff.id}
                  className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 flex items-center justify-between gap-3 hover:border-brand-lime/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-center font-black text-brand-forest shadow-clay-inset text-sm">
                      {staff.fullName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-brand-forest">
                        {staff.fullName}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="px-2 py-0.5 rounded-lg clay-badge-lime text-[10px] font-bold">
                          {posName}
                        </span>
                        {staff.mobile && (
                          <span className="text-[11px] text-content-muted">
                            {staff.mobile}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenAssignModal(staff.id)}
                    className="p-2 rounded-xl clay-btn-secondary text-brand-forest hover:text-brand-lime"
                    title="Assign tasks to this member"
                  >
                    <PlusCircle className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Assignment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-lime/15 text-brand-lime">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-brand-forest">
                    Create Task Assignment
                  </h3>
                  <p className="text-xs text-content-muted">
                    Generate server-authoritative task units
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAssignment} className="mt-4 space-y-4">
              {submitError && (
                <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-semibold text-status-danger flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Assignee */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1.5">
                  Select Staff Member
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.shopMemberships?.[0]?.positionCategory?.name || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Workflow Pattern */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1.5">
                  Workflow Counting Rule
                </label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                >
                  {workflowProfiles.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.workflowType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Type (only for Piece/Activity or when relevant) */}
              {currentWorkflow?.workflowType === 'PIECE_ACTIVITY' && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1.5">
                    Service Type
                  </label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  >
                    <option value="">-- Select Service Type --</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Order ID & Pieces */}
              {(currentWorkflow?.workflowType === 'PIECE_ACTIVITY' ||
                currentWorkflow?.workflowType === 'PER_ORDER') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1.5">
                      Order ID
                    </label>
                    <input
                      type="text"
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      placeholder="e.g. ORD-1092"
                      required
                      className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-forest mb-1.5">
                      Piece Count
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pieceCount}
                      onChange={(e) => setPieceCount(parseInt(e.target.value) || '')}
                      placeholder="e.g. 5"
                      required={currentWorkflow?.workflowType === 'PIECE_ACTIVITY'}
                      className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                    />
                  </div>
                </div>
              )}

              {/* Pickup Count */}
              {currentWorkflow?.workflowType === 'COUNT_BASED' && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1.5">
                    Pickup Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pickupCount}
                    onChange={(e) => setPickupCount(parseInt(e.target.value) || '')}
                    placeholder="Number of client pickups (e.g. 4)"
                    required
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  />
                </div>
              )}

              {/* Activities Checkboxes (for PIECE_ACTIVITY) */}
              {currentWorkflow?.workflowType === 'PIECE_ACTIVITY' && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1.5">
                    Select Activities for this batch
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['WASH', 'DRY', 'IRON', 'FOLD', 'PACK'].map((act) => {
                      const isSelected = selectedActivities.includes(act);
                      return (
                        <button
                          key={act}
                          type="button"
                          onClick={() => handleToggleActivity(act)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'clay-btn-lime shadow-clay-sm'
                              : 'clay-btn-secondary text-content-muted hover:border-brand-lime'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>{act}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-brand-forest mb-1.5">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions or customer remarks"
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                />
              </div>

              {/* Live Calculation Preview Banner */}
              <div className="p-3.5 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-lime" />
                  <span className="text-xs font-bold text-brand-forest">
                    Units to be Generated:
                  </span>
                </div>
                <span className="text-sm font-black text-brand-forest bg-surface-card px-3 py-1 rounded-xl border border-border-subtle shadow-clay-sm">
                  {calculateTotalUnits()} Task Units
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || calculateTotalUnits() === 0}
                  className="flex-1 py-2.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  {isSubmitting ? (
                    <span>Creating units...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Confirm & Assign</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
