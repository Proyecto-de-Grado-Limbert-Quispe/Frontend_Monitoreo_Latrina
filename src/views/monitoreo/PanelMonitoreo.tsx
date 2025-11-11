import React, { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Button, TextInput, Badge } from 'flowbite-react';
import { Icon } from '@iconify/react/dist/iconify.js';
import { useNavigate } from 'react-router';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';

type DispositivoGpsApi = {
  idDispositivo?: number | string | null;
  codigo?: string | null;
};

type VehiculoApi = {
  idVehiculo?: number | string | null;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  idDispositivoGps?: number | string | null;
  dispositivoGps?: DispositivoGpsApi | null;
};

type ConductorApi = {
  idUsuario?: number | string | null;
  nombreCompleto?: string | null;
  idDispositivoGps?: number | string | null;
};

type ProgramacionApi = {
  idProgramacion: number | string;
  fechaEntrega?: string | null;
  estadoEntrega?: number | string | null;
  status?: number | string | null;
  idDispositivoGps?: number | string | null;
  dispositivoGps?: DispositivoGpsApi | null;
  vehiculo?: VehiculoApi | null;
  vehiculoAsignado?: VehiculoApi | null;
  conductor?: ConductorApi | null;
  conductorAsignado?: ConductorApi | null;
};

type ProgramacionItem = {
  id: string;
  fechaEntrega: string | null;
  estadoEntrega: number | null;
  vehiculoDescripcion: string;
  conductorNombre: string;
  dispositivoId: string | null;
};

