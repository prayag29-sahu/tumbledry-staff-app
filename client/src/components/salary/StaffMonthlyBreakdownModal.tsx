'use client';

import React, { useState } from 'react';
import {
  X,
  Calendar,
  Printer,
  Plus,
  Clock,
  DollarSign,
} from 'lucide-react';

export interface DailyBreakdownItem {
  date: string;
  dayNumber: number;
  dayName: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'FUTURE' | 'NOT_EMPLOYED';
  statusLabel: string;
  holidayName?: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  durationMinutes?: number | null;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    reason: string;
    paymentMode: string;
  }>;
}

export interface StaffBreakdownData {
  staffMember: {
    id: string;
    fullName: string;
    mobile: string | null;
    address: string | null;
    designation: string;
  };
  membership: {
    joiningDate: string | null;
    monthlySalary: number;
    incentiveAmount: number;
    salaryCycleDay: number;
    salaryPaymentDate: number;
    salaryNotes: string | null;
    attendanceEnabled: boolean;
    isTemporary?: boolean;
    wageType?: string | null;
    dailyWageRate?: number | null;
  };
  month: string;
  cycleBounds: {
    periodStart: string;
    periodEnd: string;
    totalDaysInMonth: number;
    effectiveWorkingStart: string;
    isMidMonthJoined: boolean;
    eligibleDays: number;
  };
  attendance: {
    presentDays: number;
    halfDays: number;
    absentDays: number;
    paidDays: number;
    weeklyOffDays?: number;
    scheduledWorkingDays?: number;
    totalSessionsRecorded: number;
  };
  calculation: {
    baseMonthlySalary: number;
    perDayRate: number;
    earnedSalary: number;
    fixedIncentive: number;
    bonusAmount: number;
    grossPayable: number;
    advanceDeducted: number;
    otherDeductions: number;
    totalDeductions: number;
    netPayable: number;
  };
  advancesList: Array<{
    id: string;
    type: string;
    amount: number;
    date: string;
    reason: string;
    paymentMode: string;
  }>;
  dailyBreakdown?: DailyBreakdownItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  staffData: StaffBreakdownData | null;
  month: string;
  onOpenPayslip?: (staffId: string) => void;
  onOpenAdvance?: (staffId: string) => void;
}

