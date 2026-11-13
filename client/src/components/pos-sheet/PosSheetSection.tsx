'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  UploadCloud,
  Settings,
  Download,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  Phone,
  CheckCircle2,
  X,
} from 'lucide-react';
import { localDateKey, formatDisplayDate } from '../../lib/dateUtils';
import { apiRequest } from '../../lib/api';
import { PosSheetConfig, PosSheetColumnDef, PosSheetConfigModal } from './PosSheetConfigModal';
import { PosSheetUploadModal } from './PosSheetUploadModal';

export interface PosDailySheetEntry {
  id: string;
  batchId: string;
  shopId: string;
  entryDate: string;
  orderNo: string | null;
  customerCode: string | null;
  customerName: string | null;
  phone: string | null;
  pieces: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  paid: number | null;
  balance: number | null;
  orderStatus: string | null;
  dueDate: string | null;
  bookedBy: string | null;
  primaryServices: string | null;
  rowData: Record<string, unknown>;
  createdAt: string;
}

export interface PosDailySheetBatch {
  id: string;
  shopId: string;
  sheetDate: string;
  fileName: string;
  fileSize: number | null;
  rowCount: number;
  totalPieces: number | null;
  totalGrossAmount: number | null;
  totalNetAmount: number | null;
  totalPaid: number | null;
  totalBalance: number | null;
  uploadedByAccountId: string;
  status: string;
  createdAt: string;
  uploadedByAccount?: {
    id: string;
    username: string;
    staffMember?: {
      fullName: string;
    } | null;
  };
}

