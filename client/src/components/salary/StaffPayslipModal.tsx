'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import {
  X,
  Printer,
  CheckCircle2,
  Calendar,
  Phone,
  AlertCircle,
  CreditCard,
  Clock,
} from 'lucide-react';

export interface PayslipData {
  shop: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    contactInfo: string | null;
    logoPath: string | null;
    brandName: string;
  };
  payslip: {
    month: string;
    monthFormatted: string;
    periodStart: string;
    periodEnd: string;
    isMidMonthJoined: boolean;
    eligibleDays: number;
    totalDaysInMonth: number;
  };
  staff: {
    id: string;
    fullName: string;
    mobile: string | null;
    address: string | null;
    profilePhotoPath: string | null;
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
  };
  attendance: {
    presentDays: number;
    halfDays: number;
    absentDays: number;
    paidDays: number;
    totalSessionsRecorded: number;
  };
  earnings: {
    baseMonthlySalary: number;
    dailyRate: number;
    earnedSalary: number;
    fixedIncentive: number;
    bonusAmount: number;
    grossEarnings: number;
  };
  deductions: {
    advanceDeducted: number;
    otherDeductions: number;
    totalDeductions: number;
    itemizedAdvances: Array<{
      id: string;
      type: string;
      amount: number;
      date: string;
      reason: string;
      paymentMode: string;
    }>;
  };
  netPayable: number;
  netPayableWords: string;
  paymentStatus: 'PAID' | 'PROCESSED' | 'PENDING' | 'DRAFT';
  paymentDetails: {
    paidDate: string | null;
    paymentMode: string | null;
    transactionRef: string | null;
    remarks: string | null;
  } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  staffMemberId: string;
  month: string; // "YYYY-MM"
  canManage?: boolean;
  onSalaryUpdated?: () => void;
}

