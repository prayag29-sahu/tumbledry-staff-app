'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, activeRole, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.isOwner) {
      router.replace('/owner');
    } else if (activeRole === 'Supervisor') {
      router.replace('/supervisor');
    } else if (activeRole === 'Manager') {
      router.replace('/manager');
    } else if (activeRole === 'Washerman') {
      router.replace('/washerman');
    } else if (activeRole === 'Ironman') {
      router.replace('/ironman');
    } else if (activeRole === 'Delivery Boy') {
      router.replace('/delivery');
    } else {
      router.replace('/washerman');
    }
  }, [user, activeRole, isLoading, router]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-brand-lime/20 flex items-center justify-center animate-pulse">
        <div className="w-6 h-6 rounded-xl bg-brand-lime"></div>
      </div>
      <p className="text-xs font-semibold text-content-muted mt-3">
        Loading Tumbledry workspace...
      </p>
    </div>
  );
}
