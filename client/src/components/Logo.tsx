'use client';

import React, { useState } from 'react';

interface LogoProps {
  /** Size variant: sm (28px), md (36px), lg (48px), xl (64px) */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to show text alongside the icon */
  showWordmark?: boolean;
  /** Custom class for the wrapper */
  className?: string;
  /** Custom logo source path (default: /logo.png or /logo.svg) */
  src?: string;
  /** Alt text */
  alt?: string;
}

export function Logo({
  size = 'md',
  showWordmark = true,
  className = '',
  src,
  alt = 'Tumbledry Logo',
}: LogoProps) {
  // If custom src provided, use it; otherwise start with /logo.png, fallback to /logo.svg, then badge
  const [currentSrc, setCurrentSrc] = useState(src || '/logo.png');
  const [hasError, setHasError] = useState(false);

  const handleImageError = () => {
    if (currentSrc === '/logo.png') {
      setCurrentSrc('/logo.svg');
    } else {
      setHasError(true);
    }
  };

  const sizeMap = {
    sm: { icon: 'w-7 h-7 text-xs', height: 28, text: 'text-sm' },
    md: { icon: 'w-9 h-9 text-base', height: 36, text: 'text-base' },
    lg: { icon: 'w-14 h-14 text-2xl', height: 56, text: 'text-2xl' },
    xl: { icon: 'w-20 h-20 text-4xl', height: 80, text: 'text-3xl' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Logo Image or Stylish Fallback */}
      {!hasError ? (
        <div className={`relative ${currentSize.icon} shrink-0 flex items-center justify-center`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentSrc}
            alt={alt}
            onError={handleImageError}
            className="w-full h-full object-contain drop-shadow-sm"
          />
        </div>
      ) : (
        /* Fallback SVG / Styled Brand Badge if image is not yet uploaded */
        <div
          className={`${currentSize.icon} shrink-0 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] flex items-center justify-center shadow-clay-sm border border-white/50 text-white font-black tracking-wider`}
        >
          <span>T</span>
        </div>
      )}

      {/* Brand Wordmark (Optional) */}
      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <span className={`${currentSize.text} font-black text-brand-forest tracking-tight flex items-baseline`}>
            <span>tumble</span>
            <span className="text-[#84C42C] relative">
              d<span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold">..</span>
            </span>
            <span>ry</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default Logo;
