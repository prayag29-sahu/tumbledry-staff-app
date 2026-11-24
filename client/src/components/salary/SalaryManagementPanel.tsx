'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../../lib/api';
import {
  CreditCard,
  Calendar,
  Search,
  Plus,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sliders,
  AlertTriangle,
  Trash2,
  Wallet,
  CalendarCheck,
  UserPlus,
} from 'lucide-react';
import { StaffPayslipModal } from './StaffPayslipModal';
import { RecordAdvanceModal } from './RecordAdvanceModal';
import { EditSalaryTermsModal } from './EditSalaryTermsModal';
import { SalarySettingsModal } from './SalarySettingsModal';
import { StoreHolidayCalendarModal } from './StoreHolidayCalendarModal';
import { AddTemporaryStaffModal } from './AddTemporaryStaffModal';

interface SalarySummaryResponse {
  shopId: string;
  month: string;
  settings: {
    supervisorCanManageSalary: boolean;
    supervisorCanViewSalary: boolean;
    defaultSalaryCycleDay: number;
    defaultPaymentDate: number;
    companyName: string;
  };
  metrics: {
    totalStaff: number;
    totalPayrollBudget: number;
    totalEarnedSalary: number;
    totalAdvances: number;
    totalDeductions: number;
    totalNetPayable: number;
    totalPaidAmount: number;
    paidCount: number;
    pendingCount: number;
  };
  staffList: Array<{
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
    savedPayment: {
      id: string;
      status: 'PAID' | 'PROCESSED' | 'DRAFT';
      netPayable: number;
      paidDate: string | null;
      paymentMode: string | null;
      transactionRef: string | null;
      remarks: string | null;
      generatedAt: string;
      generatedBy?: string;
    } | null;
  }>;
}

interface AdvanceTransaction {
  id: string;
  staffMemberId: string;
  staffName: string;
  mobile: string | null;
  type: string;
  amount: number;
  date: string;
  targetMonth: string | null;
  reason: string;
  paymentMode: string;
  status: string;
  recordedBy: string;
  createdAt: string;
}

interface Props {
  shopId: string;
  shopName?: string;
  isOwner?: boolean;
}

