import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, TextInput } from 'flowbite-react';
import Chart from 'react-apexcharts';
import CardBox from 'src/components/shared/CardBox';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';
import type { ApexOptions } from 'apexcharts';

type EstadoReporte = 'entregado' | 'en_proceso' | 'no_entregado';
type Estado = 'todos' | EstadoReporte;

type ProgramacionApi = {
  idProgramacion?: number | string;
  estadoEntrega?: number | null;
  fechaEntrega?: string | null;
  conductor?: {
    idUsuario?: number | string;
    nombreCompleto?: string | null;
  } | null;
};

type Programacion = {
  id: string;
  estado: EstadoReporte;
  conductorId: string | null;
  conductorNombre: string;
  fechaEntrega: string | null;
};

type ConductorApi = {
  idUsuario?: number | string;
  nombreCompleto?: string | null;
};

type ConductorOption = {
  id: string;
  nombre: string;
};

type ApiResponse<T> = {
  code?: number;
  data?: T;
  message?: string;
};

const ESTADO_ORDER: EstadoReporte[] = ['entregado', 'en_proceso', 'no_entregado'];

const ESTADO_INFO: Record<EstadoReporte, { label: string; color: string }> = {
  entregado: { label: 'Entregado', color: 'var(--color-primary)' },
  en_proceso: { label: 'En proceso', color: 'var(--color-warning)' },
  no_entregado: { label: 'No entregado', color: 'var(--color-error)' },
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthRangeForOffset = (offsetMonths: number) => {
  const today = new Date();
  const reference = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return {
    desde: formatDateInput(start),
    hasta: formatDateInput(end),
  };
};

const getLastMonthRange = () => getMonthRangeForOffset(-1);

const getCurrentMonthRange = () => getMonthRangeForOffset(0);

const toDateOnly = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const dateOnly = value.split('T')[0];
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return formatDateInput(parsed);
};

const formatShortDateLabel = (value: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return value;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short' }).format(date);
};

const getEstadoFromApi = (value?: number | null): EstadoReporte => {
  switch (value) {
    case 2:
      return 'entregado';
    case 3:
      return 'no_entregado';
    default:
      return 'en_proceso';
  }
};