export function StaffMonthlyBreakdownModal({
  isOpen,
  onClose,
  staffData,
  month,
  onOpenPayslip,
  onOpenAdvance,
}: Props) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline' | 'advances'>('calendar');

  if (!isOpen || !staffData) return null;

  const monthFormatted = (() => {
    try {
      return new Date(month + '-01').toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return month;
    }
  })();

  const { staffMember, membership, attendance, calculation, cycleBounds, dailyBreakdown = [], advancesList } = staffData;

  const absentDeductionTotal = Math.round(
    attendance.absentDays * calculation.perDayRate + 0.5 * attendance.halfDays * calculation.perDayRate
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-3xl border border-border-subtle shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col animate-scale-up">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-lg shrink-0 shadow-sm">
              {staffMember.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-brand-forest truncate">
                  {staffMember.fullName}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-cream text-content-muted border border-border-subtle">
                  {staffMember.designation}
                </span>
                {membership.isTemporary && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-200">
                    ⚡ Temporary {membership.wageType === 'DAILY' ? '• Daily Wage' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-content-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{monthFormatted} Statement</span>
                <span>•</span>
                <span>Mobile: {staffMember.mobile || 'Not set'}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center hover:bg-surface-hover hover:scale-105 active:scale-95 transition-all shadow-xs shrink-0"
            title="Close Statement"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* ── KPI Metrics Cards Row ─────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 text-xs shrink-0">
          {/* Base Rate */}
          <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle space-y-0.5">
            <span className="text-[10px] text-content-muted font-bold uppercase block">
              {membership.wageType === 'DAILY' ? 'Daily Wage Rate' : 'Base Monthly Salary'}
            </span>
            <span className="text-base font-black font-mono text-brand-forest block">
              ₹ {membership.wageType === 'DAILY' && membership.dailyWageRate != null
                ? membership.dailyWageRate.toLocaleString('en-IN')
                : calculation.baseMonthlySalary.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-content-muted block">
              ₹ {calculation.perDayRate}/day • {attendance.scheduledWorkingDays ?? (cycleBounds.eligibleDays - (attendance.weeklyOffDays || 0))} Target
            </span>
          </div>

          {/* Attendance Breakdown */}
          <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-xs space-y-1">
            <span className="text-[10px] text-content-muted font-bold uppercase block">
              Attendance Log
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                {attendance.presentDays} P
              </span>
              <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                attendance.absentDays > 0
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                {attendance.absentDays} A
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {attendance.weeklyOffDays || 0} Off
              </span>
              {attendance.halfDays > 0 && (
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {attendance.halfDays} H
                </span>
              )}
            </div>
            <span className="text-[10px] text-content-muted block">
              {attendance.paidDays} Paid / {cycleBounds.totalDaysInMonth} Month Days
            </span>
          </div>

          {/* Absent Deduction & Advances */}
          <div className="p-3 rounded-2xl bg-red-50/70 border border-red-200 space-y-0.5">
            <span className="text-[10px] text-red-800 font-bold uppercase block">
              Deductions Breakdown
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black font-mono text-red-900">
                - ₹ {(absentDeductionTotal + calculation.advanceDeducted).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="text-[10px] text-red-700 font-medium">
              <span>Absent: -₹{absentDeductionTotal.toLocaleString('en-IN')}</span>
              {calculation.advanceDeducted > 0 && <span> • Adv: -₹{calculation.advanceDeducted.toLocaleString('en-IN')}</span>}
            </div>
          </div>

          {/* Net Payable */}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-brand-forest to-[#2f663e] text-white shadow-sm space-y-0.5">
            <span className="text-[10px] text-brand-lime font-black uppercase tracking-wider block">
              Net Payable
            </span>
            <span className="text-base font-black font-mono text-white block">
              ₹ {calculation.netPayable.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-white/80 block">
              Earned ₹{calculation.earnedSalary.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* ── Segmented Navigation Tabs inside Modal ────────────── */}
        <div className="flex items-center gap-1 p-1 bg-surface-cream rounded-2xl border border-border-subtle shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'calendar'
                ? 'bg-brand-forest text-white font-black shadow-xs'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Attendance Calendar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'timeline'
                ? 'bg-brand-forest text-white font-black shadow-xs'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Day-wise Log ({dailyBreakdown.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('advances')}
            className={`flex-1 py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'advances'
                ? 'bg-brand-forest text-white font-black shadow-xs'
                : 'text-content-muted hover:text-brand-forest'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Advances / Deductions ({advancesList.length})</span>
          </button>
        </div>

        {/* ── Modal Tab Contents (Scrollable Area) ──────────────── */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-3">
          {/* TAB 1: CALENDAR VIEW */}
          {activeTab === 'calendar' && (
            <div className="space-y-3">
              {/* Legend row */}
              <div className="flex items-center gap-3 text-[11px] font-bold flex-wrap bg-surface-cream p-2.5 rounded-2xl border border-border-subtle justify-center sm:justify-start">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block"></span>
                  <span>Present (P)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-rose-600 inline-block"></span>
                  <span>Absent (A)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-sky-500 inline-block"></span>
                  <span>Weekly Off / Holiday (OFF)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-amber-500 inline-block"></span>
                  <span>Half Day (H)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-slate-300 inline-block"></span>
                  <span>Upcoming</span>
                </span>
              </div>

              {/* Day Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center font-black text-[10px] text-content-muted uppercase py-1">
                    {d}
                  </div>
                ))}

                {/* Empty slots for first day offset */}
                {(() => {
                  if (dailyBreakdown.length === 0) return null;
                  const firstDate = new Date(`${dailyBreakdown[0].date}T00:00:00`);
                  const firstDayOfWeek = firstDate.getDay(); // 0 for Sun, 1 for Mon...
                  const emptySlots = [];
                  for (let i = 0; i < firstDayOfWeek; i++) {
                    emptySlots.push(<div key={`empty-${i}`} className="min-h-[52px] rounded-xl bg-slate-50/50 border border-transparent"></div>);
                  }
                  return emptySlots;
                })()}

                {/* All days of the month */}
                {dailyBreakdown.map((day) => {
                  const isPresent = day.status === 'PRESENT';
                  const isAbsent = day.status === 'ABSENT';
                  const isOff = day.status === 'WEEKLY_OFF' || day.status === 'HOLIDAY';
                  const isHalf = day.status === 'HALF_DAY';

                  let cellStyle = 'bg-slate-50 text-slate-400 border-slate-200';
                  let badgeStyle = 'bg-slate-200 text-slate-600';
                  let statusTag = '—';

                  if (isPresent) {
                    cellStyle = 'bg-emerald-50/90 text-emerald-950 border-emerald-300 shadow-xs';
                    badgeStyle = 'bg-emerald-600 text-white font-black';
                    statusTag = 'P';
                  } else if (isAbsent) {
                    cellStyle = 'bg-rose-50 text-rose-950 border-rose-300 shadow-xs';
                    badgeStyle = 'bg-rose-600 text-white font-black';
                    statusTag = 'A';
                  } else if (isOff) {
                    cellStyle = 'bg-sky-50 text-sky-950 border-sky-300';
                    badgeStyle = 'bg-sky-600 text-white font-bold';
                    statusTag = 'OFF';
                  } else if (isHalf) {
                    cellStyle = 'bg-amber-50 text-amber-950 border-amber-300';
                    badgeStyle = 'bg-amber-600 text-white font-black';
                    statusTag = 'H';
                  }

                  const hasTransaction = day.transactions && day.transactions.length > 0;

                  return (
                    <div
                      key={day.date}
                      className={`min-h-[58px] sm:min-h-[66px] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border flex flex-col justify-between transition-all ${cellStyle}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs">
                          {day.dayNumber}
                        </span>
                        <span className={`px-1 sm:px-1.5 py-0.2 rounded-md text-[9px] ${badgeStyle}`}>
                          {statusTag}
                        </span>
                      </div>

                      <div className="text-[9px] mt-1 space-y-0.5">
                        {isPresent && day.checkInTime && (
                          <span className="truncate block font-mono text-[8px] sm:text-[9px] text-emerald-800">
                            {day.checkInTime}
                          </span>
                        )}
                        {isAbsent && (
                          <span className="truncate block font-mono text-[8px] sm:text-[9px] text-rose-700 font-bold">
                            -₹{calculation.perDayRate}
                          </span>
                        )}
                        {isOff && (
                          <span className="truncate block text-[8px] sm:text-[9px] text-sky-800">
                            {day.status === 'WEEKLY_OFF' ? 'Weekly Off' : 'Holiday'}
                          </span>
                        )}
                        {hasTransaction && (
                          <span className="px-1 py-0.2 rounded bg-amber-200 text-amber-950 text-[8px] font-bold block truncate">
                            ₹{day.transactions[0].amount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: DAY-WISE TIMELINE LOG */}
          {activeTab === 'timeline' && (
            <div className="divide-y divide-border-subtle bg-white rounded-2xl border border-border-subtle overflow-hidden">
              {dailyBreakdown.map((day) => {
                const isPresent = day.status === 'PRESENT';
                const isAbsent = day.status === 'ABSENT';
                const isOff = day.status === 'WEEKLY_OFF' || day.status === 'HOLIDAY';
                const isHalf = day.status === 'HALF_DAY';

                return (
                  <div key={day.date} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-surface-cream/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-surface-cream border border-border-subtle flex flex-col items-center justify-center shrink-0">
                        <span className="font-mono font-black text-xs text-brand-forest">{day.dayNumber}</span>
                        <span className="text-[9px] font-bold text-content-muted uppercase">{day.dayName}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-brand-forest">
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isAbsent
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : isOff
                              ? 'bg-sky-100 text-sky-800 border border-sky-300'
                              : isHalf
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {day.statusLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-content-muted mt-0.5 flex items-center gap-2">
                          {day.checkInTime && <span>Check-in: {day.checkInTime}</span>}
                          {day.checkOutTime && <span>• Check-out: {day.checkOutTime}</span>}
                          {isAbsent && <span className="text-rose-700 font-bold">Deduction: -₹{calculation.perDayRate}</span>}
                        </div>
                      </div>
                    </div>

                    {day.transactions.length > 0 && (
                      <div className="text-right">
                        <span className="px-2 py-1 rounded-xl bg-red-50 text-red-800 border border-red-200 font-mono font-bold text-xs inline-block">
                          ₹{day.transactions[0].amount.toLocaleString('en-IN')} {day.transactions[0].type}
                        </span>
                        <span className="block text-[10px] text-content-muted truncate max-w-xs">{day.transactions[0].reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: ADVANCES & DEDUCTIONS LEDGER */}
          {activeTab === 'advances' && (
            <div className="space-y-3">
              {advancesList.length > 0 ? (
                <div className="divide-y divide-border-subtle bg-white rounded-2xl border border-border-subtle overflow-hidden">
                  {advancesList.map((adv) => (
                    <div key={adv.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            adv.type === 'ADVANCE' || adv.type === 'LOAN'
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : adv.type === 'BONUS'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            {adv.type}
                          </span>
                          <span className="text-[11px] text-content-muted">
                            Mode: {adv.paymentMode}
                          </span>
                        </div>
                        <p className="text-xs text-[#1E293B] font-medium mt-1">{adv.reason}</p>
                        <p className="text-[10px] text-content-muted mt-0.5">
                          Date: {new Date(adv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>

                      <span className="font-mono font-black text-sm text-red-700">
                        ₹ {adv.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-border-subtle text-xs text-content-muted font-bold">
                  No advance or deduction entries logged for this staff in {monthFormatted}.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer Actions ──────────────────────────────── */}
        <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-xs font-mono font-bold text-brand-forest">
            Net Payable: ₹ {calculation.netPayable.toLocaleString('en-IN')}
          </div>

          <div className="flex items-center gap-2">
            {onOpenPayslip && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPayslip(staffMember.id);
                }}
                className="px-3.5 py-2 rounded-xl bg-surface-cream text-brand-forest text-xs font-bold border border-border-subtle hover:bg-surface-hover flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>View &amp; Print Slip</span>
              </button>
            )}

            {onOpenAdvance && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdvance(staffMember.id);
                }}
                className="px-3.5 py-2 rounded-xl bg-red-50 text-red-800 text-xs font-bold border border-red-200 hover:bg-red-100 flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Advance</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-brand-forest text-white text-xs font-bold hover:bg-brand-forest/90 transition-colors shadow-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
