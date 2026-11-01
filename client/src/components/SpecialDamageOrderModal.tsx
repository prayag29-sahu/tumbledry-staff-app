'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  AlertTriangle,
  Receipt,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Calendar,
  Layers,
} from 'lucide-react';
import { localDateKey } from '../lib/dateUtils';
import { apiRequest } from '../lib/api';
import { DamageOrderFieldsConfig } from './DamageOrderFieldConfigModal';

interface SpecialDamageOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  onSuccess: () => void;
  initialDate?: string;
  config?: DamageOrderFieldsConfig | null;
}

const SERVICE_OPTIONS = [
  'Dry Cleaning',
  'Wash & Fold',
  'Wash & Steam Iron',
  'Steam Ironing Only',
  'Shoe Cleaning & Spa',
  'Bag Cleaning & Spa',
  'Curtains & Drapes',
  'Blanket / Quilt Care',
  'Saree Rolling & Polishing',
  'Leather & Suede Care',
  'Other / Custom Service',
];

export function SpecialDamageOrderModal({
  isOpen,
  onClose,
  shopId,
  onSuccess,
  initialDate,
  config,
}: SpecialDamageOrderModalProps) {
  const [orderDate, setOrderDate] = useState(() => initialDate || localDateKey());
  const [orderId, setOrderId] = useState('');
  const [serviceType, setServiceType] = useState(SERVICE_OPTIONS[0]);
  const [customService, setCustomService] = useState('');
  const [piecesCount, setPiecesCount] = useState<number>(1);
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [returnPiecesCount, setReturnPiecesCount] = useState<number>(1);
  const [returnAmount, setReturnAmount] = useState<string>('');
  const [finalBillingAmount, setFinalBillingAmount] = useState<string>('');
  const [returnReason, setReturnReason] = useState('');
  const [damageReason, setDamageReason] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialDate) setOrderDate(initialDate);
      setError(null);
    }
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  const getFieldLabel = (key: string, defaultLabel: string): string => {
    const found = config?.standardFields?.find((f) => f.key === key);
    return found?.label || defaultLabel;
  };

  const isFieldVisible = (key: string): boolean => {
    const found = config?.standardFields?.find((f) => f.key === key);
    return found?.isVisible ?? true;
  };

  // Auto-calculate suggested final billing when total or return changes
  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
    const numTotal = parseFloat(val) || 0;
    const numReturn = parseFloat(returnAmount) || 0;
    setFinalBillingAmount(String(Math.max(0, numTotal - numReturn)));
  };

  const handleReturnAmountChange = (val: string) => {
    setReturnAmount(val);
    const numTotal = parseFloat(totalAmount) || 0;
    const numReturn = parseFloat(val) || 0;
    setFinalBillingAmount(String(Math.max(0, numTotal - numReturn)));
  };

  // Compress image to manageable size (max 1280px, ~150-250KB JPEG)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    const availableSlots = 10 - photos.length;
    if (availableSlots <= 0) {
      setError('Maximum 10 damage photos allowed per order.');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      setError(`Only added ${availableSlots} photos. Maximum limit is 10 photos.`);
    }

    setIsCompressing(true);
    try {
      const compressedList = await Promise.all(filesToProcess.map(compressImage));
      setPhotos((prev) => [...prev, ...compressedList]);
    } catch {
      setError('Failed to process one or more images. Please try again.');
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedOrderId = orderId.trim();
    if (!trimmedOrderId) {
      setError('Please enter a valid Order ID.');
      return;
    }

    const resolvedService =
      serviceType === 'Other / Custom Service'
        ? customService.trim() || 'Custom Service'
        : serviceType;

    const numTotalAmount = parseFloat(totalAmount) || 0;
    const numReturnAmount = parseFloat(returnAmount) || 0;
    const numFinalBilling = parseFloat(finalBillingAmount) || 0;

    // Validate any required custom fields
    if (config?.customFields) {
      for (const cf of config.customFields) {
        if (cf.isRequired && cf.isVisible !== false) {
          const val = customFieldValues[cf.key];
          if (val === undefined || val === null || val === '') {
            setError(`Please fill required custom field: ${cf.label}`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      await apiRequest<{ order: unknown; message: string }>(
        `/api/shops/${shopId}/special-damage-orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            orderDate,
            orderId: trimmedOrderId,
            serviceType: resolvedService,
            piecesCount: Number(piecesCount) || 1,
            totalAmount: numTotalAmount,
            returnPiecesCount: Number(returnPiecesCount) || 0,
            returnAmount: numReturnAmount,
            finalBillingAmount: numFinalBilling,
            returnReason: returnReason.trim() || null,
            damageReason: damageReason.trim() || null,
            notes: notes.trim() || null,
            photos,
            customFields: customFieldValues,
          }),
        }
      );

      // Reset form
      setOrderId('');
      setTotalAmount('');
      setReturnAmount('');
      setFinalBillingAmount('');
      setReturnReason('');
      setDamageReason('');
      setNotes('');
      setPhotos([]);
      setCustomFieldValues({});

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting damage order';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showFinancials =
    isFieldVisible('returnPiecesCount') ||
    isFieldVisible('totalAmount') ||
    isFieldVisible('returnAmount') ||
    isFieldVisible('finalBillingAmount');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-brand-forest/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-surface-card rounded-2xl sm:rounded-clay border border-border-subtle shadow-clay-lg p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shadow-sm">
              <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-brand-forest flex items-center gap-2">
                Special Damage Order
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Direct Entry
                </span>
              </h2>
              <p className="text-xs text-content-muted">
                Log customer return, garment damage details & billing adjustment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-surface-cream hover:bg-red-50 text-content-muted hover:text-red-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2 animate-shake">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Date & Order ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                {getFieldLabel('orderDate', 'Order Date')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-forest mb-1 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-brand-forest" />
                {getFieldLabel('orderId', 'Order ID')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. T4002"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-black uppercase rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
              />
            </div>
          </div>

          {/* Row 2: Service Type & Total Pieces */}
          {(isFieldVisible('serviceType') || isFieldVisible('piecesCount')) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isFieldVisible('serviceType') && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-brand-forest" />
                    {getFieldLabel('serviceType', 'Service Type')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                  >
                    {SERVICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {serviceType === 'Other / Custom Service' && (
                    <input
                      type="text"
                      placeholder="Specify service name..."
                      value={customService}
                      onChange={(e) => setCustomService(e.target.value)}
                      className="mt-2 w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white focus:ring-2 focus:ring-brand-forest focus:outline-none"
                    />
                  )}
                </div>
              )}

              {isFieldVisible('piecesCount') && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1">
                    {getFieldLabel('piecesCount', 'Total Pieces in Order')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={piecesCount}
                    onChange={(e) => setPiecesCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 3: Return Articles & Financials */}
          {showFinancials && (
            <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-border-subtle space-y-3">
              <h3 className="text-xs font-black uppercase text-brand-forest tracking-wider flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-brand-forest" />
                Return & Financial Adjustments
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {isFieldVisible('returnPiecesCount') && (
                  <div>
                    <label className="block text-[11px] font-bold text-content-muted mb-1">
                      {getFieldLabel('returnPiecesCount', 'Return Pieces')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={piecesCount}
                      value={returnPiecesCount}
                      onChange={(e) =>
                        setReturnPiecesCount(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                    />
                  </div>
                )}

                {isFieldVisible('totalAmount') && (
                  <div>
                    <label className="block text-[11px] font-bold text-content-muted mb-1">
                      {getFieldLabel('totalAmount', 'Total Amount (₹)')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="₹ 0.00"
                      value={totalAmount}
                      onChange={(e) => handleTotalAmountChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                    />
                  </div>
                )}

                {isFieldVisible('returnAmount') && (
                  <div>
                    <label className="block text-[11px] font-bold text-red-600 mb-1">
                      {getFieldLabel('returnAmount', 'Return Amount (₹)')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="₹ 0.00"
                      value={returnAmount}
                      onChange={(e) => handleReturnAmountChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-red-200 bg-red-50/50 text-red-700 focus:ring-2 focus:ring-red-400 focus:outline-none"
                    />
                  </div>
                )}

                {isFieldVisible('finalBillingAmount') && (
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                      {getFieldLabel('finalBillingAmount', 'Final Billing (₹)')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="₹ 0.00"
                      value={finalBillingAmount}
                      onChange={(e) => setFinalBillingAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50/50 text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Row 4: Reasons */}
          {(isFieldVisible('returnReason') || isFieldVisible('damageReason')) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isFieldVisible('returnReason') && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1 flex items-center justify-between">
                    <span>{getFieldLabel('returnReason', 'Return Article Reason (Why)')}</span>
                    <span className="text-[10px] text-content-muted font-normal">Customer side</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Why is article returned? e.g. Customer reported torn hem / color bleed..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary placeholder:text-content-muted/60 focus:ring-2 focus:ring-brand-forest focus:outline-none resize-none"
                  />
                </div>
              )}

              {isFieldVisible('damageReason') && (
                <div>
                  <label className="block text-xs font-bold text-brand-forest mb-1 flex items-center justify-between">
                    <span>{getFieldLabel('damageReason', 'Damage Reason (How)')}</span>
                    <span className="text-[10px] text-red-600 font-normal">Internal analysis</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="How did damage happen? e.g. Iron burn during steam press / chemical spot..."
                    value={damageReason}
                    onChange={(e) => setDamageReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary placeholder:text-content-muted/60 focus:ring-2 focus:ring-brand-forest focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 5: Dynamic Custom Fields (Configured by Owner) */}
          {config?.customFields &&
            config.customFields.filter((cf) => cf.isVisible !== false).length > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#F8FAF8] border border-border-subtle space-y-3">
                <h3 className="text-xs font-black uppercase text-brand-forest tracking-wider">
                  Additional Store Custom Fields
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {config.customFields
                    .filter((cf) => cf.isVisible !== false)
                    .map((cf) => (
                      <div key={cf.id || cf.key}>
                        <label className="block text-xs font-bold text-brand-forest mb-1">
                          {cf.label} {cf.isRequired && <span className="text-red-500">*</span>}
                        </label>

                        {cf.type === 'text' && (
                          <input
                            type="text"
                            required={cf.isRequired}
                            placeholder={`Enter ${cf.label}...`}
                            value={String(customFieldValues[cf.key] ?? '')}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({
                                ...prev,
                                [cf.key]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                          />
                        )}

                        {cf.type === 'textarea' && (
                          <textarea
                            rows={2}
                            required={cf.isRequired}
                            placeholder={`Enter ${cf.label}...`}
                            value={String(customFieldValues[cf.key] ?? '')}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({
                                ...prev,
                                [cf.key]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none resize-none"
                          />
                        )}

                        {cf.type === 'number' && (
                          <input
                            type="number"
                            required={cf.isRequired}
                            placeholder="0"
                            value={String(customFieldValues[cf.key] ?? '')}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({
                                ...prev,
                                [cf.key]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                          />
                        )}

                        {cf.type === 'select' && (
                          <select
                            required={cf.isRequired}
                            value={String(customFieldValues[cf.key] ?? '')}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({
                                ...prev,
                                [cf.key]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                          >
                            <option value="">-- Select {cf.label} --</option>
                            {cf.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {cf.type === 'date' && (
                          <input
                            type="date"
                            required={cf.isRequired}
                            value={String(customFieldValues[cf.key] ?? '')}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({
                                ...prev,
                                [cf.key]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-white text-content-primary focus:ring-2 focus:ring-brand-forest focus:outline-none"
                          />
                        )}

                        {cf.type === 'boolean' && (
                          <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs font-bold text-content-primary">
                            <input
                              type="checkbox"
                              checked={Boolean(customFieldValues[cf.key])}
                              onChange={(e) =>
                                setCustomFieldValues((prev) => ({
                                  ...prev,
                                  [cf.key]: e.target.checked,
                                }))
                              }
                              className="rounded text-brand-forest focus:ring-brand-forest w-4 h-4"
                            />
                            <span>Yes / Active</span>
                          </label>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Row 6: Damage Photos (Max 10) */}
          {isFieldVisible('photos') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-brand-forest flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-brand-forest" />
                  {getFieldLabel('photos', 'Proof & Damage Photos')}
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-brand-forest/10 text-brand-forest">
                    {photos.length}/10 photos
                  </span>
                </label>
                <span className="text-[10px] text-content-muted">Max 10 images</span>
              </div>

              {/* Photo Action Buttons */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />

                <button
                  type="button"
                  disabled={photos.length >= 10 || isCompressing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 py-2 px-3 rounded-xl border border-brand-forest/30 bg-brand-forest/5 hover:bg-brand-forest/10 text-brand-forest text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>Snap Camera</span>
                </button>

                <button
                  type="button"
                  disabled={photos.length >= 10 || isCompressing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2 px-3 rounded-xl border border-border-subtle bg-white hover:bg-surface-cream text-content-primary text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm"
                >
                  <Upload className="w-4 h-4 text-brand-forest" />
                  <span>Upload Photos</span>
                </button>
              </div>

              {isCompressing && (
                <div className="flex items-center gap-2 text-xs text-brand-forest font-bold p-2 bg-brand-forest/5 rounded-xl">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-forest" />
                  <span>Optimizing and compressing photos...</span>
                </div>
              )}

              {/* Thumbnail Gallery */}
              {photos.length > 0 && (
                <div className="grid grid-cols-5 sm:grid-cols-5 gap-2 pt-1">
                  {photos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl overflow-hidden aspect-square border border-border-subtle bg-black/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt={`Damage photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 shadow transition-transform active:scale-95"
                        title="Remove image"
                      >
                        <X className="w-3 h-3 stroke-[3]" />
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-content-muted hover:text-content-primary rounded-xl hover:bg-surface-cream transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isCompressing}
              className="px-5 py-2.5 text-xs font-black text-white bg-brand-forest hover:bg-brand-forest/90 active:scale-95 rounded-xl shadow-clay-sm flex items-center gap-2 transition-all disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recording Order...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Damage Order</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
