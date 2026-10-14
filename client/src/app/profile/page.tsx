'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  Building,
  KeyRound,
  LogOut,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, activeShopId, activeRole, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passMessage, setPassMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentShop = user?.shopMemberships?.find((m) => m.shopId === activeShopId);

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

  const handleLogout = async () => {
    await logout();
    router.push('/login');
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

  return (
    <div className="space-y-4 animate-fade-in max-w-md mx-auto">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (activeRole === 'Supervisor') router.push('/supervisor');
            else if (user?.isOwner) router.push('/owner');
            else router.back();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:text-brand-lime transition-colors py-1.5 px-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {activeRole === 'Supervisor' ? 'Supervisor Portal' : user?.isOwner ? 'Owner Portal' : 'Home'}</span>
        </button>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-brand-forest tracking-tight">
          My Account & Profile
        </h2>
        <p className="text-xs text-content-muted">
          Operational credentials and security settings
        </p>
      </div>

      {/* User Card */}
      <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-3">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-xl shadow-clay-sm border border-white/40">
            {user?.staffMember?.fullName?.charAt(0) || user?.username.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-brand-forest">
              {user?.staffMember?.fullName || user?.username}
            </h3>
            <p className="text-xs text-content-muted font-medium">@{user?.username}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="px-2 py-0.5 rounded-lg clay-badge-lime text-[10px] font-bold">
                {activeRole}
              </span>
              {currentShop && (
                <span className="text-[11px] font-medium text-content-muted flex items-center gap-1">
                  <Building className="w-3 h-3 text-brand-forest" />
                  <span>{currentShop.shopName}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {activeRole === 'Supervisor' && (
          <div className="pt-3 border-t border-border-subtle/60 flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-content-muted">Attendance Tracking:</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              Exempt from Floor Roll (Set by Owner)
            </span>
          </div>
        )}
      </div>

      {/* Change Password Card */}
      <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-border-subtle">
          <KeyRound className="w-4 h-4 text-brand-forest" />
          <h4 className="text-xs font-bold text-brand-forest uppercase tracking-wider">
            Update Password
          </h4>
        </div>

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
            className="w-full py-2.5 rounded-xl clay-btn-forest text-xs font-bold"
          >
            {isChangingPass ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Logout Actions */}
      <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl clay-btn-secondary text-xs font-bold text-brand-forest flex items-center justify-center gap-2 hover:text-status-danger transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of This Device</span>
        </button>

        <button
          onClick={handleLogoutAll}
          className="w-full py-2 rounded-xl text-[11px] font-bold text-status-danger hover:bg-status-danger/10 transition-colors"
        >
          Revoke All Active Sessions (Logout Everywhere)
        </button>
      </div>
    </div>
  );
}
