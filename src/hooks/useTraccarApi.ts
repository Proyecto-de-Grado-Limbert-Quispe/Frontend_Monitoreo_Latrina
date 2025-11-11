import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'traccarBaseUrl';
const DEFAULT_URL =
  (import.meta.env as unknown as Record<string, string | undefined>)?.VITE_TRACCAR_BASE_URL ??
  'https://dui-clouds-registry-focus.trycloudflare.com';

const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1)$/i;
const isBrowser = typeof window !== 'undefined';

const encodeBasicAuth = (value: string): string => {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  const globalAny = globalThis as Record<string, any>;
  if (typeof globalAny?.Buffer?.from === 'function') {
    return globalAny.Buffer.from(value, 'utf-8').toString('base64');
  }
  return value;
};

const buildBasicAuthHeader = (email: string, password: string): string => `Basic ${encodeBasicAuth(`${email}:${password}`)}`;

const toParamValue = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

const buildSearchParams = (query: Record<string, unknown>): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        params.append(key, toParamValue(item));
      }
      continue;
    }
    params.append(key, toParamValue(rawValue));
  }
  return params;
};

const safeReadText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const resolveProxyBase = (): string | null => {
  return null; // forzamos a usar la URL completa aunque estemos en dev
};

const normalize = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (!url.port && LOCAL_HOSTS.test(url.hostname)) {
      url.port = '8082';
    }
    if (LOCAL_HOSTS.test(url.hostname) && url.protocol === 'https:') {
      url.protocol = 'http:';
    }
    url.search = '';
    url.hash = '';
    if (url.pathname && url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    } else {
      url.pathname = '';
    }
    const finalUrl = url.toString();
    return finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl;
  } catch (error) {
    console.warn('No se pudo normalizar la URL de Traccar, se usará el valor por defecto.', error);
    return DEFAULT_URL;
  }
};

const resolveInitialUrl = (): string => {
  if (!isBrowser) {
    return normalize(DEFAULT_URL);
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored ? normalize(stored) : normalize(DEFAULT_URL);
};

const resolveCredentials = () => {
  const email =
    (import.meta.env as unknown as Record<string, string | undefined>)?.VITE_TRACCAR_EMAIL ?? 'dqsent@gmail.com';
  const password =
    (import.meta.env as unknown as Record<string, string | undefined>)?.VITE_TRACCAR_PASSWORD ?? 'Pa$$w0rdUADS123';
  return { email, password };
};

export type TraccarDevice = Record<string, unknown>;
export type TraccarPosition = Record<string, unknown>;
export type TraccarRouteRecord = Record<string, unknown>;

export type TraccarDeviceWithPosition = TraccarDevice & {
  position: TraccarPosition | null;
  speed: number;
  lastUpdate: string | null;
};

export type TraccarPositionsQuery = {
  deviceId?: string | number;
  from?: string | Date;
  to?: string | Date;
  page?: number;
  limit?: number;
  id?: string | number;
  unique?: boolean;
  [key: string]: unknown;
};

export type TraccarRouteQuery = {
  deviceId: string | number;
  from: string | Date;
  to: string | Date;
  page?: number;
  limit?: number;
  [key: string]: unknown;
};

const extractDeviceKey = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value);
};

