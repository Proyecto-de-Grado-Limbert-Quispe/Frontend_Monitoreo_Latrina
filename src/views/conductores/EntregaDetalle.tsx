import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Badge, Button } from 'flowbite-react';
import { Icon } from '@iconify/react/dist/iconify.js';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';

type SalidaProgramadaDetalleApi = {
  idSalidaProgramadaDetalle?: number | string | null;
  idSalidaProgramada?: number | string | null;
  idNotaSalida?: number | string | null;
  idNotaSalidaDetalle?: number | string | null;
  productoNombre?: string | null;
  productoCodigo?: string | null;
  cantidad?: number | string | null;
  descripcion?: string | null;
  precioUnitario?: number | string | null;
  estadoObservacion?: number | string | null;
  estadoEntrega?: number | string | null;
  status?: number | string | null;
};

type Producto = {
  id: string;
  detalleId: number | null;
  codigo: string;
  orden: number | null;
  estadoEntrega: number | null;
  nombre: string;
  cantidad: number | null;
  precioUnitario: number | null;
  descripcion: string;
  estadoObservacion: number | null;
};

type NotaResumen = {
  idSalidaProgramada: string;
  nroSalida: string;
  cliente: string;
  ubicacionDetalle: string;
};

type LocationState = {
  nota?: NotaResumen | null;
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

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

const mapEstadoEntrega = (estado: number | null) => {
  switch (estado) {
    case 1:
      return { label: 'No entregado', badge: 'lightwarning', cls: 'border-warning text-warning' };
    case 2:
      return { label: 'Entregado', badge: 'lightsuccess', cls: 'border-success text-success' };
    case 3:
      return { label: 'Atrasado', badge: 'lighterror', cls: 'border-error text-error' };
    default:
      return { label: 'Sin estado', badge: 'lightsecondary', cls: 'border-secondary text-secondary' };
  }
};

const mapProducto = (detalle: SalidaProgramadaDetalleApi, index: number): Producto => {
  const id =
    detalle.idSalidaProgramadaDetalle !== undefined && detalle.idSalidaProgramadaDetalle !== null
      ? String(detalle.idSalidaProgramadaDetalle)
      : `detalle-${index}`;
  return {
    id,
    detalleId: parseNumber(detalle.idSalidaProgramadaDetalle),
    codigo: sanitize(detalle.productoCodigo),
    orden: parseNumber(detalle.idNotaSalidaDetalle) ?? index + 1,
    estadoEntrega: parseNumber(detalle.estadoEntrega),
    nombre: sanitize(detalle.productoNombre),
    cantidad: parseNumber(detalle.cantidad),
    precioUnitario: parseNumber(detalle.precioUnitario),
    descripcion: sanitize(detalle.descripcion),
    estadoObservacion: parseNumber(detalle.estadoObservacion),
  };
};

const formatCantidad = (cantidad: number | null): string => {
  if (cantidad === null) {
    return '-';
  }
  return Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(2);
};

const formatPrecio = (precio: number | null): string => {
  if (precio === null) {
    return '-';
  }
  return precio.toFixed(2);
};

const EntregaDetalle: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { authorizedFetch, token } = useAuthorizedApi();

  const state = (location.state ?? {}) as LocationState;
  const nota = state.nota ?? null;

  const salidaProgramadaId = nota?.idSalidaProgramada ?? (id ?? '');

  const [rows, setRows] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Producto | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [observacionDetalle, setObservacionDetalle] = useState<{
    detalleId: string;
    observacion: string;
    estadoEntrega: number | null;
  } | null>(null);
  const [observacionLoadId, setObservacionLoadId] = useState<string | null>(null);

  const fetchDetalles = useCallback(
    async (signal?: AbortSignal) => {
      if (!salidaProgramadaId) {
        setRows([]);
        setError('No se proporciono una salida programada.');
        return;
      }

      if (!token) {
        setRows([]);
        setError('No se pudo autenticar la solicitud.');
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await authorizedFetch(
          `/api/v1/salidas-programadas-detalle/salida-programada/${encodeURIComponent(salidaProgramadaId)}`,
          { signal },
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener los productos (${response.status}).`);
        }
        const json = (await response.json()) as { data?: SalidaProgramadaDetalleApi[] | null };
        if (signal?.aborted) {
          return;
        }
        const items = Array.isArray(json?.data) ? json.data.map((detalle, index) => mapProducto(detalle, index)) : [];
        setRows(items);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        console.error('Error al cargar los productos de la salida programada', err);
        setError('No se pudo cargar el detalle de la salida programada.');
        setRows([]);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [authorizedFetch, salidaProgramadaId, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchDetalles(controller.signal);
    return () => controller.abort();
  }, [fetchDetalles, reloadKey, location.key]);

  const datosPedido = useMemo(
    () => ({
      cliente: nota?.cliente || 'Sin cliente',
      celular: '-',
      ubicacion: nota?.ubicacionDetalle || 'Sin ubicacion',
      codigoPedido: nota?.nroSalida || salidaProgramadaId || '-',
    }),
    [nota, salidaProgramadaId],
  );

  const onVerProducto = (row: Producto) => {
    setSelected(row);
    setOpen(true);
  };

  const handleObservacion = async (row: Producto) => {
    const detalleId = row.detalleId ?? parseNumber(row.id);
    if (detalleId === null) {
      alert('No se encontro el identificador del producto.');
      return;
    }

    if (row.estadoObservacion === 2) {
      navigate(`/menu/entregas/${salidaProgramadaId}/observacion/${detalleId}`, {
        state: {
          notaId: String(detalleId),
          producto: {
            codigo: row.codigo,
            nombre: row.nombre,
            cantidad: row.cantidad,
            precioUnitario: row.precioUnitario,
            descripcion: row.descripcion,
            orden: row.orden,
          },
        },
      });
      return;
    }

    if (row.estadoObservacion !== 1) {
      alert('Este producto no permite gestionar observaciones.');
      return;
    }

    setObservacionLoadId(row.id);
    try {
      const response = await authorizedFetch(
        `/api/v1/observacion-entregas/salida-detalle/${encodeURIComponent(detalleId)}`,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error al obtener la observacion (${response.status}).`);
      }
      const json = (await response.json()) as {
        data?: {
          idObservacionEntrega?: number | string | null;
          idSalidasProgramadasDetalle?: number | string | null;
          observacion?: string | null;
          estadoEntrega?: number | string | null;
        } | null;
      };
      const data = json?.data;
      if (!data) {
        alert('No se encontro la observacion registrada.');
        return;
      }
      setObservacionDetalle({
        detalleId: String(detalleId),
        observacion: sanitize(data.observacion),
        estadoEntrega: parseNumber(data.estadoEntrega),
      });
    } catch (error) {
      console.error('Error al obtener observacion', error);
      alert('No se pudo cargar la observacion.');
    } finally {
      setObservacionLoadId(null);
    }
  };

  const handleConfirmEntrega = async () => {
    if (isConfirming || !salidaProgramadaId) {
      return;
    }

    const sinObservacion = rows
      .filter((row) => row.estadoObservacion === 2)
      .map((row) => {
        const detalleId = row.detalleId ?? parseNumber(row.id);
        if (detalleId === null) {
          return null;
        }
        return { idSalidaProgramadaDetalle: detalleId };
      })
      .filter((item): item is { idSalidaProgramadaDetalle: number } => item !== null);

    try {
      setIsConfirming(true);
      const response = await authorizedFetch(
        `/api/v1/salidas-programadas-detalle/confirmar/${encodeURIComponent(salidaProgramadaId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sinObservacion),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error al confirmar la entrega (${response.status}).`);
      }

      setReloadKey((prev) => prev + 1);
      setOpenConfirm(false);
    } catch (error) {
      console.error('Error al confirmar entrega', error);
      alert('No se pudo confirmar la entrega. Intente nuevamente.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="font-medium">Entrega</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">Detalle</span>
      </div>

      <h3 className="text-2xl font-semibold text-center mb-4">Detalles de Entrega</h3>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 mb-6">
        <h5 className="card-title mb-3">Datos del Pedido</h5>
        <div className="grid grid-cols-12 gap-4 text-sm">
          <div className="col-span-12 md:col-span-6">
            <div>
              <span className="font-semibold">Cliente: </span>
              {datosPedido.cliente}
            </div>
            <div>
              <span className="font-semibold">Celular: </span>
              {datosPedido.celular}
            </div>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div>
              <span className="font-semibold">Cod. Pedido: </span>
              {datosPedido.codigoPedido}
            </div>
            <div>
              <span className="font-semibold">Detalle ubicacion: </span>
              {datosPedido.ubicacion}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6 relative w-full break-words">
        <h5 className="card-title">Productos</h5>
        {isLoading && <p className="mt-3 text-sm text-dark/70">Cargando productos...</p>}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-3 overflow-x-auto">
          <Table hoverable>
            <TableHead className="border-b border-gray-300">
              <TableRow>
                <TableHeadCell className="p-6 text-base">Código</TableHeadCell>
                <TableHeadCell className="text-base">Orden entrega</TableHeadCell>
                <TableHeadCell className="text-base">Estado entrega</TableHeadCell>
                <TableHeadCell className="text-base">Cantidad</TableHeadCell>
                <TableHeadCell className="text-base">Precio unitario</TableHeadCell>
                <TableHeadCell className="text-base">Opciones</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-gray-300">
              {!isLoading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6">
                    <span className="text-sm text-dark/60">No se encontraron productos para esta salida.</span>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => {
                  const estado = mapEstadoEntrega(row.estadoEntrega);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap ps-6">
                        <span className="text-sm">{row.codigo || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge color="lightsecondary" className="border border-secondary text-secondary">
                          {row.orden ?? index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge color={estado.badge} className={`border ${estado.cls}`}>
                          {estado.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatCantidad(row.cantidad)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatPrecio(row.precioUnitario)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <button title="Ver" className="hover:text-primary" onClick={() => onVerProducto(row)}>
                            <Icon icon="solar:eye-linear" width={22} />
                          </button>
                          <button
                            title="Observacion"
                            className="hover:text-warning disabled:opacity-60"
                            onClick={() => handleObservacion(row)}
                            disabled={
                              (row.estadoObservacion !== 1 && row.estadoObservacion !== 2) ||
                              observacionLoadId === row.id
                            }
                          >
                            <Icon icon="solar:notes-linear" width={22} />
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
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button color={'gray'} className="px-6" onClick={() => setOpenConfirm(true)} disabled={isConfirming || !salidaProgramadaId}>
          Confirmar Entrega
        </Button>
        <Button color={'light'} onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-darkgray rounded-xl shadow-lg w-full max-w-xl">
            <div className="px-6 py-4 border-b border-black/10">
              <h4 className="text-lg font-semibold">Detalle producto pedido</h4>
            </div>
            <div className="p-6 max-h-[70vh] overflow-auto">
              {selected && (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold">Cod. producto: </span>
                    {selected.codigo || '-'}
                  </div>
                  <div>
                    <span className="font-semibold">Producto: </span>
                    {selected.nombre || '-'}
                  </div>
                  <div>
                    <span className="font-semibold">Cantidad: </span>
                    {formatCantidad(selected.cantidad)}
                  </div>
                  <div>
                    <span className="font-semibold">Precio unitario: </span>
                    {formatPrecio(selected.precioUnitario)}
                  </div>
                  <div>
                    <span className="font-semibold">Descripcion: </span>
                    {selected.descripcion || '-'}
                  </div>
                  <div>
                    <span className="font-semibold">Estado entrega: </span>
                    {mapEstadoEntrega(selected.estadoEntrega).label}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-black/10 flex justify-end">
              <Button color={'gray'} onClick={() => setOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {openConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-darkgray rounded-xl shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-black/10">
              <h4 className="text-lg font-semibold">Alerta</h4>
            </div>
            <div className="p-6">
              <p className="text-sm text-dark/90">
                ¿Confirmar que el pedido fue entregado y las observaciones registradas?
              </p>
            </div>
            <div className="flex">
              <button
                className="flex-1 py-3 text-sm border-t border-r border-black/10 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setOpenConfirm(false)}
              >
                No
              </button>
              <button
                className="flex-1 py-3 text-sm border-t border-black/10 text-primary hover:bg-lightprimary/40"
                onClick={handleConfirmEntrega}
                disabled={isConfirming}
              >
                Si
              </button>
            </div>
          </div>
        </div>
      )}

      {observacionDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-darkgray rounded-xl shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-black/10">
              <h4 className="text-lg font-semibold">Observacion registrada</h4>
            </div>
            <div className="p-6 text-sm text-dark/80 space-y-3">
              <div>
                <span className="font-semibold">Estado entrega: </span>
                {mapEstadoEntrega(observacionDetalle.estadoEntrega).label}
              </div>
              <div>
                <span className="font-semibold">Observacion: </span>
                {observacionDetalle.observacion || 'Sin observacion'}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/10 flex justify-end">
              <Button color={'gray'} onClick={() => setObservacionDetalle(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EntregaDetalle;
