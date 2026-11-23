'use client';

import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { X, ShieldCheck, AlertTriangle, Sliders } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  initialSettings: {
    supervisorCanManageSalary: boolean;
    supervisorCanViewSalary: boolean;
    defaultSalaryCycleDay: number;
    defaultPaymentDate: number;
    companyName: string;
  };
  onSuccess?: () => void;
}

export function SalarySettingsModal({
  isOpen,
  onClose,
  shopId,
  initialSettings,
  onSuccess,
}: Props) {
  const [supervisorCanManageSalary, setSupervisorCanManageSalary] = useState(
    initialSettings.supervisorCanManageSalary
  );
  const [supervisorCanViewSalary, setSupervisorCanViewSalary] = useState(
    initialSettings.supervisorCanViewSalary
  );
  const [defaultSalaryCycleDay, setDefaultSalaryCycleDay] = useState(
    initialSettings.defaultSalaryCycleDay || 1
  );
  const [defaultPaymentDate, setDefaultPaymentDate] = useState(
    initialSettings.defaultPaymentDate || 7
  );
  const [companyName, setCompanyName] = useState(
    initialSettings.companyName || 'Tumbledry Dry Clean & Laundry'
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${shopId}/salary/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          supervisorCanManageSalary,
          supervisorCanViewSalary,
          defaultSalaryCycleDay,
          defaultPaymentDate,
          companyName: companyName.trim(),
        }),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update settings.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md border border-border-subtle shadow-clay p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-900 flex items-center justify-center font-black">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-brand-forest">
                Salary Access &amp; Permissions
              </h3>
              <p className="text-[11px] text-content-muted">
                Control who can view, record advances &amp; process pay
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-content-muted hover:text-brand-forest hover:bg-surface-cream transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Company Brand Name for Print */}
          <div>
            <label className="block text-[11px] font-bold text-brand-forest mb-1">
              Company / Brand Header (Printed on Payslips)
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
            />
          </div>

          {/* Supervisor Permissions */}
          <div className="p-3.5 rounded-2xl bg-surface-cream/80 border border-border-subtle space-y-3">
            <h4 className="text-xs font-black text-brand-forest flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-forest" /> Supervisor Permissions
            </h4>

            {/* Toggle 1: View Salary */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-1">
              <div>
                <span className="font-extrabold text-brand-forest block">
                  Allow Supervisor to View Staff Salaries
                </span>
                <span className="text-[10px] text-content-muted block leading-snug">
                  If disabled, supervisors cannot see staff salary figures or payroll sheets.
                </span>
              </div>
              <input
                type="checkbox"
                checked={supervisorCanViewSalary}
                onChange={(e) => setSupervisorCanViewSalary(e.target.checked)}
                className="mt-1 w-4 h-4 text-brand-forest rounded focus:ring-brand-forest cursor-pointer"
              />
            </label>

            {/* Toggle 2: Manage Salary & Record Advances */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-2 border-t border-border-subtle">
              <div>
                <span className="font-extrabold text-brand-forest block">
                  Allow Supervisor to Record Advances &amp; Settle
                </span>
                <span className="text-[10px] text-content-muted block leading-snug">
                  Enables supervisor to enter salary advances, deductions, and mark salary paid.
                </span>
              </div>
              <input
                type="checkbox"
                checked={supervisorCanManageSalary}
                onChange={(e) => setSupervisorCanManageSalary(e.target.checked)}
                className="mt-1 w-4 h-4 text-brand-forest rounded focus:ring-brand-forest cursor-pointer"
              />
            </label>
          </div>

          {/* Default Cycle Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Default Cycle Start Day
              </label>
              <select
                value={defaultSalaryCycleDay}
                onChange={(e) => setDefaultSalaryCycleDay(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              >
                <option value={1}>1st of each month</option>
                <option value={7}>7th of each month</option>
                <option value={10}>10th of each month</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-forest mb-1">
                Default Payout Date
              </label>
              <select
                value={defaultPaymentDate}
                onChange={(e) => setDefaultPaymentDate(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream font-bold text-brand-forest"
              >
                <option value={5}>5th of Month</option>
                <option value={7}>7th of Month</option>
                <option value={10}>10th of Month</option>
              </select>
            </div>
          </div>

          {/* Actions */}
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
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
