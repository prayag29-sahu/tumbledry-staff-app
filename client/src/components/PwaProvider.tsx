'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaContextType {
  isInstallable: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<void>;
}

const PwaContext = createContext<PwaContextType>({
  isInstallable: false,
  isStandalone: false,
  promptInstall: async () => {},
});

export function usePwa() {
  return useContext(PwaContext);
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // 1. Detect if already installed/running as standalone PWA
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);

    // 2. Register Service Worker with Auto-Update checks
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered with scope:', registration.scope);
            registration.update().catch(() => {});
            // Periodic check every 30 mins
            setInterval(() => {
              registration.update().catch(() => {});
            }, 30 * 60 * 1000);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration skipped/failed:', err);
          });
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }

      const handleFocus = () => {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => {}));
      };
      window.addEventListener('focus', handleFocus);
    }

    // 3. Capture beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Check if user dismissed banner recently
      const dismissed = sessionStorage.getItem('tumbledry_pwa_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 4. Listen for appinstalled
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
      setIsStandalone(true);
      console.log('[PWA] Tumbledry App successfully installed!');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      alert('To install, tap your browser menu (⋮) and select "Add to Home screen" or "Install App".');
      return;
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      setShowBanner(false);
      setDeferredPrompt(null);
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem('tumbledry_pwa_dismissed', 'true');
  };

  return (
    <PwaContext.Provider
      value={{
        isInstallable: !!deferredPrompt,
        isStandalone,
        promptInstall,
      }}
    >
      {children}

      {/* Floating PWA Install Prompt Banner */}
      {showBanner && !isStandalone && (
        <div className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-50 animate-slide-up">
          <div className="bg-[#245431] text-white p-3.5 rounded-2xl shadow-clay-lg border border-white/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-192.png"
                alt="Tumbledry Icon"
                className="w-11 h-11 rounded-xl shadow-md border border-white/20 object-contain bg-white shrink-0 p-0.5"
              />
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white leading-tight truncate">
                  Install Tumbledry App
                </h4>
                <p className="text-[11px] text-white/80 font-medium line-clamp-1">
                  Add to home screen for 1-tap fast access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={promptInstall}
                className="px-3 py-1.5 rounded-xl bg-brand-lime hover:bg-[#96d63d] text-brand-forest text-xs font-black flex items-center gap-1 shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                type="button"
                onClick={dismissBanner}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

export default PwaProvider;
