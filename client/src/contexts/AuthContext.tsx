'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AccountSession } from '../types';
import { apiRequest, setAccessToken, setRefreshToken, getRefreshToken } from '../lib/api';

interface AuthContextType {
  user: AccountSession | null;
  activeShopId: string | null;
  activeShopName: string | null;
  activeRole: string;
  isLoading: boolean;
  setActiveShopId: (shopId: string) => void;
  login: (username: string, password: string) => Promise<AccountSession>;
  logout: () => Promise<void>;
  hasCapability: (capability: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountSession | null>(null);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount via refresh token cookie or local storage
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedRefreshToken = getRefreshToken();
        const refreshData = await apiRequest<{ accessToken: string; refreshToken?: string }>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });
        if (refreshData.accessToken) {
          setAccessToken(refreshData.accessToken);
          if (refreshData.refreshToken) {
            setRefreshToken(refreshData.refreshToken);
          }
          // Try fetching fresh profile from /api/auth/me
          try {
            const meData = await apiRequest<{ account: AccountSession }>('/api/auth/me');
            if (meData?.account) {
              const account = meData.account;
              setUser(account);
              localStorage.setItem('td_user', JSON.stringify(account));
              const savedShop = localStorage.getItem('td_active_shop');
              const memberships = account.shopMemberships || [];
              if (savedShop && memberships.some((m) => m.shopId === savedShop)) {
                setActiveShopId(savedShop);
              } else if (memberships[0]) {
                setActiveShopId(memberships[0].shopId);
              }
              return;
            }
          } catch {
            // Fallback to localStorage if /api/auth/me fails
          }

          const storedUser = localStorage.getItem('td_user');
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setUser(parsed);
            const savedShop = localStorage.getItem('td_active_shop');
            const memberships = parsed.shopMemberships || [];
            if (savedShop && memberships.some((m: { shopId: string }) => m.shopId === savedShop)) {
              setActiveShopId(savedShop);
            } else if (memberships[0]) {
              setActiveShopId(memberships[0].shopId);
            }
          }
        }
      } catch {
        // Not authenticated
        localStorage.removeItem('td_user');
        setRefreshToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  const handleSetActiveShopId = (shopId: string) => {
    setActiveShopId(shopId);
    localStorage.setItem('td_active_shop', shopId);
  };

  const login = async (username: string, password: string): Promise<AccountSession> => {
    const data = await apiRequest<{ accessToken: string; refreshToken?: string; account: AccountSession }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    setAccessToken(data.accessToken);
    if (data.refreshToken) {
      setRefreshToken(data.refreshToken);
    }
    setUser(data.account);
    localStorage.setItem('td_user', JSON.stringify(data.account));

    const memberships = data.account.shopMemberships || [];
    const defaultShop = memberships[0]?.shopId || null;
    setActiveShopId(defaultShop);
    if (defaultShop) {
      localStorage.setItem('td_active_shop', defaultShop);
    }

    return data.account;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
      setActiveShopId(null);
      localStorage.removeItem('td_user');
      localStorage.removeItem('td_active_shop');
    }
  };

  // Determine effective role in active shop with safe optional chaining
  const memberships = user?.shopMemberships || [];
  const currentMembership = memberships.find((m) => m.shopId === activeShopId);
  const activeShopName = currentMembership?.shopName || null;
  let activeRole = 'Staff';
  if (user?.isOwner) {
    activeRole = 'Owner';
  } else if (currentMembership) {
    const roleName = (currentMembership.roleName || '').toLowerCase();
    const posName = (currentMembership.positionCategory || '').toLowerCase();
    if (roleName.includes('supervisor') || posName.includes('supervisor')) activeRole = 'Supervisor';
    else if (roleName.includes('manager') || posName.includes('manager')) activeRole = 'Manager';
    else if (posName.includes('washer') || roleName.includes('washer')) activeRole = 'Washerman';
    else if (posName.includes('iron') || roleName.includes('iron')) activeRole = 'Ironman';
    else if (posName.includes('deliver') || roleName.includes('deliver')) activeRole = 'Delivery Boy';
    else activeRole = currentMembership.roleName;
  }

  const hasCapability = (capability: string): boolean => {
    if (user?.isOwner) return true;
    return currentMembership?.capabilities?.includes(capability) || false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeShopId,
        activeShopName,
        activeRole,
        isLoading,
        setActiveShopId: handleSetActiveShopId,
        login,
        logout,
        hasCapability,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
