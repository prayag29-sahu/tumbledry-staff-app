'use client';

import React from 'react';
import { X, Clock, CheckCircle2 } from 'lucide-react';

interface AttendancePhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  role?: string;
  checkInAt?: string | null;
  checkInPhotoPath?: string | null;
  photoUrl?: string | null;
  checkOutAt?: string | null;
  checkOutPhotoPath?: string | null;
  checkOutPhotoUrl?: string | null;
  timestamp?: string | null;
  checkOutTimestamp?: string | null;
  status?: string | null;
  date?: string;
}

export function AttendancePhotoViewerModal({
  isOpen,
  onClose,
  staffName,
  role = 'Staff Member',
  checkInAt,
  checkInPhotoPath,
  photoUrl,
  checkOutAt,
  checkOutPhotoPath,
  checkOutPhotoUrl,
  timestamp,
  checkOutTimestamp,
  status,
}: AttendancePhotoViewerModalProps) {
  if (!isOpen) return null;

  const actualCheckInPhoto = checkInPhotoPath || photoUrl;
  const actualCheckOutPhoto = checkOutPhotoPath || checkOutPhotoUrl;
  const actualCheckInTime = checkInAt || timestamp;
  const actualCheckOutTime = checkOutAt || checkOutTimestamp;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#EAF5E9] text-brand-forest font-black flex items-center justify-center shadow-sm">
              {staffName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-brand-forest">{staffName}</h3>
                {status && (
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 uppercase">
                    {status}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-content-muted">{role}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Check-In Photo & Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-brand-forest flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Shift Check-In Selfie</span>
            </span>
            {actualCheckInTime && (
              <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                {new Date(actualCheckInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="relative w-full aspect-square bg-black/5 rounded-2xl overflow-hidden border border-border-subtle shadow-clay-sm flex items-center justify-center">
            {actualCheckInPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={actualCheckInPhoto}
                alt={`${staffName} Check-in Selfie`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="p-4 text-center text-xs text-content-muted font-medium">
                No photographic selfie attached with this check-in session.
              </div>
            )}
          </div>
        </div>

        {/* Check-Out Photo (if recorded) */}
        {actualCheckOutPhoto && (
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-brand-forest flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Shift Check-Out Photo</span>
              </span>
              {actualCheckOutTime && (
                <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  {new Date(actualCheckOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="relative w-full h-40 bg-black/5 rounded-xl overflow-hidden border border-border-subtle flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={actualCheckOutPhoto}
                alt={`${staffName} Check-out Photo`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-surface-cream text-brand-forest text-xs font-bold border border-border-subtle hover:bg-surface-hover"
        >
          Close
        </button>
      </div>
    </div>
  );
}