interface PosSheetSectionProps {
  shopId: string;
  mode?: 'manager' | 'supervisor' | 'owner';
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export function PosSheetSection({
  shopId,
  mode = 'manager',
  onShowToast,
}: PosSheetSectionProps) {
  const [selectedDate, setSelectedDate] = useState<string>(localDateKey());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [entries, setEntries] = useState<PosDailySheetEntry[]>([]);
  const [batches, setBatches] = useState<PosDailySheetBatch[]>([]);
  const [config, setConfig] = useState<PosSheetConfig | null>(null);
  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalPieces: 0,
    totalGrossAmount: 0,
    totalNetAmount: 0,
    totalPaid: 0,
    totalBalance: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const toastRef = useRef(onShowToast);
  useEffect(() => {
    toastRef.current = onShowToast;
  }, [onShowToast]);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      if (debouncedSearch) params.append('search', debouncedSearch);

      const res = await apiRequest<{
        date: string;
        entries: PosDailySheetEntry[];
        batches: PosDailySheetBatch[];
        config: PosSheetConfig;
        summary: typeof summary;
      }>(`/api/shops/${shopId}/pos-sheet?${params.toString()}`);

      setEntries(res.entries || []);
      setBatches(res.batches || []);
      if (res.config) setConfig(res.config);
      if (res.summary) setSummary(res.summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching POS sheet data.';
      toastRef.current?.(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [shopId, selectedDate, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d - 1);
    setSelectedDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`
    );
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + 1);
    setSelectedDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`
    );
  };

  // Determine active visible columns based on user role
  const activeColumns: PosSheetColumnDef[] = (config?.columns || [])
    .filter((col) => {
      if (mode === 'manager') return col.isVisibleToManager !== false;
      if (mode === 'supervisor') return col.isVisibleToSupervisor !== false;
      return col.isVisibleToOwner !== false;
    })
    .sort((a, b) => a.order - b.order);

  // Filter entries by status if selected
  const filteredEntries = entries.filter((entry) => {
    if (statusFilter === 'ALL') return true;
    const s = (entry.orderStatus || '').toLowerCase();
    return s.includes(statusFilter.toLowerCase());
  });

  // Extract distinct statuses for quick filter
  const distinctStatuses = Array.from(
    new Set(
      entries
        .map((e) => e.orderStatus)
        .filter((s): s is string => Boolean(s && s.trim().length > 0))
    )
  ).slice(0, 6);

  // Delete/Rollback Batch
  const handleDeleteBatch = async (batchId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete and rollback batch "${fileName}"? All its entries will be deleted.`)) {
      return;
    }

    setDeletingBatchId(batchId);
    try {
      await apiRequest(`/api/shops/${shopId}/pos-sheet/batches/${batchId}`, {
        method: 'DELETE',
      });
      toastRef.current?.(`Batch "${fileName}" deleted successfully.`, 'success');
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting batch';
      toastRef.current?.(msg, 'error');
    } finally {
      setDeletingBatchId(null);
    }
  };

  // Delete Single Entry
  const handleDeleteEntry = async (entryId: string, orderNo: string | null) => {
    if (!confirm(`Are you sure you want to remove entry #${orderNo || entryId}?`)) return;

    setDeletingEntryId(entryId);
    try {
      await apiRequest(`/api/shops/${shopId}/pos-sheet/entries/${entryId}`, {
        method: 'DELETE',
      });
      toastRef.current?.(`Entry removed successfully.`, 'success');
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting entry';
      toastRef.current?.(msg, 'error');
    } finally {
      setDeletingEntryId(null);
    }
  };

  // Export visible data to Excel
  const handleExportExcel = () => {
    if (filteredEntries.length === 0) {
      toastRef.current?.('No data to export for this date.', 'error');
      return;
    }

    // Build rows with labels matching active columns
    const exportData = filteredEntries.map((entry) => {
      const row: Record<string, unknown> = {};
      activeColumns.forEach((col) => {
        const val =
          entry[col.key as keyof PosDailySheetEntry] ??
          (entry.rowData as Record<string, unknown>)?.[col.key] ??
          (entry.rowData as Record<string, unknown>)?.[col.excelHeader] ??
          '';
        row[col.label] = val;
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'POS_Orders');
    XLSX.writeFile(workbook, `Tumbledry_POS_Sheet_${selectedDate}.xlsx`);
    toastRef.current?.(`Exported ${filteredEntries.length} orders to Excel!`, 'success');
  };

  // Helper to extract cell value flexibly from entry or raw rowData
  const getCellValue = (entry: PosDailySheetEntry, col: PosSheetColumnDef) => {
    // 1. Direct model properties
    if (col.key === 'order_no') return entry.orderNo || '—';
    if (col.key === 'customer_name') return entry.customerName || '—';
    if (col.key === 'phone') return entry.phone || '—';
    if (col.key === 'pieces') return entry.pieces ?? '0';
    if (col.key === 'net_amount') return entry.netAmount != null ? `₹${entry.netAmount.toLocaleString('en-IN')}` : '—';
    if (col.key === 'paid') return entry.paid != null ? `₹${entry.paid.toLocaleString('en-IN')}` : '—';
    if (col.key === 'balance') return entry.balance != null ? `₹${entry.balance.toLocaleString('en-IN')}` : '—';
    if (col.key === 'gross_amount') return entry.grossAmount != null ? `₹${entry.grossAmount.toLocaleString('en-IN')}` : '—';
    if (col.key === 'order_status') return entry.orderStatus || '—';
    if (col.key === 'due_date') return entry.dueDate || '—';
    if (col.key === 'primary_services') return entry.primaryServices || '—';
    if (col.key === 'booked_by') return entry.bookedBy || '—';
    if (col.key === 'customer_code') return entry.customerCode || '—';

    // 2. Fallback to rowData json by key or by original excelHeader
    const val = entry.rowData?.[col.key] ?? entry.rowData?.[col.excelHeader];
    if (val === null || val === undefined || val === '') return '—';

    if (col.dataType === 'currency') {
      const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[₹,\s]/g, ''));
      return isNaN(n) ? String(val) : `₹${n.toLocaleString('en-IN')}`;
    }

    return String(val);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* ─── Top Master Header Card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border-subtle p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center flex-shrink-0 shadow-sm">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-brand-forest">
                Daily POS Sheet Maintain
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-cream text-brand-forest border border-border-subtle">
                {mode === 'owner' ? 'Owner Portal' : mode === 'supervisor' ? 'Supervisor' : 'Manager'} • {entries.length} Orders
              </span>
            </div>
            <p className="text-xs text-content-muted mt-0.5">
              Sync, maintain, and review daily orders exported from your external POS billing system.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Column Configuration Button (Owner & Supervisor) */}
          {(mode === 'owner' || mode === 'supervisor') && (
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-border-subtle bg-white hover:bg-surface-cream text-content-primary font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
              title="Customize Columns & Manager Visibility"
            >
              <Settings className="w-3.5 h-3.5 text-brand-forest" />
              <span className="hidden sm:inline">Columns</span>
            </button>
          )}

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            disabled={entries.length === 0}
            className="px-3 py-2 rounded-xl border border-border-subtle bg-white hover:bg-surface-cream text-content-primary font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
            title="Download visible data as Excel"
          >
            <Download className="w-3.5 h-3.5 text-brand-forest" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchData()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-border-subtle hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Upload Button */}
          {(mode !== 'manager' || config?.allowManagerUpload !== false) && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-brand-forest hover:bg-brand-forest/90 text-brand-lime font-black text-xs shadow-sm flex items-center justify-center gap-1.5 transition-transform active:scale-95"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Daily Sheet</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Date Selector & Search Filters Bar ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Sleek Date Pill (Self-Contained & Compact) */}
        <div className="flex items-center justify-between sm:justify-start gap-1 bg-white rounded-xl border border-border-subtle p-1 shadow-sm shrink-0">
          <button
            onClick={handlePrevDay}
            className="p-1.5 rounded-lg hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="relative flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg hover:bg-surface-cream cursor-pointer transition-colors">
            <Calendar className="w-3.5 h-3.5 text-brand-forest" />
            <span className="text-xs font-black text-brand-forest select-none whitespace-nowrap">
              {formatDisplayDate(selectedDate)}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="Click to change date"
            />
          </div>

          <button
            onClick={handleNextDay}
            className="p-1.5 rounded-lg hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Status Tabs (if available) */}
        {distinctStatuses.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 ${
                statusFilter === 'ALL'
                  ? 'bg-brand-forest text-white shadow-sm'
                  : 'bg-white text-content-muted border border-border-subtle hover:bg-surface-cream'
              }`}
            >
              All ({entries.length})
            </button>
            {distinctStatuses.map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 ${
                  statusFilter === st
                    ? 'bg-brand-forest text-white shadow-sm'
                    : 'bg-white text-content-muted border border-border-subtle hover:bg-surface-cream'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search Order #, Customer, Phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-border-subtle bg-white text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-forest"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Summary Metric Cards (5 Clean White Cards) ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Total Orders
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-brand-forest">
              {summary.totalOrders}
            </span>
            <span className="text-[11px] text-content-muted font-medium">orders</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Total Pieces
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-brand-forest">
              {summary.totalPieces}
            </span>
            <span className="text-[11px] text-content-muted font-medium">pcs</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Net Amount
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-brand-forest">
              ₹{summary.totalNetAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Total Paid
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-emerald-700">
              ₹{summary.totalPaid.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Balance Due
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-rose-700">
              ₹{summary.totalBalance.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Uploaded Batches History Strip (if any batch uploaded for today) ─── */}
      {batches.length > 0 && (
        <div className="p-3 rounded-xl bg-surface-cream/50 border border-border-subtle space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-brand-forest">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Uploaded Batches for {formatDisplayDate(selectedDate)} ({batches.length})</span>
            </span>
          </div>
          <div className="space-y-1.5">
            {batches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-border-subtle text-xs"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-bold text-content-primary truncate">{b.fileName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-cream text-content-muted border border-border-subtle shrink-0">
                    {b.rowCount} rows
                  </span>
                  <span className="text-[10px] text-content-muted shrink-0 hidden sm:inline">
                    Uploaded by {b.uploadedByAccount?.staffMember?.fullName || b.uploadedByAccount?.username || 'Staff'} at{' '}
                    {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {(mode !== 'manager' || config?.allowManagerDelete) && (
                  <button
                    type="button"
                    disabled={deletingBatchId === b.id}
                    onClick={() => handleDeleteBatch(b.id, b.fileName)}
                    className="p-1 text-content-muted hover:text-red-600 rounded hover:bg-red-50 transition-colors shrink-0"
                    title="Rollback / Delete this sheet batch"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Interactive Sheet Data Table ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden text-xs">
        {isLoading && entries.length === 0 ? (
          <div className="p-12 text-center text-content-muted">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-forest mb-2" />
            <p className="text-xs font-bold">Loading POS orders...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center mx-auto shadow-sm">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-forest">
                No POS Orders for {formatDisplayDate(selectedDate)}
              </h3>
              <p className="text-xs text-content-muted max-w-sm mx-auto mt-0.5">
                No Excel sheet has been uploaded for this date yet. Download your daily export from the POS system and upload here.
              </p>
            </div>
            {(mode !== 'manager' || config?.allowManagerUpload !== false) && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-brand-forest text-brand-lime text-xs font-black shadow-sm inline-flex items-center gap-1.5 transition-transform active:scale-95"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload Daily POS Sheet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table className="min-w-full divide-y divide-border-subtle text-left">
              <thead className="bg-surface-cream/80 text-brand-forest font-black text-[11px] uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-center w-12">#</th>
                  {activeColumns.map((col) => (
                    <th key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  {(mode !== 'manager' || config?.allowManagerDelete) && (
                    <th className="px-3 py-2.5 text-right w-16">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60 bg-white">
                {filteredEntries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-surface-cream/30 transition-colors">
                    {/* Index */}
                    <td className="px-3 py-2 text-center font-mono text-[10px] text-content-muted">
                      {idx + 1}
                    </td>

                    {/* Dynamic Columns Data */}
                    {activeColumns.map((col) => {
                      const cellVal = getCellValue(entry, col);

                      // Custom styling for specific key fields
                      if (col.key === 'order_no') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                            <span className="font-mono text-xs font-black text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              #{cellVal}
                            </span>
                          </td>
                        );
                      }

                      if (col.key === 'customer_name') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap font-bold text-content-primary">
                            {cellVal}
                          </td>
                        );
                      }

                      if (col.key === 'phone' && cellVal !== '—') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap font-mono text-content-primary">
                            <a
                              href={`tel:${String(cellVal).replace(/\D/g, '')}`}
                              className="text-brand-forest hover:underline inline-flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3 text-content-muted" />
                              <span>{cellVal}</span>
                            </a>
                          </td>
                        );
                      }

                      if (col.key === 'pieces') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap font-black text-brand-forest">
                            {cellVal} pcs
                          </td>
                        );
                      }

                      if (col.key === 'net_amount') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap font-black text-brand-forest">
                            {cellVal}
                          </td>
                        );
                      }

                      if (col.key === 'balance' && cellVal !== '—') {
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap font-bold text-rose-700">
                            {cellVal}
                          </td>
                        );
                      }

                      if (col.key === 'order_status') {
                        const s = String(cellVal || '').toLowerCase();
                        const isDelivered = s.includes('delivered');
                        const isReady = s.includes('ready');
                        return (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isDelivered
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : isReady
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-surface-cream text-content-muted border border-border-subtle'
                              }`}
                            >
                              {cellVal}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} className="px-3 py-2 whitespace-nowrap text-content-primary">
                          {cellVal}
                        </td>
                      );
                    })}

                    {/* Delete entry action (if allowed) */}
                    {(mode !== 'manager' || config?.allowManagerDelete) && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={deletingEntryId === entry.id}
                          onClick={() => handleDeleteEntry(entry.id, entry.orderNo)}
                          className="p-1 text-content-muted hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer info */}
        {filteredEntries.length > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-border-subtle bg-surface-cream/30 text-[11px] text-content-muted">
            <span>
              Showing {filteredEntries.length} of {entries.length} orders on {formatDisplayDate(selectedDate)}
            </span>
            <span>
              {activeColumns.length} visible columns displayed
            </span>
          </div>
        )}
      </div>

      {/* ─── Upload Modal ────────────────────────────────────────────────────── */}
      {isUploadModalOpen && config && (
        <PosSheetUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          shopId={shopId}
          defaultDate={selectedDate}
          config={config}
          onSuccess={() => {
            fetchData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ─── Column Configuration Modal (Owner & Supervisor) ────────────────── */}
      {isConfigModalOpen && config && (
        <PosSheetConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          shopId={shopId}
          initialConfig={config}
          onSuccess={(updated) => {
            setConfig(updated);
            fetchData();
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