const formatDateDisplay = (value: string | null): string => {
  const normalized = normalizeIsoDateString(value);
  if (!normalized) {
    return 'Sin fecha';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }
  return new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const formatDateForApi = (value: string): string => {
  if (!value) {
    return '';
  }
  const parts = value.split('-');
  if (parts.length !== 3) {
    return '';
  }
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) {
    return '';
  }
  return day + '-' + month + '-' + year;
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

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const buildVehiculoDescripcion = (vehiculo: VehiculoApi | null | undefined): string => {
  if (!vehiculo) {
    return 'Sin vehiculo asignado';
  }
  const placa = sanitize(vehiculo.placa);
  const marca = sanitize(vehiculo.marca);
  const modelo = sanitize(vehiculo.modelo);
  const parts = [placa, marca, modelo].filter((part) => Boolean(part));
  return parts.length ? parts.join(' - ') : 'Sin vehiculo asignado';
};

const normalizeIdValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const resolveProgramacionDispositivoId = (
  programacion: ProgramacionApi,
  vehiculo: VehiculoApi | null,
  conductor: ConductorApi | null,
): string | null => {
  const candidates: unknown[] = [
    conductor?.idDispositivoGps,
    programacion.idDispositivoGps,
    programacion.dispositivoGps?.idDispositivo,
    vehiculo?.idDispositivoGps,
    vehiculo?.dispositivoGps?.idDispositivo,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIdValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const getTodayIsoDate = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offsetMs = today.getTimezoneOffset() * 60 * 1000;
  const adjusted = new Date(today.getTime() - offsetMs);
  return adjusted.toISOString().split('T')[0]!;
};

const isEstadoEntregado = (estado: number | string | null | undefined): boolean => {
  if (estado === null || estado === undefined) {
    return false;
  }
  const numeric = typeof estado === 'number' ? estado : Number(estado);
  return numeric === 2;
};

const mapProgramacionEstado = (estado: number | null) => {
  switch (estado) {
    case 0:
      return { label: 'En proceso', badge: 'lightwarning', cls: 'border-warning text-warning' };
    case 2:
      return { label: 'Entregado', badge: 'lightsuccess', cls: 'border-success text-success' };
    case 3:
      return { label: 'No entregado', badge: 'lightsecondary', cls: 'border-secondary text-secondary' };
    default:
      return { label: 'Sin estado', badge: 'lightsecondary', cls: 'border-secondary text-secondary' };
  }
};

const mapProgramacion = (programacion: ProgramacionApi): ProgramacionItem => {
  const vehiculoRaw = programacion.vehiculo ?? programacion.vehiculoAsignado ?? null;
  const conductorRaw = programacion.conductor ?? programacion.conductorAsignado ?? null;
  const dispositivoId = resolveProgramacionDispositivoId(programacion, vehiculoRaw, conductorRaw);
  const fechaEntregaNormalizada = normalizeIsoDateString(programacion.fechaEntrega ?? null);

  return {
    id: String(programacion.idProgramacion),
    fechaEntrega: fechaEntregaNormalizada,
    estadoEntrega: parseNumber(programacion.estadoEntrega),
    vehiculoDescripcion: buildVehiculoDescripcion(vehiculoRaw),
    conductorNombre: sanitize(conductorRaw?.nombreCompleto),
    dispositivoId,
  };
};

type SearchParams = {
  nro: string;
  desde: string;
  hasta: string;
};

const PanelMonitoreo: React.FC = () => {
  const navigate = useNavigate();
  const { token, authorizedFetch } = useAuthorizedApi();

  const [nro, setNro] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [searchParams, setSearchParams] = useState<SearchParams>({ nro: '', desde: '', hasta: '' });

  const [items, setItems] = useState<ProgramacionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProgramacion, setEditingProgramacion] = useState<ProgramacionItem | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);

  useEffect(() => {
    if (!token) {
      setItems([]);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const nroParam = searchParams.nro.trim();
    const desdeParam = formatDateForApi(searchParams.desde);
    const hastaParam = formatDateForApi(searchParams.hasta);

    const query = new URLSearchParams({
      nro: nroParam,
      desde: desdeParam,
      hasta: hastaParam,
    });

    const fetchProgramaciones = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await authorizedFetch('/api/v1/programacion-distribucion/all?' + query.toString(), {
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Error al obtener las programaciones (' + response.status + ').');
        }

        const json = (await response.json()) as { data?: ProgramacionApi[] };
        if (!isMounted) {
          return;
        }

        const records = Array.isArray(json.data) ? json.data.map(mapProgramacion) : [];
        setItems(records);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Error al obtener programaciones', error);
        if (isMounted) {
          setError('No se pudieron cargar las programaciones. Intenta nuevamente.');
          setItems([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchProgramaciones();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [authorizedFetch, searchParams, token]);

  const closeEditForm = () => {
    setEditingProgramacion(null);
    setEditFecha('');
    setMutationError(null);
  };

  const openEditForm = (programacion: ProgramacionItem) => {
    if (isEstadoEntregado(programacion.estadoEntrega)) {
      return;
    }
    if (editingProgramacion?.id === programacion.id) {
      closeEditForm();
      return;
    }
    setActionStatus(null);
    setMutationError(null);
    const normalizedProgramacionDate = normalizeIsoDateString(programacion.fechaEntrega);
    const initialDate =
      normalizedProgramacionDate && normalizedProgramacionDate >= todayIsoDate ? normalizedProgramacionDate : todayIsoDate;
    setEditingProgramacion(programacion);
    setEditFecha(initialDate ?? todayIsoDate);
  };

  const handleDelete = async (programacion: ProgramacionItem) => {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`¿Deseas eliminar la programación ${programacion.id}? Esta acción no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setActionStatus(null);
    setDeleteInProgress(programacion.id);
    try {
      const response = await authorizedFetch('/api/v1/programacion-distribucion/delete/' + programacion.id, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `No se pudo eliminar (status ${response.status}).`);
      }
      setItems((prev) => prev.filter((item) => item.id !== programacion.id));
      if (editingProgramacion?.id === programacion.id) {
        closeEditForm();
      }
      setActionStatus({ type: 'success', message: 'Programación eliminada correctamente.' });
    } catch (deleteError) {
      console.error('Error al eliminar programacion', deleteError);
      setActionStatus({
        type: 'error',
        message: 'No se pudo eliminar la programación seleccionada. Intenta nuevamente.',
      });
    } finally {
      setDeleteInProgress(null);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProgramacion) {
      return;
    }

    const normalizedDate = normalizeIsoDateString(editFecha);
    if (!normalizedDate) {
      setMutationError('Selecciona una fecha válida con el formato yyyy-MM-dd.');
      return;
    }
    if (normalizedDate < todayIsoDate) {
      setMutationError('Selecciona una fecha igual o posterior a la fecha actual.');
      return;
    }

    setActionStatus(null);
    setMutationError(null);
    setEditSubmitting(true);

    try {
      const response = await authorizedFetch(
        '/api/v1/programacion-distribucion/updateFecha/' + editingProgramacion.id + '/' + normalizedDate,
        {
          method: 'PUT',
        },
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `No se pudo actualizar la fecha (status ${response.status}).`);
      }
      setItems((prev) =>
        prev.map((item) => (item.id === editingProgramacion.id ? { ...item, fechaEntrega: normalizedDate } : item)),
      );
      setActionStatus({ type: 'success', message: 'Fecha actualizada correctamente.' });
      closeEditForm();
    } catch (editError) {
      console.error('Error al actualizar fecha de programacion', editError);
      setMutationError(editError instanceof Error ? editError.message : 'No se pudo actualizar la fecha.');
      setActionStatus({ type: 'error', message: 'No se pudo actualizar la fecha. Intenta nuevamente.' });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchParams({ nro: nro.trim(), desde, hasta });
  };

  const handleClear = () => {
    setNro('');
    setDesde('');
    setHasta('');
    setSearchParams({ nro: '', desde: '', hasta: '' });
  };

  const programaciones = useMemo(() => items, [items]);

  return (
    <>
      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">PanelMonitoreo</span>
      </div>

      <h3 className="text-2xl font-semibold text-center mb-4">Panel de Monitoreo</h3>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 mb-6">
        <form className="grid grid-cols-12 gap-4 items-end" onSubmit={handleSearch}>
          <div className="md:col-span-4 col-span-12">
            <div className="relative w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark/60">
                <Icon icon="solar:magnifer-linear" width={20} />
              </span>
              <TextInput
                value={nro}
                onChange={(e) => setNro(e.target.value)}
                placeholder="Ingresa Nro. programacion"
                className="pl-9 form-control form-rounded-xl"
              />
            </div>
          </div>
          <div className="md:col-span-3 col-span-12">
            <label className="mb-2 block text-sm text-dark/80">Desde</label>
            <TextInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="form-control form-rounded-xl" />
          </div>
          <div className="md:col-span-3 col-span-12">
            <label className="mb-2 block text-sm text-dark/80">Hasta</label>
            <TextInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="form-control form-rounded-xl" />
          </div>
          <div className="md:col-span-2 col-span-12 flex gap-2">
            <Button type="submit" color="primary" className="w-full" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
            <Button type="button" color="light" onClick={handleClear} className="w-full" disabled={loading}>
              Limpiar
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6  relative w-full break-words">
        <h5 className="card-title text-center">Programacion de Distribucion de Salidas</h5>
        <div className="mt-3 overflow-x-auto">
          <Table hoverable>
            <TableHead className="border-b border-gray-300">
              <TableRow>
                <TableHeadCell className="p-6 text-base">Fecha de Distribucion</TableHeadCell>
                <TableHeadCell className="text-base">Nro. Programacion</TableHeadCell>
                <TableHeadCell className="text-base">Estado</TableHeadCell>
                <TableHeadCell className="text-base">Opciones</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-gray-300">
              {programaciones.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6">
                    <span className="text-sm text-dark/60">No se encontraron programaciones.</span>
                  </TableCell>
                </TableRow>
              ) : (
                programaciones.map((programacion) => {
                  const estado = mapProgramacionEstado(programacion.estadoEntrega);
                  const canEdit = !isEstadoEntregado(programacion.estadoEntrega);
                  const isEditing = editingProgramacion?.id === programacion.id;
                  return (
                    <React.Fragment key={programacion.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap ps-6">
                          <span className="text-sm">{formatDateDisplay(programacion.fechaEntrega)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{programacion.id}</span>
                        </TableCell>
                        <TableCell>
                          <Badge color={estado.badge} className={'border ' + estado.cls}>
                            {estado.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <button
                              title="Ver"
                              className="hover:text-primary"
                              onClick={() =>
                                navigate('/menu/panel-monitoreo/salidas/' + programacion.id, {
                                  state: { programacion },
                                })
                              }
                            >
                              <Icon icon="solar:eye-linear" width={20} />
                            </button>
                            <button
                              title={
                                canEdit ? 'Modificar fecha' : 'No se puede modificar una programación ya entregada'
                              }
                              className="hover:text-warning disabled:text-dark/40 disabled:cursor-not-allowed"
                              onClick={() => openEditForm(programacion)}
                              disabled={!canEdit || (editSubmitting && isEditing)}
                            >
                              <Icon icon="solar:pen-new-square-linear" width={20} />
                            </button>
                            <button
                              title="Eliminar"
                              className="hover:text-error disabled:text-dark/40 disabled:cursor-not-allowed"
                              onClick={() => handleDelete(programacion)}
                              disabled={deleteInProgress === programacion.id}
                            >
                              <Icon icon="solar:trash-bin-minimalistic-linear" width={20} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isEditing && (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleEditSubmit}>
                              <div className="flex-1">
                                <label className="mb-2 block text-sm text-dark/80">Nueva fecha de distribución</label>
                                <TextInput
                                  type="date"
                                  value={editFecha}
                                  onChange={(event) => setEditFecha(event.target.value)}
                                  className="form-control form-rounded-xl"
                                  required
                                  min={todayIsoDate}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button type="submit" color="primary" disabled={editSubmitting}>
                                  {editSubmitting ? 'Guardando...' : 'Guardar'}
                                </Button>
                                <Button type="button" color="light" onClick={closeEditForm} disabled={editSubmitting}>
                                  Cancelar
                                </Button>
                              </div>
                            </form>
                            {mutationError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{mutationError}</p>}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {actionStatus && (
          <p
            className={
              'mt-4 text-sm ' +
              (actionStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
            }
          >
            {actionStatus.message}
          </p>
        )}
      </div>
    </>
  );
};

export default PanelMonitoreo;