export function SalaryManagementPanel({ shopId, shopName, isOwner = false }: Props) {
  // Current Month State ("YYYY-MM")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [activeTab, setActiveTab] = useState<'payroll' | 'advances_ledger'>('payroll');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<SalarySummaryResponse | null>(null);

  // Advances Ledger state
  const [advancesList, setAdvancesList] = useState<AdvanceTransaction[]>([]);
  const [isAdvancesLoading, setIsAdvancesLoading] = useState(false);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('ALL');

  // Modals state
  const [payslipModalStaffId, setPayslipModalStaffId] = useState<string | null>(null);
  const [advanceModalStaffId, setAdvanceModalStaffId] = useState<string | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isAddTemporaryOpen, setIsAddTemporaryOpen] = useState(false);
  const [staffTypeFilter, setStaffTypeFilter] = useState<'ALL' | 'PERMANENT' | 'TEMPORARY'>('ALL');
  const [editTermsStaff, setEditTermsStaff] = useState<{
    id: string;
    name: string;
    membership: {
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
  } | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    setError(null);
    try {
      const q = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await apiRequest<{ data: SalarySummaryResponse }>(
        `/api/shops/${shopId}/salary/summary?month=${selectedMonth}${q}`
      );
      setSummaryData(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load salary records.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, selectedMonth, searchQuery]);

  // Fetch advances ledger
  const fetchAdvances = useCallback(async () => {
    if (!shopId) return;
    setIsAdvancesLoading(true);
    try {
      const typeParam = ledgerTypeFilter !== 'ALL' ? `&type=${ledgerTypeFilter}` : '';
      const res = await apiRequest<{ data: AdvanceTransaction[] }>(
        `/api/shops/${shopId}/salary/advances?targetMonth=${selectedMonth}${typeParam}`
      );
      setAdvancesList(res.data || []);
    } catch {
      setAdvancesList([]);
    } finally {
      setIsAdvancesLoading(false);
    }
  }, [shopId, selectedMonth, ledgerTypeFilter]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'advances_ledger') {
      fetchAdvances();
    }
  }, [activeTab, fetchAdvances]);

  // Quick Month Navigation
  const handleShiftMonth = (offset: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(nextMonth);
  };

  const monthFormatted = useMemo(() => {
    try {
      return new Date(selectedMonth + '-01').toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  const canManage = isOwner || (summaryData?.settings?.supervisorCanManageSalary ?? true);

  const staffOptions = useMemo(() => {
    if (!summaryData?.staffList) return [];
    return summaryData.staffList.map((s) => ({
      id: s.staffMember.id,
      fullName: s.staffMember.fullName,
      mobile: s.staffMember.mobile,
      designation: s.staffMember.designation,
    }));
  }, [summaryData]);

  const staffCounts = useMemo(() => {
    if (!summaryData?.staffList) return { total: 0, permanent: 0, temporary: 0 };
    const total = summaryData.staffList.length;
    const temporary = summaryData.staffList.filter((s) => s.membership.isTemporary).length;
    const permanent = total - temporary;
    return { total, permanent, temporary };
  }, [summaryData]);

  const filteredStaffList = useMemo(() => {
    if (!summaryData?.staffList) return [];
    return summaryData.staffList.filter((s) => {
      if (staffTypeFilter === 'PERMANENT') return !s.membership.isTemporary;
      if (staffTypeFilter === 'TEMPORARY') return !!s.membership.isTemporary;
      return true;
    });
  }, [summaryData, staffTypeFilter]);

  const handleDeleteAdvance = async (id: string) => {
    if (!confirm('Are you sure you want to remove this advance/deduction entry?')) return;
    try {
      await apiRequest(`/api/shops/${shopId}/salary/advances/${id}`, { method: 'DELETE' });
      fetchAdvances();
      fetchSummary();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete advance.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* ── Top Control & Month Filter Bar ─────────────────────── */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-border-subtle shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-brand-forest text-brand-lime font-black flex items-center justify-center text-base shadow-sm">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-brand-forest">
                  Staff Salary &amp; Advances {shopName ? `• ${shopName}` : ''}
                </h2>
                <p className="text-xs text-content-muted">
                  Attendance-linked pay, mid-month joining pro-rata &amp; printed slips
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {canManage && (
              <button
                type="button"
                onClick={() => setIsAddTemporaryOpen(true)}
                className="px-3 py-2 rounded-xl bg-purple-50 text-purple-900 hover:bg-purple-100 text-xs font-bold border border-purple-200 flex items-center gap-1.5 transition-all shadow-sm"
                title="Add Temporary Staff (Daily Wage / Expense tracking)"
              >
                <UserPlus className="w-4 h-4 text-purple-700" />
                <span className="hidden sm:inline">+ Temporary Staff</span>
                <span className="sm:hidden">+ Temp</span>
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-surface-cream text-brand-forest hover:bg-emerald-50 text-xs font-bold border border-border-subtle flex items-center gap-1.5 transition-all shadow-sm"
                title="Manage Store Calendar & Weekly Offs"
              >
                <CalendarCheck className="w-4 h-4 text-brand-forest" />
                <span className="hidden sm:inline">Store Calendar</span>
                <span className="sm:hidden">Calendar</span>
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setAdvanceModalStaffId(null);
                  setIsAdvanceModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-800 to-red-950 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Record Advance / Deduct</span>
              </button>
            )}

            {isOwner && summaryData?.settings && (
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="p-2 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle hover:bg-surface-hover transition-colors"
                title="Salary Settings &amp; Permissions"
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                fetchSummary();
                if (activeTab === 'advances_ledger') fetchAdvances();
              }}
              disabled={isLoading}
              className="p-2 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle hover:bg-surface-hover active:scale-95 transition-all"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Month Selector & Search Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border-subtle">
          {/* Month Stepper */}
          <div className="flex items-center gap-2 bg-surface-cream p-1 rounded-2xl border border-border-subtle w-full sm:w-auto justify-between">
            <button
              type="button"
              onClick={() => handleShiftMonth(-1)}
              className="p-1.5 rounded-xl text-brand-forest hover:bg-white transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-3.5 h-3.5 text-brand-forest" />
              <span className="text-xs font-black text-brand-forest min-w-[130px] text-center">
                {monthFormatted}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleShiftMonth(1)}
              className="p-1.5 rounded-xl text-brand-forest hover:bg-white transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-content-muted" />
            <input
              type="text"
              placeholder="Search staff by name or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest focus:ring-1 focus:ring-brand-forest"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Summary Cards ──────────────────────────────────── */}
      {summaryData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
          {/* Total Budget */}
          <div className="p-3.5 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
            <span className="text-[10px] text-content-muted font-bold block uppercase">
              Total Base Budget
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-brand-forest">
                ₹ {summaryData.metrics.totalPayrollBudget.toLocaleString('en-IN')}
              </span>
            </div>
            <span className="text-[10px] text-content-muted font-medium block">
              {summaryData.metrics.totalStaff} Total Staff members
            </span>
          </div>

          {/* Earned Salary */}
          <div className="p-3.5 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
            <span className="text-[10px] text-content-muted font-bold block uppercase">
              Attendance Earned
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-emerald-800">
                ₹ {summaryData.metrics.totalEarnedSalary.toLocaleString('en-IN')}
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 font-semibold block">
              Pro-rata &amp; days present
            </span>
          </div>

          {/* Advances Deducted */}
          <div className="p-3.5 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
            <span className="text-[10px] text-content-muted font-bold block uppercase">
              Total Advances Taken
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-red-700">
                ₹ {summaryData.metrics.totalAdvances.toLocaleString('en-IN')}
              </span>
            </div>
            <span className="text-[10px] text-red-600 font-semibold block">
              Directly deducted from net
            </span>
          </div>

          {/* Net Payable */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-brand-forest to-[#2f663e] text-white shadow-sm space-y-1">
            <span className="text-[10px] text-brand-lime font-black block uppercase tracking-wider">
              Net Payable (Disbursement)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-white">
                ₹ {summaryData.metrics.totalNetPayable.toLocaleString('en-IN')}
              </span>
            </div>
            <span className="text-[10px] text-white/80 font-medium block">
              {summaryData.metrics.paidCount} Paid • {summaryData.metrics.pendingCount} Pending
            </span>
          </div>
        </div>
      )}

      {/* ── Segmented Navigation Tabs ──────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-2xl border border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('payroll')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${activeTab === 'payroll'
            ? 'bg-brand-forest text-white shadow-sm'
            : 'text-content-muted hover:text-brand-forest'
            }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Staff Payroll ({summaryData?.staffList.length || 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('advances_ledger')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${activeTab === 'advances_ledger'
            ? 'bg-brand-forest text-white shadow-sm'
            : 'text-content-muted hover:text-brand-forest'
            }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Advances &amp; Deductions Ledger</span>
        </button>
      </div>

      {/* ── TAB 1: STAFF PAYROLL LIST ──────────────────────────── */}
      {activeTab === 'payroll' && (
        <div className="space-y-3">
          {/* Sub-filter: All / Permanent / Temporary */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold pb-1">
            <button
              type="button"
              onClick={() => setStaffTypeFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                staffTypeFilter === 'ALL'
                  ? 'bg-brand-forest text-white font-black shadow-xs'
                  : 'bg-white text-content-muted border border-border-subtle hover:text-brand-forest'
              }`}
            >
              All Staff ({staffCounts.total})
            </button>
            <button
              type="button"
              onClick={() => setStaffTypeFilter('PERMANENT')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                staffTypeFilter === 'PERMANENT'
                  ? 'bg-brand-forest text-white font-black shadow-xs'
                  : 'bg-white text-content-muted border border-border-subtle hover:text-brand-forest'
              }`}
            >
              Permanent ({staffCounts.permanent})
            </button>
            <button
              type="button"
              onClick={() => setStaffTypeFilter('TEMPORARY')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                staffTypeFilter === 'TEMPORARY'
                  ? 'bg-purple-900 text-white font-black shadow-xs'
                  : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
              }`}
            >
              Temporary / Daily ({staffCounts.temporary})
            </button>
          </div>

          {isLoading && !summaryData && (
            <div className="p-12 bg-white rounded-3xl border border-border-subtle flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
              <p className="text-xs font-bold text-content-muted">Calculating monthly payroll...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {filteredStaffList.map((item) => {
            const isPaid = item.savedPayment?.status === 'PAID';
            return (
              <div
                key={item.staffMember.id}
                className="p-4 sm:p-5 rounded-3xl bg-white border border-border-subtle shadow-sm hover:border-brand-forest/40 transition-all space-y-3.5"
              >
                {/* Staff Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center font-black text-white text-base shrink-0 shadow-sm">
                      {item.staffMember.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-brand-forest">
                          {item.staffMember.fullName}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-cream text-content-muted border border-border-subtle">
                          {item.staffMember.designation}
                        </span>
                        {item.membership.isTemporary && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-200">
                            ⚡ Temp {item.membership.wageType === 'DAILY' ? '• Daily Wage' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-content-muted font-medium mt-0.5">
                        {item.staffMember.mobile && <span>{item.staffMember.mobile}</span>}
                        {item.membership.joiningDate && (
                          <span>
                            Joined: {new Date(item.membership.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {item.cycleBounds.isMidMonthJoined && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        Joined Mid-Month ({item.cycleBounds.eligibleDays} days)
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isPaid
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                    >
                      {isPaid ? '● PAID' : '○ PENDING'}
                    </span>
                  </div>
                </div>

                {/* Calculation Numbers Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-2xl bg-surface-cream border border-border-subtle">
                    <span className="text-[10px] text-content-muted font-bold block uppercase">
                      {item.membership.wageType === 'DAILY' ? 'Daily Wage Rate' : 'Base Salary'}
                    </span>
                    <span className="font-mono font-bold text-brand-forest mt-0.5 block">
                      ₹ {item.membership.wageType === 'DAILY' && item.membership.dailyWageRate != null
                        ? item.membership.dailyWageRate.toLocaleString('en-IN')
                        : item.calculation.baseMonthlySalary.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[9px] text-content-muted block">
                      {item.membership.wageType === 'DAILY'
                        ? 'Per day worked'
                        : `₹ ${item.calculation.perDayRate}/day`}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-surface-cream border border-border-subtle">
                    <span className="text-[10px] text-content-muted font-bold block uppercase">
                      Attendance Days
                    </span>
                    <span className="font-mono font-bold text-[#1E293B] mt-0.5 block">
                      {item.attendance.presentDays} / {item.attendance.scheduledWorkingDays ?? (item.cycleBounds.eligibleDays - (item.attendance.weeklyOffDays || 0))} Working Days
                    </span>
                    <div className="flex items-center gap-1 text-[9px] font-bold mt-0.5 flex-wrap">
                      <span className="text-emerald-700">{item.attendance.presentDays} Pres</span>
                      <span className="text-content-muted">•</span>
                      <span className={item.attendance.absentDays > 0 ? "text-red-600 font-black" : "text-content-muted"}>
                        {item.attendance.absentDays} Abs
                      </span>
                      <span className="text-content-muted">•</span>
                      <span className="text-blue-700">{item.attendance.weeklyOffDays || 0} Offs</span>
                      {item.attendance.halfDays > 0 && (
                        <>
                          <span className="text-content-muted">•</span>
                          <span className="text-amber-700">{item.attendance.halfDays} Half</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">
                      Earned Salary
                    </span>
                    <span className="font-mono font-black text-emerald-950 mt-0.5 block">
                      ₹ {item.calculation.earnedSalary.toLocaleString('en-IN')}
                    </span>
                    {item.calculation.fixedIncentive > 0 && (
                      <span className="text-[9px] text-emerald-700 block">
                        +₹{item.calculation.fixedIncentive} inc.
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-2xl bg-red-50 border border-red-200">
                    <span className="text-[10px] text-red-800 font-bold block uppercase">
                      Advances Deducted
                    </span>
                    <span className="font-mono font-black text-red-900 mt-0.5 block">
                      - ₹ {item.calculation.advanceDeducted.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[9px] text-red-700 block">
                      {item.advancesList.length} advance transactions
                    </span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-brand-forest text-white col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-brand-lime font-black block uppercase tracking-wider">
                      Net Payable
                    </span>
                    <span className="font-mono font-black text-sm text-white mt-0.5 block">
                      ₹ {item.calculation.netPayable.toLocaleString('en-IN')}
                    </span>
                    {isPaid && item.savedPayment?.paidDate && (
                      <span className="text-[9px] text-white/80 block">
                        Paid on {new Date(item.savedPayment.paidDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="text-[11px] text-content-muted">
                    {item.membership.salaryNotes && (
                      <span className="truncate max-w-xs block font-mono text-[10px]">
                        Bank: {item.membership.salaryNotes}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View / Print Payslip */}
                    <button
                      type="button"
                      onClick={() => setPayslipModalStaffId(item.staffMember.id)}
                      className="px-3 py-1.5 rounded-xl bg-surface-cream text-brand-forest text-xs font-bold border border-border-subtle hover:bg-surface-hover flex items-center gap-1.5 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>View &amp; Print Slip</span>
                    </button>

                    {/* Record Advance for this staff */}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdvanceModalStaffId(item.staffMember.id);
                          setIsAdvanceModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-50 text-red-800 text-xs font-bold border border-red-200 hover:bg-red-100 flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Advance</span>
                      </button>
                    )}

                    {/* Configure Terms */}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditTermsStaff({
                            id: item.staffMember.id,
                            name: item.staffMember.fullName,
                            membership: item.membership,
                          })
                        }
                        className="p-1.5 rounded-xl bg-surface-cream text-content-muted hover:text-brand-forest border border-border-subtle"
                        title="Edit Salary &amp; Terms"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredStaffList.length === 0 && (
            <div className="p-8 text-center bg-white rounded-3xl border border-border-subtle text-xs text-content-muted font-bold space-y-2">
              <p>No {staffTypeFilter !== 'ALL' ? staffTypeFilter.toLowerCase() : ''} staff members found matching your search.</p>
              {staffTypeFilter === 'TEMPORARY' && canManage && (
                <button
                  type="button"
                  onClick={() => setIsAddTemporaryOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4 text-purple-700" />
                  <span>Create First Temporary Staff</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ADVANCES & DEDUCTIONS LEDGER ─────────────────── */}
      {activeTab === 'advances_ledger' && (
        <div className="bg-white rounded-3xl border border-border-subtle p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
            <div>
              <h3 className="text-sm font-black text-brand-forest">
                Advances &amp; Deductions Ledger for {monthFormatted}
              </h3>
              <p className="text-[11px] text-content-muted">
                Audit trail of cash advances, loans, and salary adjustments
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
              {['ALL', 'ADVANCE', 'DEDUCTION', 'BONUS', 'PENALTY'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLedgerTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] transition-all ${ledgerTypeFilter === t
                    ? 'bg-brand-forest text-white font-black'
                    : 'bg-surface-cream text-content-muted hover:text-brand-forest'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {isAdvancesLoading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-brand-forest border-t-transparent animate-spin" />
            </div>
          ) : advancesList.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {advancesList.map((adv) => (
                <div key={adv.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-brand-forest">{adv.staffName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${adv.type === 'ADVANCE'
                          ? 'bg-red-100 text-red-800'
                          : adv.type === 'BONUS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                          }`}
                      >
                        {adv.type}
                      </span>
                      <span className="text-[10px] text-content-muted">
                        via {adv.paymentMode}
                      </span>
                    </div>
                    <p className="text-xs text-[#1E293B] font-medium mt-1 leading-snug">
                      {adv.reason}
                    </p>
                    <p className="text-[10px] text-content-muted font-medium mt-0.5">
                      Date: {new Date(adv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • Recorded by {adv.recordedBy}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-sm text-red-700">
                      ₹ {adv.amount.toLocaleString('en-IN')}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdvance(adv.id)}
                        className="p-1.5 rounded-xl text-content-muted hover:text-red-700 hover:bg-red-50 transition-colors"
                        title="Delete Entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-content-muted font-bold">
              No advance or deduction entries logged for this month.
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────── */}
      {/* 1. Printable Payslip Modal */}
      {payslipModalStaffId && (
        <StaffPayslipModal
          isOpen={true}
          onClose={() => setPayslipModalStaffId(null)}
          shopId={shopId}
          staffMemberId={payslipModalStaffId}
          month={selectedMonth}
          canManage={canManage}
          onSalaryUpdated={fetchSummary}
        />
      )}

      {/* 2. Record Advance / Deduction Modal */}
      {isAdvanceModalOpen && (
        <RecordAdvanceModal
          isOpen={true}
          onClose={() => setIsAdvanceModalOpen(false)}
          shopId={shopId}
          defaultStaffMemberId={advanceModalStaffId || undefined}
          staffList={staffOptions}
          defaultMonth={selectedMonth}
          onSuccess={() => {
            fetchSummary();
            if (activeTab === 'advances_ledger') fetchAdvances();
          }}
        />
      )}

      {/* 3. Edit Terms Modal */}
      {editTermsStaff && (
        <EditSalaryTermsModal
          isOpen={true}
          onClose={() => setEditTermsStaff(null)}
          shopId={shopId}
          staffMemberId={editTermsStaff.id}
          staffName={editTermsStaff.name}
          initialTerms={editTermsStaff.membership}
          onSuccess={fetchSummary}
        />
      )}

      {/* 4. Salary Access & Settings Modal (Owner Only) */}
      {isSettingsModalOpen && summaryData?.settings && (
        <SalarySettingsModal
          isOpen={true}
          onClose={() => setIsSettingsModalOpen(false)}
          shopId={shopId}
          initialSettings={summaryData.settings}
          onSuccess={fetchSummary}
        />
      )}

      {/* 5. Store Holiday & Weekly Off Calendar Modal */}
      {isHolidayModalOpen && (
        <StoreHolidayCalendarModal
          isOpen={true}
          onClose={() => setIsHolidayModalOpen(false)}
          shopId={shopId}
          month={selectedMonth}
          onSaved={fetchSummary}
        />
      )}

      {/* 6. Add Temporary Staff Modal */}
      {isAddTemporaryOpen && (
        <AddTemporaryStaffModal
          isOpen={true}
          onClose={() => setIsAddTemporaryOpen(false)}
          shopId={shopId}
          onSuccess={fetchSummary}
        />
      )}
    </div>
  );
}
