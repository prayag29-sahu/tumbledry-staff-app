'use client';

import React from 'react';
import { LogOut, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onCancel: () => void;
  onConfirmExit: () => void;
}

export function ExitConfirmModal({ isOpen, onCancel, onConfirmExit }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm border border-border-subtle shadow-2xl p-5 space-y-4 animate-scale-up">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-forest text-brand-lime font-black flex items-center justify-center text-base shadow-sm">
              T
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-forest">Exit Tumbledry App</h3>
              <p className="text-[10px] text-content-muted">Confirmation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-xl bg-surface-cream text-content-muted hover:text-brand-forest flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-content-default font-medium leading-relaxed">
          Are you sure you want to exit the application? Your active operations and session are safely saved.
        </p>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 rounded-xl bg-surface-cream border border-border-subtle text-xs font-bold text-brand-forest hover:bg-surface-hover transition-colors"
          >
            Stay in App
          </button>
          <button
            type="button"
            onClick={onConfirmExit}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-800 to-red-950 text-white text-xs font-black shadow-clay flex items-center justify-center gap-1.5 hover:opacity-95 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Yes, Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
