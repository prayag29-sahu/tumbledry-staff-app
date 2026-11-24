'use client';

import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { X, AlertTriangle, Settings } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  staffMemberId: string;
  staffName: string;
  initialTerms: {
    monthlySalary?: number | null;
    incentiveAmount?: number | null;
    joiningDate?: string | null;
    salaryCycleDay?: number | null;
    salaryPaymentDate?: number | null;
    salaryNotes?: string | null;
    isTemporary?: boolean;
    wageType?: string | null;
    dailyWageRate?: number | null;
  };
  onSuccess?: () => void;
}

export function EditSalaryTermsModal({
  isOpen,
  onClose,
  shopId,
  staffMemberId,
  staffName,
  initialTerms,
  onSuccess,
}: Props) {
  const [wageType, setWageType] = useState<'MONTHLY' | 'DAILY'>(
    initialTerms.wageType === 'DAILY' ? 'DAILY' : 'MONTHLY'
  );
  const [dailyWageRate, setDailyWageRate] = useState<string>(
    initialTerms.dailyWageRate ? String(initialTerms.dailyWageRate) : ''
  );
  const [monthlySalary, setMonthlySalary] = useState<string>(
    initialTerms.monthlySalary ? String(initialTerms.monthlySalary) : ''
  );
  const [incentiveAmount, setIncentiveAmount] = useState<string>(
    initialTerms.incentiveAmount ? String(initialTerms.incentiveAmount) : ''
  );
  const [joiningDate, setJoiningDate] = useState<string>(
    initialTerms.joiningDate ? initialTerms.joiningDate.slice(0, 10) : ''
  );
  const [salaryCycleDay, setSalaryCycleDay] = useState<number>(initialTerms.salaryCycleDay || 1);
  const [salaryPaymentDate, setSalaryPaymentDate] = useState<number>(initialTerms.salaryPaymentDate || 7);
  const [salaryNotes, setSalaryNotes] = useState<string>(initialTerms.salaryNotes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${shopId}/staff/${staffMemberId}/salary-terms`, {
        method: 'PATCH',
        body: JSON.stringify({
          wageType,
          dailyWageRate: wageType === 'DAILY' && dailyWageRate ? parseFloat(dailyWageRate) : null,
          monthlySalary: wageType === 'MONTHLY' && monthlySalary ? parseFloat(monthlySalary) : (wageType === 'DAILY' ? 0 : 0),
          incentiveAmount: incentiveAmount ? parseFloat(incentiveAmount) : 0,
          joiningDate: joiningDate ? joiningDate : null,
          salaryCycleDay,
          salaryPaymentDate,
          salaryNotes: salaryNotes.trim() || undefined,
        }),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update salary terms.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md border border-border-subtle shadow-clay p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-brand-forest flex items-center justify-center font-black shrink-0 shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-brand-forest truncate">
                Staff Salary &amp; Terms
              </h3>
              <p className="text-[10px] sm:text-[11px] text-content-muted truncate">
                Configure pay scale, joining date &amp; payout cycle
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center hover:bg-surface-hover hover:scale-105 active:scale-95 transition-all shadow-xs shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-surface-cream border border-border-subtle text-xs">
          <span className="text-[10px] text-content-muted font-bold block uppercase">Employee</span>
          <span className="font-extrabold text-brand-forest text-sm">{staffName}</span>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Joining Date */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Date of Joining (For Mid-Month Pro-rata Calculation)
            </label>
            <input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest cursor-pointer"
            />
            <p className="text-[10px] text-content-muted mt-1">
              If staff joined mid-month, salary for their first month will automatically start from this date.
            </p>
          </div>

          {/* Wage Type Toggle */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Wage Structure
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWageType('MONTHLY')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  wageType === 'MONTHLY'
                    ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                Fixed Monthly Salary
              </button>
              <button
                type="button"
                onClick={() => setWageType('DAILY')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  wageType === 'DAILY'
                    ? 'bg-brand-forest text-white border-brand-forest shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                Daily Wage Rate (₹/day)
              </button>
            </div>
          </div>

          {/* Salary or Daily Wage & Incentive */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                {wageType === 'DAILY' ? 'Daily Wage Rate (₹/day) *' : 'Base Monthly Salary (₹) *'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-content-muted">₹</span>
                {wageType === 'DAILY' ? (
                  <input
                    type="number"
                    placeholder="500"
                    step="any"
                    value={dailyWageRate}
                    onChange={(e) => setDailyWageRate(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-mono font-black text-brand-forest focus:ring-1 focus:ring-brand-forest"
                  />
                ) : (
                  <input
                    type="number"
                    placeholder="15000"
                    step="any"
                    value={monthlySalary}
                    onChange={(e) => setMonthlySalary(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-mono font-black text-brand-forest focus:ring-1 focus:ring-brand-forest"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Fixed Incentive (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-content-muted">₹</span>
                <input
                  type="number"
                  placeholder="1000"
                  step="any"
                  value={incentiveAmount}
                  onChange={(e) => setIncentiveAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-mono font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                />
              </div>
            </div>
          </div>

          {/* Salary Cycle Day & Payout Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Salary Cycle Start Day
              </label>
              <select
                value={salaryCycleDay}
                onChange={(e) => setSalaryCycleDay(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              >
                <option value={1}>1st of Month (1st to 30/31st)</option>
                <option value={7}>7th of Month (7th to 6th)</option>
                <option value={10}>10th of Month (10th to 9th)</option>
                <option value={15}>15th of Month (15th to 14th)</option>
                <option value={25}>25th of Month (25th to 24th)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Target Payment Day
              </label>
              <select
                value={salaryPaymentDate}
                onChange={(e) => setSalaryPaymentDate(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              >
                <option value={1}>1st of each month</option>
                <option value={5}>5th of each month</option>
                <option value={7}>7th of each month (Standard)</option>
                <option value={10}>10th of each month</option>
                <option value={15}>15th of each month</option>
              </select>
            </div>
          </div>

          {/* Bank / Salary Notes */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Bank Details / Payment Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. SBI A/c: XXXXXXXX1234, IFSC: SBIN0001234, UPI: name@upi"
              value={salaryNotes}
              onChange={(e) => setSalaryNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-xs text-brand-forest focus:ring-1 focus:ring-brand-forest resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border-subtle bg-surface-cream text-content-muted font-bold hover:text-brand-forest"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-brand-forest text-white font-black shadow-clay hover:opacity-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Terms'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
