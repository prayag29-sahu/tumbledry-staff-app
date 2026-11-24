'use client';

import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { X, AlertTriangle } from 'lucide-react';

interface StaffOption {
  id: string;
  fullName: string;
  mobile?: string | null;
  designation?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  defaultStaffMemberId?: string;
  staffList?: StaffOption[];
  defaultMonth?: string;
  onSuccess?: () => void;
}

export function RecordAdvanceModal({
  isOpen,
  onClose,
  shopId,
  defaultStaffMemberId,
  staffList = [],
  defaultMonth,
  onSuccess,
}: Props) {
  const [staffMemberId, setStaffMemberId] = useState(defaultStaffMemberId || (staffList[0]?.id || ''));
  const [type, setType] = useState<'ADVANCE' | 'DEDUCTION' | 'BONUS' | 'PENALTY' | 'LOAN'>('ADVANCE');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [targetMonth, setTargetMonth] = useState<string>(
    defaultMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );
  const [reason, setReason] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('CASH');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (defaultStaffMemberId) {
      setStaffMemberId(defaultStaffMemberId);
    } else if (staffList.length > 0 && !staffMemberId) {
      setStaffMemberId(staffList[0].id);
    }
  }, [defaultStaffMemberId, staffList, staffMemberId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!reason.trim()) {
      setError('Please enter a reason or description for this entry.');
      return;
    }
    if (!staffMemberId) {
      setError('Please select a staff member.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${shopId}/salary/advances`, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId,
          type,
          amount: numAmount,
          date,
          targetMonth,
          reason: reason.trim(),
          paymentMode,
        }),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record entry.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStaff = staffList.find((s) => s.id === staffMemberId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md border border-border-subtle shadow-clay p-5 sm:p-6 space-y-4">
        {/* Header with Mobile-Friendly Close Button */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0 shadow-sm text-base">
              ₹
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-brand-forest truncate">
                Record Staff Advance
              </h3>
              <p className="text-[10px] sm:text-[11px] text-content-muted truncate">
                Advance, loan deduction or festive bonus
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

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Staff Member Selection */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Select Staff Member *
            </label>
            {staffList.length > 0 && !defaultStaffMemberId ? (
              <select
                value={staffMemberId}
                onChange={(e) => setStaffMemberId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream text-xs font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest"
                required
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} {s.designation ? `(${s.designation})` : ''} {s.mobile ? `- ${s.mobile}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3.5 py-2.5 rounded-xl bg-surface-cream border border-border-subtle font-extrabold text-brand-forest">
                {selectedStaff?.fullName || 'Selected Staff Member'}
                {selectedStaff?.designation && (
                  <span className="text-[11px] font-normal text-content-muted ml-2">
                    ({selectedStaff.designation})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Type Selector Pills */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Entry Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('ADVANCE')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                  type === 'ADVANCE'
                    ? 'bg-red-900 text-white border-red-900 shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                💸 Cash / Salary Advance
              </button>
              <button
                type="button"
                onClick={() => setType('DEDUCTION')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                  type === 'DEDUCTION'
                    ? 'bg-amber-900 text-white border-amber-900 shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                🔻 Salary Deduction
              </button>
              <button
                type="button"
                onClick={() => setType('BONUS')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                  type === 'BONUS'
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                🎁 Festive / Special Bonus
              </button>
              <button
                type="button"
                onClick={() => setType('PENALTY')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                  type === 'PENALTY'
                    ? 'bg-rose-950 text-white border-rose-950 shadow-sm'
                    : 'bg-surface-cream text-content-muted border-border-subtle hover:text-brand-forest'
                }`}
              >
                ⚖️ Penalty / Loss Adjustment
              </button>
            </div>
          </div>

          {/* Amount & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-content-muted">₹</span>
                <input
                  type="number"
                  placeholder="0.00"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-mono font-black text-brand-forest focus:ring-1 focus:ring-brand-forest"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              >
                <option value="CASH">Cash in Hand</option>
                <option value="UPI">UPI Transfer</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
              </select>
            </div>
          </div>

          {/* Date & Target Month */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Date of Transaction *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream font-semibold text-brand-forest"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Apply to Salary Month *
              </label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              />
            </div>
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Reason / Remarks *
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Taken advance for emergency medical expense, to be deducted from this month's salary"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-xs text-brand-forest focus:ring-1 focus:ring-brand-forest resize-none"
            />
          </div>

          {/* Submit Buttons */}
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
              {isSubmitting ? 'Saving...' : 'Save & Deduct'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
