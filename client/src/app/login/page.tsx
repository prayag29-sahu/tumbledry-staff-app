'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const account = await login(username.trim().toLowerCase(), password);

      // Route based on role/permissions
      if (account.isOwner) {
        router.push('/owner');
      } else {
        const firstMembership = account.shopMemberships?.[0];
        const role = (firstMembership?.roleName || '').toLowerCase();
        const pos = (firstMembership?.positionCategory || '').toLowerCase();

        if (role.includes('supervisor') || pos.includes('supervisor')) router.push('/supervisor');
        else if (role.includes('manager') || pos.includes('manager')) router.push('/manager');
        else if (pos.includes('washer') || role.includes('washer')) router.push('/washerman');
        else if (pos.includes('iron') || role.includes('iron')) router.push('/ironman');
        else if (pos.includes('deliver') || role.includes('deliver')) router.push('/delivery');
        else router.push('/washerman');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid username or password.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-6 px-2">
      <div className="w-full max-w-sm">
        {/* Brand Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-lime to-[#6DA322] items-center justify-center shadow-clay border border-white/60 mb-3">
            <span className="text-white font-black text-2xl tracking-wider">TD</span>
          </div>
          <h2 className="text-2xl font-extrabold text-brand-forest tracking-tight">
            Tumbledry Operations
          </h2>
          <p className="text-xs text-content-muted mt-1">
            Sign in to access your shop workspace
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-xs font-semibold text-status-danger text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-brand-forest uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoCapitalize="none"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lime font-medium"
                />
                <User className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-forest uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-cream border border-border-subtle shadow-clay-inset text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lime font-medium"
                />
                <Lock className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-brand-forest"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl clay-btn-forest text-sm font-bold flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Informational note */}
        <p className="text-center text-[11px] text-content-muted mt-6">
          Multi-tenant secure authentication with encrypted sessions.
        </p>
      </div>
    </div>
  );
}
