'use client';

import React, { useState } from 'react';
import { apiRequest } from '../lib/api';
import { AlertTriangle, X, Camera, Check } from 'lucide-react';

interface DamageModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  staffMemberId: string;
  taskAssignmentId: string;
  taskUnitId?: string | null;
  pieceNumber?: number | null;
  orderId?: string | null;
  onSuccess?: () => void;
}

export function DamageModal({
  isOpen,
  onClose,
  shopId,
  staffMemberId,
  taskAssignmentId,
  taskUnitId,
  pieceNumber,
  orderId,
  onSuccess,
}: DamageModalProps) {
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/shops/${shopId}/damage`, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId,
          taskAssignmentId,
          taskUnitId: taskUnitId || undefined,
          pieceNumber: pieceNumber || undefined,
          notes: notes.trim() || undefined,
          photoPath: photoPreview ? 'uploads/damage-evidence.jpg' : undefined,
        }),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to report damage incident.';
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-status-danger/10 text-status-danger">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-forest">Report Damage</h3>
              <p className="text-xs text-content-muted">
                {orderId ? `Order ${orderId}` : 'Incident'}{' '}
                {pieceNumber ? `— Piece #${pieceNumber}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-medium text-status-danger">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-brand-forest mb-1.5">
              Incident Description / Reason
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Tear on left sleeve, stubborn chemical stain, missing button..."
              rows={3}
              required
              className="w-full text-sm p-3 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lime"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-forest mb-1.5">
              Damage Photo Evidence (Optional)
            </label>
            <div className="relative">
              {photoPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-border-subtle shadow-clay-sm h-36">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Damage Evidence"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border-subtle rounded-xl bg-surface-cream/60 hover:bg-surface-cream cursor-pointer transition-colors">
                  <Camera className="w-6 h-6 text-content-muted mb-1" />
                  <span className="text-xs font-semibold text-brand-forest">
                    Take or Upload Photo
                  </span>
                  <span className="text-[10px] text-content-muted">PNG, JPG up to 5MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl clay-btn-secondary text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl clay-btn-forest text-sm font-semibold flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Recording...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Submit Incident</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