const resolveDeviceKey = (device: TraccarDevice): string | null => {
  const candidates = ['id', 'deviceId', 'device_id', 'uniqueId', 'uniqueID', 'idDevice'];
  for (const key of candidates) {
    const candidate = extractDeviceKey(device[key]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

const resolvePositionDeviceKey = (position: TraccarPosition): string | null => {
  const candidate =
    extractDeviceKey(position.deviceId) ??
    extractDeviceKey(position.device_id) ??
    extractDeviceKey(position.device) ??
    extractDeviceKey(position.deviceID) ??
    (typeof position.device === 'object' && position.device !== null
      ? extractDeviceKey((position.device as Record<string, unknown>).id)
      : null);
  return candidate;
};

export const useTraccarApi = () => {
  const [baseUrl, setBaseUrlState] = useState(resolveInitialUrl);
  const credentials = useMemo(() => resolveCredentials(), []);
  const proxyBase = useMemo(() => resolveProxyBase(), []);
  const authHeader = useMemo(
    () => buildBasicAuthHeader(credentials.email, credentials.password),
    [credentials.email, credentials.password],
  );

  if (typeof window !== 'undefined') {
    // Debug para confirmar cuál base URL usa el hook en tiempo de ejecución.
    console.log('[TRACCAR] baseUrl en uso:', baseUrl, 'proxyBase:', proxyBase);
  }

  const ensureHeaders = useCallback(
    (init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      if (authHeader && !headers.has('Authorization')) {
        headers.set('Authorization', authHeader);
      }
      if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
      }
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body;
      const shouldAssignJsonContentType =
        typeof body === 'string' && method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type');
      if (shouldAssignJsonContentType) {
        headers.set('Content-Type', 'application/json');
      }
      return headers;
    },
    [authHeader],
  );

  const setBaseUrl = useCallback((value: string) => {
    const normalized = normalize(value);
    setBaseUrlState(normalized);
    if (isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    }
  }, []);

  const buildUrl = useCallback(
    (path: string) => {
      if (proxyBase) {
        const finalPath = path.startsWith('/') ? path : `/${path}`;
        return `${proxyBase}${finalPath}`;
      }
      const normalizedBase = normalize(baseUrl);
      if (!path) {
        return normalizedBase;
      }
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      try {
        const base = new URL(normalizedBase);
        return new URL(normalizedPath, base).toString();
      } catch {
        return `${normalizedBase}${normalizedPath}`;
      }
    },
    [baseUrl, proxyBase],
  );

  const traccarFetch = useCallback(
    (path: string, init?: RequestInit) => {
      const url = buildUrl(path);
      const headers = ensureHeaders(init);
      const fetchInit: RequestInit = {
        ...init,
        headers,
      };
      if (proxyBase) {
        fetchInit.credentials = 'include';
      }
      if (typeof window !== 'undefined') {
        console.log('[TRACCAR] fetch →', url, fetchInit.method ?? 'GET');
      }
      return fetch(url, fetchInit);
    },
    [buildUrl, ensureHeaders, proxyBase],
  );

  const fetchJson = useCallback(
    <T,>(path: string, init?: RequestInit, errorMessage?: string): Promise<T> =>
      traccarFetch(path, init).then(async (response) => {
        if (!response.ok) {
          const text = await safeReadText(response);
          const message = text || errorMessage || `La solicitud a Traccar falló (${response.status}).`;
          throw new Error(message);
        }
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      }),
    [traccarFetch],
  );

  const fetchDevices = useCallback(
    () => fetchJson<TraccarDevice[]>('/api/devices', undefined, 'Error al obtener los dispositivos de Traccar.'),
    [fetchJson],
  );

  const fetchPositions = useCallback(
    (query: TraccarPositionsQuery = {}) => {
      const params = buildSearchParams(query);
      const qs = params.toString();
      const path = qs ? `/api/positions?${qs}` : '/api/positions';
      return fetchJson<TraccarPosition[]>(path, undefined, 'Error al obtener las posiciones del dispositivo.');
    },
    [fetchJson],
  );

  const fetchDeviceRoute = useCallback(
    (query: TraccarRouteQuery) => {
      if (!query?.deviceId) {
        throw new Error('Se requiere un deviceId para obtener el historial del dispositivo en Traccar.');
      }
      if (!query?.from) {
        throw new Error('Se requiere un valor "from" para obtener el historial del dispositivo en Traccar.');
      }
      if (!query?.to) {
        throw new Error('Se requiere un valor "to" para obtener el historial del dispositivo en Traccar.');
      }
      const { limit = 1000, ...rest } = query;
      const params = buildSearchParams({ ...rest, limit });
      const path = `/api/reports/route?${params.toString()}`;
      return fetchJson<TraccarRouteRecord[]>(path, undefined, 'Error al obtener el historial del dispositivo.');
    },
    [fetchJson],
  );

  const fetchDevicesWithPositions = useCallback(async (): Promise<TraccarDeviceWithPosition[]> => {
    const [devices, positions] = await Promise.all([fetchDevices(), fetchPositions()]);
    const positionsByDevice = new Map<string, TraccarPosition>();
    for (const position of positions) {
      const key = resolvePositionDeviceKey(position);
      if (key) {
        positionsByDevice.set(key, position);
      }
    }

    return devices.map((device) => {
      const key = resolveDeviceKey(device);
      const position = key ? positionsByDevice.get(key) ?? null : null;
      let speed = 0;
      let lastUpdate: string | null = null;
      if (position) {
        const record = position as Record<string, unknown>;
        const speedValue = record.speed;
        if (typeof speedValue === 'number') {
          speed = speedValue;
        }
        const deviceTimeValue = record.deviceTime;
        const fixTimeValue = record.fixTime;
        if (typeof deviceTimeValue === 'string') {
          lastUpdate = deviceTimeValue;
        } else if (typeof fixTimeValue === 'string') {
          lastUpdate = fixTimeValue;
        }
      }

      const enriched: TraccarDeviceWithPosition = {
        ...(device as TraccarDevice),
        position,
        speed,
        lastUpdate,
      };
      return enriched;
    });
  }, [fetchDevices, fetchPositions]);

  return {
    baseUrl,
    setBaseUrl,
    traccarFetch,
    credentials,
    authHeader,
    fetchJson,
    fetchDevices,
    fetchPositions,
    fetchDeviceRoute,
    fetchDevicesWithPositions,
  };
};

export type UseTraccarApi = ReturnType<typeof useTraccarApi>;
