'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import {
  ClipboardList,
  Camera,
  User,
  Users,
  Building,
  CheckCircle2,
  Shield,
  Layers,
} from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();
  const { user, activeRole } = useAuth();

  if (!user || pathname === '/login') return null;

  // Build role-appropriate navigation
  const navItems = [];

  if (user.isOwner) {
    navItems.push(
      { label: 'Owner Panel', href: '/owner', icon: Shield },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else if (activeRole === 'Supervisor') {
    navItems.push(
      { label: 'Overview', href: '/supervisor', icon: Users },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else if (activeRole === 'Manager') {
    navItems.push(
      { label: 'Tasks', href: '/manager', icon: ClipboardList },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else if (activeRole === 'Washerman') {
    navItems.push(
      { label: 'Wash Tasks', href: '/washerman', icon: Layers },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else if (activeRole === 'Ironman') {
    navItems.push(
      { label: 'Iron Tasks', href: '/ironman', icon: CheckCircle2 },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else if (activeRole === 'Delivery Boy') {
    navItems.push(
      { label: 'Deliveries', href: '/delivery', icon: Building },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  } else {
    navItems.push(
      { label: 'Home', href: '/', icon: ClipboardList },
      { label: 'Attendance', href: '/attendance', icon: Camera },
      { label: 'Profile', href: '/profile', icon: User }
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF7]/95 backdrop-blur-md border-t border-[#E4E4D8]/80 shadow-[0_-4px_12px_rgba(37,75,50,0.05)] px-4 py-2">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-2xl transition-all ${
                isActive
                  ? 'text-brand-lime font-bold scale-105'
                  : 'text-content-muted hover:text-brand-forest font-medium'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-brand-lime/15 shadow-clay-sm text-brand-forest'
                    : 'bg-transparent text-content-muted'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              </div>
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
