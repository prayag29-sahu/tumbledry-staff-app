'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  StaffMemberListItem,
  AttendanceSession,
  DamageIncident,
  PositionCategory,
  PermissionProfile,
} from '../../types';
import {
  Users,
  Camera,
  AlertTriangle,
  UserPlus,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  X,
  Send,
} from 'lucide-react';

export default function SupervisorPage() {
  const { activeShopId } = useAuth();
  const [activeTab, setActiveTab] = useState<'attendance' | 'staff' | 'damage'>('attendance');
  const [staffList, setStaffList] = useState<StaffMemberListItem[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [damageIncidents, setDamageIncidents] = useState<DamageIncident[]>([]);
  const [positionCategories, setPositionCategories] = useState<PositionCategory[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Staff Modal State
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPositionId, setNewPositionId] = useState('');
  const [newPermissionProfileId, setNewPermissionProfileId] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [newAadhaar, setNewAadhaar] = useState('');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [showSensitivePii, setShowSensitivePii] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeShopId) return;
    setIsLoading(true);
    try {
      const [staffData, attData, dmgData] = await Promise.all([
        apiRequest<{ staff: StaffMemberListItem[] }>(`/api/shops/${activeShopId}/staff`),
        apiRequest<{ sessions: AttendanceSession[] }>(
          `/api/shops/${activeShopId}/attendance/today`
        ).catch(() => ({ sessions: [] })),
        apiRequest<{ incidents: DamageIncident[] }>(
          `/api/shops/${activeShopId}/damage`
        ).catch(() => ({ incidents: [] })),
      ]);

      setStaffList(staffData.staff);
      setAttendanceSessions(attData.sessions);
      setDamageIncidents(dmgData.incidents);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [activeShopId]);

  const fetchConfigs = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const [posData, permData] = await Promise.all([
        apiRequest<{ categories: PositionCategory[] }>(
          `/api/config/shops/${activeShopId}/position-categories`
        ).catch(() => ({ categories: [] })),
        apiRequest<{ profiles: PermissionProfile[] }>(
          `/api/config/permission-profiles`
        ).catch(() => ({ profiles: [] })),
      ]);
      setPositionCategories(posData.categories);
      setPermissionProfiles(permData.profiles);
    } catch {
      // Fallback
    }
  }, [activeShopId]);

  useEffect(() => {
    fetchData();
    fetchConfigs();
  }, [fetchData, fetchConfigs]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !newFullName.trim()) return;

    setIsSubmittingStaff(true);
    setStaffError(null);

    try {
      await apiRequest(`/api/shops/${activeShopId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName.trim(),
          mobile: newMobile.trim() || undefined,
          aadhaar: newAadhaar.trim() || undefined,
          bankAccount: newBankAccount.trim() || undefined,
          permissionProfileId: newPermissionProfileId || undefined,
          positionCategoryId: newPositionId || undefined,
          monthlySalary: newSalary ? parseFloat(newSalary) : undefined,
          account: newUsername.trim()
            ? {
                username: newUsername.trim().toLowerCase(),
                password: newPassword || 'Tumbledry@123',
              }
            : undefined,
        }),
      });

      setIsAddStaffOpen(false);
      alert('Staff member registered successfully.');
      fetchData();
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Failed to register staff.');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleUpdateDamageStatus = async (incidentId: string, status: string) => {
    if (!activeShopId) return;
    try {
      await apiRequest(`/api/shops/${activeShopId}/damage/${incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update damage record.');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight">
            Supervisor Station
          </h2>
          <p className="text-xs text-content-muted">
            Team attendance, staff management, and damage reviews
          </p>
        </div>

        <button
          onClick={() => {
            setStaffError(null);
            setNewFullName('');
            setNewMobile('');
            setNewUsername('');
            setNewPassword('');
            setNewPositionId(positionCategories[0]?.id || '');
            setNewPermissionProfileId(permissionProfiles[0]?.id || '');
            setNewSalary('');
            setNewAadhaar('');
            setNewBankAccount('');
            setIsAddStaffOpen(true);
          }}
          className="px-4 py-2 rounded-xl clay-btn-forest text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-card rounded-2xl border border-border-subtle shadow-clay-sm">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'attendance'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Live Attendance ({attendanceSessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'staff'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Staff Roster ({staffList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('damage')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'damage'
              ? 'bg-brand-forest text-white shadow-md'
              : 'text-content-muted hover:text-brand-forest'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Damage Queue ({damageIncidents.filter((d) => d.status === 'OPEN').length})</span>
        </button>
      </div>

      {/* Tab 1: Live Attendance */}
      {activeTab === 'attendance' && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-xs font-semibold text-content-muted">
              Checking team attendance...
            </div>
          ) : attendanceSessions.length === 0 ? (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
              <Camera className="w-8 h-8 text-content-muted mx-auto mb-2" />
              <h4 className="text-sm font-bold text-brand-forest">No Attendance Check-Ins</h4>
              <p className="text-xs text-content-muted mt-1">
                No staff members have checked in for today yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {attendanceSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-center text-brand-forest font-bold shadow-clay-inset">
                      <Camera className="w-5 h-5 text-brand-lime" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-brand-forest">
                        {session.staffMember?.fullName || 'Staff Member'}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-content-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-brand-lime" />
                          <span>
                            In:{' '}
                            {session.checkInAt
                              ? new Date(session.checkInAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '--'}
                          </span>
                        </span>
                        {session.checkOutAt && (
                          <span>
                            Out:{' '}
                            {new Date(session.checkOutAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                      session.status === 'OPEN'
                        ? 'clay-badge-lime'
                        : 'bg-surface-cream text-content-muted border border-border-subtle'
                    }`}
                  >
                    {session.status === 'OPEN' ? 'On Duty' : 'Completed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Staff Roster */}
      {activeTab === 'staff' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {staffList.map((staff) => {
              const membership = staff.shopMemberships?.[0];
              const posName =
                membership?.positionCategory?.name ||
                membership?.permissionProfile?.name ||
                'Staff';

              return (
                <div
                  key={staff.id}
                  className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-surface-cream border border-border-subtle flex items-center justify-center font-black text-brand-forest shadow-clay-inset text-sm">
                        {staff.fullName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-brand-forest">
                          {staff.fullName}
                        </h4>
                        <span className="text-[11px] text-content-muted">
                          {staff.mobile || 'No mobile entered'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg clay-badge-lime text-[10px] font-bold">
                      {posName}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border-subtle/80 flex items-center justify-between text-xs text-content-muted">
                    <span>
                      Account:{' '}
                      <strong className="text-brand-forest font-semibold">
                        {staff.account?.username || 'No login'}
                      </strong>
                    </span>
                    {membership?.monthlySalary && (
                      <span>
                        Salary: ₹{membership.monthlySalary.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Damage Queue */}
      {activeTab === 'damage' && (
        <div className="space-y-3">
          {damageIncidents.length === 0 ? (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-status-success mx-auto mb-2" />
              <h4 className="text-sm font-bold text-brand-forest">No Damage Incidents</h4>
              <p className="text-xs text-content-muted mt-1">
                Zero open fabric damage reports across today&apos;s assignments.
              </p>
            </div>
          ) : (
            damageIncidents.map((incident) => (
              <div
                key={incident.id}
                className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-status-danger/10 text-status-danger border border-status-danger/20 shadow-clay-sm">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-brand-forest">
                        {incident.taskAssignment?.orderId
                          ? `Order #${incident.taskAssignment.orderId}`
                          : 'Damage Incident'}
                      </span>
                      {incident.pieceNumber && (
                        <span className="text-xs font-semibold text-content-muted">
                          (Piece #{incident.pieceNumber})
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          incident.status === 'OPEN'
                            ? 'clay-badge-danger'
                            : 'bg-surface-cream text-content-muted border border-border-subtle'
                        }`}
                      >
                        {incident.status}
                      </span>
                    </div>
                    <p className="text-xs text-brand-forest font-medium mt-1">
                      &quot;{incident.notes || 'Damage noted during processing.'}&quot;
                    </p>
                    <p className="text-[11px] text-content-muted mt-0.5">
                      Reported by {incident.staffMember?.fullName || 'Staff'} on{' '}
                      {new Date(incident.reportedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {incident.status === 'OPEN' ? (
                    <button
                      onClick={() => handleUpdateDamageStatus(incident.id, 'UNDER_REVIEW')}
                      className="px-3 py-1.5 rounded-xl clay-btn-forest text-xs font-bold"
                    >
                      Review
                    </button>
                  ) : incident.status === 'UNDER_REVIEW' ? (
                    <button
                      onClick={() => handleUpdateDamageStatus(incident.id, 'CLOSED')}
                      className="px-3 py-1.5 rounded-xl clay-btn-lime text-xs font-bold"
                    >
                      Close Incident
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Staff Modal */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-forest/10 text-brand-forest">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-brand-forest">
                    Register New Staff
                  </h3>
                  <p className="text-xs text-content-muted">
                    Create profile in unified staff directory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddStaffOpen(false)}
                className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-3.5">
              {staffError && (
                <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-semibold text-status-danger">
                  {staffError}
                </div>
              )}

              {/* Personal Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    required
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={newMobile}
                    onChange={(e) => setNewMobile(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  />
                </div>
              </div>

              {/* Position & Permission */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Position Category
                  </label>
                  <select
                    value={newPositionId}
                    onChange={(e) => setNewPositionId(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  >
                    <option value="">-- Default --</option>
                    {positionCategories.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    Permission Profile
                  </label>
                  <select
                    value={newPermissionProfileId}
                    onChange={(e) => setNewPermissionProfileId(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-lime"
                  >
                    <option value="">-- Standard Staff --</option>
                    {permissionProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Login Credentials */}
              <div className="p-3 rounded-2xl bg-surface-cream/80 border border-border-subtle space-y-2">
                <span className="text-[11px] font-bold text-brand-forest uppercase tracking-wider block">
                  App Account (Optional)
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username"
                    autoCapitalize="none"
                    className="w-full text-xs font-semibold p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password (default Tumbledry@123)"
                    className="w-full text-xs font-semibold p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest"
                  />
                </div>
              </div>

              {/* Sensitive Details (Masked) */}
              <div className="p-3 rounded-2xl bg-surface-cream/80 border border-border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-brand-forest uppercase tracking-wider">
                    Sensitive PII & Compensation
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSensitivePii(!showSensitivePii)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-content-muted hover:text-brand-forest"
                  >
                    {showSensitivePii ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showSensitivePii ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type={showSensitivePii ? 'text' : 'password'}
                    value={newAadhaar}
                    onChange={(e) => setNewAadhaar(e.target.value)}
                    placeholder="Aadhaar No."
                    className="w-full text-xs font-semibold p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest"
                  />
                  <input
                    type={showSensitivePii ? 'text' : 'password'}
                    value={newBankAccount}
                    onChange={(e) => setNewBankAccount(e.target.value)}
                    placeholder="Bank Account No."
                    className="w-full text-xs font-semibold p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest"
                  />
                  <input
                    type="number"
                    value={newSalary}
                    onChange={(e) => setNewSalary(e.target.value)}
                    placeholder="Monthly ₹"
                    className="w-full text-xs font-semibold p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStaff}
                  className="flex-1 py-2.5 rounded-xl clay-btn-forest text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  {isSubmittingStaff ? (
                    <span>Registering...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Save Staff Member</span>
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
