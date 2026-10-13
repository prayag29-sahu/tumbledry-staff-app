/**
 * Tumbledry API Client
 * Automatically sends cookies (credentials: 'include') and attaches headers.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    // Attempt automatic refresh
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAccessToken(refreshData.accessToken);
        headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        const retryRes = await fetch(endpoint, { ...options, headers, credentials: 'include' });
        if (!retryRes.ok) {
          const errData = await retryRes.json().catch(() => ({}));
          throw new ApiError(retryRes.status, errData.error?.code || 'ERROR', errData.error?.message || 'Request failed');
        }
        return retryRes.json() as Promise<T>;
      }
    } catch {
      // Refresh failed, let the original 401 throw
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
