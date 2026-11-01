'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { localDateKey, formatDisplayDate } from '../lib/dateUtils';
import { SpecialDamageOrderModal } from './SpecialDamageOrderModal';
import { SpecialDamagePhotoViewerModal } from './SpecialDamagePhotoViewerModal';

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
  const [orders, setOrders] = useState<SpecialDamageOrderItem[]>([]);
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

  const fetchOrders = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.append('month', selectedMonth);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/shops/${shopId}/special-damage-orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load damage orders');
      }
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching orders';
      if (onShowToast) onShowToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [shopId, selectedMonth, searchQuery, onShowToast]);

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

  const handleDeleteOrder = async (id: string, orderId: string) => {
    if (!confirm(`Are you sure you want to delete Damage Order #${orderId}?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/shops/${shopId}/special-damage-orders/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete damage order');
      }
      if (onShowToast) {
        onShowToast(`Order #${orderId} deleted successfully.`, 'success');
      }
      fetchOrders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting damage order';
      if (onShowToast) onShowToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Top Header Card */}
      <div className="bg-surface-card rounded-2xl sm:rounded-clay border border-border-subtle p-4 sm:p-5 shadow-clay-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-brand-forest">
                Damage & Special Orders
              </h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {mode === 'owner' ? 'Branch' : mode === 'supervisor' ? 'Shop' : 'Direct'} • {orders.length} Records
              </span>
            </div>
            <p className="text-xs text-content-muted">
              Customer returns, damaged garments, reason analysis & billing adjustments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchOrders()}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-border-subtle hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-brand-forest hover:bg-brand-forest/90 text-white font-black text-xs shadow-clay-sm flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Add Damage Order</span>
          </button>
        </div>
      </div>

      {/* Month Selector & Search Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Month Selector Bar */}
        <div className="flex items-center gap-1.5 bg-surface-card rounded-2xl border border-border-subtle p-1.5 shadow-sm">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-2">
            <Calendar className="w-3.5 h-3.5 text-brand-forest" />
            <span className="text-xs font-black text-brand-forest min-w-[120px] text-center">
              {formatMonthTitle(selectedMonth)}
            </span>
          </div>

          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="ml-1 px-2 py-1 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-forest"
          />
        </div>

        {/* Search input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Search Order ID, service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-2xl border border-border-subtle bg-surface-card text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-forest"
          />
        </div>
      </div>

      {/* Monthly Summary Statistics Cards (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 sm:p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-black uppercase text-content-muted tracking-wider">
            Total Damage Orders
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-brand-forest">
              {summary.totalOrders}
            </span>
            <span className="text-[11px] text-content-muted font-bold">orders</span>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-sm space-y-1">
          <p className="text-[10px] font-black uppercase text-red-600 tracking-wider">
            Return Articles
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-red-600">
              {summary.totalReturnPieces}
            </span>
            <span className="text-[11px] text-content-muted font-bold">
              / {summary.totalPieces} pcs
            </span>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-red-50/50 border border-red-200 shadow-sm space-y-1">
          <p className="text-[10px] font-black uppercase text-red-700 tracking-wider flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            Return Amount
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-2xl font-black text-red-700">
              ₹{summary.totalReturnAmountSum.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 shadow-sm space-y-1">
          <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1">
            <IndianRupee className="w-3 h-3" />
            Final Billing
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-2xl font-black text-emerald-800">
              ₹{summary.totalFinalBillingSum.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {isLoading && orders.length === 0 ? (
          <div className="p-10 text-center text-content-muted bg-surface-card rounded-2xl border border-border-subtle">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-forest mb-2" />
            <p className="text-xs font-bold">Loading damage orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center bg-surface-card rounded-2xl border border-dashed border-border-subtle space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-forest">
                No Damage Orders Recorded
              </h3>
              <p className="text-xs text-content-muted max-w-sm mx-auto mt-1">
                No customer returns or damaged garments logged for {formatMonthTitle(selectedMonth)}.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-brand-forest text-white text-xs font-black shadow-sm inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Special Damage Order</span>
            </button>
          </div>
        ) : (
          orders.map((ord) => (
            <div
              key={ord.id}
              className="p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-sm hover:border-brand-forest/30 transition-all space-y-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-brand-forest tracking-wide">
                    #{ord.orderId}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-cream text-content-muted border border-border-subtle">
                    {formatDisplayDate(ord.orderDate)}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {ord.serviceType}
                  </span>
                  {ord.returnPiecesCount > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {ord.returnPiecesCount} of {ord.piecesCount} pcs returned
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#F8FAF8] border border-border-subtle text-xs">
                <div>
                  <span className="text-[10px] text-content-muted font-bold block">
                    Total Amount
                  </span>
                  <span className="font-bold text-content-primary">
                    ₹{ord.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-red-600 font-bold block">
                    Return Loss
                  </span>
                  <span className="font-bold text-red-600">
                    ₹{ord.returnAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700 font-bold block">
                    Final Billing
                  </span>
                  <span className="font-black text-emerald-800">
                    ₹{ord.finalBillingAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Reasons Block */}
              {(ord.returnReason || ord.damageReason) && (
                <div className="space-y-1.5 text-xs pt-1">
                  {ord.returnReason && (
                    <div className="p-2 rounded-xl bg-orange-50/60 border border-orange-200 text-orange-900">
                      <span className="font-black text-[11px] uppercase tracking-wider block text-orange-800 mb-0.5 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />
                        Return Reason (Why):
                      </span>
                      <p className="text-xs leading-relaxed">{ord.returnReason}</p>
                    </div>
                  )}

                  {ord.damageReason && (
                    <div className="p-2 rounded-xl bg-red-50/60 border border-red-200 text-red-900">
                      <span className="font-black text-[11px] uppercase tracking-wider block text-red-800 mb-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Damage Reason (How):
                      </span>
                      <p className="text-xs leading-relaxed">{ord.damageReason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Photos Gallery */}
              {ord.photos && ord.photos.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black text-content-muted flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-brand-forest" />
                      Damage Evidence Photos ({ord.photos.length})
                    </span>
                    <span className="text-[10px] text-content-muted">
                      Click to view full photo
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
                        className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-border-subtle group hover:border-brand-forest shadow-sm transition-transform active:scale-95"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl}
                          alt={`Evidence ${photoIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
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
              <div className="flex items-center justify-between text-[10px] text-content-muted pt-2 border-t border-border-subtle">
                <span>
                  Logged by:{' '}
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
        onSuccess={() => {
          if (onShowToast) onShowToast('Special damage order recorded successfully!', 'success');
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
    </div>
  );
}

