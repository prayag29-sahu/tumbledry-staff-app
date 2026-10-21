'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { localDateKey } from '../../lib/dateUtils';
import { StaffProfileCard, ProfileAttendanceSession } from '../../components/StaffProfileCard';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, activeShopId, activeRole, logout, refreshUser, isLoading: isAuthLoading } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passMessage, setPassMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const [attendanceSession, setAttendanceSession] = useState<ProfileAttendanceSession | null>(null);
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false);

  // Fetch freshest user profile and membership from server on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const currentShop = user?.shopMemberships?.find((m) => m.shopId === activeShopId);
  const staffMemberId = user?.staffMember?.id;

  const fetchAttendanceSession = useCallback(async () => {
    if (!activeShopId || !staffMemberId) return;
    try {
      const data = await apiRequest<{ session: ProfileAttendanceSession | null }>(
        `/api/shops/${activeShopId}/attendance/my-session?date=${localDateKey()}`
      );
      setAttendanceSession(data.session);
    } catch {
      setAttendanceSession(null);
    }
  }, [activeShopId, staffMemberId]);

  useEffect(() => {
    if (activeShopId && staffMemberId) {
      fetchAttendanceSession();
    }
  }, [activeShopId, staffMemberId, fetchAttendanceSession]);

  const handleAttendanceCapture = async (photoData: string, action: 'check-in' | 'check-out') => {
    if (!activeShopId || !staffMemberId) return;
    setIsProcessingAttendance(true);
    try {
      const ep = action === 'check-in'
        ? `/api/shops/${activeShopId}/attendance/check-in`
        : `/api/shops/${activeShopId}/attendance/check-out`;
      await apiRequest(ep, { method: 'POST', body: JSON.stringify({ staffMemberId, photoData }) });
      await fetchAttendanceSession();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Attendance update failed.');
    } finally {
      setIsProcessingAttendance(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPassMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }

    setIsChangingPass(true);
    setPassMessage(null);

    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPassMessage({ type: 'success', text: 'Password changed successfully. Please log in again.' });
      setTimeout(() => {
        logout();
        router.push('/login');
      }, 1500);
    } catch (err: unknown) {
      setPassMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update password.',
      });
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleLogoutAll = async () => {
    if (confirm('Revoke all sessions across all phones and browsers?')) {
      try {
        await apiRequest('/api/auth/logout-all', { method: 'POST' });
        await logout();
        router.push('/login');
      } catch {
        await logout();
        router.push('/login');
      }
    }
  };

  const handleBack = () => {
    const roleLower = (activeRole || '').toLowerCase();
    if (user?.isOwner) router.push('/owner');
    else if (roleLower.includes('supervisor')) router.push('/supervisor');
    else if (roleLower.includes('manager')) router.push('/manager');
    else if (roleLower.includes('wash')) router.push('/washerman');
    else if (roleLower.includes('iron')) router.push('/ironman');
    else if (roleLower.includes('deliver')) router.push('/delivery');
    else router.push('/');
  };

  if (isAuthLoading || !user) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-xs font-bold text-content-muted animate-pulse">Loading Profile...</div>
      </div>
    );
  }

  // Derive title based on role
  const roleDisplay = currentShop?.positionCategory || currentShop?.roleName || activeRole || 'Staff';
  const pageTitle = `${roleDisplay} Profile`;

  return (
    <div className="space-y-4 animate-fade-in max-w-md mx-auto pb-24">
      <StaffProfileCard
        title={pageTitle}
        onBack={handleBack}
        staff={{
          fullName: user.staffMember?.fullName || (user.isOwner ? 'Owner' : user.username),
          mobile: user.staffMember?.mobile,
          address: user.staffMember?.address,
          profilePhotoPath: user.staffMember?.profilePhotoPath,
          employmentStatus: user.staffMember?.employmentStatus || 'ACTIVE',
        }}
        membership={{
          shopId: activeShopId || undefined,
          shopName: currentShop?.shopName,
          staffMemberId: staffMemberId || user.staffMember?.id,
          roleName: currentShop?.roleName || roleDisplay,
          positionCategory: currentShop?.positionCategory,
          joiningDate: currentShop?.joiningDate,
          dutyTimingNotes: currentShop?.dutyTimingNotes,
          monthlySalary: currentShop?.monthlySalary,
          incentiveAmount: currentShop?.incentiveAmount,
          securityDeposit: currentShop?.securityDeposit,
          shiftStartTime: currentShop?.shiftStartTime,
          shiftEndTime: currentShop?.shiftEndTime,
          lateThreshold: currentShop?.lateThreshold,
          halfDayThreshold: currentShop?.halfDayThreshold,
          absentThreshold: currentShop?.absentThreshold,
          capabilities: currentShop?.capabilities,
        }}
        session={attendanceSession}
        isProcessingAttendance={isProcessingAttendance}
        onCheckInWithPhoto={async (photoData) => {
          await handleAttendanceCapture(photoData, 'check-in');
        }}
        onCheckOutWithPhoto={async (photoData) => {
          await handleAttendanceCapture(photoData, 'check-out');
        }}
      />

      {/* Password & Security Card */}
      <div className="bg-white rounded-2xl border border-border-subtle shadow-clay-sm p-4 space-y-3">
        <button
          type="button"
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-brand-forest" />
            <h4 className="text-xs font-bold text-brand-forest uppercase tracking-wider">
              Update Password &amp; Security
            </h4>
          </div>
          <span className="text-xs text-brand-forest font-bold">
            {showPasswordSection ? 'Hide' : 'Change'}
          </span>
        </button>

        {showPasswordSection && (
          <div className="pt-2 border-t border-border-subtle/60 space-y-3 animate-fade-in">
            {passMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  passMessage.type === 'success'
                    ? 'bg-status-success/10 border border-status-success/30 text-status-success'
                    : 'bg-status-danger/10 border border-status-danger/30 text-status-danger'
                }`}
              >
                {passMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{passMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-brand-forest"
                />
              </div>

              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full py-2.5 rounded-xl bg-brand-forest text-white text-xs font-bold hover:bg-brand-forest/90 transition-colors"
              >
                {isChangingPass ? 'Updating...' : 'Save New Password'}
              </button>
            </form>

            <div className="pt-2 border-t border-border-subtle/40">
              <button
                type="button"
                onClick={handleLogoutAll}
                className="w-full py-2 rounded-xl text-[11px] font-bold text-status-danger hover:bg-status-danger/10 transition-colors"
              >
                Revoke All Active Sessions (Logout Everywhere)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
