import React, { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Badge, Button, TextInput, Select } from 'flowbite-react';
import { Icon } from '@iconify/react/dist/iconify.js';
import { useNavigate } from 'react-router';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';

type VehiculoApi = {
  idVehiculo: number | string;
  idDispositivoGps?: number | string | null;
  placa?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  capacidadKg?: number | null;
  estadoVehiculo?: string | null;
  fechaUltimoMantenimiento?: string | null;
  status?: number | null;
};

type Vehiculo = {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  capacidadKg: number | null;
  estadoVehiculo: string;
  fechaUltimoMantenimiento: string | null;
  idDispositivoGps: number | null;
  status: number | null;
};

type EstadoVehiculo = 'Nuevo' | 'Semi Nuevo';

type EditVehiculoFormState = {
  placa: string;
  marca: string;
  modelo: string;
  anio: string;
  capacidadKg: string;
  estadoVehiculo: EstadoVehiculo;
  fechaUltimoMantenimiento: string;
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

const mapVehiculo = (vehiculo: VehiculoApi): Vehiculo => ({
  id: String(vehiculo.idVehiculo),
  placa: sanitize(vehiculo.placa),
  marca: sanitize(vehiculo.marca),
  modelo: sanitize(vehiculo.modelo),
  anio: vehiculo.anio ?? null,
  capacidadKg: vehiculo.capacidadKg ?? null,
  estadoVehiculo: sanitize(vehiculo.estadoVehiculo) || 'Sin estado',
  fechaUltimoMantenimiento: vehiculo.fechaUltimoMantenimiento ?? null,
  idDispositivoGps: vehiculo.idDispositivoGps ? Number(vehiculo.idDispositivoGps) : null,
  status: vehiculo.status ?? null,
});

const normalizeDateInput = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().split('T')[0] || '';
};

const estadoVehiculoOptions: EstadoVehiculo[] = ['Nuevo', 'Semi Nuevo'];

const normalizeEstadoVehiculo = (value?: string | null): EstadoVehiculo => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'semi nuevo' || normalized === 'semi-nuevo') {
    return 'Semi Nuevo';
  }
  return 'Nuevo';
};

const buildEditFormState = (vehiculo?: Vehiculo | null): EditVehiculoFormState => ({
  placa: vehiculo?.placa ?? '',
  marca: vehiculo?.marca ?? '',
  modelo: vehiculo?.modelo ?? '',
  anio: vehiculo?.anio !== null && vehiculo?.anio !== undefined ? String(vehiculo.anio) : '',
  capacidadKg: vehiculo?.capacidadKg !== null && vehiculo?.capacidadKg !== undefined ? String(vehiculo.capacidadKg) : '',
  estadoVehiculo: vehiculo ? normalizeEstadoVehiculo(vehiculo.estadoVehiculo) : 'Nuevo',
  fechaUltimoMantenimiento: normalizeDateInput(vehiculo?.fechaUltimoMantenimiento ?? null),
});