export function StaffPayslipModal({
  isOpen,
  onClose,
  shopId,
  staffMemberId,
  month,
  canManage = true,
  onSalaryUpdated,
}: Props) {
  const [data, setData] = useState<PayslipData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settlement Form State
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentMode, setPaymentMode] = useState<string>('BANK_TRANSFER');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPayslip = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ data: PayslipData }>(
        `/api/shops/${shopId}/salary/staff/${staffMemberId}/slip?month=${month}`
      );
      setData(res.data);
      if (res.data.paymentDetails?.paymentMode) {
        setPaymentMode(res.data.paymentDetails.paymentMode);
      }
      if (res.data.paymentDetails?.transactionRef) {
        setTransactionRef(res.data.paymentDetails.transactionRef);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load payslip.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, staffMemberId, month]);

  useEffect(() => {
    if (isOpen) {
      fetchPayslip();
      setIsMarkingPaid(false);
      setActionSuccess(null);
    }
  }, [isOpen, fetchPayslip]);

  const handleProcessPayment = async (status: 'PAID' | 'PROCESSED') => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/shops/${shopId}/salary/staff/${staffMemberId}/process?month=${month}`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          paymentMode,
          transactionRef: transactionRef.trim() || undefined,
          remarks: remarks.trim() || undefined,
          paidDate: new Date().toISOString(),
        }),
      });
      setActionSuccess(`Salary successfully marked as ${status}!`);
      setIsMarkingPaid(false);
      await fetchPayslip();
      if (onSalaryUpdated) onSalaryUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process payment.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white animate-fade-in">
      {/* ── PRINT-ONLY STYLES ────────────────────────────────────── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-payslip, #printable-payslip * {
            visibility: visible !important;
          }
          #printable-payslip {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: 1px solid #CBD5E1 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        id="printable-payslip"
        className="bg-white rounded-3xl w-full max-w-2xl border border-border-subtle shadow-2xl overflow-hidden print:border-none print:shadow-none my-6"
      >
        {/* Modal Top Actions (Hidden on Print) */}
        <div className="no-print flex items-center justify-between px-5 py-3.5 bg-surface-cream border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-brand-forest" />
            <span className="text-xs font-black text-brand-forest uppercase tracking-wider">
              Staff Monthly Payslip
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || !data}
              className="px-3 py-1.5 rounded-xl bg-brand-forest text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-900 shadow-sm transition-all"
              title="Print Salary Slip"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center hover:bg-surface-hover hover:scale-105 active:scale-95 transition-all shadow-xs shrink-0"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
            <p className="text-xs font-bold text-content-muted">Generating Payslip Details...</p>
          </div>
        )}

        {error && (
          <div className="p-5 bg-red-50 text-red-700 text-xs font-bold flex items-center gap-2 border-b border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="no-print p-3 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2 border-b border-emerald-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* ── PAYSLIP CONTENT (PRINTABLE BODY) ────────────────── */}
        {!isLoading && data && (
          <div className="p-6 sm:p-8 space-y-6 text-[#1E293B]">
            {/* Header: Store Branding */}
            <div className="border-b border-border-subtle pb-5">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-brand-forest uppercase tracking-tight">
                    {data.shop.brandName}
                  </h1>
                  <p className="text-xs font-extrabold text-brand-lime bg-brand-forest inline-block px-2 py-0.5 rounded-md mt-1">
                    Store: {data.shop.name} ({data.shop.code})
                  </p>
                  {data.shop.address && (
                    <p className="text-[11px] text-content-muted font-medium mt-1 leading-snug max-w-sm">
                      {data.shop.address}
                    </p>
                  )}
                  {data.shop.contactInfo && (
                    <p className="text-[11px] text-content-muted font-medium flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 inline" /> {data.shop.contactInfo}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-surface-cream text-brand-forest border border-border-subtle block">
                    SALARY SLIP
                  </span>
                  <p className="text-sm font-black text-brand-forest mt-1.5">
                    {data.payslip.monthFormatted}
                  </p>
                  <p className="text-[10px] text-content-muted font-semibold">
                    Cycle: {new Date(data.payslip.periodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} -{' '}
                    {new Date(data.payslip.periodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        data.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {data.paymentStatus === 'PAID' ? '● PAID' : '○ PENDING PAYMENT'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-surface-cream/70 border border-border-subtle text-xs">
              <div>
                <span className="text-[10px] text-content-muted font-bold block uppercase">Employee Name</span>
                <span className="font-extrabold text-brand-forest text-sm truncate block mt-0.5">
                  {data.staff.fullName}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-content-muted font-bold block uppercase">Designation</span>
                <span className="font-bold text-[#1E293B] block mt-0.5">
                  {data.staff.designation}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-content-muted font-bold block uppercase">Contact No.</span>
                <span className="font-mono font-semibold text-[#1E293B] block mt-0.5">
                  {data.staff.mobile || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-content-muted font-bold block uppercase">Date of Joining</span>
                <span className="font-bold text-[#1E293B] block mt-0.5">
                  {data.membership.joiningDate
                    ? new Date(data.membership.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>

            {/* Mid-Month Joining Pro-Rata Banner if applicable */}
            {data.payslip.isMidMonthJoined && (
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-900">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block">Mid-Month Joining Adjustment:</span>
                  <p className="text-[11px] text-blue-800 leading-snug">
                    Staff joined on{' '}
                    <strong>
                      {data.membership.joiningDate
                        ? new Date(data.membership.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : ''}
                    </strong>
                    . Month salary is calculated for <strong>{data.payslip.eligibleDays} eligible days</strong> (out of {data.payslip.totalDaysInMonth} total month days).
                  </p>
                </div>
              </div>
            )}

            {/* Attendance Breakdown Grid */}
            <div>
              <h3 className="text-xs font-black text-brand-forest uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-forest" /> Attendance Summary
              </h3>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-surface-cream border border-border-subtle">
                  <span className="text-[10px] text-content-muted font-bold block">Total Days</span>
                  <span className="text-sm font-extrabold text-brand-forest mt-0.5 block font-mono">
                    {data.payslip.eligibleDays}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 font-bold block">Full Days Present</span>
                  <span className="text-sm font-extrabold text-emerald-950 mt-0.5 block font-mono">
                    {data.attendance.presentDays}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] text-amber-800 font-bold block">Half Days</span>
                  <span className="text-sm font-extrabold text-amber-950 mt-0.5 block font-mono">
                    {data.attendance.halfDays}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-cream border border-border-subtle">
                  <span className="text-[10px] text-content-muted font-bold block">Total Paid Days</span>
                  <span className="text-sm font-black text-brand-forest mt-0.5 block font-mono">
                    {data.attendance.paidDays}
                  </span>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions Tables */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left Column: Earnings */}
              <div className="rounded-2xl border border-border-subtle overflow-hidden">
                <div className="bg-brand-forest px-3.5 py-2 text-white flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider">Earnings</span>
                  <span className="text-xs font-black">Amount (₹)</span>
                </div>
                <div className="divide-y divide-border-subtle text-xs bg-white">
                  <div className="p-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#1E293B]">Monthly Base Salary</span>
                      <span className="block text-[10px] text-content-muted font-mono">
                        ₹ {data.earnings.dailyRate} / day rate
                      </span>
                    </div>
                    <span className="font-mono font-bold text-[#1E293B]">
                      ₹ {data.earnings.baseMonthlySalary.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between bg-surface-cream/30">
                    <div>
                      <span className="font-extrabold text-brand-forest">Earned Salary</span>
                      <span className="block text-[10px] text-content-muted font-mono">
                        ({data.attendance.paidDays} paid days × ₹{data.earnings.dailyRate})
                      </span>
                    </div>
                    <span className="font-mono font-extrabold text-brand-forest">
                      ₹ {data.earnings.earnedSalary.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {data.earnings.fixedIncentive > 0 && (
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="font-bold text-[#1E293B]">Monthly Incentive</span>
                      <span className="font-mono font-bold text-emerald-800">
                        + ₹ {data.earnings.fixedIncentive.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                  {data.earnings.bonusAmount > 0 && (
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="font-bold text-[#1E293B]">Bonus / Overtime</span>
                      <span className="font-mono font-bold text-emerald-800">
                        + ₹ {data.earnings.bonusAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                  <div className="p-2.5 flex items-center justify-between bg-surface-cream font-black">
                    <span className="text-brand-forest">Gross Earnings (A)</span>
                    <span className="font-mono text-brand-forest">
                      ₹ {data.earnings.grossEarnings.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Deductions */}
              <div className="rounded-2xl border border-border-subtle overflow-hidden">
                <div className="bg-red-900 px-3.5 py-2 text-white flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider">Deductions</span>
                  <span className="text-xs font-black">Amount (₹)</span>
                </div>
                <div className="divide-y divide-border-subtle text-xs bg-white">
                  <div className="p-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#1E293B]">Staff Advances Taken</span>
                      {data.deductions.itemizedAdvances.length > 0 && (
                        <span className="block text-[10px] text-red-600 font-semibold">
                          ({data.deductions.itemizedAdvances.length} transactions)
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-red-700">
                      - ₹ {data.deductions.advanceDeducted.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {data.deductions.otherDeductions > 0 && (
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="font-bold text-[#1E293B]">Other Deductions / Penalties</span>
                      <span className="font-mono font-bold text-red-700">
                        - ₹ {data.deductions.otherDeductions.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  {/* Itemized Advances List if any */}
                  {data.deductions.itemizedAdvances.length > 0 && (
                    <div className="p-2 bg-red-50/50 space-y-1">
                      {data.deductions.itemizedAdvances.map((adv) => (
                        <div key={adv.id} className="flex items-center justify-between text-[10px] text-red-900">
                          <span className="truncate max-w-[150px]">
                            • {new Date(adv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}: {adv.reason}
                          </span>
                          <span className="font-mono font-bold">₹ {adv.amount.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-2.5 flex items-center justify-between bg-surface-cream font-black">
                    <span className="text-red-950">Total Deductions (B)</span>
                    <span className="font-mono text-red-800">
                      ₹ {data.deductions.totalDeductions.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Payable Highlight Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-forest to-[#2d683d] text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-brand-lime block">
                  Net Salary Payable (A - B)
                </span>
                <p className="text-xs font-medium text-white/90 mt-0.5 capitalize">
                  {data.netPayableWords}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
                  ₹ {data.netPayable.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Payment Details / Transaction Reference if Paid */}
            {data.paymentDetails?.paidDate && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between">
                <div>
                  <span className="font-black block">Disbursement Trace:</span>
                  <span className="text-[11px] text-emerald-800">
                    Paid on {new Date(data.paymentDetails.paidDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} via {data.paymentDetails.paymentMode || 'Bank Transfer'}
                  </span>
                </div>
                {data.paymentDetails.transactionRef && (
                  <div className="text-right">
                    <span className="text-[10px] text-content-muted block uppercase">Ref / UTR</span>
                    <span className="font-mono font-bold text-emerald-900">{data.paymentDetails.transactionRef}</span>
                  </div>
                )}
              </div>
            )}

            {/* Signatures Area (Clean for Print) */}
            <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                <div className="border-t border-[#1E293B] pt-2 w-48 mx-auto" />
                <span className="font-bold text-content-muted text-[11px] block">
                  Staff Signature
                </span>
                <span className="text-[10px] text-content-muted">({data.staff.fullName})</span>
              </div>
              <div>
                <div className="border-t border-[#1E293B] pt-2 w-48 mx-auto" />
                <span className="font-black text-brand-forest text-[11px] block">
                  Authorized Signatory / Store Stamp
                </span>
                <span className="text-[10px] text-content-muted">({data.shop.name})</span>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTLEMENT ACTIONS (NO PRINT) ───────────────────── */}
        {!isLoading && data && canManage && (
          <div className="no-print bg-surface-cream/80 border-t border-border-subtle p-4 sm:p-5 space-y-3">
            {!isMarkingPaid ? (
              <div className="flex items-center justify-between">
                <div className="text-xs text-content-muted font-medium">
                  Status: <strong>{data.paymentStatus}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMarkingPaid(true)}
                    className="px-4 py-2 rounded-xl bg-brand-forest text-white text-xs font-black hover:bg-emerald-900 transition-colors shadow-sm"
                  >
                    {data.paymentStatus === 'PAID' ? 'Update Payment Record' : 'Mark as Paid / Settle'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-white border border-border-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-brand-forest">
                    Record Payment Settlement for {data.payslip.monthFormatted}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsMarkingPaid(false)}
                    className="text-content-muted hover:text-brand-forest text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-xs font-bold text-brand-forest"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                      <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                      <option value="CASH">Cash in Hand</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-brand-forest mb-1">
                      UTR / Transaction No. / Cheque No.
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UPI Ref / NEFT UTR"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-brand-forest mb-1">
                    Remarks / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid directly by store manager / Owner"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleProcessPayment('PROCESSED')}
                    className="px-3 py-2 rounded-xl border border-border-subtle bg-surface-cream text-brand-forest text-xs font-bold hover:bg-surface-hover"
                  >
                    Save as Processed
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleProcessPayment('PAID')}
                    className="px-4 py-2 rounded-xl bg-brand-forest text-white text-xs font-black shadow-sm hover:opacity-95 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Confirm Paid (Disbursed)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
