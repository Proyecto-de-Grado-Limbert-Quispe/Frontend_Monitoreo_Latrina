import React, { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Badge, Button, TextInput, Select } from 'flowbite-react';
import { Icon } from '@iconify/react/dist/iconify.js';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';
import { useTraccarApi } from 'src/hooks/useTraccarApi';

type DispositivoApi = {
  idDispositivo: number | string;
  codigo?: string | null;
  modelo?: string | null;
  activo?: number | null;
  status?: number | null;
};

type Dispositivo = {
  id: string;
  codigo: string;
  modelo: string;
  activo: number | null;
  status: number | null;
};

type DispositivosPage = {
  content?: DispositivoApi[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
  first?: boolean;
  last?: boolean;
  numberOfElements?: number;
};

type ApiResponse<T> = {
  code?: number;
  data?: T;
  message?: string;
};

type FeedbackMessage = {
  type: 'success' | 'error';
  message: string;
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

const mapDispositivo = (dispositivo: DispositivoApi): Dispositivo => ({
  id: String(dispositivo.idDispositivo),
  codigo: sanitize(dispositivo.codigo),
  modelo: sanitize(dispositivo.modelo),
  activo: dispositivo.activo ?? null,
  status: dispositivo.status ?? null,
});

const availabilityLabel = (value: number | null): string => {
  switch (value) {
    case 1:
      return 'Disponible';
    case 2:
      return 'Asignado';
    default:
      return 'Sin estado';
  }
};

const availabilityBadgeColor = (value: number | null): string => {
  switch (value) {
    case 1:
      return 'lightsuccess';
    case 2:
      return 'lightwarning';
    default:
      return 'lightsecondary';
  }
};

const statusLabel = (value: number | null): string => {
  if (value === 1) {
    return 'Activo';
  }
  if (value === 0) {
    return 'Inactivo';
  }
  return 'Sin registro';
};

const PAGE_SIZES = [5, 10, 15, 20] as const;

const Dispositivos: React.FC = () => {
  const { token, authorizedFetch } = useAuthorizedApi();
  const { traccarFetch } = useTraccarApi();

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [selectedDispositivo, setSelectedDispositivo] = useState<Dispositivo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[1]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isFirstPage, setIsFirstPage] = useState(true);
  const [isLastPage, setIsLastPage] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<FeedbackMessage | null>(null);

  useEffect(() => {
    if (!token) {
      setDispositivos([]);
      setSelectedDispositivo(null);
      setTotalElements(0);
      setTotalPages(0);
      setIsFirstPage(true);
      setIsLastPage(true);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const term = searchTerm.trim() === '' ? 'all' : searchTerm.trim();
    const safePage = Math.max(page, 0);

    const obtenerDispositivos = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(safePage),
          size: String(size),
        });
        const response = await authorizedFetch(
          `/api/v1/dispositivosGps/${encodeURIComponent(term)}?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );

        const json = (await response.json().catch(() => null)) as ApiResponse<DispositivosPage | DispositivoApi[]> | null;
        if (!isMounted) {
          return;
        }

        if (!response.ok) {
          const text = json?.message ?? '';
          throw new Error(text || `Error al obtener dispositivos (${response.status}).`);
        }

        if (json?.code && json.code !== 200) {
          throw new Error(json.message || 'Error al obtener dispositivos.');
        }

        const data = json?.data;
        let itemsSource: DispositivoApi[] = [];
        let totalRegistros = 0;
        let totalPaginas = 0;
        let firstFlag = safePage <= 0;
        let lastFlag = true;

        if (Array.isArray(data)) {
          itemsSource = data;
          totalRegistros = data.length;
          totalPaginas = data.length ? 1 : 0;
          firstFlag = true;
          lastFlag = true;
        } else if (data && typeof data === 'object') {
          const pageData = data as DispositivosPage;
          if (Array.isArray(pageData.content)) {
            itemsSource = pageData.content;
          }
          totalRegistros = typeof pageData.totalElements === 'number' ? pageData.totalElements : itemsSource.length;
          if (typeof pageData.totalPages === 'number') {
            totalPaginas = pageData.totalPages;
          } else if (totalRegistros > 0 && size > 0) {
            totalPaginas = Math.ceil(totalRegistros / size);
          } else {
            totalPaginas = itemsSource.length ? 1 : 0;
          }
          firstFlag = typeof pageData.first === 'boolean' ? pageData.first : firstFlag;
          lastFlag =
            typeof pageData.last === 'boolean'
              ? pageData.last
              : totalPaginas
                ? safePage >= totalPaginas - 1
                : itemsSource.length < size;
        }

        if (totalPaginas > 0 && safePage >= totalPaginas) {
          setPage(Math.max(totalPaginas - 1, 0));
          return;
        }

        const items = itemsSource.map(mapDispositivo);
        setDispositivos(items);
        setTotalElements(totalRegistros);
        setTotalPages(totalPaginas);
        setIsFirstPage(firstFlag);
        setIsLastPage(lastFlag);
        setSelectedDispositivo((prev) => (prev && items.some((item) => item.id === prev.id) ? prev : null));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Error al obtener dispositivos', error);
        if (isMounted) {
          setError('No se pudieron cargar los dispositivos. Intenta nuevamente.');
          setDispositivos([]);
          setSelectedDispositivo(null);
          setTotalElements(0);
          setTotalPages(0);
          setIsFirstPage(true);
          setIsLastPage(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void obtenerDispositivos();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [authorizedFetch, page, searchTerm, size, token, reloadKey]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    setSearchTerm(normalized || 'all');
    setPage(0);
  };

  const handleClear = () => {
    setQuery('');
    setSearchTerm('all');
    setSelectedDispositivo(null);
    setPage(0);
  };

  const toggleDetalle = (dispositivo: Dispositivo) => {
    setSelectedDispositivo((prev) => (prev && prev.id === dispositivo.id ? null : dispositivo));
  };

  const resetForm = () => {
    setNuevoCodigo('');
    setNuevoModelo('');
  };

  const handleGuardarNuevo = async () => {
    if (!token) {
      setSubmitError('No se encontro un token de autenticacion.');
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(null);

    const codigo = sanitize(nuevoCodigo);
    const modelo = sanitize(nuevoModelo);

    if (!codigo || !modelo) {
      setSubmitError('Completa el codigo y el modelo del dispositivo.');
      return;
    }

    setIsSubmitting(true);
    let traccarDeviceId: number | string | null | undefined;
    try {
      const traccarDevicePayload = {
        name: codigo,
        uniqueId: codigo,
        category: modelo || undefined,
      };

      const traccarResponse = await traccarFetch('/api/devices', {
        method: 'POST',
        body: JSON.stringify(traccarDevicePayload),
      });

      if (!traccarResponse.ok) {
        const text = await traccarResponse.text();
        throw new Error(text || `Error al registrar el dispositivo en Traccar (${traccarResponse.status}).`);
      }

      const traccarDevice = (await traccarResponse.json()) as { id?: number | string | null };
      traccarDeviceId = traccarDevice?.id;
      if (traccarDeviceId === undefined || traccarDeviceId === null || traccarDeviceId === '') {
        throw new Error('Traccar no devolvio un identificador para el dispositivo registrado.');
      }

      const traccarIdAsString = String(traccarDeviceId);
      const modeloAlmacenado = `${codigo}${modelo ? `, ${modelo}` : ''}`;

      const payload = {
        idDispositivo: null,
        codigo: traccarIdAsString,
        modelo: modeloAlmacenado,
        activo: 1,
        status: 1,
      };

      const response = await authorizedFetch('/api/v1/dispositivosGps/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error al registrar el dispositivo (${response.status}).`);
      }

      setSubmitSuccess('Dispositivo registrado correctamente.');
      resetForm();
      setQuery('');
      setSearchTerm('all');
      setPage(0);
      setReloadKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error al registrar dispositivo', error);
      if (traccarDeviceId !== undefined && traccarDeviceId !== null) {
        try {
          await traccarFetch(`/api/devices/${encodeURIComponent(traccarDeviceId)}`, {
            method: 'DELETE',
          });
        } catch (cleanupError) {
          console.error('No se pudo revertir el registro en Traccar', cleanupError);
        }
      }
      setSubmitError(error instanceof Error ? error.message : 'No se pudo registrar el dispositivo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEliminarDispositivo = async (dispositivo: Dispositivo) => {
    if (!token) {
      setDeleteFeedback({
        type: 'error',
        message: 'No se encontro un token de autenticacion.',
      });
      return;
    }

    const traccarId = sanitize(dispositivo.codigo);
    if (!traccarId) {
      setDeleteFeedback({
        type: 'error',
        message: 'El dispositivo no tiene un identificador valido en Traccar.',
      });
      return;
    }

    const confirmMessage = `¿Deseas eliminar el dispositivo ${dispositivo.modelo || dispositivo.codigo || ''}? Esta accion no se puede deshacer.`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }

    setDeletingId(dispositivo.id);
    setDeleteFeedback(null);

    try {
      const traccarResponse = await traccarFetch(`/api/devices/${encodeURIComponent(traccarId)}`, {
        method: 'DELETE',
      });

      if (!traccarResponse.ok) {
        const text = await traccarResponse.text();
        throw new Error(text || `No se pudo eliminar el dispositivo en Traccar (${traccarResponse.status}).`);
      }

      const backendResponse = await authorizedFetch(`/api/v1/dispositivosGps/delete/${encodeURIComponent(dispositivo.id)}`, {
        method: 'DELETE',
      });
      const backendJson = (await backendResponse.json().catch(() => null)) as ApiResponse<null> | null;
      if (!backendResponse.ok) {
        const text = backendJson?.message ?? '';
        throw new Error(text || `No se pudo eliminar el dispositivo (${backendResponse.status}).`);
      }
      if (backendJson?.code && backendJson.code !== 200) {
        throw new Error(backendJson.message || 'No se pudo eliminar el dispositivo.');
      }

      setDeleteFeedback({
        type: 'success',
        message: backendJson?.message ?? 'Dispositivo GPS eliminado correctamente.',
      });
      setReloadKey((prev) => prev + 1);
      setSelectedDispositivo((prev) => (prev && prev.id === dispositivo.id ? null : prev));
    } catch (error) {
      console.error('Error al eliminar el dispositivo', error);
      setDeleteFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message || 'Hubo un problema al eliminar el dispositivo. Intenta nuevamente.'
            : 'Hubo un problema al eliminar el dispositivo. Intenta nuevamente.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const dispositivosEnTabla = useMemo(() => dispositivos, [dispositivos]);
  const startIndex = dispositivosEnTabla.length ? page * size + 1 : 0;
  const endIndex = dispositivosEnTabla.length ? startIndex + dispositivosEnTabla.length - 1 : 0;
  const resumen =
    totalElements > 0 && startIndex && endIndex
      ? `Mostrando ${startIndex}-${endIndex} de ${totalElements} dispositivos`
      : totalElements > 0
        ? `Total de dispositivos: ${totalElements}`
        : '';
  const computedTotalPages =
    totalPages > 0 ? totalPages : totalElements > 0 && size > 0 ? Math.ceil(totalElements / size) || 1 : 1;
  const currentPageLabel = Math.min(page + 1, computedTotalPages);

  const handleNextPage = () => {
    if (isLastPage || loading) {
      return;
    }
    setPage((prev) => prev + 1);
  };

  const handlePreviousPage = () => {
    if (isFirstPage || loading) {
      return;
    }
    setPage((prev) => Math.max(prev - 1, 0));
  };

  const handlePageSizeChange = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return;
    }
    setSize(parsed);
    setPage(0);
  };

  return (
    <>
      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">Dispositivos</span>
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 mb-6">
        <h5 className="card-title text-center">Gestion de Dispositivos</h5>
        <form className="mt-4 flex flex-col md:flex-row items-stretch gap-3" onSubmit={handleSearch}>
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark/60">
              <Icon icon="solar:magnifer-linear" width={20} />
            </span>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ingresa codigo o modelo del dispositivo GPS"
              className="pl-9 form-control form-rounded-xl"
            />
          </div>
          <div className="flex gap-2 md:w-auto w-full">
            <Button type="submit" color="primary" className="font-medium w-full md:w-auto" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
            <Button type="button" color="light" className="font-medium w-full md:w-auto" onClick={handleClear} disabled={loading}>
              Limpiar
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 relative w-full break-words">
        <div className="flex items-center justify-between mb-3">
          <h6 className="text-base font-medium">Listado de dispositivos</h6>
          {loading && <span className="text-sm text-dark/60">Cargando dispositivos...</span>}
        </div>
      <div className="mt-3 overflow-x-auto">
        <Table hoverable>
            <TableHead className="border-b border-gray-300">
              <TableRow>
                <TableHeadCell className="p-6 text-base">Codigo</TableHeadCell>
                <TableHeadCell className="text-base">Modelo</TableHeadCell>
                <TableHeadCell className="text-base">Disponibilidad</TableHeadCell>
                <TableHeadCell className="text-base">Opciones</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-gray-300">
              {dispositivosEnTabla.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6">
                    <span className="text-sm text-dark/60">No se encontraron dispositivos.</span>
                  </TableCell>
                </TableRow>
              ) : (
                dispositivosEnTabla.map((dispositivo) => {
                  const label = availabilityLabel(dispositivo.activo);
                  const badgeColor = availabilityBadgeColor(dispositivo.activo);
                  const badgeClass =
                    dispositivo.activo === 1
                      ? 'border-success text-success'
                      : dispositivo.activo === 2
                        ? 'border-warning text-warning'
                        : 'border-secondary text-dark/70';

                  return (
                    <TableRow key={dispositivo.id}>
                      <TableCell className="whitespace-nowrap ps-6">
                        <span className="text-sm">{dispositivo.codigo || 'Sin codigo'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{dispositivo.modelo || 'Sin modelo'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge color={badgeColor} className={`border ${badgeClass}`}>
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <button title="Ver" className="hover:text-primary" onClick={() => toggleDetalle(dispositivo)}>
                            <Icon icon="solar:eye-linear" width={20} />
                          </button>
                          <button
                            title="Eliminar"
                            className={`hover:text-error ${deletingId === dispositivo.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => handleEliminarDispositivo(dispositivo)}
                            disabled={deletingId === dispositivo.id}
                          >
                            <Icon icon="solar:trash-bin-minimalistic-linear" width={20} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {deleteFeedback && (
          <p
            className={`mt-3 text-sm ${
              deleteFeedback.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {deleteFeedback.message}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-dark/70">{resumen || (!loading && !error ? 'No hay dispositivos para mostrar.' : '')}</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-dark/70">Por pagina</span>
            <Select value={String(size)} onChange={(e) => handlePageSizeChange(e.target.value)} className="w-28" disabled={loading}>
              {PAGE_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Button type="button" color="light" size="xs" onClick={handlePreviousPage} disabled={isFirstPage || loading}>
              Anterior
            </Button>
            <span className="text-dark/70">
              Pagina {currentPageLabel} de {computedTotalPages}
            </span>
            <Button type="button" color="light" size="xs" onClick={handleNextPage} disabled={isLastPage || loading}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {selectedDispositivo && (
        <div className="mt-6 rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h6 className="text-base font-semibold">Detalle del dispositivo</h6>
              <p className="text-sm text-dark/60">Informacion del dispositivo seleccionado.</p>
            </div>
            <Button color="gray" size="sm" onClick={() => setSelectedDispositivo(null)}>
              Cerrar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase text-dark/50">Codigo</p>
              <p className="text-sm font-medium">{selectedDispositivo.codigo || 'Sin codigo'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Modelo</p>
              <p className="text-sm font-medium">{selectedDispositivo.modelo || 'Sin modelo'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Disponibilidad</p>
              <p className="text-sm font-medium">{availabilityLabel(selectedDispositivo.activo)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-dark/50">Estado</p>
              <p className="text-sm font-medium">{statusLabel(selectedDispositivo.status)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6">
        <h6 className="text-lg font-semibold mb-4">Agregar nuevo dispositivo</h6>
        <div className="grid grid-cols-12 gap-4">
          <div className="md:col-span-6 col-span-12">
            <label className="mb-2 block text-sm text-dark/80">Codigo:</label>
            <TextInput value={nuevoCodigo} onChange={(e) => setNuevoCodigo(e.target.value)} placeholder="GPS-000123" className="form-control form-rounded-xl" />
          </div>
          <div className="md:col-span-6 col-span-12">
            <label className="mb-2 block text-sm text-dark/80">Modelo:</label>
            <TextInput value={nuevoModelo} onChange={(e) => setNuevoModelo(e.target.value)} placeholder="Teltonika FMB920" className="form-control form-rounded-xl" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
          <Button color="primary" onClick={handleGuardarNuevo} className="font-medium" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar un nuevo dispositivo'}
          </Button>
          {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-green-600 dark:text-green-400">{submitSuccess}</p>}
        </div>
      </div>
    </>
  );
};

export default Dispositivos;