const mapProgramacion = (item: ProgramacionApi): Programacion => {
  const idValue = item.idProgramacion ?? `programacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fechaEntrega = toDateOnly(item.fechaEntrega ?? null);
  const conductorId =
    item.conductor && item.conductor.idUsuario !== undefined ? String(item.conductor.idUsuario) : null;
  const conductorNombre = sanitize(item.conductor?.nombreCompleto) || 'Sin asignar';
  return {
    id: String(idValue),
    estado: getEstadoFromApi(item.estadoEntrega),
    conductorId,
    conductorNombre,
    fechaEntrega,
  };
};

const Reportes = () => {
  const { authorizedFetch, token } = useAuthorizedApi();
  const initialRange = useMemo(() => getLastMonthRange(), []);
  const [estado, setEstado] = useState<Estado>('todos');
  const [desde, setDesde] = useState<string>(initialRange.desde);
  const [hasta, setHasta] = useState<string>(initialRange.hasta);
  const [conductor, setConductor] = useState<string>('todos');
  const [programaciones, setProgramaciones] = useState<Programacion[]>([]);
  const [conductores, setConductores] = useState<ConductorOption[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [conductoresError, setConductoresError] = useState<string | null>(null);
  const [isLoadingConductores, setIsLoadingConductores] = useState(false);
  const reportControllerRef = useRef<AbortController | null>(null);
  const initialFetchDoneRef = useRef(false);

  useEffect(() => {
    return () => {
      reportControllerRef.current?.abort();
    };
  }, []);

  const fetchReport = useCallback(
    async (range: { desde: string; hasta: string }) => {
      if (!token) {
        setProgramaciones([]);
        setReportError('No se encontro la sesion de usuario.');
        return;
      }
      if (!range.desde || !range.hasta) {
        setReportError('Debes seleccionar la fecha inicial y final.');
        return;
      }
      if (range.desde > range.hasta) {
        setReportError('La fecha inicial no puede ser mayor a la final.');
        return;
      }

      reportControllerRef.current?.abort();
      const controller = new AbortController();
      reportControllerRef.current = controller;

      setIsLoadingReport(true);
      setReportError(null);
      try {
        const response = await authorizedFetch(
          `/api/v1/programacion-distribucion/report/${range.desde}/${range.hasta}`,
          { signal: controller.signal },
        );
        const json = (await response
          .json()
          .catch(() => null)) as ApiResponse<ProgramacionApi[]> | null;

        if (!response.ok || json?.code !== 200) {
          const message = json?.message ?? `No se pudo obtener el reporte (${response.status}).`;
          throw new Error(message);
        }

        const items = Array.isArray(json?.data) ? json.data.map(mapProgramacion) : [];
        setProgramaciones(items);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setProgramaciones([]);
        setReportError((error as Error).message || 'Error al obtener los datos del reporte.');
      } finally {
        setIsLoadingReport(false);
      }
    },
    [authorizedFetch, token],
  );

  useEffect(() => {
    if (!token || initialFetchDoneRef.current) {
      return;
    }
    initialFetchDoneRef.current = true;
    void fetchReport({ desde, hasta });
  }, [token, desde, hasta, fetchReport]);

  useEffect(() => {
    if (!token) {
      setConductores([]);
      return;
    }
    const controller = new AbortController();
    setIsLoadingConductores(true);
    setConductoresError(null);

    const load = async () => {
      try {
        const response = await authorizedFetch('/api/v1/usuarios/conductores', {
          signal: controller.signal,
        });
        const json = (await response
          .json()
          .catch(() => null)) as ApiResponse<ConductorApi[]> | null;

        if (!response.ok || json?.code !== 200) {
          const message = json?.message ?? `No se pudo obtener los conductores (${response.status}).`;
          throw new Error(message);
        }

        const options = Array.isArray(json?.data)
          ? json.data
              .map((item) => ({
                id:
                  item.idUsuario !== undefined && item.idUsuario !== null
                    ? String(item.idUsuario)
                    : '',
                nombre: sanitize(item.nombreCompleto) || 'Sin nombre',
              }))
              .filter((item) => item.id)
              .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
          : [];
        setConductores(options);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setConductores([]);
        setConductoresError((error as Error).message || 'Error al obtener la lista de conductores.');
      } finally {
        setIsLoadingConductores(false);
      }
    };

    void load();

    return () => controller.abort();
  }, [authorizedFetch, token]);

  const filteredProgramaciones = useMemo(() => {
    return programaciones.filter((item) => {
      if (estado !== 'todos' && item.estado !== estado) {
        return false;
      }
      if (conductor !== 'todos' && item.conductorId !== conductor) {
        return false;
      }
      return true;
    });
  }, [programaciones, estado, conductor]);

  const charts = useMemo(() => {
    const statusTotals: Record<EstadoReporte, number> = {
      entregado: 0,
      en_proceso: 0,
      no_entregado: 0,
    };
    const dateBuckets: Record<
      string,
      {
        label: string;
        sortKey: string;
        counts: Record<EstadoReporte, number>;
      }
    > = {};
    const driverTotals = new Map<string, { nombre: string; total: number; entregados: number }>();

    filteredProgramaciones.forEach((item) => {
      statusTotals[item.estado] += 1;

      const driverKey = item.conductorId ?? item.conductorNombre;
      const driver = driverTotals.get(driverKey);
      const deliveredIncrement = item.estado === 'entregado' ? 1 : 0;
      if (driver) {
        driver.total += 1;
        driver.entregados += deliveredIncrement;
      } else {
        driverTotals.set(driverKey, {
          nombre: item.conductorNombre,
          total: 1,
          entregados: deliveredIncrement,
        });
      }

      const dateKey = item.fechaEntrega ?? 'sin-fecha';
      if (!dateBuckets[dateKey]) {
        dateBuckets[dateKey] = {
          label: item.fechaEntrega ? formatShortDateLabel(item.fechaEntrega) : 'Sin fecha',
          sortKey: item.fechaEntrega ?? '9999-12-31',
          counts: {
            entregado: 0,
            en_proceso: 0,
            no_entregado: 0,
          },
        };
      }
      dateBuckets[dateKey].counts[item.estado] += 1;
    });

    const totalRegistros = statusTotals.entregado + statusTotals.en_proceso + statusTotals.no_entregado;
    const porcentajeEntregado = totalRegistros
      ? Math.round((statusTotals.entregado / totalRegistros) * 100)
      : 0;
    const porcentajeAtrasos = totalRegistros
      ? Math.round((statusTotals.no_entregado / totalRegistros) * 100)
      : 0;

    const sortedDateKeys = Object.keys(dateBuckets).sort((a, b) => {
      const sortA = dateBuckets[a].sortKey;
      const sortB = dateBuckets[b].sortKey;
      if (sortA === sortB) {
        return 0;
      }
      return sortA < sortB ? -1 : 1;
    });
    const hasDateData = sortedDateKeys.length > 0;
    const stackedCategories = hasDateData ? sortedDateKeys.map((key) => dateBuckets[key].label) : ['Sin datos'];

    const stackedSeries = ESTADO_ORDER.map((estadoKey) => ({
      name: ESTADO_INFO[estadoKey].label,
      data: hasDateData ? sortedDateKeys.map((key) => dateBuckets[key].counts[estadoKey]) : [0],
    }));

    const donutSeries = ESTADO_ORDER.map((estadoKey) => statusTotals[estadoKey]);

    const driverEntries = Array.from(driverTotals.values()).sort((a, b) => {
      if (b.entregados !== a.entregados) {
        return b.entregados - a.entregados;
      }
      return b.total - a.total;
    });
    const hasDeliveredData = driverEntries.some((entry) => entry.entregados > 0);
    const driverCategories = driverEntries.length ? driverEntries.map((entry) => entry.nombre) : ['Sin registros'];
    const productividadData = driverEntries.length
      ? driverEntries.map((entry) => (hasDeliveredData ? entry.entregados : entry.total))
      : [0];
    const productividadSeries = [
      {
        name: hasDeliveredData ? 'Entregas completadas' : 'Programaciones registradas',
        data: productividadData,
      },
    ];

    const stackedOptions: ApexOptions = {
      chart: { type: 'bar', stacked: true, toolbar: { show: false }, fontFamily: 'inherit' },
      colors: ESTADO_ORDER.map((key) => ESTADO_INFO[key].color),
      xaxis: { categories: stackedCategories, labels: { style: { colors: '#a1aab2' } } },
      yaxis: { labels: { style: { colors: '#a1aab2' } } },
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      grid: { borderColor: 'rgba(0,0,0,.08)' },
      tooltip: { theme: 'dark' },
    };

    const donutOptions: ApexOptions = {
      labels: ESTADO_ORDER.map((key) => ESTADO_INFO[key].label),
      chart: { type: 'donut', fontFamily: 'inherit' },
      colors: ESTADO_ORDER.map((key) => ESTADO_INFO[key].color),
      stroke: { colors: ['var(--color-surface-ld)'], width: 3 },
      plotOptions: { pie: { donut: { size: '75%' } } },
      dataLabels: { enabled: false },
      legend: { show: true },
      tooltip: { theme: 'dark' },
    };

    const productividadOptions: ApexOptions = {
      chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'inherit' },
      xaxis: { categories: driverCategories, labels: { style: { colors: '#a1aab2' } } },
      yaxis: { labels: { style: { colors: '#a1aab2' } } },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '45%' } },
      colors: ['var(--color-primary)'],
      dataLabels: { enabled: false },
      grid: { borderColor: 'rgba(0,0,0,.08)' },
      tooltip: { theme: 'dark' },
    };

    return {
      statusTotals,
      totalRegistros,
      porcentajeEntregado,
      porcentajeAtrasos,
      stackedOptions,
      stackedSeries,
      donutOptions,
      donutSeries,
      productividadOptions,
      productividadSeries,
      productividadLabel: hasDeliveredData
        ? 'La productividad considera unicamente las entregas completadas por cada conductor.'
        : 'Aun no hay entregas completadas en este rango; se muestran las programaciones registradas por conductor.',
    };
  }, [filteredProgramaciones]);

  const {
    stackedOptions,
    stackedSeries,
    donutOptions,
    donutSeries,
    productividadOptions,
    productividadSeries,
    productividadLabel,
    totalRegistros,
    porcentajeEntregado,
    porcentajeAtrasos,
  } = charts;

  const handleApplyFilters = () => {
    void fetchReport({ desde, hasta });
  };

  const handleApplyShortcutRange = (range: { desde: string; hasta: string }) => {
    setDesde(range.desde);
    setHasta(range.hasta);
    void fetchReport(range);
  };

  const handleSelectCurrentMonth = () => {
    handleApplyShortcutRange(getCurrentMonthRange());
  };

  const handleSelectPreviousMonth = () => {
    handleApplyShortcutRange(getLastMonthRange());
  };

  const handleResetFilters = () => {
    setEstado('todos');
    setConductor('todos');
    setDesde(initialRange.desde);
    setHasta(initialRange.hasta);
    void fetchReport(initialRange);
  };

  return (
    <div className="space-y-6">
      <div className="mt-2">
        <h1 className="text-3xl md:text-4xl font-semibold text-center">Reportes</h1>
        <p className="text-sm text-dark/70 mt-2">Menu&gt;Reportes</p>
      </div>

      <CardBox>
        <h5 className="card-title mb-4">Filtros</h5>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-3">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
              <option value="todos">Todos los estados</option>
              <option value="entregado">Entregado</option>
              <option value="en_proceso">En proceso</option>
              <option value="no_entregado">No entregado</option>
            </Select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <TextInput type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="hidden md:flex items-center col-span-12 md:col-span-1 justify-center text-sm text-dark/70">
            hasta
          </div>
          <div className="col-span-6 md:col-span-2">
            <TextInput type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Select
              value={conductor}
              onChange={(e) => setConductor(e.target.value)}
              disabled={isLoadingConductores && conductores.length === 0}
            >
              <option value="todos">Todos los conductores</option>
              {isLoadingConductores && conductores.length === 0 && <option value="">Cargando...</option>}
              {conductores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </Select>
            {conductoresError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{conductoresError}</p>
            )}
          </div>
          <div className="col-span-12 md:col-span-2 flex gap-3 md:justify-end">
            <Button
              type="button"
              color="primary"
              className="w-full md:w-auto"
              onClick={handleApplyFilters}
              disabled={isLoadingReport || !desde || !hasta}
            >
              {isLoadingReport ? 'Cargando...' : 'Aplicar'}
            </Button>
            <Button
              type="button"
              color="light"
              className="w-full md:w-auto"
              onClick={handleResetFilters}
              disabled={isLoadingReport}
            >
              Limpiar
            </Button>
          </div>
          <div className="col-span-12 flex flex-wrap gap-3 text-sm">
            <Button type="button" color="light" size="xs" onClick={handleSelectCurrentMonth}>
              Mes actual
            </Button>
            <Button type="button" color="light" size="xs" onClick={handleSelectPreviousMonth}>
              Mes anterior
            </Button>
          </div>
          <div className="col-span-12">
            {reportError && <p className="text-sm text-red-600 dark:text-red-400">{reportError}</p>}
            {!reportError && isLoadingReport && (
              <p className="text-sm text-dark/70">Actualizando datos con los filtros seleccionados...</p>
            )}
            {!reportError && !isLoadingReport && filteredProgramaciones.length === 0 && (
              <p className="text-sm text-dark/70">No hay registros para los filtros seleccionados.</p>
            )}
          </div>
        </div>
      </CardBox>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-5">
          <CardBox>
            <h5 className="card-title mb-4">Entregas realizadas</h5>
            <Chart options={donutOptions} series={donutSeries} type="donut" height={260} />
            <div className="mt-4 grid grid-cols-3 text-center">
              <div>
                <div className="text-sm text-dark/60">Total</div>
                <div className="text-xl font-semibold">{totalRegistros}</div>
              </div>
              <div>
                <div className="text-sm text-dark/60">% Entregadas</div>
                <div className="text-xl font-semibold">{porcentajeEntregado}%</div>
              </div>
              <div>
                <div className="text-sm text-dark/60">% No entregado</div>
                <div className="text-xl font-semibold">{porcentajeAtrasos}%</div>
              </div>
            </div>
          </CardBox>
        </div>
        <div className="col-span-12 md:col-span-7">
          <CardBox>
            <h5 className="card-title mb-4">Entregas por dia (apiladas)</h5>
            <Chart options={stackedOptions} series={stackedSeries} type="bar" height={300} />
          </CardBox>
        </div>
      </div>

      <CardBox>
        <h5 className="card-title mb-4">Productividad por conductor</h5>
        <Chart options={productividadOptions} series={productividadSeries} type="bar" height={320} />
        <p className="text-sm text-dark/70 mt-3">{productividadLabel}</p>
      </CardBox>
    </div>
  );
};

export default Reportes;
