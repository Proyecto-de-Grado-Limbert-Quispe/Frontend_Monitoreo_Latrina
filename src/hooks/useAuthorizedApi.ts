import { useCallback, useMemo } from 'react';
import { useAuth } from 'src/context/AuthContext';

const resolveApiBaseUrl = (): string => {
  const env = (import.meta.env as unknown as Record<string, string | undefined>)?.VITE_API_BASE_URL;
  if (env) {
    return env.replace(/\/$/, '');
  }
  //return 'https://includes-conferences-went-showing.trycloudflare.com';
  return 'http://localhost:8080';
};

const isAbsoluteUrl = (value: string): boolean => /^(?:https?:)?\/\//i.test(value);

const joinUrl = (base: string, path: string): string => {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const ensureAuthHeaders = (headers: Headers, token: string): Headers => {
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return headers;
};

export const useAuthorizedApi = () => {
  const { auth } = useAuth();
  const baseUrl = useMemo(() => resolveApiBaseUrl(), []);

  const token = auth.token;

  const buildUrl = useCallback(
    (path: string) => joinUrl(baseUrl, path),
    [baseUrl],
  );

  const withAuthInit = useCallback(
    (init?: RequestInit): RequestInit | null => {
      if (!token) {
        return null;
      }

      const headers = ensureAuthHeaders(new Headers(init?.headers ?? {}), token);

      return {
        ...init,
        headers,
      };
    },
    [token],
  );

  const authorizedFetch = useCallback(
    (path: string, init?: RequestInit) => {
      const options = withAuthInit(init);
      if (!options) {
        return Promise.reject(new Error('No auth token available for API request.'));
      }
      return fetch(buildUrl(path), options);
    },
    [buildUrl, withAuthInit],
  );

  return useMemo(
    () => ({
      token,
      buildUrl,
      authorizedFetch,
      withAuthInit,
    }),
    [token, buildUrl, authorizedFetch, withAuthInit],
  );
};

export type UseAuthorizedApi = ReturnType<typeof useAuthorizedApi>;
