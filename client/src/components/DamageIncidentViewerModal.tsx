'use client';

import React, { useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  AlertTriangle,
  X,
  Clock,
  User,
  CheckCircle2,
  Eye,
  FileText,
  ShieldCheck,
} from 'lucide-react';

export interface DamageIncidentRecord {
  id: string;
  pieceNumber?: number | null;
  status: 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'DISPUTED';
  notes?: string | null;
  photoPath?: string | null;
  reportedAt: string;
  reviewNotes?: string | null;
  staffMember?: { fullName?: string };
  taskAssignment?: {
    orderId?: string | null;
    serviceType?: { name?: string };
  };
}

interface DamageIncidentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: DamageIncidentRecord | null;
  shopId: string;
  canManage?: boolean;
  onUpdated?: () => void;
}

export function DamageIncidentViewerModal({
  isOpen,
  onClose,
  incident,
  shopId,
  canManage = true,
  onUpdated,
}: DamageIncidentViewerModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(incident?.status || 'OPEN');
  const [reviewNotes, setReviewNotes] = useState<string>(incident?.reviewNotes || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  if (!isOpen || !incident) return null;

  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      await apiRequest(`/api/shops/${shopId}/damage/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });
      setSelectedStatus(newStatus);
      if (onUpdated) onUpdated();
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update incident.');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CLOSED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'UNDER_REVIEW':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'DISPUTED':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      default:
        return 'bg-red-100 text-red-900 border-red-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-status-danger/15 text-status-danger shadow-clay-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-brand-forest">Damage Incident Report</h3>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadge(
                    selectedStatus
                  )}`}
                >
                  {selectedStatus.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-content-muted">
                {incident.taskAssignment?.orderId ? `Order #${incident.taskAssignment.orderId}` : 'Incident Details'}{' '}
                {incident.pieceNumber ? `• Piece #${incident.pieceNumber}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-4 text-xs">
          {/* Reporter & Metadata Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-surface-cream/60 border border-border-subtle">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-brand-forest shrink-0" />
              <div>
                <span className="text-[10px] font-bold text-content-muted block">Reported By</span>
                <span className="font-extrabold text-brand-forest">
                  {incident.staffMember?.fullName || 'Staff Member'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-forest shrink-0" />
              <div>
                <span className="text-[10px] font-bold text-content-muted block">Reported At</span>
                <span className="font-bold text-brand-forest">
                  {new Date(incident.reportedAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Description & Reason */}
          <div className="p-3.5 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-1.5">
            <div className="flex items-center gap-1.5 text-brand-forest font-black text-xs">
              <FileText className="w-3.5 h-3.5 text-brand-forest" />
              <span>Incident Reason / Damage Notes</span>
            </div>
            <p className="text-xs text-content-primary leading-relaxed whitespace-pre-wrap font-medium">
              {incident.notes || 'No specific notes recorded by staff member.'}
            </p>
          </div>

          {/* Photo Evidence */}
          <div className="p-3.5 rounded-2xl bg-white border border-border-subtle shadow-sm space-y-2">
            <div className="flex items-center gap-1.5 text-brand-forest font-black text-xs">
              <Eye className="w-3.5 h-3.5 text-brand-forest" />
              <span>Damage Photo Evidence</span>
            </div>

            {incident.photoPath ? (
              <div className="rounded-xl overflow-hidden border border-border-subtle max-h-72 bg-black/5 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={incident.photoPath}
                  alt="Incident Evidence"
                  className="w-full h-auto max-h-72 object-contain"
                />
              </div>
            ) : (
              <div className="p-6 text-center text-content-muted bg-surface-cream/50 rounded-xl border border-dashed border-border-subtle">
                <p className="text-xs font-semibold">No photographic evidence attached with this report.</p>
              </div>
            )}
          </div>

          {/* Supervisor / Manager Action Section */}
          {canManage && (
            <div className="p-3.5 rounded-2xl bg-surface-cream/70 border border-border-subtle space-y-3">
              <div className="flex items-center gap-1.5 text-brand-forest font-black text-xs">
                <ShieldCheck className="w-4 h-4 text-brand-forest" />
                <span>Operational Resolution & Status Controls</span>
              </div>

              {updateError && (
                <div className="p-2 rounded-xl bg-status-danger/10 border border-status-danger/30 text-[11px] font-semibold text-status-danger">
                  {updateError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-brand-forest mb-1">
                  Investigation / Resolution Notes
                </label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Customer informed, compensation arranged, marked resolved..."
                  className="w-full text-xs p-2.5 rounded-xl bg-white border border-border-subtle text-content-primary focus:ring-1 focus:ring-brand-forest"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isUpdating || selectedStatus === 'UNDER_REVIEW'}
                  onClick={() => handleUpdateStatus('UNDER_REVIEW')}
                  className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selectedStatus === 'CLOSED'}
                  onClick={() => handleUpdateStatus('CLOSED')}
                  className="px-3 py-1.5 rounded-xl bg-[#245431] hover:bg-[#1E4327] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Resolve & Close Incident</span>
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selectedStatus === 'OPEN'}
                  onClick={() => handleUpdateStatus('OPEN')}
                  className="px-2.5 py-1.5 rounded-xl bg-surface-card hover:bg-surface-cream text-content-muted text-xs font-semibold transition-all disabled:opacity-50"
                >
                  Reopen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-card hover:bg-surface-cream text-xs font-bold text-brand-forest border border-border-subtle shadow-clay-sm"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
