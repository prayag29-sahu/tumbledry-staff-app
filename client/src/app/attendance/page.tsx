'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { AttendanceSession, AttendanceHistoryResponse, AttendanceHistoryRecord } from '../../types';
import { LiveCameraModal } from '../../components/LiveCameraModal';
import { AttendancePhotoViewerModal } from '../../components/AttendancePhotoViewerModal';
import {
  Camera,
  LogOut,
  AlertCircle,
  X,
  Check,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  History,
  Timer,
  Info,
} from 'lucide-react';

export default function AttendancePage() {
  const { user, activeShopId } = useAuth();
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  // Today session & shift schedule states
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [shiftSchedule, setShiftSchedule] = useState<{
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    lateThreshold?: string | null;
    halfDayThreshold?: string | null;
    absentThreshold?: string | null;
  } | null>(null);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'check-in' | 'check-out'>('check-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Monthly History State
  const now = new Date();
  const [historyYear, setHistoryYear] = useState<number>(now.getFullYear());
  const [historyMonth, setHistoryMonth] = useState<number>(now.getMonth() + 1);
  const [historyData, setHistoryData] = useState<AttendanceHistoryResponse | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Photo viewer modal state
  const [viewingPhoto, setViewingPhoto] = useState<{
    staffName: string;
    role: string;
    photoUrl?: string | null;
    checkOutPhotoUrl?: string | null;
    timestamp?: string | null;
    checkOutTimestamp?: string | null;
    status?: string | null;
    date?: string;
  } | null>(null);

  const fetchCurrentSession = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const data = await apiRequest<{
        session: AttendanceSession | null;
        shiftSchedule?: typeof shiftSchedule;
        evaluated?: unknown;
      }>(`/api/shops/${activeShopId}/attendance/my-session`);
      setCurrentSession(data.session);
      if (data.shiftSchedule) setShiftSchedule(data.shiftSchedule);
    } catch {
      setCurrentSession(null);
    }
  }, [activeShopId]);

  const fetchHistory = useCallback(async (year: number, month: number) => {
    if (!activeShopId) return;
    setIsHistoryLoading(true);
    try {
      const res = await apiRequest<AttendanceHistoryResponse>(
        `/api/shops/${activeShopId}/attendance/my-history?year=${year}&month=${month}`
      );
      setHistoryData(res);
      if (res.shiftSchedule) setShiftSchedule(res.shiftSchedule);
    } catch {
      setHistoryData(null);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [activeShopId]);

  useEffect(() => {
    fetchCurrentSession();
  }, [fetchCurrentSession]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(historyYear, historyMonth);
    }
  }, [activeTab, historyYear, historyMonth, fetchHistory]);

  // Auto-refresh attendance status on window focus / tab return
  useEffect(() => {
    const handleFocus = () => {
      fetchCurrentSession();
      if (activeTab === 'history') fetchHistory(historyYear, historyMonth);
    };
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchCurrentSession();
        if (activeTab === 'history') fetchHistory(historyYear, historyMonth);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchCurrentSession, fetchHistory, activeTab, historyYear, historyMonth]);

  // Timing window calculations (IST, 12h & 24h)
  const timingWindow = useMemo(() => {
    if (!shiftSchedule?.shiftEndTime) {
      return {
        isCheckInAllowed: true,
        checkInReason: '',
        isCheckOutAllowed: true,
        checkOutReason: '',
        shiftEndLabel: '',
      };
    }
    const clean = shiftSchedule.shiftEndTime.trim().toUpperCase().replace(/[AP]M/g, '').trim();
    const [hStr, mStr] = clean.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    if (shiftSchedule.shiftEndTime.toUpperCase().includes('PM') && h < 12) h += 12;
    if (shiftSchedule.shiftEndTime.toUpperCase().includes('AM') && h === 12) h = 0;
    const shiftEndMin = h * 60 + m;
    const checkoutCloseMin = shiftEndMin + 90;

    let dispH = Math.floor(shiftEndMin / 60);
    const dispM = String(shiftEndMin % 60).padStart(2, '0');
    const ampm = dispH >= 12 ? 'PM' : 'AM';
    dispH = dispH % 12 || 12;
    const shiftEndLabel = `${String(dispH).padStart(2, '0')}:${dispM} ${ampm}`;

    const nowD = new Date();
    const istStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(nowD);
    const [nowH, nowM] = istStr.split(':').map(Number);
    const currentMin = (nowH || 0) * 60 + (nowM || 0);

    const isCheckInAllowed = currentMin < shiftEndMin;
    const checkInReason = isCheckInAllowed
      ? ''
      : `Check-in closed (Shift ended at ${shiftEndLabel} IST)`;

    const isBeforeEnd = currentMin < shiftEndMin;
    const isPastClose = currentMin > checkoutCloseMin;
    const isCheckOutAllowed = !isBeforeEnd && !isPastClose;
    const checkOutReason = isBeforeEnd
      ? `Check-out opens at ${shiftEndLabel} IST (Shift End)`
      : isPastClose
        ? `Check-out closed (90 min past shift end expired)`
        : '';

    return {
      isCheckInAllowed,
      checkInReason,
      isCheckOutAllowed,
      checkOutReason,
      shiftEndLabel,
    };
  }, [shiftSchedule]);

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
      setIsCameraModalOpen(false);
      fetchCurrentSession();
      if (activeTab === 'history') fetchHistory(historyYear, historyMonth);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attendance recording failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrevMonth = () => {
    if (historyMonth === 1) {
      setHistoryYear((y) => y - 1);
      setHistoryMonth(12);
    } else {
      setHistoryMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (historyMonth === 12) {
      setHistoryYear((y) => y + 1);
      setHistoryMonth(1);
    } else {
      setHistoryMonth((m) => m + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const isCheckedIn = currentSession?.status === 'OPEN';
  const staffDisplayName = user?.staffMember?.fullName || user?.username || 'Staff Member';

  return (
    <div className="space-y-4 animate-fade-in max-w-lg mx-auto pb-14">
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

      {/* Header and Tab Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-brand-forest tracking-tight">
              Staff Attendance
            </h2>
            <p className="text-xs text-content-muted">
              Live biometric facial verification & monthly logs
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-brand-forest text-white font-black flex items-center justify-center text-sm shadow-clay-sm">
            {staffDisplayName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-2xl bg-surface-card p-1 border border-border-subtle shadow-clay-sm">
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-brand-forest text-white shadow-sm'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Today&apos;s Duty</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-brand-forest text-white shadow-sm'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Monthly History</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-semibold text-status-danger flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 1: TODAY'S DUTY & LIVE CAMERA CLOCK IN / OUT
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'today' && (
        <div className="space-y-4 animate-fade-in">
          {/* Shift Schedule Timing Card */}
          {shiftSchedule?.shiftStartTime && shiftSchedule?.shiftEndTime && (
            <div className="bg-surface-cream/80 border border-border-subtle rounded-2xl p-3.5 text-xs space-y-1.5 shadow-clay-sm">
              <div className="flex items-center justify-between text-[11px] font-black text-brand-forest">
                <span className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-brand-lime" />
                  Your Assigned Shift
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white border border-border-subtle font-mono text-[10px]">
                  {shiftSchedule.shiftStartTime} - {shiftSchedule.shiftEndTime}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-content-muted pt-1 border-t border-border-subtle/60">
                <span>Check-out Window: <strong>At Shift End ({timingWindow.shiftEndLabel}) + 90 min</strong></span>
                {shiftSchedule.absentThreshold && (
                  <span>Absent Cutoff: <strong>{shiftSchedule.absentThreshold}</strong></span>
                )}
              </div>
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
                  {isCheckedIn ? 'Currently on Shift' : currentSession?.checkOutAt ? 'Shift Completed' : 'Off Duty'}
                </span>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  currentSession?.attendanceType === 'ABSENT'
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : isCheckedIn
                      ? 'clay-badge-lime'
                      : currentSession?.checkOutAt
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'bg-surface-cream text-content-muted border border-border-subtle'
                }`}
              >
                {currentSession?.attendanceType === 'ABSENT'
                  ? (isCheckedIn ? 'Absent (On Floor)' : 'Absent')
                  : isCheckedIn
                    ? 'Active Shift'
                    : currentSession?.checkOutAt
                      ? 'Closed'
                      : 'Not Clocked In'}
              </span>
            </div>

            {currentSession?.statusReason && (
              <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium ${
                currentSession.attendanceType === 'ABSENT'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : currentSession.attendanceType === 'LATE'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                {currentSession.attendanceType === 'ABSENT' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                )}
                <span>{currentSession.statusReason}</span>
              </div>
            )}

            {currentSession?.checkInAt && (
              <div className="grid grid-cols-2 gap-3 text-xs bg-surface-cream/80 p-3 rounded-2xl border border-border-subtle shadow-clay-inset">
                <div>
                  <span className="text-[11px] text-content-muted block font-medium">Check-In Time</span>
                  <strong className="text-brand-forest font-bold">
                    {currentSession.checkInTimeIST ||
                      new Date(currentSession.checkInAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                  </strong>
                </div>

                {currentSession.checkOutAt ? (
                  <div>
                    <span className="text-[11px] text-content-muted block font-medium">Check-Out Time</span>
                    <strong className="text-brand-forest font-bold">
                      {currentSession.checkOutTimeIST ||
                        new Date(currentSession.checkOutAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                    </strong>
                  </div>
                ) : (
                  <div>
                    <span className="text-[11px] text-content-muted block font-medium">Duty Status</span>
                    <strong className="text-emerald-700 font-bold">Active On Floor</strong>
                  </div>
                )}
              </div>
            )}

            {/* Check-In Selfie Preview if present */}
            {currentSession?.checkInPhotoPath && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-brand-forest uppercase tracking-wider">
                    Today&apos;s Verified Check-In Selfie
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setViewingPhoto({
                        staffName: staffDisplayName,
                        role: 'Staff Member',
                        photoUrl: currentSession.checkInPhotoPath,
                        checkOutPhotoUrl: currentSession.checkOutPhotoPath || undefined,
                        timestamp: currentSession.checkInAt,
                        checkOutTimestamp: currentSession.checkOutAt || undefined,
                        status: currentSession.status,
                      })
                    }
                    className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    <span>View Full Photo</span>
                  </button>
                </div>
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
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!timingWindow.isCheckInAllowed) return;
                    setCameraMode('check-in');
                    setIsCameraModalOpen(true);
                  }}
                  disabled={isSubmitting || !timingWindow.isCheckInAllowed}
                  title={timingWindow.checkInReason}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-clay-btn transition-all ${
                    timingWindow.isCheckInAllowed
                      ? 'clay-btn-lime cursor-pointer'
                      : 'bg-surface-cream text-content-muted border border-border-subtle cursor-not-allowed opacity-70'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Recording Shift...'
                      : timingWindow.isCheckInAllowed
                        ? 'Open Live Camera to Clock In'
                        : timingWindow.checkInReason}
                  </span>
                </button>
                {!timingWindow.isCheckInAllowed && (
                  <p className="text-[11px] text-center text-status-danger font-semibold">
                    {timingWindow.checkInReason}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!timingWindow.isCheckOutAllowed) return;
                    setCameraMode('check-out');
                    setIsCameraModalOpen(true);
                  }}
                  disabled={isSubmitting || !timingWindow.isCheckOutAllowed}
                  title={timingWindow.checkOutReason}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    timingWindow.isCheckOutAllowed
                      ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-clay hover:opacity-95 cursor-pointer'
                      : 'bg-surface-cream text-content-muted border border-border-subtle cursor-not-allowed opacity-75'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Ending Shift...'
                      : timingWindow.isCheckOutAllowed
                        ? 'Open Live Camera to Clock Out'
                        : timingWindow.checkOutReason}
                  </span>
                </button>
                {!timingWindow.isCheckOutAllowed && (
                  <p className="text-[11px] text-center text-amber-800 font-semibold bg-amber-50 py-1.5 px-2.5 rounded-xl border border-amber-200">
                    ℹ️ {timingWindow.checkOutReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 2: MONTHLY ATTENDANCE HISTORY
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-fade-in">
          {/* Month & Year Selector */}
          <div className="bg-surface-card rounded-clay border border-border-subtle p-3.5 shadow-clay-sm flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-surface-cream hover:bg-surface-cream/80 text-brand-forest border border-border-subtle transition-all active:scale-95"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <select
                value={historyMonth}
                onChange={(e) => setHistoryMonth(parseInt(e.target.value, 10))}
                className="bg-surface-cream text-xs font-black text-brand-forest border border-border-subtle rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-brand-forest"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={historyYear}
                onChange={(e) => setHistoryYear(parseInt(e.target.value, 10))}
                className="bg-surface-cream text-xs font-black text-brand-forest border border-border-subtle rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-brand-forest"
              >
                {[2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-surface-cream hover:bg-surface-cream/80 text-brand-forest border border-border-subtle transition-all active:scale-95"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Monthly KPI Summary Cards */}
          {historyData?.summary && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              <div className="bg-emerald-50/80 p-2.5 rounded-2xl border border-emerald-200">
                <span className="text-base font-black text-emerald-800 block">
                  {historyData.summary.presentDays}
                </span>
                <span className="text-[10px] font-bold text-emerald-700">Present</span>
              </div>
              <div className="bg-amber-50/80 p-2.5 rounded-2xl border border-amber-200">
                <span className="text-base font-black text-amber-800 block">
                  {historyData.summary.lateDays}
                </span>
                <span className="text-[10px] font-bold text-amber-700">Late</span>
              </div>
              <div className="bg-blue-50/80 p-2.5 rounded-2xl border border-blue-200">
                <span className="text-base font-black text-blue-800 block">
                  {historyData.summary.halfDays}
                </span>
                <span className="text-[10px] font-bold text-blue-700">Half-Day</span>
              </div>
              <div className="bg-red-50/60 p-2.5 rounded-2xl border border-red-200">
                <span className="text-base font-black text-red-600 block">
                  {historyData.summary.absentDays}
                </span>
                <span className="text-[10px] font-bold text-red-500">Absent</span>
              </div>
              <div className="bg-purple-50/80 p-2.5 rounded-2xl border border-purple-200 col-span-2 sm:col-span-1">
                <span className="text-base font-black text-purple-800 block">
                  {historyData.summary.totalHoursWorked}h
                </span>
                <span className="text-[10px] font-bold text-purple-700">Hours</span>
              </div>
            </div>
          )}

          {/* Month History Records List */}
          <div className="bg-surface-card rounded-clay border border-border-subtle p-4 shadow-clay space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <h3 className="text-xs font-black text-brand-forest flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-lime" />
                <span>
                  {monthNames[historyMonth - 1]} {historyYear} Logs ({historyData?.records.length || 0})
                </span>
              </h3>
              {isHistoryLoading && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
              )}
            </div>

            {isHistoryLoading ? (
              <div className="py-12 text-center text-xs font-bold text-content-muted space-y-2">
                <span className="w-6 h-6 border-2 border-brand-forest border-t-transparent rounded-full animate-spin inline-block" />
                <p>Loading attendance history...</p>
              </div>
            ) : !historyData?.records || historyData.records.length === 0 ? (
              <div className="py-10 text-center text-xs font-semibold text-content-muted bg-surface-cream/50 rounded-2xl border border-dashed border-border-subtle space-y-1">
                <Info className="w-6 h-6 text-content-muted mx-auto" />
                <p>No attendance records found for {monthNames[historyMonth - 1]} {historyYear}.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyData.records.map((rec: AttendanceHistoryRecord) => {
                  const recDate = rec.checkInAt ? new Date(rec.checkInAt) : new Date(rec.date);
                  const dateFormatted = recDate.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    weekday: 'short',
                  });

                  return (
                    <div
                      key={rec.id}
                      className="p-3 rounded-2xl bg-surface-cream/60 border border-border-subtle hover:border-brand-forest/30 transition-all text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-brand-forest text-xs">
                            {dateFormatted}
                          </span>
                          {rec.durationHours > 0 && (
                            <span className="text-[10px] text-content-muted font-bold bg-white px-1.5 py-0.5 rounded-md border border-border-subtle">
                              {rec.durationHours} hrs
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            rec.attendanceType === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : rec.attendanceType === 'LATE'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : rec.attendanceType === 'HALF_DAY'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                  : 'bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          {rec.attendanceType === 'LATE'
                            ? `Late (${rec.delayMinutes}m)`
                            : rec.attendanceType}
                        </span>
                      </div>

                      {/* Timings and Photo Action */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle/50">
                        <div className="flex items-center gap-2 text-content-muted font-medium">
                          <span>
                            In: <strong>{rec.checkInTimeIST || (rec.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--')}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Out: <strong>{rec.checkOutTimeIST || (rec.checkOutAt ? new Date(rec.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--')}</strong>
                          </span>
                        </div>

                        {rec.checkInPhotoPath && (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingPhoto({
                                staffName: staffDisplayName,
                                role: 'Staff Member',
                                photoUrl: rec.checkInPhotoPath,
                                checkOutPhotoUrl: rec.checkOutPhotoPath || undefined,
                                timestamp: rec.checkInAt,
                                checkOutTimestamp: rec.checkOutAt || undefined,
                                status: rec.status,
                                date: dateFormatted,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 text-[10px] font-extrabold border border-border-subtle transition-colors shadow-sm"
                          >
                            <Camera className="w-3 h-3 text-emerald-600" />
                            <span>Selfie</span>
                          </button>
                        )}
                      </div>

                      {rec.statusReason && rec.attendanceType !== 'PRESENT' && (
                        <p className="text-[10px] text-content-muted font-medium bg-white/60 px-2 py-1 rounded-lg">
                          Note: {rec.statusReason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Camera Modal */}
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

      {/* Verified Photo Viewer Modal */}
      {viewingPhoto && (
        <AttendancePhotoViewerModal
          isOpen={Boolean(viewingPhoto)}
          onClose={() => setViewingPhoto(null)}
          staffName={viewingPhoto.staffName}
          role={viewingPhoto.role}
          photoUrl={viewingPhoto.photoUrl}
          checkOutPhotoUrl={viewingPhoto.checkOutPhotoUrl}
          timestamp={viewingPhoto.timestamp}
          checkOutTimestamp={viewingPhoto.checkOutTimestamp}
          status={viewingPhoto.status}
          date={viewingPhoto.date}
        />
      )}
    </div>
  );
}
