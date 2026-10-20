'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { Building2, ChevronDown, User, ShieldCheck, Download } from 'lucide-react';
import { Logo } from './Logo';
import { usePwa } from './PwaProvider';

export function Header() {
  const { user, activeShopId, activeRole, setActiveShopId } = useAuth();
  const { isInstallable, isStandalone, promptInstall } = usePwa();

  const pathname = usePathname();
  if (!user || pathname === '/login' || pathname === '/supervisor' || pathname === '/manager') return null;

  const memberships = user.shopMemberships || [];
  const currentShop = memberships.find((m) => m.shopId === activeShopId);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FFFDF7]/90 backdrop-blur-md border-b border-[#E4E4D8]/80 shadow-sm px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Brand & Active Role */}
        <Link href="/" className="flex items-center gap-3">
          <Logo size="md" showWordmark={false} />
          <div className="pl-2.5 border-l border-border-subtle/80 flex flex-col justify-center">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-lime animate-pulse"></span>
              <span className="text-xs font-black text-brand-forest uppercase tracking-wider">
                {activeRole}
              </span>
            </div>
          </div>
        </Link>

        {/* Shop Switcher & Profile link */}
        <div className="flex items-center gap-2">
          {memberships.length > 1 ? (
            <div className="relative">
              <select
                value={activeShopId || ''}
                onChange={(e) => setActiveShopId(e.target.value)}
                className="appearance-none bg-surface-cream border border-border-subtle text-xs font-semibold text-brand-forest rounded-xl pl-8 pr-7 py-1.5 shadow-clay-sm focus:outline-none focus:ring-2 focus:ring-brand-lime cursor-pointer"
              >
                {memberships.map((m) => (
                  <option key={m.shopId} value={m.shopId}>
                    {m.shopName}
                  </option>
                ))}
              </select>
              <Building2 className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3 h-3 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : currentShop ? (
            <div className="flex items-center gap-1.5 bg-surface-cream px-2.5 py-1 rounded-xl border border-border-subtle shadow-clay-sm text-xs font-medium text-brand-forest">
              <Building2 className="w-3.5 h-3.5 text-brand-forest/70" />
              <span className="truncate max-w-[120px]">{currentShop.shopName}</span>
            </div>
          ) : null}

          {/* PWA Install Button */}
          {isInstallable && !isStandalone && (
            <button
              onClick={promptInstall}
              type="button"
              className="px-2.5 py-1.5 rounded-xl bg-brand-lime hover:bg-[#96d63d] text-brand-forest font-black text-xs flex items-center gap-1.5 shadow-clay-sm transition-all"
              title="Install App on Device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {/* Profile link */}
          <Link
            href="/profile"
            className="w-8 h-8 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-sm flex items-center justify-center text-brand-forest hover:bg-surface-hover transition-colors"
            title="Profile & Settings"
          >
            {user.isOwner ? (
              <ShieldCheck className="w-4 h-4 text-brand-lime" />
            ) : (
              <User className="w-4 h-4 text-brand-forest" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
