'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { AttendanceSession } from '../../types';
import { LiveCameraModal } from '../../components/LiveCameraModal';
import {
  Camera,
  LogOut,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';

export default function AttendancePage() {
  const { activeShopId } = useAuth();
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'check-in' | 'check-out'>('check-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchCurrentSession = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const data = await apiRequest<{ session: AttendanceSession | null }>(
        `/api/shops/${activeShopId}/attendance/my-session`
      );
      setCurrentSession(data.session);
    } catch {
      setCurrentSession(null);
    }
  }, [activeShopId]);

  useEffect(() => {
    fetchCurrentSession();
  }, [fetchCurrentSession]);

  const handleCaptureAttendance = async (photoDataUrl: string) => {
    if (!activeShopId) return;
    setIsSubmitting(true);
    setError(null);

    const isCheckIn = cameraMode === 'check-in';
    const endpoint = isCheckIn
      ? `/api/shops/${activeShopId}/attendance/check-in`
      : `/api/shops/${activeShopId}/attendance/check-out`;

    try {
      const res = await apiRequest<{ message: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          photoPath: photoDataUrl,
        }),
      });

      setSuccessToast(res.message || (isCheckIn ? 'Checked in successfully!' : 'Checked out successfully!'));
      setTimeout(() => setSuccessToast(null), 4000);
      fetchCurrentSession();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attendance recording failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckedIn = currentSession?.status === 'OPEN';

  return (
    <div className="space-y-5 animate-fade-in max-w-md mx-auto pb-12">
      {/* Toast Notification */}
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

      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-brand-forest tracking-tight">
          Photo Attendance
        </h2>
        <p className="text-xs text-content-muted">
          Live camera facial verification clock-in & clock-out
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-semibold text-status-danger flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Current Duty Card */}
      <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3 h-3 rounded-full ${
                isCheckedIn ? 'bg-brand-lime animate-ping' : 'bg-content-muted'
              }`}
            />
            <span className="text-sm font-extrabold text-brand-forest">
              {isCheckedIn ? 'Currently on Shift' : 'Off Duty'}
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
              isCheckedIn ? 'clay-badge-lime' : 'bg-surface-cream text-content-muted border border-border-subtle'
            }`}
          >
            {isCheckedIn ? 'Active Shift' : 'Closed'}
          </span>
        </div>

        {currentSession?.checkInAt && (
          <div className="grid grid-cols-2 gap-3 text-xs bg-surface-cream/80 p-3 rounded-2xl border border-border-subtle shadow-clay-inset">
            <div>
              <span className="text-[11px] text-content-muted block font-medium">Check-In Time</span>
              <strong className="text-brand-forest font-bold">
                {new Date(currentSession.checkInAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>

            {currentSession.checkOutAt ? (
              <div>
                <span className="text-[11px] text-content-muted block font-medium">Check-Out Time</span>
                <strong className="text-brand-forest font-bold">
                  {new Date(currentSession.checkOutAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </div>
            ) : (
              <div>
                <span className="text-[11px] text-content-muted block font-medium">Duty Status</span>
                <strong className="text-emerald-700 font-bold">Active Working</strong>
              </div>
            )}
          </div>
        )}

        {/* Check-In Selfie Preview if present */}
        {currentSession?.checkInPhotoPath && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-brand-forest uppercase tracking-wider">
              Today&apos;s Verified Check-In Selfie
            </span>
            <div className="w-full h-44 rounded-2xl overflow-hidden border border-border-subtle shadow-sm bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentSession.checkInPhotoPath}
                alt="Today Check-In Selfie"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Live Camera Attendance Action */}
        {!isCheckedIn ? (
          <button
            type="button"
            onClick={() => {
              setCameraMode('check-in');
              setIsCameraModalOpen(true);
            }}
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-clay-btn transition-all clay-btn-lime"
          >
            <Camera className="w-4 h-4" />
            <span>{isSubmitting ? 'Recording Shift...' : 'Open Live Camera to Clock In'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCameraMode('check-out');
              setIsCameraModalOpen(true);
            }}
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-red-600 to-red-700 text-white shadow-clay hover:opacity-95"
          >
            <LogOut className="w-4 h-4" />
            <span>{isSubmitting ? 'Ending Shift...' : 'Open Live Camera to Clock Out'}</span>
          </button>
        )}
      </div>

      {/* Live Camera Modal (Direct Camera Only, No File Picker) */}
      <LiveCameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCaptureAttendance}
        title={cameraMode === 'check-in' ? 'Live Check-In Selfie' : 'Live Check-Out Verification'}
        subtitle={
          cameraMode === 'check-in'
            ? 'Position your face in the camera to verify your morning shift check-in'
            : 'Capture live selfie to finalize your working hours and clock out'
        }
        actionLabel={cameraMode === 'check-in' ? 'Confirm Check-In' : 'Confirm Check-Out'}
      />
    </div>
  );
}
