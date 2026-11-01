'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  Plus,
  Search,
  Calendar,
  RotateCcw,
  IndianRupee,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
} from 'lucide-react';
import { localDateKey, formatDisplayDate } from '../lib/dateUtils';
import { apiRequest } from '../lib/api';
import { SpecialDamageOrderModal } from './SpecialDamageOrderModal';
import { SpecialDamagePhotoViewerModal } from './SpecialDamagePhotoViewerModal';
import {
  DamageOrderFieldConfigModal,
  DamageOrderFieldsConfig,
} from './DamageOrderFieldConfigModal';

export interface SpecialDamageOrderItem {
  id: string;
  shopId: string;
  orderDate: string;
  orderId: string;
  totalAmount: number;
  serviceType: string;
  piecesCount: number;
  returnPiecesCount: number;
  returnReason: string | null;
  damageReason: string | null;
  returnAmount: number;
  finalBillingAmount: number;
  photos: string[];
  status: string;
  notes: string | null;
  customFields?: Record<string, string | number | boolean> | null;
  createdAt: string;
  reportedByAccount?: {
    id: string;
    username: string;
    staffMember?: {
      id: string;
      fullName: string;
    } | null;
  };
}

interface SummaryData {
  totalOrders: number;
  totalPieces: number;
  totalReturnPieces: number;
  totalAmountSum: number;
  totalReturnAmountSum: number;
  totalFinalBillingSum: number;
}

