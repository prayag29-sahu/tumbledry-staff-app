'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { AttendanceSession } from '../../types';
import {
  Camera,
  CheckCircle2,
  LogOut,
  AlertCircle,
  X,
} from 'lucide-react';

export default function AttendancePage() {
  const { activeShopId } = useAuth();
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheckIn = async () => {
    if (!activeShopId || !photoPreview) {
      setError('Please take a selfie photo to check in.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${activeShopId}/attendance/check-in`, {
        method: 'POST',
        body: JSON.stringify({
          photoPath: 'uploads/attendance-checkin.jpg',
        }),
      });
      setPhotoPreview(null);
      alert('Checked in successfully!');
      fetchCurrentSession();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeShopId || !photoPreview) {
      setError('Please take a photo to check out.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${activeShopId}/attendance/check-out`, {
        method: 'POST',
        body: JSON.stringify({
          photoPath: 'uploads/attendance-checkout.jpg',
        }),
      });
      setPhotoPreview(null);
      alert('Checked out successfully. Good job today!');
      fetchCurrentSession();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Check-out failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckedIn = currentSession?.status === 'OPEN';

  return (
    <div className="space-y-5 animate-fade-in max-w-md mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-brand-forest tracking-tight">
          Photo Attendance
        </h2>
        <p className="text-xs text-content-muted">
          Daily shift clock-in and clock-out station
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
            {isCheckedIn ? 'Active' : 'Closed'}
          </span>
        </div>

        {currentSession?.checkInAt && (
          <div className="grid grid-cols-2 gap-3 text-xs bg-surface-cream/80 p-3 rounded-2xl border border-border-subtle shadow-clay-inset">
            <div>
              <span className="text-[11px] text-content-muted block font-medium">Check-In Time</span>
              <strong className="text-brand-forest font-bold">
                {new Date(currentSession.checkInAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>

            {currentSession.checkOutAt ? (
              <div>
                <span className="text-[11px] text-content-muted block font-medium">Check-Out Time</span>
                <strong className="text-brand-forest font-bold">
                  {new Date(currentSession.checkOutAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </div>
            ) : (
              <div>
                <span className="text-[11px] text-content-muted block font-medium">Duty Duration</span>
                <strong className="text-brand-lime font-bold">In Progress</strong>
              </div>
            )}
          </div>
        )}

        {/* Photo Box */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-brand-forest uppercase tracking-wider">
            {isCheckedIn ? 'Check-out Verification Photo' : 'Check-in Selfie Photo'}
          </label>

          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-border-subtle shadow-clay h-52">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Attendance selfie"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 shadow-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-brand-lime/40 rounded-2xl bg-surface-cream hover:bg-surface-cream/80 cursor-pointer shadow-clay-inset transition-colors">
              <Camera className="w-8 h-8 text-brand-lime mb-2" />
              <span className="text-xs font-bold text-brand-forest">
                Tap to Take Attendance Selfie
              </span>
              <span className="text-[10px] text-content-muted mt-0.5">
                Front camera capture required
              </span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handlePhotoCapture}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Action Button */}
        {!isCheckedIn ? (
          <button
            onClick={handleCheckIn}
            disabled={isSubmitting || !photoPreview}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-clay-btn transition-all ${
              !photoPreview
                ? 'bg-surface-cream text-content-muted border border-border-subtle cursor-not-allowed'
                : 'clay-btn-lime'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{isSubmitting ? 'Verifying...' : 'Clock In Now'}</span>
          </button>
        ) : (
          <button
            onClick={handleCheckOut}
            disabled={isSubmitting || !photoPreview}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              !photoPreview
                ? 'bg-surface-cream text-content-muted border border-border-subtle cursor-not-allowed'
                : 'clay-btn-forest shadow-md'
            }`}
          >
            <LogOut className="w-5 h-5" />
            <span>{isSubmitting ? 'Calculating hours...' : 'Clock Out (End Shift)'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
