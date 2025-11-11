import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature, { type FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat } from 'ol/proj';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import Text from 'ol/style/Text';
import { boundingExtent } from 'ol/extent';
import type { Coordinate } from 'ol/coordinate';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';
import type { UseAuthorizedApi } from 'src/hooks/useAuthorizedApi';
import { useTraccarApi } from 'src/hooks/useTraccarApi';

type NotaSalidaResumen = {
  idSalidaProgramada: string;
  idNotaSalida: string;
  nroSalida: string;
  cliente: string;
  ordenPrioridadRuta: number | null;
  estadoEntrega: number | null;
  direccion: string;
  ubicacionEntrega: string;
};

type ProgramacionResumen = {
  id: string;
  fechaEntrega: string | null;
  estadoEntrega: number | null;
  vehiculoDescripcion: string;
  conductorNombre: string;
  dispositivoId?: string | null;
};

type RecorridoLocationState = {
  programacion?: ProgramacionResumen | null;
  notas?: NotaSalidaResumen[] | null;
};

type EntregaItem = {
  id: string;
  cliente: string;
  direccion: string;
  nroSalida: string;
  estadoEntrega: number | null;
  orden: number | null;
  lat: number | null;
  lon: number | null;
  ubicacionOriginal: string;
};

type EstadoNotaInfo = {
  label: string;
  pillClass: string;
  dotClass: string;
  pinColor: string;
};

const ALMACEN_COORD: [number, number] = [-68.151984, -16.522179];
const ALMACEN_LABEL = 'Almacen LatrinaCover';
const ALMACEN_ICON_URL = '/icons/almacen-pin.svg';

const DEFAULT_CENTER: [number, number] = ALMACEN_COORD;

type RoutePoint = {
  lat: number;
  lon: number;
  timestamp: number;
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

const normalizeIsoDateString = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return trimmed;
};

const parseCoordinates = (value: string | null): { lat: number; lon: number } | null => {
  const trimmed = sanitize(value);
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split(',');
  if (parts.length < 2) {
    return null;
  }
  const lat = Number(parts[0]?.trim());
  const lon = Number(parts[1]?.trim());
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }
  return { lat, lon };
};

const getNotaEstadoInfo = (estado: number | null): EstadoNotaInfo => {
  switch (estado) {
    case 1:
      return {
        label: 'No entregado',
        pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
        pinColor: '#facc15',
      };
    case 2:
      return {
        label: 'Entregado',
        pillClass: 'bg-green-50 text-green-700 border-green-200',
        dotClass: 'bg-green-500',
        pinColor: '#22c55e',
      };
    case 3:
      return {
        label: 'Atrasado',
        pillClass: 'bg-red-50 text-red-700 border-red-200',
        dotClass: 'bg-red-500',
        pinColor: '#ef4444',
      };
    default:
      return {
        label: 'Sin estado',
        pillClass: 'bg-gray-100 text-gray-600 border-gray-300',
        dotClass: 'bg-gray-400',
        pinColor: '#9ca3af',
      };
  }
};

const formatDateDisplay = (value: string | null): string => {
  const normalized = normalizeIsoDateString(value);
  if (!normalized) {
    return 'Sin fecha';
  }
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }
  return new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const buildPinSvg = (color: string) =>
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 32' width='24' height='32'><path fill='${color}' d='M12 0C6 0 1.5 4.5 1.5 10.5c0 6.5 7.6 15.2 9.8 17.6.4.5 1 .5 1.4 0 2.2-2.4 9.8-11.1 9.8-17.6C22.5 4.5 18 0 12 0z'/><circle cx='12' cy='10.5' r='4' fill='white'/></svg>`
  );

const toTraccarRecordArray = (payload: unknown): Array<Record<string, any>> => {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, any>>;
  }
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, any>;
    const candidates = ['positions', 'data', 'route'];
    for (const key of candidates) {
      if (Array.isArray(candidate[key])) {
        return candidate[key] as Array<Record<string, any>>;
      }
    }
  }
  return [];
};