const parseNumberFromString = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'Sin registro';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const Vehiculos: React.FC = () => {
  const navigate = useNavigate();
  const { token, authorizedFetch } = useAuthorizedApi();
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('all');
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null);
  const [editForm, setEditForm] = useState<EditVehiculoFormState>(buildEditFormState());
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setVehiculos([]);
      setSelectedVehiculo(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const term = searchTerm.trim() === '' ? 'all' : searchTerm.trim();

    const obtenerVehiculos = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authorizedFetch(`/api/v1/vehiculos/${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener vehiculos (${response.status}).`);
        }

        const json = (await response.json()) as { data?: VehiculoApi[] };
        if (!isMounted) {
          return;
        }

        const items = Array.isArray(json.data) ? json.data.map(mapVehiculo) : [];
        setVehiculos(items);
        setSelectedVehiculo((prev) => (prev && items.some((vehiculo) => vehiculo.id === prev.id) ? prev : null));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Error al obtener vehiculos', error);
        if (isMounted) {
          setError('No se pudieron cargar los vehiculos. Intenta nuevamente.');
          setVehiculos([]);
          setSelectedVehiculo(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void obtenerVehiculos();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [authorizedFetch, searchTerm, token]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    setSearchTerm(normalized || 'all');
  };

  const handleClear = () => {
    setQuery('');
    setSearchTerm('all');
    setSelectedVehiculo(null);
  };

  const handleAgregar = () => {
    navigate('/menu/vehiculos/nuevo');
  };

  const vehiculosEnTabla = useMemo(() => vehiculos, [vehiculos]);

  const toggleDetalle = (vehiculo: Vehiculo) => {
    setSelectedVehiculo((prev) => (prev && prev.id === vehiculo.id ? null : vehiculo));
  };

  const closeEditForm = () => {
    setEditingVehiculo(null);
    setEditForm(buildEditFormState());
    setEditError(null);
  };

  const openEditForm = (vehiculo: Vehiculo) => {
    if (editingVehiculo?.id === vehiculo.id) {
      closeEditForm();
      return;
    }
    setActionMessage(null);
    setEditError(null);
    setEditingVehiculo(vehiculo);
    setEditForm(buildEditFormState(vehiculo));
  };

  const handleEditInputChange = (field: keyof EditVehiculoFormState, value: string) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: field === 'estadoVehiculo' ? (value as EstadoVehiculo) : value,
    }));
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingVehiculo) {
      return;
    }

    const requiredFields: Array<[keyof EditVehiculoFormState, string]> = [
      ['placa', 'La placa'],
      ['marca', 'La marca'],
      ['modelo', 'El modelo'],
      ['estadoVehiculo', 'El estado'],
    ];

    for (const [field, label] of requiredFields) {
      if (!editForm[field].trim()) {
        setEditError(`${label} es obligatoria.`);
        return;
      }
    }

    const anioNumber = (() => {
      const parsed = parseNumberFromString(editForm.anio);
      if (editForm.anio.trim() && parsed === null) {
        setEditError('El campo Año debe contener solo números.');
        return undefined;
      }
      return parsed;
    })();
    if (anioNumber === undefined) {
      return;
    }

    const capacidadNumber = (() => {
      const parsed = parseNumberFromString(editForm.capacidadKg);
      if (editForm.capacidadKg.trim() && parsed === null) {
        setEditError('La capacidad debe ser un número.');
        return undefined;
      }
      return parsed;
    })();
    if (capacidadNumber === undefined) {
      return;
    }

    if (editForm.fechaUltimoMantenimiento && !/^\d{4}-\d{2}-\d{2}$/.test(editForm.fechaUltimoMantenimiento)) {
      setEditError('Selecciona una fecha válida (formato yyyy-MM-dd).');
      return;
    }

    const payload = {
      idVehiculo: Number(editingVehiculo.id),
      idDispositivoGps: editingVehiculo.idDispositivoGps,
      placa: editForm.placa.trim(),
      marca: editForm.marca.trim(),
      modelo: editForm.modelo.trim(),
      anio: anioNumber,
      capacidadKg: capacidadNumber,
      estadoVehiculo: editForm.estadoVehiculo.trim(),
      fechaUltimoMantenimiento: editForm.fechaUltimoMantenimiento || null,
      status: editingVehiculo.status,
    };

    if (Number.isNaN(payload.idVehiculo)) {
      setEditError('No se encontró el identificador del vehiculo.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    setActionMessage(null);

    try {
      const response = await authorizedFetch('/api/v1/vehiculos/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `No se pudo actualizar el vehiculo (status ${response.status}).`);
      }

      const actualizado: Vehiculo = {
        ...editingVehiculo,
        placa: payload.placa,
        marca: payload.marca,
        modelo: payload.modelo,
        anio: payload.anio,
        capacidadKg: payload.capacidadKg,
        estadoVehiculo: payload.estadoVehiculo,
        fechaUltimoMantenimiento: payload.fechaUltimoMantenimiento,
      };

      setVehiculos((prev) => prev.map((vehiculo) => (vehiculo.id === actualizado.id ? actualizado : vehiculo)));
      setSelectedVehiculo((prev) => (prev && prev.id === actualizado.id ? actualizado : prev));
      setActionMessage({ type: 'success', message: 'Vehiculo actualizado correctamente.' });
      closeEditForm();
    } catch (error) {
      console.error('Error al actualizar vehiculo', error);
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el vehiculo.';
      setEditError(message);
      setActionMessage({ type: 'error', message: 'No se pudo actualizar el vehiculo. Intenta nuevamente.' });
    } finally {
      setEditSubmitting(false);
    }
  };

const handleDeleteVehiculo = async (vehiculo: Vehiculo) => {
    const labelParts = [vehiculo.placa, vehiculo.marca, vehiculo.modelo].map((value) => (value ?? '').trim());
    const displayLabel = labelParts.find((value) => value.length > 0) ?? 'seleccionado';
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`¿Deseas eliminar el vehiculo ${displayLabel}? Esta acción no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setDeleteInProgress(vehiculo.id);

    try {
      const response = await authorizedFetch(`/api/v1/vehiculos/delete/${vehiculo.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `No se pudo eliminar el vehiculo (status ${response.status}).`);
      }

      setVehiculos((prev) => prev.filter((item) => item.id !== vehiculo.id));
      setSelectedVehiculo((prev) => (prev && prev.id === vehiculo.id ? null : prev));
      if (editingVehiculo?.id === vehiculo.id) {
        closeEditForm();
      }
      setActionMessage({ type: 'success', message: 'Vehiculo eliminado correctamente.' });
    } catch (error) {
      console.error('Error al eliminar vehiculo', error);
      setActionMessage({ type: 'error', message: 'No se pudo eliminar el vehiculo. Intenta nuevamente.' });
    } finally {
      setDeleteInProgress(null);
    }
  };

  return (
    <>
      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">Vehiculos</span>
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 mb-6">
        <h5 className="card-title text-center">Vehiculos</h5>
        <form className="mt-4 flex flex-col md:flex-row items-stretch gap-3" onSubmit={handleSearch}>
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark/60">
              <Icon icon="solar:magnifer-linear" width={20} />
            </span>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ingresa placa o modelo del vehiculo"
              className="pl-9 form-control form-rounded-xl"
            />
          </div>
          <div className="flex gap-2 md:w-auto w-full">
            <Button type="submit" color="primary" className="font-medium w-full md:w-auto" disabled={isLoading}>
              {isLoading ? 'Buscando...' : 'Buscar'}
            </Button>
            <Button type="button" color="gray" className="font-medium w-full md:w-auto" onClick={handleClear} disabled={isLoading}>
              Limpiar
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 relative w-full break-words">
        <div className="flex items-center justify-between mb-3">
          <h6 className="text-base font-medium">Listado de vehiculos</h6>
          {isLoading && <span className="text-sm text-dark/60">Cargando vehiculos...</span>}
        </div>
        <div className="overflow-x-auto">
          <Table hoverable>
            <TableHead className="border-b border-gray-300">
              <TableRow>
                <TableHeadCell className="p-6 text-base">Marca</TableHeadCell>
                <TableHeadCell className="text-base">Modelo</TableHeadCell>
                <TableHeadCell className="text-base">Placa</TableHeadCell>
                <TableHeadCell className="text-base">Estado</TableHeadCell>
                <TableHeadCell className="text-base">Opciones</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-gray-300">
              {vehiculosEnTabla.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6">
                    <span className="text-sm text-dark/60">No se encontraron vehiculos.</span>
                  </TableCell>
                </TableRow>
              ) : (
                vehiculosEnTabla.map((vehiculo) => {
                  const activo = (vehiculo.status ?? 0) === 1;
                  const isEditing = editingVehiculo?.id === vehiculo.id;
                  return (
                    <React.Fragment key={vehiculo.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap ps-6">
                          <span className="text-sm">{vehiculo.marca || 'Sin marca'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{vehiculo.modelo || 'Sin modelo'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{vehiculo.placa || 'Sin placa'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            color={activo ? 'lightsuccess' : 'lighterror'}
                            className={`border ${activo ? 'border-success text-success' : 'border-error text-error'}`}
                          >
                            {activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <button title="Ver" className="hover:text-primary" onClick={() => toggleDetalle(vehiculo)}>
                              <Icon icon="solar:eye-linear" width={20} />
                            </button>
                            <button
                              title="Modificar vehiculo"
                              className="hover:text-warning disabled:text-dark/40 disabled:cursor-not-allowed"
                              onClick={() => openEditForm(vehiculo)}
                              disabled={editSubmitting && isEditing}
                            >
                              <Icon icon="solar:pen-linear" width={20} />
                            </button>
                            <button
                              title="Eliminar"
                              className="hover:text-error disabled:text-dark/40 disabled:cursor-not-allowed"
                              onClick={() => handleDeleteVehiculo(vehiculo)}
                              disabled={deleteInProgress === vehiculo.id}
                            >
                              <Icon icon="solar:trash-bin-minimalistic-linear" width={20} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isEditing && editingVehiculo && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <form className="flex flex-col gap-4" onSubmit={handleEditSubmit}>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">Placa</label>
                                  <TextInput
                                    value={editForm.placa}
                                    onChange={(event) => handleEditInputChange('placa', event.target.value)}
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">Marca</label>
                                  <TextInput
                                    value={editForm.marca}
                                    onChange={(event) => handleEditInputChange('marca', event.target.value)}
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">Modelo</label>
                                  <TextInput
                                    value={editForm.modelo}
                                    onChange={(event) => handleEditInputChange('modelo', event.target.value)}
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">Año</label>
                                  <TextInput
                                    type="number"
                                    value={editForm.anio}
                                    onChange={(event) => handleEditInputChange('anio', event.target.value)}
                                    min={0}
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">
                                    Capacidad (Kg)
                                  </label>
                                  <TextInput
                                    type="number"
                                    value={editForm.capacidadKg}
                                    onChange={(event) => handleEditInputChange('capacidadKg', event.target.value)}
                                    min={0}
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">Estado</label>
                                  <Select
                                    value={editForm.estadoVehiculo}
                                    onChange={(event) => handleEditInputChange('estadoVehiculo', event.target.value)}
                                    required
                                  >
                                    {estadoVehiculoOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase text-dark/60">
                                    Fecha último mantenimiento
                                  </label>
                                  <TextInput
                                    type="date"
                                    value={editForm.fechaUltimoMantenimiento}
                                    onChange={(event) =>
                                      handleEditInputChange('fechaUltimoMantenimiento', event.target.value)
                                    }
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-xs uppercase text-dark/60">Dispositivo asignado</p>
                                  <p className="font-medium">
                                    {editingVehiculo.idDispositivoGps !== null && editingVehiculo.idDispositivoGps !== undefined
                                      ? 'Con dispositivo (no modificable)'
                                      : 'Sin dispositivo asignado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase text-dark/60">Status actual</p>
                                  <p className="font-medium">
                                    {(editingVehiculo.status ?? 0) === 1 ? 'Activo' : 'Inactivo'}
                                  </p>
                                </div>
                              </div>
                              {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
                              <div className="flex justify-end gap-2">
                                <Button type="submit" color="primary" disabled={editSubmitting}>
                                  {editSubmitting ? 'Guardando...' : 'Guardar cambios'}
                                </Button>
                                <Button type="button" color="light" onClick={closeEditForm} disabled={editSubmitting}>
                                  Cancelar
                                </Button>
                              </div>
                            </form>
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
        {actionMessage && (
          <p
            className={
              'mt-4 text-sm ' +
              (actionMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
            }
          >
            {actionMessage.message}
          </p>
        )}
      </div>

      {selectedVehiculo && (
        <div className="mt-6 rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h6 className="text-base font-semibold">Detalle del vehiculo</h6>
              <p className="text-sm text-dark/60">Informacion detallada del vehiculo seleccionado.</p>
            </div>
            <Button color="gray" size="sm" onClick={() => setSelectedVehiculo(null)}>
              Cerrar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase text-dark/50">Marca</p>
              <p className="text-sm font-medium">{selectedVehiculo.marca || 'Sin marca'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Modelo</p>
              <p className="text-sm font-medium">{selectedVehiculo.modelo || 'Sin modelo'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Placa</p>
              <p className="text-sm font-medium">{selectedVehiculo.placa || 'Sin placa'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Anio</p>
              <p className="text-sm font-medium">{selectedVehiculo.anio ?? 'Sin registro'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Capacidad (Kg)</p>
              <p className="text-sm font-medium">{selectedVehiculo.capacidadKg ?? 'Sin registro'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Estado</p>
              <p className="text-sm font-medium">{selectedVehiculo.estadoVehiculo}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Dispositivo GPS</p>
              <p className="text-sm font-medium">
                {selectedVehiculo.idDispositivoGps !== null && selectedVehiculo.idDispositivoGps !== undefined
                  ? 'Con dispositivo asignado'
                  : 'Sin dispositivo asignado'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Ultimo mantenimiento</p>
              <p className="text-sm font-medium">{formatDate(selectedVehiculo.fechaUltimoMantenimiento)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button color="primary" onClick={handleAgregar} className="font-medium">
          Agregar un nuevo vehiculo
        </Button>
      </div>
    </>
  );
};

export default Vehiculos;