interface SpecialDamageOrdersSectionProps {
  shopId: string;
  mode?: 'manager' | 'supervisor' | 'owner';
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export function SpecialDamageOrdersSection({
  shopId,
  mode = 'manager',
  onShowToast,
}: SpecialDamageOrdersSectionProps) {
  const currentMonthKey = localDateKey().slice(0, 7); // "YYYY-MM"
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [orders, setOrders] = useState<SpecialDamageOrderItem[]>([]);
  const [config, setConfig] = useState<DamageOrderFieldsConfig | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [summary, setSummary] = useState<SummaryData>({
    totalOrders: 0,
    totalPieces: 0,
    totalReturnPieces: 0,
    totalAmountSum: 0,
    totalReturnAmountSum: 0,
    totalFinalBillingSum: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activePhotoViewer, setActivePhotoViewer] = useState<{
    photos: string[];
    initialIndex: number;
    orderId: string;
    orderDate: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Keep a stable ref to onShowToast so fetchOrders doesn't re-trigger when parent re-renders
  const toastRef = useRef(onShowToast);
  useEffect(() => {
    toastRef.current = onShowToast;
  }, [onShowToast]);

  // Debounce search input by 300ms to avoid constant API hammering
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchOrders = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.append('month', selectedMonth);
      if (debouncedSearch) params.append('search', debouncedSearch);

      const data = await apiRequest<{
        orders: SpecialDamageOrderItem[];
        summary: SummaryData;
        config?: DamageOrderFieldsConfig;
      }>(`/api/shops/${shopId}/special-damage-orders?${params.toString()}`);

      setOrders(data.orders || []);
      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching orders';
      toastRef.current?.(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [shopId, selectedMonth, debouncedSearch]);

  // Fetch when shopId, selectedMonth, or debouncedSearch changes
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const newMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const newMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const formatMonthTitle = (monthStr: string) => {
    try {
      const [y, m] = monthStr.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch {
      return monthStr;
    }
  };

  const getFieldLabel = (key: string, defaultLabel: string): string => {
    const found = config?.standardFields?.find((f) => f.key === key);
    return found?.label || defaultLabel;
  };

  const handleDeleteOrder = async (id: string, orderId: string) => {
    if (!confirm(`Are you sure you want to delete Damage Order #${orderId}?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await apiRequest<{ success: boolean; message: string }>(
        `/api/shops/${shopId}/special-damage-orders/${id}`,
        { method: 'DELETE' }
      );
      toastRef.current?.(`Order #${orderId} deleted successfully.`, 'success');
      fetchOrders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting damage order';
      toastRef.current?.(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-border-subtle p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center flex-shrink-0 shadow-sm">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-brand-forest">
                Damage & Special Orders
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-cream text-brand-forest border border-border-subtle">
                {mode === 'owner' ? 'Branch' : mode === 'supervisor' ? 'Shop' : 'Direct'} • {orders.length} Records
              </span>
            </div>
            <p className="text-xs text-content-muted mt-0.5">
              Customer returns, damaged garments, reason analysis & billing adjustments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {mode === 'owner' && (
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-border-subtle bg-white hover:bg-surface-cream text-content-primary font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
              title="Configure Field Labels, Visibility and Custom Fields"
            >
              <Settings className="w-3.5 h-3.5 text-brand-forest" />
              <span className="hidden sm:inline">Fields</span>
            </button>
          )}

          <button
            onClick={() => fetchOrders()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-border-subtle hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-brand-forest hover:bg-brand-forest/90 text-brand-lime font-black text-xs shadow-sm flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Damage Order</span>
          </button>
        </div>
      </div>

      {/* Month Selector & Search Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Sleek, Self-Contained Month Selector Bar (No Overflow!) */}
        <div className="flex items-center justify-between sm:justify-start gap-1 bg-white rounded-xl border border-border-subtle p-1 shadow-sm">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Clickable Month Label with Transparent Native Month Input Overlay */}
          <div className="relative flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg hover:bg-surface-cream cursor-pointer transition-colors">
            <Calendar className="w-3.5 h-3.5 text-brand-forest" />
            <span className="text-xs font-black text-brand-forest select-none whitespace-nowrap">
              {formatMonthTitle(selectedMonth)}
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedMonth(e.target.value);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="Click to select month"
            />
          </div>

          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search Order ID, service..."
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

      {/* Monthly Summary Statistics Cards (4 Clean Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider">
            Total Damage Orders
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
            Return Articles
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-rose-600">
              {summary.totalReturnPieces}
            </span>
            <span className="text-[11px] text-content-muted font-medium">
              / {summary.totalPieces} pcs
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider flex items-center gap-1">
            <RotateCcw className="w-3 h-3 text-content-muted" />
            {getFieldLabel('returnAmount', 'Return Loss')}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-rose-700">
              ₹{summary.totalReturnAmountSum.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-bold uppercase text-content-muted tracking-wider flex items-center gap-1">
            <IndianRupee className="w-3 h-3 text-content-muted" />
            {getFieldLabel('finalBillingAmount', 'Final Billing')}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-brand-forest">
              ₹{summary.totalFinalBillingSum.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {isLoading && orders.length === 0 ? (
          <div className="p-10 text-center text-content-muted bg-white rounded-2xl border border-border-subtle">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-forest mb-2" />
            <p className="text-xs font-bold">Loading damage orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-border-subtle space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-forest">
                No Damage Orders Recorded
              </h3>
              <p className="text-xs text-content-muted max-w-sm mx-auto mt-0.5">
                No customer returns or damaged garments logged for {formatMonthTitle(selectedMonth)}.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-brand-forest text-brand-lime text-xs font-black shadow-sm inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Special Damage Order</span>
            </button>
          </div>
        ) : (
          orders.map((ord) => (
            <div
              key={ord.id}
              className="p-4 rounded-2xl bg-white border border-border-subtle shadow-sm hover:border-brand-forest/30 transition-all space-y-3 text-xs"
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle/50">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="px-2.5 py-0.5 rounded-lg font-mono text-xs font-black bg-blue-100 text-blue-900 border border-blue-200">
                    #{ord.orderId}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-cream text-content-muted border border-border-subtle">
                    {formatDisplayDate(ord.orderDate)}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                    {ord.serviceType}
                  </span>
                  {ord.returnPiecesCount > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      {ord.returnPiecesCount} of {ord.piecesCount} pcs return
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDeleteOrder(ord.id, ord.orderId)}
                    disabled={deletingId === ord.id}
                    className="p-1.5 rounded-lg text-content-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete order"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle text-xs">
                <div>
                  <span className="text-[10px] text-content-muted font-bold block">
                    {getFieldLabel('totalAmount', 'Total Order')}
                  </span>
                  <span className="font-bold text-content-primary">
                    ₹{ord.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-700 font-bold block">
                    {getFieldLabel('returnAmount', 'Return Loss')}
                  </span>
                  <span className="font-bold text-rose-700">
                    ₹{ord.returnAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-brand-forest font-bold block">
                    {getFieldLabel('finalBillingAmount', 'Net Billing')}
                  </span>
                  <span className="font-black text-brand-forest">
                    ₹{ord.finalBillingAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Reasons Block */}
              {(ord.returnReason || ord.damageReason) && (
                <div className="space-y-1.5 text-xs">
                  {ord.returnReason && (
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 text-amber-950">
                      <span className="font-bold text-[10px] uppercase tracking-wider block text-amber-800 mb-0.5 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3 text-amber-700" />
                        {getFieldLabel('returnReason', 'Return Reason (Why)')}:
                      </span>
                      <p className="text-xs leading-relaxed">{ord.returnReason}</p>
                    </div>
                  )}

                  {ord.damageReason && (
                    <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70 text-rose-950">
                      <span className="font-bold text-[10px] uppercase tracking-wider block text-rose-800 mb-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        {getFieldLabel('damageReason', 'Damage Reason (How)')}:
                      </span>
                      <p className="text-xs leading-relaxed">{ord.damageReason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Custom Fields Badges */}
              {ord.customFields && Object.keys(ord.customFields).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {Object.entries(ord.customFields).map(([k, val]) => {
                    if (val === undefined || val === null || val === '') return null;
                    const fieldDef = config?.customFields?.find((cf) => cf.key === k);
                    const label = fieldDef?.label || k;
                    const displayVal = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                    return (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-surface-cream text-content-primary border border-border-subtle text-[11px]"
                      >
                        <strong className="text-content-muted font-bold">{label}:</strong>
                        <span className="font-black text-brand-forest">{displayVal}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Photos Gallery */}
              {ord.photos && ord.photos.length > 0 && (
                <div className="pt-0.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-content-muted flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-brand-forest" />
                      {getFieldLabel('photos', 'Proof Photos')} ({ord.photos.length})
                    </span>
                    <span className="text-[10px] text-content-muted">
                      Tap photo to enlarge
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {ord.photos.map((photoUrl, photoIdx) => (
                      <button
                        key={photoIdx}
                        onClick={() =>
                          setActivePhotoViewer({
                            photos: ord.photos,
                            initialIndex: photoIdx,
                            orderId: ord.orderId,
                            orderDate: ord.orderDate,
                          })
                        }
                        className="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border-subtle hover:border-brand-forest shadow-sm transition-transform active:scale-95"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl}
                          alt={`Evidence ${photoIdx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 rounded-tl">
                          #{photoIdx + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Logged by footer */}
              <div className="flex items-center justify-between text-[10px] text-content-muted pt-2 border-t border-border-subtle/50">
                <span>
                  By:{' '}
                  <strong className="text-brand-forest font-bold">
                    {ord.reportedByAccount?.staffMember?.fullName ||
                      ord.reportedByAccount?.username ||
                      'Manager'}
                  </strong>
                </span>
                <span>
                  Recorded on {new Date(ord.createdAt).toLocaleDateString('en-IN')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Order Modal */}
      <SpecialDamageOrderModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        shopId={shopId}
        config={config}
        onSuccess={() => {
          toastRef.current?.('Special damage order recorded successfully!', 'success');
          fetchOrders();
        }}
      />

      {/* Full Size Photo Viewer Modal */}
      {activePhotoViewer && (
        <SpecialDamagePhotoViewerModal
          isOpen={true}
          onClose={() => setActivePhotoViewer(null)}
          photos={activePhotoViewer.photos}
          initialIndex={activePhotoViewer.initialIndex}
          orderId={activePhotoViewer.orderId}
          orderDate={activePhotoViewer.orderDate}
        />
      )}

      {/* Field Configuration Modal (Owner) */}
      <DamageOrderFieldConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        shopId={shopId}
        initialConfig={config}
        onSuccess={(updated) => {
          setConfig(updated);
          toastRef.current?.('Field configuration updated successfully!', 'success');
          fetchOrders();
        }}
      />
    </div>
  );
}