const extractTraccarTimestamp = (entry: Record<string, any>): number | null => {
  const candidates = [entry.deviceTime, entry.fixTime, entry.serverTime, entry.time];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) {
      const timestamp = new Date(candidate).getTime();
      if (!Number.isNaN(timestamp)) {
        return timestamp;
      }
    }
  }
  if (typeof entry.timestamp === 'number' && !Number.isNaN(entry.timestamp)) {
    return entry.timestamp;
  }
  return null;
};

const extractTraccarCoordinates = (entry: Record<string, any>): { lat: number; lon: number } | null => {
  const latitude = Number(entry.latitude ?? entry.lat);
  const longitude = Number(entry.longitude ?? entry.lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }
  return { lat: latitude, lon: longitude };
};

const normalizeTraccarRecords = (records: Array<Record<string, any>>): RoutePoint[] => {
  const points: RoutePoint[] = [];
  for (const record of records) {
    const coords = extractTraccarCoordinates(record);
    if (!coords) {
      continue;
    }
    const timestamp = extractTraccarTimestamp(record);
    if (timestamp === null) {
      continue;
    }
    points.push({ ...coords, timestamp });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  const deduped: RoutePoint[] = [];
  const seen = new Set<number>();
  for (const point of points) {
    if (seen.has(point.timestamp)) {
      continue;
    }
    seen.add(point.timestamp);
    deduped.push(point);
  }
  return deduped;
};

const mergeRoutePoints = (existing: RoutePoint[], additions: RoutePoint[]): RoutePoint[] => {
  if (additions.length === 0) {
    return existing;
  }
  const combined = [...existing, ...additions];
  combined.sort((a, b) => a.timestamp - b.timestamp);
  const deduped: RoutePoint[] = [];
  const seen = new Set<number>();
  for (const point of combined) {
    if (seen.has(point.timestamp)) {
      continue;
    }
    seen.add(point.timestamp);
    deduped.push(point);
  }
  return deduped;
};

const parseFechaEntregaRange = (
  fecha: string | null,
): { from: string; to: string; shouldPoll: boolean } | null => {
  const normalized = normalizeIsoDateString(fecha);
  if (!normalized) {
    return null;
  }
  const parts = normalized.split('-');
  if (parts.length !== 3) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return null;
  }

  const from = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const now = new Date();
  const isSameDay =
    year === now.getFullYear() &&
    month === now.getMonth() + 1 &&
    day === now.getDate();

  const to = isSameDay
    ? now
    : new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return { from: from.toISOString(), to: to.toISOString(), shouldPoll: isSameDay };
};

const buildTruckSvg = () =>
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 36' width='64' height='36'><rect x='2' y='8' width='36' height='16' rx='2' fill='%232563eb'/><rect x='38' y='12' width='16' height='12' rx='2' fill='%232563eb'/><rect x='40' y='14' width='6' height='6' fill='white'/><circle cx='16' cy='28' r='5' fill='%23333'/><circle cx='46' cy='28' r='5' fill='%23333'/></svg>"
  );

