'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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

function BottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get('view');
  const { user, activeRole } = useAuth();

  if (!user || pathname === '/login' || pathname === '/supervisor' || pathname === '/manager') return null;

  // Build role-appropriate navigation
  const navItems = [];

  if (user.isOwner) {
    navItems.push(
      { label: 'Dashboard', href: '/owner', icon: Shield, id: 'admin' },
      // Workforce & Live Tasks rendered the same owner page — hidden for now.
      // { label: 'Workforce', href: '/owner?view=workforce', icon: Users, id: 'workforce' },
      // { label: 'Live Tasks', href: '/owner?view=tasks', icon: ClipboardList, id: 'tasks' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else if (activeRole === 'Supervisor') {
    navItems.push(
      { label: 'Overview', href: '/supervisor', icon: Users, id: 'overview' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else if (activeRole === 'Manager') {
    navItems.push(
      { label: 'Tasks', href: '/manager', icon: ClipboardList, id: 'tasks' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else if (activeRole === 'Washerman') {
    navItems.push(
      { label: 'Wash Tasks', href: '/washerman', icon: Layers, id: 'wash' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else if (activeRole === 'Ironman') {
    navItems.push(
      { label: 'Iron Tasks', href: '/ironman', icon: CheckCircle2, id: 'iron' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else if (activeRole === 'Delivery Boy') {
    navItems.push(
      { label: 'Deliveries', href: '/delivery', icon: Building, id: 'deliver' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  } else {
    navItems.push(
      { label: 'Home', href: '/', icon: ClipboardList, id: 'home' },
      { label: 'Attendance', href: '/attendance', icon: Camera, id: 'attendance' },
      { label: 'Profile', href: '/profile', icon: User, id: 'profile' }
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF7]/95 backdrop-blur-md border-t border-[#E4E4D8]/80 shadow-[0_-4px_12px_rgba(37,75,50,0.05)] px-4 py-2">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          let isActive = false;
          if (user.isOwner) {
            if (item.id === 'admin') {
              isActive = pathname === '/owner';
            } else if (item.id === 'workforce') {
              isActive = pathname === '/owner' && currentView === 'workforce';
            } else if (item.id === 'tasks') {
              isActive = pathname === '/owner' && currentView === 'tasks';
            } else if (item.id === 'profile') {
              isActive = pathname === '/profile';
            }
          } else {
            isActive = pathname === item.href;
          }

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

export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
