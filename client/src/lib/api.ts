/**
 * Tumbledry API Client
 * Automatically sends cookies (credentials: 'include') and attaches headers.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('td_access_token', token);
    } else {
      localStorage.removeItem('td_access_token');
    }
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem('td_access_token');
  }
  return accessToken;
}

let refreshToken: string | null = null;

export function setRefreshToken(token: string | null): void {
  refreshToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('td_refresh_token', token);
    } else {
      localStorage.removeItem('td_refresh_token');
    }
  }
}

export function getRefreshToken(): string | null {
  if (!refreshToken && typeof window !== 'undefined') {
    refreshToken = localStorage.getItem('td_refresh_token');
  }
  return refreshToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let activeRefreshPromise: Promise<string | null> | null = null;

async function doRefreshAccessToken(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const storedRefreshToken = getRefreshToken();
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData?.accessToken) {
          setAccessToken(refreshData.accessToken);
          if (refreshData?.refreshToken) {
            setRefreshToken(refreshData.refreshToken);
          }
          return refreshData.accessToken as string;
        }
      }
      // If refresh fails with 401/403, clear tokens and redirect to login if not already on login page
      setAccessToken(null);
      setRefreshToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      return null;
    } catch {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    // Attempt automatic single-flight refresh
    const newAccessToken = await doRefreshAccessToken();
    if (newAccessToken) {
      headers.set('Authorization', `Bearer ${newAccessToken}`);
      const retryRes = await fetch(endpoint, { ...options, headers, credentials: 'include' });
      if (retryRes.ok) {
        return retryRes.json() as Promise<T>;
      }
      const errData = await retryRes.json().catch(() => ({}));
      throw new ApiError(retryRes.status, errData.error?.code || 'ERROR', errData.error?.message || 'Request failed');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.error?.code || 'UNKNOWN_ERROR',
      errorData.error?.message || response.statusText || 'An error occurred'
    );
  }

  return response.json() as Promise<T>;
}
