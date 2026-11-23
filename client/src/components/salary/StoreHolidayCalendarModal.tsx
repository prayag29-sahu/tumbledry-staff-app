'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  CalendarCheck,
  Zap,
  Info,
  RotateCcw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

export interface MonthHolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'WEEKLY_OFF' | 'STORE_HOLIDAY' | 'PAID_LEAVE';
}

interface StoreHolidayCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  month: string; // "YYYY-MM"
  onSaved?: () => void;
}

export function StoreHolidayCalendarModal({
  isOpen,
  onClose,
  shopId,
  month,
  onSaved,
}: StoreHolidayCalendarModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [weeklyOffDay, setWeeklyOffDay] = useState<number>(0); // 0 = Sunday
  const [holidays, setHolidays] = useState<MonthHolidayItem[]>([]);

  // Month info
  const { year, monthNum, monthName, daysInMonth, firstDayOfWeek } = useMemo(() => {
    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    const d = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    return {
      year: y,
      monthNum: m + 1,
      monthName: d.toLocaleString('en-US', { month: 'long' }),
      daysInMonth: days,
      firstDayOfWeek: d.getDay(),
    };
  }, [month]);

  // Fetch current holidays config
  const fetchHolidays = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ data: { weeklyOffDay: number; holidays: MonthHolidayItem[] } }>(
        `/api/shops/${shopId}/salary/holidays?month=${month}`
      );
      if (res?.data) {
        setWeeklyOffDay(res.data.weeklyOffDay ?? 0);
        setHolidays(res.data.holidays || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load holidays calendar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [shopId, month]);

  useEffect(() => {
    if (isOpen) {
      fetchHolidays();
    }
  }, [isOpen, fetchHolidays]);

  // Quick Action: Auto-set day of week (e.g. all Sundays)
  const handleSetDayOfWeekAsOff = (targetDay: number) => {
    setWeeklyOffDay(targetDay);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const newHolidays: MonthHolidayItem[] = [];

    // Keep non-weekly-off store holidays
    const customHolidays = holidays.filter((h) => h.type !== 'WEEKLY_OFF');

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, monthNum - 1, day);
      if (d.getDay() === targetDay) {
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        newHolidays.push({
          date: dateStr,
          name: `Weekly Off (${dayNames[targetDay]})`,
          type: 'WEEKLY_OFF',
        });
      }
    }

    // Merge custom holidays that are not on the weekly off day
    for (const ch of customHolidays) {
      if (!newHolidays.some((nh) => nh.date === ch.date)) {
        newHolidays.push(ch);
      }
    }

    setHolidays(newHolidays);
  };

  // Toggle single date status
  const handleDateClick = (dateStr: string) => {
    const existing = holidays.find((h) => h.date === dateStr);
    if (!existing) {
      // Turn into Weekly Off
      setHolidays([
        ...holidays,
        { date: dateStr, name: 'Weekly Off', type: 'WEEKLY_OFF' },
      ]);
    } else if (existing.type === 'WEEKLY_OFF') {
      // Turn into Store Holiday
      setHolidays(
        holidays.map((h) =>
          h.date === dateStr ? { ...h, name: 'Store Holiday', type: 'STORE_HOLIDAY' } : h
        )
      );
    } else {
      // Remove (make normal working day)
      setHolidays(holidays.filter((h) => h.date !== dateStr));
    }
  };

  // Clear all
  const handleClearAll = () => {
    setHolidays([]);
  };

  // Save handler
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiRequest(`/api/shops/${shopId}/salary/holidays?month=${month}`, {
        method: 'PUT',
        body: JSON.stringify({
          weeklyOffDay,
          holidays,
        }),
      });
      setSuccessMsg('Holidays & weekly offs updated successfully!');
      if (onSaved) onSaved();
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save holidays';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const totalHolidays = holidays.length;
  const scheduledWorkingDays = Math.max(1, daysInMonth - totalHolidays);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-border-subtle flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-border-subtle bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-forest text-brand-lime flex items-center justify-center shadow-clay-sm">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-brand-forest uppercase tracking-wider">
                Store Calendar &amp; Weekly Offs
              </h2>
              <p className="text-xs text-content-muted font-medium">
                {monthName} {year} • 1 Day Weekly Off Rule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-content-muted hover:text-brand-forest hover:bg-surface-cream transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Explanation Alert */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-emerald-950">
              <span className="font-bold block">1 Weekly Off Per Week Rule:</span>
              <p className="text-[11px] leading-relaxed text-emerald-900">
                Staff get 1 day off per week. In {monthName} ({daysInMonth} days), there are{' '}
                <strong>{totalHolidays} weekly offs/holidays</strong> and{' '}
                <strong>{scheduledWorkingDays} scheduled working days</strong>. Staff who work all scheduled
                days receive 100% full base salary.
              </p>
            </div>
          </div>

          {/* Quick Setup Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-brand-forest uppercase tracking-wider block">
              Quick Setup Presets
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSetDayOfWeekAsOff(0)}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                  weeklyOffDay === 0
                    ? 'bg-brand-forest text-white border-brand-forest shadow-clay-sm'
                    : 'bg-surface-cream text-brand-forest border-border-subtle hover:bg-emerald-50'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-brand-lime" />
                <span>All Sundays Off</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetDayOfWeekAsOff(1)}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                  weeklyOffDay === 1
                    ? 'bg-brand-forest text-white border-brand-forest shadow-clay-sm'
                    : 'bg-surface-cream text-brand-forest border-border-subtle hover:bg-emerald-50'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-brand-lime" />
                <span>All Mondays Off</span>
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="py-2 px-2.5 rounded-xl border border-red-200 text-red-700 bg-red-50/60 hover:bg-red-100 text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Card */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-surface-cream/80 rounded-2xl border border-border-subtle text-center">
            <div>
              <span className="text-[10px] text-content-muted font-bold block uppercase">Total Month Days</span>
              <span className="text-base font-black text-brand-forest font-mono">{daysInMonth}</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-800 font-bold block uppercase">Weekly Offs</span>
              <span className="text-base font-black text-emerald-700 font-mono">{totalHolidays} Days</span>
            </div>
            <div>
              <span className="text-[10px] text-blue-800 font-bold block uppercase">Working Target</span>
              <span className="text-base font-black text-blue-900 font-mono">{scheduledWorkingDays} Days</span>
            </div>
          </div>

          {/* Interactive Calendar Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-brand-forest uppercase tracking-wider">
                Click any date to toggle (Work ➔ Off ➔ Holiday)
              </span>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-content-muted uppercase pb-1">
              <span className="text-red-600">Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty padding slots before first day */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-14 rounded-xl bg-gray-50/40 border border-transparent" />
              ))}

              {/* Month dates */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const holiday = holidays.find((h) => h.date === dateStr);

                const isWeeklyOff = holiday?.type === 'WEEKLY_OFF';
                const isStoreHoliday = holiday?.type === 'STORE_HOLIDAY';

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => handleDateClick(dateStr)}
                    className={`h-14 rounded-xl border p-1 flex flex-col justify-between items-center transition-all ${
                      isWeeklyOff
                        ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950 font-black shadow-sm'
                        : isStoreHoliday
                        ? 'bg-amber-100/90 border-amber-300 text-amber-950 font-black shadow-sm'
                        : 'bg-white border-border-subtle hover:bg-surface-cream text-content-default font-medium'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{day}</span>
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase truncate max-w-full leading-none ${
                        isWeeklyOff
                          ? 'bg-emerald-600 text-white'
                          : isStoreHoliday
                          ? 'bg-amber-600 text-white'
                          : 'text-content-muted'
                      }`}
                    >
                      {isWeeklyOff ? 'Off' : isStoreHoliday ? 'Holiday' : 'Work'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 pt-2 text-[10px] text-content-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-white border border-border-subtle inline-block" />
                Working Day
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
                Weekly Off (Paid)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-600 inline-block" />
                Store Holiday (Paid)
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-cream/50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white border border-border-subtle text-xs font-bold text-content-default hover:bg-surface-cream transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black shadow-clay flex items-center gap-2 hover:bg-emerald-900 disabled:opacity-50 transition-all"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-brand-lime" />
                <span>Save Store Calendar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
