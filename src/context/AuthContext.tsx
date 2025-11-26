import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import router from '../routes/Router';

interface AuthState {
  token: string | null;
  roleId: number | null;
  roleName: 'administrador' | 'conductor' | null;
  userId: number | null;
  isAuthenticated: boolean;
}

interface AuthContextValue {
  auth: AuthState;
  setAuthFromToken: (token: string) => void;
  clearAuth: () => void;
}

const defaultAuthState: AuthState = {
  token: null,
  roleId: null,
  roleName: null,
  userId: null,
  isAuthenticated: false,
};

const STORAGE_KEYS = {
  token: 'authToken',
  roleId: 'roleId',
  role: 'role',
  roleAlt: 'rol',
  userId: 'userId',
};

const ROLE_NAME: Record<number, AuthState['roleName']> = {
  2: 'administrador',
  104: 'conductor',
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const [, payloadPart] = token.split('.');
    if (!payloadPart) {
      return null;
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Unable to decode JWT payload', error);
    return null;
  }
};

const extractTokenFromLocation = (location: Location): string | null => {
  const matchFromSearch = location.search?.match(/(?:[?&])token=([^&]+)/i);
  if (matchFromSearch?.[1]) {
    return decodeURIComponent(matchFromSearch[1]);
  }
  const matchFromHash = location.hash?.match(/(?:[#&])token=([^&]+)/i);
  if (matchFromHash?.[1]) {
    return decodeURIComponent(matchFromHash[1]);
  }
  return null;
};

const getLandingPath = (roleId: number | null): string => {
  switch (roleId) {
    case 2:
      return '/menu/reportes';
    case 104:
      return '/menu/entregas';
    default:
      return '/inicio';
  }
};

const parseAsNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const loadPersistedAuth = (): AuthState => {
  if (typeof window === 'undefined') {
    return defaultAuthState;
  }
  const token = localStorage.getItem(STORAGE_KEYS.token);
  const roleId = parseAsNumber(localStorage.getItem(STORAGE_KEYS.roleId));
  const userId = parseAsNumber(localStorage.getItem(STORAGE_KEYS.userId));
  const roleName = roleId !== null ? ROLE_NAME[roleId] ?? null : null;

  return {
    token,
    roleId,
    roleName,
    userId,
    isAuthenticated: Boolean(token && roleId !== null && userId !== null),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(() => loadPersistedAuth());

  const persistAuth = useCallback((next: AuthState) => {
    if (typeof window === 'undefined') {
      return;
    }

    const { token, roleId, roleName, userId, isAuthenticated } = next;

    if (token) {
      localStorage.setItem(STORAGE_KEYS.token, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.token);
    }

    if (roleId !== null) {
      localStorage.setItem(STORAGE_KEYS.roleId, String(roleId));
    } else {
      localStorage.removeItem(STORAGE_KEYS.roleId);
    }

    if (roleName) {
      localStorage.setItem(STORAGE_KEYS.role, roleName);
      localStorage.setItem(STORAGE_KEYS.roleAlt, roleName);
    } else {
      localStorage.removeItem(STORAGE_KEYS.role);
      localStorage.removeItem(STORAGE_KEYS.roleAlt);
    }

    if (userId !== null) {
      localStorage.setItem(STORAGE_KEYS.userId, String(userId));
    } else {
      localStorage.removeItem(STORAGE_KEYS.userId);
    }

    setAuth({ token, roleId, roleName, userId, isAuthenticated });
  }, []);

  const clearAuth = useCallback(() => {
    persistAuth(defaultAuthState);
  }, [persistAuth]);

  const setAuthFromToken = useCallback(
    (token: string) => {
      const payload = decodeJwtPayload(token);
      if (!payload) {
        console.warn('JWT payload is invalid or missing.');
        return;
      }

      const roleIdRaw =
        (payload.ROLE as number | string | undefined) ??
        (payload.role as number | string | undefined) ??
        (payload.rol as number | string | undefined) ??
        (payload.roleId as number | string | undefined);
      const userIdRaw = (payload.ID as number | string | undefined) ?? (payload.id as number | string | undefined);

      const roleId = parseAsNumber(roleIdRaw);
      const userId = parseAsNumber(userIdRaw);
      const roleName = roleId !== null ? ROLE_NAME[roleId] ?? null : null;
      const nextAuth: AuthState = {
        token,
        roleId,
        roleName,
        userId,
        isAuthenticated: Boolean(token && roleId !== null && userId !== null),
      };

      persistAuth(nextAuth);

      if (typeof window !== 'undefined' && nextAuth.isAuthenticated) {
        const targetPath = getLandingPath(nextAuth.roleId);
        const currentPath = `${window.location.pathname}${window.location.search}`;
        if (currentPath !== targetPath) {
          void router.navigate(targetPath, { replace: true });
        }
      }
    },
    [persistAuth],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const tokenFromUrl = extractTokenFromLocation(window.location);
    if (!tokenFromUrl) {
      return;
    }

    setAuthFromToken(tokenFromUrl);

    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, [setAuthFromToken]);

  const value = useMemo(
    () => ({
      auth,
      setAuthFromToken,
      clearAuth,
    }),
    [auth, clearAuth, setAuthFromToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

