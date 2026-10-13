'use client';

import React from 'react';

interface ProgressRingProps {
  percentage: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export function ProgressRing({
  percentage,
  size = 110,
  strokeWidth = 10,
  label = 'Completed',
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safePercent = percentage === null ? 0 : Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (safePercent / 100) * circumference;

  return (
    <div className="flex items-center gap-4 bg-surface-card p-4 rounded-clay border border-border-subtle shadow-clay">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {/* Clay inset backdrop */}
        <div
          className="absolute inset-1.5 rounded-full clay-inset"
          style={{ width: size - 12, height: size - 12 }}
        />
        <svg width={size} height={size} className="rotate-[-90deg] relative z-10">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E4E4D8"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#limeGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="limeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9CE035" />
              <stop offset="100%" stopColor="#76B022" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-20">
          <span className="text-xl font-extrabold text-brand-forest tracking-tight">
            {percentage !== null ? `${safePercent}%` : '--'}
          </span>
        </div>
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-bold text-brand-forest">{label}</h4>
        {sublabel && <p className="text-xs text-content-muted mt-0.5">{sublabel}</p>}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-lime"></span>
          <span className="text-[11px] font-semibold text-brand-forest">
            {percentage !== null && percentage === 100
              ? 'Shift Target Achieved 🎉'
              : 'Active Shift Progress'}
          </span>
        </div>
      </div>
    </div>
  );
}
