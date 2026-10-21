'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import {
  User,
  Phone,
  MapPin,
  Briefcase,
  Clock,
  Calendar,
  CreditCard,
  Gift,
  ChevronLeft,
  LogOut,
  Camera,
  CheckCircle2,
  Timer,
  ShieldCheck,
} from 'lucide-react';
import { resolveDutyTiming, formatTime12h, formatDisplayDate } from '../lib/dateUtils';
import { LiveCameraModal } from './LiveCameraModal';
import { AttendancePhotoViewerModal } from './AttendancePhotoViewerModal';
import { StaffExtraDetails } from './owner/StaffExtraDetails';


export interface ProfileStaffDetails {
  fullName: string;
  mobile?: string | null;
  address?: string | null;
  profilePhotoPath?: string | null;
  employmentStatus?: string | null;
}

export interface ProfileMembershipDetails {
  shopId?: string;
  shopName?: string;
  staffMemberId?: string;
  roleName: string;
  positionCategory?: string | null;
  joiningDate?: string | null;
  dutyTimingNotes?: string | null;
  monthlySalary?: number | string | null;
  incentiveAmount?: number | string | null;
  securityDeposit?: number | string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  lateThreshold?: string | null;
  halfDayThreshold?: string | null;
  absentThreshold?: string | null;
  attendanceEnabled?: boolean;
  capabilities?: string[];
}

export interface ProfileAttendanceSession {
  id?: string;
  status: string; // 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW'
  attendanceType?: string; // 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT'
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInPhotoPath?: string | null;
  checkOutPhotoPath?: string | null;
  checkInTimeIST?: string | null;
  checkOutTimeIST?: string | null;
  statusReason?: string | null;
}

interface StaffProfileCardProps {
  title?: string;
  onBack?: () => void;
  staff: ProfileStaffDetails;
  membership?: ProfileMembershipDetails | null;
  session?: ProfileAttendanceSession | null;
  isProcessingAttendance?: boolean;
  onCheckInWithPhoto?: (photoData: string) => Promise<void>;
  onCheckOutWithPhoto?: (photoData: string) => Promise<void>;
  hidePermissions?: boolean;
}

