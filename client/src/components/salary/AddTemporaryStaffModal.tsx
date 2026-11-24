'use client';

import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { X, UserPlus, AlertTriangle, CheckCircle2, User, Phone, Calendar, Banknote } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  onSuccess?: () => void;
}

export function AddTemporaryStaffModal({ isOpen, onClose, shopId, onSuccess }: Props) {
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [roleDescription, setRoleDescription] = useState('Temporary Staff');
  const [wageType, setWageType] = useState<'MONTHLY' | 'DAILY'>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Staff full name is required.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid salary or daily wage amount.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${shopId}/salary/temporary-staff`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          mobile: mobile.trim() || undefined,
          roleDescription: roleDescription.trim() || 'Temporary Staff',
          wageType,
          amount: numAmount,
          joiningDate,
          notes: notes.trim() || undefined,
        }),
      });

      setSuccessMsg('Temporary staff added successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add temporary staff.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md border border-border-subtle shadow-clay p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header with Mobile-Friendly Close Button */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-black shrink-0 shadow-sm">
              <UserPlus className="w-5 h-5 text-amber-800" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-brand-forest truncate">
                Add Temporary Staff
              </h3>
              <p className="text-[10px] sm:text-[11px] text-content-muted truncate">
                For salary, daily wage &amp; expense tracking (no app login)
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

        {successMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Full Name */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Staff Full Name *
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-3 text-content-muted" />
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
              />
            </div>
          </div>

          {/* Mobile & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Mobile Number (Optional)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-content-muted" />
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Role / Purpose
              </label>
              <input
                type="text"
                placeholder="e.g. Ironing Helper, Delivery"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
              />
            </div>
          </div>

          {/* Wage Type Selection (Monthly Salary vs Daily Wage) */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1.5">
              Payment / Wage Structure *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWageType('MONTHLY')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  wageType === 'MONTHLY'
                    ? 'bg-brand-forest text-white border-brand-forest shadow-clay-sm'
                    : 'bg-surface-cream text-content-default border-border-subtle hover:bg-emerald-50'
                }`}
              >
                <span>📅 Fixed Monthly Salary</span>
              </button>

              <button
                type="button"
                onClick={() => setWageType('DAILY')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  wageType === 'DAILY'
                    ? 'bg-brand-forest text-white border-brand-forest shadow-clay-sm'
                    : 'bg-surface-cream text-content-default border-border-subtle hover:bg-emerald-50'
                }`}
              >
                <span>⚡ Daily Wage Rate</span>
              </button>
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                {wageType === 'MONTHLY' ? 'Monthly Salary (₹) *' : 'Daily Rate (₹ / Day) *'}
              </label>
              <div className="relative">
                <Banknote className="w-3.5 h-3.5 absolute left-3 top-3 text-content-muted" />
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={wageType === 'MONTHLY' ? 'e.g. 15000' : 'e.g. 500'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-mono font-bold text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Start / Joining Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-3 text-content-muted" />
                <input
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Payment / Bank Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Cash in hand daily, or UPI 9876543210@upi"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-cream border border-border-subtle font-medium text-brand-forest focus:ring-1 focus:ring-brand-forest text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-content-default hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-brand-forest text-white text-xs font-black shadow-clay flex items-center gap-1.5 hover:bg-emerald-900 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Adding Staff...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 text-brand-lime" />
                  <span>Add Temporary Staff</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
