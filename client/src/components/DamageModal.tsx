'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { AlertTriangle, X, Camera, Check, RefreshCw, SwitchCamera, Upload } from 'lucide-react';

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

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

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

  // Live Camera states
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera stream cleanly
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraActive(false);
    setIsCameraStarting(false);
  }, []);

  // Start back camera stream
  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setError(null);
    setCameraError(null);
    setIsCameraStarting(true);
    stopCameraStream();

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode }, // Prioritize back camera for garment evidence
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        streamRef.current = stream;
        setIsLiveCameraActive(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } else {
        setCameraError('Live camera not supported on this browser. Please use native capture below.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to access back camera.';
      setCameraError(`${msg}. Please allow camera access or use photo upload.`);
      setIsLiveCameraActive(false);
    } finally {
      setIsCameraStarting(false);
    }
  }, [facingMode, stopCameraStream]);

  // Flip between rear and front camera
  const handleToggleCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await startLiveCamera(nextMode);
  };

  // Click / snap photo from live video stream
  const handleSnapEvidencePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw full unmirrored rear camera image
    ctx.drawImage(video, 0, 0, width, height);

    // High quality JPEG evidence
    const capturedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPhotoPreview(capturedDataUrl);
    stopCameraStream();
  };

  // Clean up camera on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setPhotoPreview(null);
      setNotes('');
      setError(null);
      setCameraError(null);
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, stopCameraStream]);

  if (!isOpen) return null;

  // Process uploaded or native-camera captured file with 10MB limit
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Image size exceeds 10MB limit. Please choose or capture an image under 10MB.');
      e.target.value = '';
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.88);
          setPhotoPreview(compressed);
        } else {
          setPhotoPreview(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
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
          photoPath: photoPreview || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-surface-card rounded-2xl border border-border-subtle shadow-clay-lg p-5 my-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-status-danger/10 text-status-danger border border-status-danger/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-brand-forest">Report Damage Evidence</h3>
              <p className="text-xs text-content-muted">
                {orderId ? `Order ${orderId}` : 'Incident'}{' '}
                {pieceNumber ? `— Piece #${pieceNumber}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-bold text-status-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-brand-forest mb-1.5">
              Damage Description / Reason <span className="text-status-danger">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Tear on left sleeve, stubborn chemical stain, missing button, burn mark..."
              rows={3}
              required
              className="w-full text-xs p-3 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lime"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-brand-forest">
                Damage Photo Evidence
              </label>
              <span className="text-[10px] font-bold text-content-muted">Max 10MB</span>
            </div>

            {/* LIVE CAMERA VIEWFINDER */}
            {isLiveCameraActive ? (
              <div className="relative rounded-2xl overflow-hidden bg-black border border-brand-forest aspect-[4/3] flex flex-col items-center justify-center shadow-clay">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />

                {/* Camera Overlay Header */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1.5 border border-white/20">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {facingMode === 'environment' ? 'Back Camera (Garment)' : 'Front Camera'}
                  </span>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button
                      type="button"
                      onClick={handleToggleCamera}
                      title="Switch Camera"
                      className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20 transition-all"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      title="Close Camera"
                      className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Targeting reticle / framing helper */}
                <div className="absolute inset-8 border border-white/30 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-brand-lime absolute top-0 left-0" />
                  <div className="w-8 h-8 border-t-2 border-r-2 border-brand-lime absolute top-0 right-0" />
                  <div className="w-8 h-8 border-b-2 border-l-2 border-brand-lime absolute bottom-0 left-0" />
                  <div className="w-8 h-8 border-b-2 border-r-2 border-brand-lime absolute bottom-0 right-0" />
                  <p className="text-[11px] font-bold text-white/70 bg-black/50 px-2 py-0.5 rounded-md pointer-events-none">
                    Point camera at damaged area
                  </p>
                </div>

                {/* Shutter / Capture Button */}
                <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center z-10">
                  <button
                    type="button"
                    onClick={handleSnapEvidencePhoto}
                    className="px-5 py-2.5 rounded-full bg-brand-lime text-brand-forest font-black text-xs shadow-clay-lg flex items-center gap-2 hover:scale-105 active:scale-95 transition-all border border-brand-forest/20"
                  >
                    <Camera className="w-4 h-4 text-brand-forest stroke-[2.5]" />
                    <span>Click Evidence Photo</span>
                  </button>
                </div>
              </div>
            ) : photoPreview ? (
              /* CAPTURED PHOTO PREVIEW */
              <div className="space-y-2">
                <div className="relative rounded-2xl overflow-hidden border border-border-subtle shadow-clay h-48 bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Damage Evidence Photo"
                    className="w-full h-full object-contain bg-black/10"
                  />
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-emerald-700/80 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    Evidence Photo Captured
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    title="Remove Photo"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startLiveCamera('environment')}
                    className="flex-1 py-2 rounded-xl bg-surface-cream border border-border-subtle text-brand-forest text-xs font-bold hover:bg-surface-hover flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-brand-forest" />
                    <span>Retake with Back Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="px-3 py-2 rounded-xl text-status-danger hover:bg-status-danger/10 text-xs font-bold transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              /* CAMERA & PHOTO PICKER SELECTION */
              <div className="space-y-2">
                {cameraError && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
                    {cameraError}
                  </p>
                )}

                {/* Primary: Direct Live Back Camera Button */}
                <button
                  type="button"
                  onClick={() => startLiveCamera('environment')}
                  disabled={isCameraStarting}
                  className="w-full p-4 rounded-2xl bg-brand-forest hover:bg-brand-forest/90 active:scale-[0.99] text-white font-black text-xs shadow-clay flex items-center justify-center gap-2.5 transition-all"
                >
                  <Camera className="w-5 h-5 text-brand-lime stroke-[2.5]" />
                  <span>
                    {isCameraStarting ? 'Opening Back Camera...' : 'Open Back Camera to Click Photo'}
                  </span>
                </button>

                {/* Secondary: Native Camera or File Upload (Up to 10MB) */}
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-content-muted hover:text-brand-forest font-semibold flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-surface-cream transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Or choose file / native camera (up to 10MB)</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border-subtle text-content-muted hover:bg-surface-hover text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-brand-forest hover:bg-brand-forest/90 text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
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