export function StaffProfileCard({
  title = 'Staff Profile',
  onBack,
  staff,
  membership,
  session,
  isProcessingAttendance = false,
  onCheckInWithPhoto,
  onCheckOutWithPhoto,
  hidePermissions = false,
}: StaffProfileCardProps) {
  const router = useRouter();
  const { logout } = useAuth();

  const [subtab, setSubtab] = useState<'attendance' | 'details'>('attendance');
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [cameraAction, setCameraAction] = useState<'check-in' | 'check-out'>('check-in');
  const [viewingPhoto, setViewingPhoto] = useState<{
    staffName: string;
    role: string;
    checkInPhotoPath?: string;
    checkOutPhotoUrl?: string;
    checkInAt?: string;
    checkOutAt?: string;
    status?: string;
  } | null>(null);

  // Resolved dynamic values
  const roleLabel = membership?.positionCategory || membership?.roleName || 'Staff';
  const shopLabel = membership?.shopName || 'Tumbledry';
  const mobileLabel = staff.mobile || 'Not provided';
  const addressLabel = staff.address || 'Not provided';
  const joiningLabel = membership?.joiningDate ? formatDisplayDate(membership.joiningDate) : 'Not provided';
  const dutyTimingLabel = resolveDutyTiming(
    membership?.dutyTimingNotes,
    membership?.shiftStartTime,
    membership?.shiftEndTime
  );

  const parseAmount = (val: unknown) => {
    if (val == null || val === '') return null;
    const num = typeof val === 'number' ? val : Number(val);
    return isNaN(num) ? null : num;
  };

  const numSalary = parseAmount(membership?.monthlySalary);
  const numIncentive = parseAmount(membership?.incentiveAmount);
  const numSecurityDeposit = parseAmount(membership?.securityDeposit);

  const salaryLabel = numSalary != null ? `₹ ${numSalary.toLocaleString('en-IN')}` : null;
  const incentiveLabel = numIncentive != null ? `₹ ${numIncentive.toLocaleString('en-IN')}` : null;
  const securityDepositLabel = numSecurityDeposit != null ? `₹ ${numSecurityDeposit.toLocaleString('en-IN')}` : null;

  // Attendance indicators
  const isCheckedIn = !!session?.checkInAt;
  const isOnFloor = isCheckedIn && !session?.checkOutAt && session?.status === 'OPEN';
  const isShiftCompleted = isCheckedIn && (!!session?.checkOutAt || session?.status === 'CLOSED');

  const attendanceTypeLabel = session?.attendanceType || (isCheckedIn ? 'PRESENT' : 'NOT CHECKED IN');
  const checkInIST = session?.checkInTimeIST || (session?.checkInAt ? formatTime12h(new Date(session.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })) : '—');
  const checkOutIST = session?.checkOutTimeIST || (session?.checkOutAt ? formatTime12h(new Date(session.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })) : '—');

  const handleCapture = async (photoDataUrl: string) => {
    setIsLiveCameraOpen(false);
    if (cameraAction === 'check-in' && onCheckInWithPhoto) {
      await onCheckInWithPhoto(photoDataUrl);
    } else if (cameraAction === 'check-out' && onCheckOutWithPhoto) {
      await onCheckOutWithPhoto(photoDataUrl);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-lg mx-auto pb-10">
      {/* ── Top Header Navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-xl hover:bg-surface-cream text-brand-forest transition-colors"
              title="Go back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-base font-black text-brand-forest">{title}</h1>
        </div>

        <button
          type="button"
          onClick={async () => {
            if (confirm('Are you sure you want to log out?')) {
              await logout();
              router.push('/login');
            }
          }}
          className="p-2 rounded-xl bg-white border border-border-subtle text-red-600 hover:bg-red-50 transition-colors shadow-sm"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* ── Profile Identity Card (Matching Screenshot) ───────── */}
      <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm flex flex-col items-center text-center space-y-3">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-2xl shadow-clay-sm border-2 border-white overflow-hidden">
          {staff.profilePhotoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={staff.profilePhotoPath} alt={staff.fullName} className="w-full h-full object-cover" />
          ) : (
            staff.fullName?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>

        <div>
          <h2 className="text-lg font-black text-brand-forest tracking-tight">
            {staff.fullName || 'Staff Member'}
          </h2>
          <p className="text-xs text-content-muted font-semibold mt-0.5">
            {roleLabel} • {shopLabel}
          </p>
        </div>

        {/* 4 Quick Info Cards (2x2 Grid exactly as uploaded screenshot) */}
        {/* Quick Info Cards (Adaptive DB-centric grid) */}
        <div className="grid grid-cols-2 gap-2 w-full pt-3 border-t border-border-subtle text-left text-xs">
          <div className="p-2.5 rounded-xl bg-surface-cream/50">
            <span className="text-[10px] text-content-muted block">Mobile</span>
            <span className="font-bold text-brand-forest truncate block">
              {mobileLabel}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-cream/50">
            <span className="text-[10px] text-content-muted block">Role</span>
            <span className="font-bold text-brand-forest truncate block">
              {roleLabel}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-cream/50">
            <span className="text-[10px] text-content-muted block">Joining Date</span>
            <span className="font-bold text-brand-forest truncate block">
              {joiningLabel}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-cream/50">
            <span className="text-[10px] text-content-muted block">Duty Timing</span>
            <span className="font-bold text-brand-forest truncate block" title={dutyTimingLabel}>
              {dutyTimingLabel}
            </span>
          </div>

          {salaryLabel && (
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
              <span className="text-[10px] text-emerald-800 font-bold block flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-emerald-600" />
                Monthly Salary
              </span>
              <span className="font-black text-emerald-950 truncate block mt-0.5">
                {salaryLabel}
              </span>
            </div>
          )}

          {incentiveLabel && (
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 shadow-sm">
              <span className="text-[10px] text-amber-900 font-bold block flex items-center gap-1">
                <Gift className="w-3 h-3 text-amber-600" />
                Incentive
              </span>
              <span className="font-black text-amber-950 text-sm truncate block mt-0.5">
                {incentiveLabel}
              </span>
            </div>
          )}

          {securityDepositLabel && (
            <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70">
              <span className="text-[10px] text-blue-800 font-bold block flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-blue-600" />
                Security Deposit
              </span>
              <span className="font-black text-blue-950 truncate block mt-0.5">
                {securityDepositLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Segmented Tabs: Attendance vs Profile Details ─────── */}
      <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-xl border border-border-subtle">
        <button
          type="button"
          onClick={() => setSubtab('attendance')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${subtab === 'attendance'
              ? 'bg-brand-forest text-white shadow-sm'
              : 'text-content-muted hover:text-brand-forest'
            }`}
        >
          Attendance
        </button>
        <button
          type="button"
          onClick={() => setSubtab('details')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${subtab === 'details'
              ? 'bg-brand-forest text-white shadow-sm'
              : 'text-content-muted hover:text-brand-forest'
            }`}
        >
          Profile Details
        </button>
      </div>

      {/* ── TAB 1: ATTENDANCE & LIVE STATUS ──────────────────── */}
      {subtab === 'attendance' && (
        <div className="space-y-4 animate-fade-in">
          {/* Today's Attendance Overview Card */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-brand-forest" />
                <h3 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                  Today&apos;s Attendance Status
                </h3>
              </div>
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${attendanceTypeLabel === 'PRESENT'
                    ? 'bg-emerald-100 text-emerald-800'
                    : attendanceTypeLabel === 'LATE'
                      ? 'bg-amber-100 text-amber-900'
                      : attendanceTypeLabel === 'HALF_DAY'
                        ? 'bg-orange-100 text-orange-900'
                        : isCheckedIn
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-red-100 text-red-700'
                  }`}
              >
                {attendanceTypeLabel === 'HALF_DAY' ? 'HALF DAY' : attendanceTypeLabel}
              </span>
            </div>

            {/* Check-In / Check-Out Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`p-3 rounded-xl bg-surface-cream/70 border border-border-subtle/80 ${session?.checkInPhotoPath ? 'cursor-pointer hover:bg-surface-cream' : ''
                  }`}
                onClick={() => {
                  if (session?.checkInPhotoPath) {
                    setViewingPhoto({
                      staffName: staff.fullName,
                      role: roleLabel,
                      checkInPhotoPath: session.checkInPhotoPath,
                      checkInAt: session.checkInAt || undefined,
                      status: session.status,
                    });
                  }
                }}
              >
                <span className="text-[10px] text-content-muted block font-semibold">Check-In (IST)</span>
                <span className="text-sm font-black text-brand-forest block mt-0.5">
                  {checkInIST}
                </span>
                {session?.checkInPhotoPath && (
                  <span className="text-[9px] text-brand-lime font-bold block mt-1">
                    View Selfie →
                  </span>
                )}
              </div>

              <div
                className={`p-3 rounded-xl bg-surface-cream/70 border border-border-subtle/80 ${session?.checkOutPhotoPath ? 'cursor-pointer hover:bg-surface-cream' : ''
                  }`}
                onClick={() => {
                  if (session?.checkOutPhotoPath) {
                    setViewingPhoto({
                      staffName: staff.fullName,
                      role: roleLabel,
                      checkOutPhotoUrl: session.checkOutPhotoPath,
                      checkOutAt: session.checkOutAt || undefined,
                      status: session.status,
                    });
                  }
                }}
              >
                <span className="text-[10px] text-content-muted block font-semibold">Check-Out (IST)</span>
                <span className="text-sm font-black text-brand-forest block mt-0.5">
                  {checkOutIST}
                </span>
                {session?.checkOutPhotoPath && (
                  <span className="text-[9px] text-brand-lime font-bold block mt-1">
                    View Selfie →
                  </span>
                )}
              </div>
            </div>

            {/* Live Camera Action Button */}
            {onCheckInWithPhoto && onCheckOutWithPhoto && (
              <div className="pt-1">
                {isOnFloor ? (
                  <button
                    type="button"
                    disabled={isProcessingAttendance}
                    onClick={() => {
                      setCameraAction('check-out');
                      setIsLiveCameraOpen(true);
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white text-xs font-black shadow-clay hover:opacity-95 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isProcessingAttendance ? 'Processing...' : 'Check Out with Live Camera'}</span>
                  </button>
                ) : isShiftCompleted ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Shift completed for today.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isProcessingAttendance}
                    onClick={() => {
                      setCameraAction('check-in');
                      setIsLiveCameraOpen(true);
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay hover:opacity-95 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isProcessingAttendance ? 'Verifying...' : 'Check In with Live Camera'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: PROFILE DETAILS (Matching Screenshot) ────── */}
      {subtab === 'details' && (
        <div className="space-y-4 animate-fade-in">
          {/* Personal & Employment Details Card */}
          <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3.5 text-xs">
            <div>
              <h3 className="text-xs font-black text-brand-forest">Personal &amp; Employment Details</h3>
              <p className="text-[10px] text-content-muted">Your verified profile details in this store</p>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-forest" />
                  Full Name
                </span>
                <span className="font-bold text-brand-forest">{staff.fullName}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand-forest" />
                  Mobile Number
                </span>
                <span className="font-bold text-brand-forest">{mobileLabel}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-forest" />
                  Address
                </span>
                <span className="font-bold text-brand-forest text-right max-w-[200px] truncate" title={addressLabel}>
                  {addressLabel}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-brand-forest" />
                  Designation
                </span>
                <span className="font-bold text-brand-forest">{roleLabel}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-forest" />
                  Duty Timings
                </span>
                <span className="font-bold text-brand-forest">{dutyTimingLabel}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                  Joining Date
                </span>
                <span className="font-bold text-brand-forest">{joiningLabel}</span>
              </div>

              {salaryLabel && (
                <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                  <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                    Monthly Salary
                  </span>
                  <span className="font-bold text-brand-forest">{salaryLabel}</span>
                </div>
              )}

              {incentiveLabel && (
                <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                  <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-amber-700" />
                    Incentive
                  </span>
                  <span className="font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {incentiveLabel}
                  </span>
                </div>
              )}

              {securityDepositLabel && (
                <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                  <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                    Security Deposit
                  </span>
                  <span className="font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    {securityDepositLabel}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/60">
                <span className="text-content-muted text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-forest" />
                  Employment Status
                </span>
                <span className="font-bold text-brand-forest uppercase px-2 py-0.5 rounded bg-surface-cream text-[10px]">
                  {staff.employmentStatus || 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Shift & Attendance Policy (IST) Card */}
          {(membership?.shiftStartTime || membership?.shiftEndTime || membership?.lateThreshold || membership?.absentThreshold) && (
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-forest" />
                  <h3 className="text-xs font-black text-brand-forest uppercase tracking-wider">
                    Shift &amp; Attendance Timings (IST)
                  </h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Configured
                </span>
              </div>

              <div className="space-y-2 pt-1">
                {membership?.shiftStartTime && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle/40">
                    <span className="text-content-muted text-[11px]">Shift Start (IST)</span>
                    <span className="font-bold text-brand-forest">{formatTime12h(membership.shiftStartTime)}</span>
                  </div>
                )}

                {membership?.lateThreshold && membership.lateThreshold.trim() !== '' && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle/40">
                    <span className="text-emerald-800 text-[11px] font-semibold">On-Time Cutoff (IST)</span>
                    <span className="font-bold text-emerald-900">{formatTime12h(membership.lateThreshold)}</span>
                  </div>
                )}

                {/* Only show Late Cutoff if it is explicitly configured and filled! */}
                {membership?.halfDayThreshold && membership.halfDayThreshold.trim() !== '' && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle/40">
                    <span className="text-amber-800 text-[11px] font-semibold">Late Cutoff (IST)</span>
                    <span className="font-bold text-amber-900">{formatTime12h(membership.halfDayThreshold)}</span>
                  </div>
                )}

                {membership?.absentThreshold && membership.absentThreshold.trim() !== '' && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle/40">
                    <span className="text-rose-800 text-[11px] font-semibold">Half-Day Cutoff (IST)</span>
                    <span className="font-bold text-rose-900">{formatTime12h(membership.absentThreshold)}</span>
                  </div>
                )}

                {membership?.shiftEndTime && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-content-muted text-[11px]">Shift End (IST)</span>
                    <span className="font-bold text-brand-forest">{formatTime12h(membership.shiftEndTime)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Store Permissions (if applicable) */}
          {!hidePermissions && membership?.capabilities && membership.capabilities.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-border-subtle shadow-clay-sm space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-forest" />
                <h3 className="text-xs font-black text-brand-forest">My Store Permissions</h3>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {membership.capabilities.map((c) => (
                  <span
                    key={c}
                    className="px-2.5 py-1 rounded-lg bg-surface-cream text-brand-forest text-[11px] font-bold border border-border-subtle"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom Store Fields (Aadhaar, PAN, Bank Details, etc.) */}
          {membership?.shopId && membership?.staffMemberId && (
            <StaffExtraDetails
              shopId={membership.shopId}
              staffMemberId={membership.staffMemberId}
              canEdit={false}
            />
          )}
        </div>
      )}

      {/* ── Modals: Live Camera & Photo Viewer ──────────────── */}
      {isLiveCameraOpen && (
        <LiveCameraModal
          isOpen
          onClose={() => setIsLiveCameraOpen(false)}
          onCapture={handleCapture}
          title={cameraAction === 'check-in' ? 'Check In — Take Selfie' : 'Check Out — Take Selfie'}
          subtitle="Position your face inside the circle"
        />
      )}

      {viewingPhoto && (
        <AttendancePhotoViewerModal
          isOpen
          onClose={() => setViewingPhoto(null)}
          staffName={viewingPhoto.staffName}
          role={viewingPhoto.role}
          checkInPhotoPath={viewingPhoto.checkInPhotoPath}
          checkInAt={viewingPhoto.checkInAt}
          checkOutPhotoUrl={viewingPhoto.checkOutPhotoUrl}
          checkOutAt={viewingPhoto.checkOutAt}
          status={viewingPhoto.status}
        />
      )}
    </div>
  );
}
