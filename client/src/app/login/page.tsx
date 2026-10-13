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
        else router.push('/supervisor');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid username or password.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-6 px-3">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Banner matching Screen 1 */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <h1 className="text-3xl font-black text-brand-forest tracking-tight flex items-baseline">
              <span>tumble</span>
              <span className="text-[#84C42C] relative">
                d<span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-xs font-bold">..</span>
              </span>
              <span>ry</span>
            </h1>
          </div>
          <p className="text-[11px] font-extrabold tracking-[0.25em] text-[#B88728] uppercase">
            LAUNDRY | DRY CLEAN
          </p>
        </div>

        {/* Login Card matching Screen 1 */}
        <div className="bg-surface-card rounded-[28px] border border-border-subtle shadow-clay-lg p-6 sm:p-7 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-black text-brand-forest">
              Workforce & Admin Login
            </h2>
            <p className="text-xs text-content-muted mt-0.5">
              Sign in with your Owner, Supervisor, or Staff credentials
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 text-center animate-fade-in">
                {error}
              </div>
            )}

            <div>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username (e.g. owner or supervisor01)"
                  required
                  autoCapitalize="none"
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-forest font-semibold placeholder:text-content-muted/60"
                />
                <User className="w-4 h-4 text-content-muted absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-11 pr-11 py-3 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-forest font-semibold placeholder:text-content-muted/60 tracking-wider"
                />
                <Lock className="w-4 h-4 text-content-muted absolute left-4 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted hover:text-brand-forest transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#245431] to-[#3B7A49] text-white shadow-clay text-sm font-black flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition-all"
            >
              {isLoading ? (
                <span>Logging in...</span>
              ) : (
                <>
                  <span>Login</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => alert('Please contact your Store Owner to reset your account password.')}
                className="text-xs font-bold text-content-muted hover:text-brand-forest transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </div>

        {/* Informational note */}
        <p className="text-center text-[11px] text-content-muted font-medium">
          Authorized workforce terminal • Encrypted multi-tenant session
        </p>
      </div>
    </div>
  );
}