const RecorridoMapa = () => {
  const location = useLocation();
  const navigate = useNavigate();

  let authorizedApi: UseAuthorizedApi | null = null;
  try {
    authorizedApi = useAuthorizedApi();
  } catch (error) {
    console.error('useAuthorizedApi() fallo al inicializar en RecorridoMapa', error);
  }

  const authorizedFetch = authorizedApi?.authorizedFetch ?? null;
  const { traccarFetch } = useTraccarApi();

  const { programacion, notas } = useMemo(() => {
    const state = (location.state ?? {}) as RecorridoLocationState;
    const notasLimpias = Array.isArray(state.notas)
      ? state.notas.filter((nota): nota is NotaSalidaResumen => Boolean(nota && typeof nota === 'object'))
      : [];
    return {
      programacion: state.programacion ?? null,
      notas: notasLimpias,
    };
  }, [location.state]);

  const entregas = useMemo<EntregaItem[]>(
    () =>
      notas.map((nota) => {
        const coords = parseCoordinates(nota.ubicacionEntrega);
        return {
          id: nota.idSalidaProgramada || nota.idNotaSalida,
          cliente: sanitize(nota.cliente) || 'Sin cliente',
          direccion: sanitize(nota.direccion) || 'Sin direccion',
          nroSalida: sanitize(nota.nroSalida) || '-',
          estadoEntrega: nota.estadoEntrega ?? null,
          orden: nota.ordenPrioridadRuta ?? null,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
          ubicacionOriginal: sanitize(nota.ubicacionEntrega),
        };
      }),
    [notas]
  );

  const entregasConCoordenadas = useMemo(
    () => entregas.filter((entrega): entrega is EntregaItem & { lat: number; lon: number } => entrega.lat !== null && entrega.lon !== null),
    [entregas]
  );
  const fechaRange = useMemo(() => parseFechaEntregaRange(programacion?.fechaEntrega ?? null), [programacion?.fechaEntrega]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [vehicleRoute, setVehicleRoute] = useState<RoutePoint[]>([]);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [isLoadingVehicle, setIsLoadingVehicle] = useState(false);
  const [traccarDeviceId, setTraccarDeviceId] = useState<number | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);

  useEffect(() => {
    console.log('[recorrido] entregas actualizadas:', entregas.length);
    if (entregas.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && entregas.some((entrega) => entrega.id === prev) ? prev : entregas[0].id));
  }, [entregas]);

  useEffect(() => {
    console.log('[recorrido] preparando dispositivo Traccar con programacion:', programacion);
    setVehiclePosition(null);
    setVehicleRoute([]);
    setVehicleError(null);
    setTraccarDeviceId(null);
    setDeviceLabel(null);

    if (!authorizedFetch) {
      console.warn('[recorrido] No se pudo inicializar authorizedFetch');
      setVehicleError('No se pudo acceder al API autorizado.');
      return;
    }

    const dispositivoRaw = programacion?.dispositivoId;
    console.log('[recorrido] dispositivoRaw recibido:', dispositivoRaw);
    if (dispositivoRaw === undefined || dispositivoRaw === null) {
      setVehicleError('No se asigno un dispositivo GPS al vehiculo.');
      return;
    }

    const dispositivoId = String(dispositivoRaw).trim();
    console.log('[recorrido] dispositivoId normalizado:', dispositivoId);
    if (!dispositivoId) {
      setVehicleError('No se asigno un dispositivo GPS al vehiculo.');
      return;
    }

    const controller = new AbortController();

    const fetchDeviceInfo = async () => {
      setIsLoadingVehicle(true);
      try {
        console.log('[recorrido] solicitando dispositivo GPS a backend propio:', dispositivoId);
        const response = await authorizedFetch(
          `/api/v1/dispositivosGps/id/${encodeURIComponent(dispositivoId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener el dispositivo GPS (${response.status}).`);
        }
        const json = (await response.json()) as { data?: { codigo?: string | null; modelo?: string | null } | null };
        if (controller.signal.aborted) {
          return;
        }
        const codigoRaw = sanitize(json?.data?.codigo);
        const modeloDescripcion = sanitize(json?.data?.modelo);
        console.log('[recorrido] payload dispositivo GPS:', json?.data, 'codigoRaw:', codigoRaw, 'modelo:', modeloDescripcion);
        if (!codigoRaw) {
          setVehicleError('El dispositivo GPS no tiene un identificador valido.');
          return;
        }
        const traccarId = Number.parseInt(codigoRaw, 10);
        if (Number.isNaN(traccarId)) {
          setVehicleError('El dispositivo GPS no tiene un identificador numerico valido.');
          return;
        }
        const originalCodigo = modeloDescripcion ? sanitize((modeloDescripcion.split(',')[0] ?? '').trim()) : '';
        const idLabel = String(traccarId);
        const displayLabel =
          modeloDescripcion ||
          (originalCodigo && originalCodigo !== idLabel ? `${originalCodigo} (ID ${idLabel})` : `ID ${idLabel}`);
        console.log('[recorrido] traccarId resuelto:', traccarId, 'label:', displayLabel);
        setDeviceLabel(displayLabel);
        setTraccarDeviceId(traccarId);
        lastPositionTimestampRef.current = 0;
        setVehicleError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Error al preparar dispositivo GPS', error);
        setTraccarDeviceId(null);
        setVehicleError(error instanceof Error ? error.message : 'No se pudo obtener el dispositivo GPS.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingVehicle(false);
        }
      }
    };

    void fetchDeviceInfo();

    return () => controller.abort();
  }, [authorizedFetch, programacion?.dispositivoId]);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<View | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const vehiculoFeatureRef = useRef<Feature<Point> | null>(null);
  const previousVehiclePositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastPositionTimestampRef = useRef<number>(0);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    vectorLayerRef.current?.changed();
  }, [selectedId]);

  useEffect(() => {
    setVehicleRoute([]);
    setVehiclePosition(null);
    lastPositionTimestampRef.current = 0;
    setVehicleError(null);

    if (!traccarDeviceId || !fechaRange) {
      console.warn('[recorrido] No se puede solicitar recorrido:', { traccarDeviceId, fechaRange });
      return;
    }

    console.log('[recorrido] Inicializando carga de posiciones', { traccarDeviceId, fechaRange });

    let cancelled = false;
    let pollingInterval: number | null = null;

    const clearPolling = () => {
      if (pollingInterval !== null) {
        window.clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    const applyRoutePoints = (points: RoutePoint[]) => {
      setVehicleRoute(points);
      if (points.length === 0) {
        console.warn('[recorrido] Traccar devolvió 0 puntos para el device', traccarDeviceId);
        setVehiclePosition(null);
        lastPositionTimestampRef.current = 0;
        setVehicleError(
          fechaRange.shouldPoll
            ? 'Aun no hay recorrido registrado para hoy.'
            : 'No hay recorrido registrado para esta fecha.',
        );
        return;
      }
      const lastPoint = points[points.length - 1];
      console.log('[recorrido] puntos aplicados:', points.length, 'ultimo timestamp', lastPoint.timestamp);
      setVehiclePosition({ lat: lastPoint.lat, lon: lastPoint.lon });
      lastPositionTimestampRef.current = lastPoint.timestamp;
      setVehicleError(null);
    };

    const fetchRoute = async () => {
      try {
        const params = new URLSearchParams({
          deviceId: String(traccarDeviceId),
          from: fechaRange.from,
          to: fechaRange.shouldPoll ? new Date().toISOString() : fechaRange.to,
        });
        console.log('[TRACCAR] GET /api/positions params', params.toString());

        const response = await traccarFetch(`/api/positions?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener posiciones (${response.status}).`);
        }
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        console.log(
          '[TRACCAR] positions payload length:',
          Array.isArray(payload) ? payload.length : 'n/a',
        );
        const records = normalizeTraccarRecords(toTraccarRecordArray(payload));
        console.log('[TRACCAR] normalized points:', records.length);
        applyRoutePoints(records);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Error al obtener posiciones de Traccar', error);
        setVehicleError(error instanceof Error ? error.message : 'No se pudo obtener el recorrido del vehiculo.');
      }
    };

    const pollLatestPosition = async () => {
      try {
        const params = new URLSearchParams({
          deviceId: String(traccarDeviceId),
        });
        console.log('[TRACCAR] polling params', params.toString(), 'last ts', lastPositionTimestampRef.current);
        const response = await traccarFetch(`/api/positions?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener la posicion actual (${response.status}).`);
        }
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        const records = normalizeTraccarRecords(toTraccarRecordArray(payload));
        const additions = records.filter((point) => point.timestamp > lastPositionTimestampRef.current);
        if (additions.length === 0) {
          console.log('[TRACCAR] Sin nuevas posiciones para device', traccarDeviceId);
          return;
        }
        setVehicleRoute((prev) => mergeRoutePoints(prev, additions));
        const lastPoint = additions[additions.length - 1];
        setVehiclePosition({ lat: lastPoint.lat, lon: lastPoint.lon });
        lastPositionTimestampRef.current = Math.max(lastPositionTimestampRef.current, lastPoint.timestamp);
        setVehicleError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Error al actualizar posicion en tiempo real de Traccar', error);
      }
    };

    const initialize = async () => {
      await fetchRoute();
      if (cancelled || !fechaRange.shouldPoll) {
        return;
      }
      await pollLatestPosition();
      if (cancelled) {
        return;
      }
      pollingInterval = window.setInterval(() => {
        void pollLatestPosition();
      }, 3000);
    };

    void initialize();

    return () => {
      cancelled = true;
      clearPolling();
    };
  }, [fechaRange, traccarDeviceId, traccarFetch]);

  useEffect(() => {
    if (!mapEl.current) {
      return;
    }

    const initialLonLat = (() => {
      if (vehiclePosition) {
        return [vehiclePosition.lon, vehiclePosition.lat] as [number, number];
      }
      if (entregasConCoordenadas.length > 0) {
        const first = entregasConCoordenadas[0];
        return [first.lon, first.lat] as [number, number];
      }
      return DEFAULT_CENTER;
    })();

    const center = fromLonLat(initialLonLat);
    const almacenCoord = fromLonLat(ALMACEN_COORD);
    const truckIconUrl = `data:image/svg+xml;charset=UTF-8,${buildTruckSvg()}`;

    let currentZoom = 13;

    const styleFn = (feature: FeatureLike) => {
      const tipo = (feature as any).get('tipo');
      const zoomFactor = Math.max(0.6, Math.min(2.2, 0.5 + (currentZoom - 10) * 0.25));

      if (tipo === 'vehiculo') {
        const vehiculoStyle = new Style({
          image: new Icon({ src: truckIconUrl, anchor: [0.5, 1], scale: 0.6 * zoomFactor }),
        });
        vehiculoStyle.setZIndex(400);
        return vehiculoStyle;
      }

      if (tipo === 'almacen') {
        const markerStyle = new Style({
          image: new Icon({
            src: ALMACEN_ICON_URL,
            anchor: [0.5, 1],
            scale: 0.32 * zoomFactor,
            crossOrigin: 'anonymous',
          }),
          text: new Text({
            text: ALMACEN_LABEL,
            font: '600 13px "Inter", "Segoe UI", sans-serif',
            fill: new Fill({ color: '#1f2937' }),
            stroke: new Stroke({ color: 'rgba(248, 250, 252, 0.9)', width: 3 }),
            backgroundFill: new Fill({ color: 'rgba(255,255,255,0.95)' }),
            offsetY: -38,
            padding: [4, 8, 4, 8],
            textAlign: 'center',
          }),
        });
        markerStyle.setZIndex(480);
        return markerStyle;
      }

      if (tipo === 'recorrido') {
        const routeStyle = new Style({
          stroke: new Stroke({ color: '#2563eb', width: 3, lineCap: 'round', lineJoin: 'round' }),
        });
        routeStyle.setZIndex(150);
        return routeStyle;
      }

      const estado = (feature as any).get('estado') as number | null;
      const estadoInfo = getNotaEstadoInfo(estado);
      const isSelected = feature.getId() === selectedIdRef.current;
      const baseScale = 0.9 * zoomFactor * (isSelected ? 1.35 : 1);
      const entregaStyle = new Style({
        image: new Icon({
          src: `data:image/svg+xml;charset=UTF-8,${buildPinSvg(estadoInfo.pinColor)}`,
          anchor: [0.5, 1],
          scale: baseScale,
        }),
      });
      entregaStyle.setZIndex(isSelected ? 360 : 320);
      return entregaStyle;
    };

    const vehiculo = new Feature({ geometry: new Point(center), tipo: 'vehiculo' });
    vehiculo.setId('vehiculo');
    vehiculoFeatureRef.current = vehiculo;

    const almacen = new Feature({ geometry: new Point(almacenCoord), tipo: 'almacen' });
    almacen.setId('almacen-origen');

    const vectorSource = new VectorSource({ features: [vehiculo, almacen] });
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({ source: vectorSource, style: styleFn });
    vectorLayerRef.current = vectorLayer;

    const view = new View({ center, zoom: currentZoom });
    viewRef.current = view;

    const map = new Map({ target: mapEl.current, layers: [new TileLayer({ source: new OSM() }), vectorLayer], view });
    mapRef.current = map;

    view.on('change:resolution', () => {
      currentZoom = view.getZoom() || currentZoom;
      vectorLayer.changed();
    });

    setTimeout(() => map.updateSize(), 120);

    return () => {
      map.setTarget(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const feature = vehiculoFeatureRef.current;
    if (!feature) {
      return;
    }
    const geometry = feature.getGeometry() as Point | null;
    if (!geometry) {
      return;
    }
    const targetLonLat = (() => {
      if (vehiclePosition) {
        return [vehiclePosition.lon, vehiclePosition.lat] as [number, number];
      }
      if (entregasConCoordenadas.length > 0) {
        const first = entregasConCoordenadas[0];
        return [first.lon, first.lat] as [number, number];
      }
      return DEFAULT_CENTER;
    })();

    geometry.setCoordinates(fromLonLat(targetLonLat));

    if (vehiclePosition) {
      const prev = previousVehiclePositionRef.current;
      const changed =
        !prev ||
        prev.lat !== vehiclePosition.lat ||
        prev.lon !== vehiclePosition.lon;
      if (changed) {
        previousVehiclePositionRef.current = vehiclePosition;
        if (entregasConCoordenadas.length === 0) {
          const view = viewRef.current;
          if (view) {
            view.animate({ center: fromLonLat(targetLonLat), duration: 400 });
          }
        }
      }
    } else {
      previousVehiclePositionRef.current = null;
    }

    vectorLayerRef.current?.changed();
  }, [vehiclePosition, entregasConCoordenadas]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) {
      return;
    }

    const existing = source.getFeatureById('vehiculo-recorrido');
    if (existing) {
      source.removeFeature(existing);
    }

    if (vehicleRoute.length < 2) {
      vectorLayerRef.current?.changed();
      return;
    }

    const line = new LineString(vehicleRoute.map((point) => fromLonLat([point.lon, point.lat])));
    const feature = new Feature({ geometry: line, tipo: 'recorrido' });
    feature.setId('vehiculo-recorrido');
    source.addFeature(feature);
    vectorLayerRef.current?.changed();
  }, [vehicleRoute]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) {
      return;
    }

    source.getFeatures().forEach((feature) => {
      if ((feature as any).get('tipo') === 'entrega') {
        source.removeFeature(feature);
      }
    });

    entregasConCoordenadas.forEach((entrega) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([entrega.lon as number, entrega.lat as number])),
        tipo: 'entrega',
        estado: entrega.estadoEntrega ?? null,
      });
      feature.setId(entrega.id);
      source.addFeature(feature);
    });

    const coords: Coordinate[] = [fromLonLat(ALMACEN_COORD)];

    if (entregasConCoordenadas.length > 0) {
      coords.push(
        ...entregasConCoordenadas.map((entrega) => fromLonLat([entrega.lon as number, entrega.lat as number])),
      );
    }

    if (vehicleRoute.length > 0) {
      coords.push(...vehicleRoute.map((point) => fromLonLat([point.lon, point.lat])));
    }

    if (vehiclePosition) {
      coords.push(fromLonLat([vehiclePosition.lon, vehiclePosition.lat]));
    }

    if (coords.length > 0) {
      const extent = boundingExtent(coords);
      const view = viewRef.current;
      if (view) {
        view.fit(extent, { padding: [80, 80, 80, 80], duration: 600, maxZoom: 16 });
      }
    }

    vectorLayerRef.current?.changed();
  }, [entregasConCoordenadas, vehiclePosition, vehicleRoute]);

  useEffect(() => {
    const handleResize = () => mapRef.current?.updateSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const flyToEntrega = (id: string) => {
    setSelectedId(id);
    const view = viewRef.current;
    const source = vectorSourceRef.current;
    if (!view || !source) {
      return;
    }
    const feature = source.getFeatureById(id) as Feature<Point> | undefined;
    const coord = feature?.getGeometry()?.getCoordinates();
    if (coord) {
      view.animate({ center: coord, duration: 600, zoom: Math.max(view.getZoom() || 13, 15) });
    }
  };

  const fechaProgramacion = formatDateDisplay(programacion?.fechaEntrega ?? null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-center">Recorrido</h1>

      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
        >
          Volver
        </button>
      </div>

      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="font-medium">PanelMonitoreo</span>
        <span className="mx-2">&gt;</span>
        <span className="font-medium">Salidas</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">Recorrido</span>
      </div>

      <div className="rounded-xl bg-white dark:bg-darkgray shadow-md p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="block text-xs uppercase text-dark/60">Programacion</span>
            <span className="font-semibold">{programacion?.id || 'Sin identificador'}</span>
          </div>
          <div>
            <span className="block text-xs uppercase text-dark/60">Fecha</span>
            <span className="font-semibold">{fechaProgramacion}</span>
          </div>
          <div>
            <span className="block text-xs uppercase text-dark/60">Conductor</span>
            <span className="font-semibold">{programacion?.conductorNombre || 'Sin conductor asignado'}</span>
          </div>
          <div>
            <span className="block text-xs uppercase text-dark/60">Vehiculo</span>
            <span className="font-semibold">{programacion?.vehiculoDescripcion || 'Sin vehiculo asignado'}</span>
          </div>
          <div>
            <span className="block text-xs uppercase text-dark/60">Dispositivo GPS</span>
            <span className="font-semibold">{deviceLabel || 'Sin registro'}</span>
          </div>
        </div>
      </div>

      {!isLoadingVehicle && vehicleError && (
        <p className="text-sm text-red-600 dark:text-red-400">{vehicleError}</p>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4 lg:col-span-3 bg-white dark:bg-darkgray rounded-md shadow p-3 space-y-2 max-h-60 overflow-auto md:max-h-[70vh]">
          <h3 className="text-sm font-semibold mb-2">Puntos de entrega</h3>
          {entregas.length === 0 ? (
            <p className="text-sm text-dark/60">No se recibieron notas de salida para esta programacion.</p>
          ) : (
            entregas.map((entrega) => {
              const estadoInfo = getNotaEstadoInfo(entrega.estadoEntrega ?? null);
              const isSelected = selectedId === entrega.id;
              const tieneCoordenadas = entrega.lat !== null && entrega.lon !== null;
              return (
                <button
                  key={entrega.id}
                  type="button"
                  onClick={() => flyToEntrega(entrega.id)}
                  className={`w-full text-left border rounded-md p-3 transition ${
                    isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-gray-300 hover:border-primary'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 rounded-full flex-shrink-0 ${estadoInfo.dotClass}`} />
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-semibold truncate">{entrega.cliente}</div>
                      <div className="text-xs text-gray-600 truncate">Direccion: {entrega.direccion}</div>
                      <div className="text-xs text-gray-600">Nro. salida: {entrega.nroSalida}</div>
                      {entrega.orden !== null && (
                        <div className="text-xs text-gray-600">Orden: {entrega.orden}</div>
                      )}
                      <div className="text-xs">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border ${estadoInfo.pillClass}`}>
                          {estadoInfo.label}
                        </span>
                      </div>
                      {!tieneCoordenadas && (
                        <div className="text-xs text-amber-600">Sin coordenadas disponibles</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="col-span-12 md:col-span-8 lg:col-span-9 rounded-lg overflow-hidden shadow-md h-[55vh] md:h-[70vh] relative">
          <div ref={mapEl} className="w-full h-full" />
          {(isLoadingVehicle || vehicleError) && (
            <div className="absolute bottom-3 left-3 rounded-md bg-white/90 dark:bg-darkgray/90 px-3 py-2 text-xs text-dark dark:text-gray-100 shadow">
              {isLoadingVehicle ? 'Cargando ubicacion del vehiculo...' : vehicleError}
            </div>
          )}
        </div>
      </div>

      {entregas.length > 0 && entregasConCoordenadas.length === 0 && (
        <p className="text-sm text-amber-600">
          Ninguna de las notas tiene coordenadas validas, por lo que no se pudieron graficar en el mapa.
        </p>
      )}
    </div>
  );
};

export default RecorridoMapa;

