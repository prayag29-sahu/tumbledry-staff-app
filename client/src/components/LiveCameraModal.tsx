'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photoDataUrl: string) => Promise<void> | void;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
}

export function LiveCameraModal({
  isOpen,
  onClose,
  onCapture,
  title = 'Live Selfie Attendance',
  subtitle = 'Please capture a clear live photo to verify your attendance shift',
  actionLabel = 'Confirm Attendance',
}: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const [hasCameraStream, setHasCameraStream] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Stop camera tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setHasCameraStream(false);
  }, []);

  // Start live webcam / front camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    stopStream();

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user', // Front camera for selfie
              width: { ideal: 640 },
              height: { ideal: 640 },
            },
            audio: false,
          });
        } catch {
          // Fallback to basic user camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setHasCameraStream(true);
      } else {
        setCameraError('Webcam direct stream not supported. Please use the native camera button below.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera permission denied or unavailable.';
      setCameraError(`${msg} Tap below to open your camera.`);
      setHasCameraStream(false);
    }
  }, [stopStream]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
      setCapturedPhoto(null);
      setCameraError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  if (!isOpen) return null;

  // Snap photo from live video feed
  const handleSnapFromVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth || 640, video.videoHeight || 640);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Center crop square
    const sx = ((video.videoWidth || size) - size) / 2;
    const sy = ((video.videoHeight || size) - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    const compressed = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedPhoto(compressed);
    stopStream();
  };

  // Direct camera fallback input handler
  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
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
          setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.82));
        } else {
          setCapturedPhoto(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!capturedPhoto) return;
    setIsProcessing(true);
    try {
      await onCapture(capturedPhoto);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-forest/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-lime text-brand-forest shadow-clay-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-brand-forest">{title}</h3>
              <p className="text-[11px] text-content-muted leading-tight">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-surface-cream text-content-muted hover:text-brand-forest"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Window */}
        <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden border-2 border-brand-forest/20 shadow-clay-inset flex items-center justify-center">
          {capturedPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedPhoto}
              alt="Live Attendance Selfie"
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && streamRef.current && el.srcObject !== streamRef.current) {
                    el.srcObject = streamRef.current;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                className={`w-full h-full object-cover transition-opacity ${
                  hasCameraStream ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Viewfinder Overlay Guides */}
              {hasCameraStream && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4">
                  <div className="px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Camera Active</span>
                  </div>
                  <div className="w-48 h-48 rounded-full border-2 border-dashed border-white/60 shadow-lg" />
                  <span className="text-[10px] text-white/80 font-bold bg-black/40 px-2 py-0.5 rounded-md">
                    Position your face within the circle
                  </span>
                </div>
              )}

              {/* Fallback button if live stream not supported or denied */}
              {!hasCameraStream && (
                <div className="p-4 text-center space-y-3">
                  <Camera className="w-10 h-10 text-white/40 mx-auto" />
                  <p className="text-xs text-white/80 font-medium">
                    {cameraError || 'Initializing device camera...'}
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white text-xs font-black shadow-clay cursor-pointer hover:opacity-95">
                    <Camera className="w-4 h-4" />
                    <span>Open Camera Live</span>
                    <input
                      ref={fallbackInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handleNativeCameraCapture}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="space-y-2">
          {capturedPhoto ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCapturedPhoto(null);
                  startCamera();
                }}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-surface-cream border border-border-subtle text-content-primary font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-hover"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white font-black text-xs shadow-clay flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 stroke-[3]" />
                )}
                <span>{isProcessing ? 'Verifying...' : actionLabel}</span>
              </button>
            </div>
          ) : (
            hasCameraStream && (
              <button
                type="button"
                onClick={handleSnapFromVideo}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white font-black text-xs shadow-clay flex items-center justify-center gap-2 hover:opacity-95"
              >
                <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
                <span>Snap Live Photo</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
