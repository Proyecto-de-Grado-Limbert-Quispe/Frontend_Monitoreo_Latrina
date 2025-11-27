import React, { useEffect, useMemo, useState } from 'react';
import { Button, Label, Select, TextInput } from 'flowbite-react';
import { useNavigate } from 'react-router';
import { useAuthorizedApi } from 'src/hooks/useAuthorizedApi';

type EstadoVehiculo = 'Nuevo' | 'Semi Nuevo';

type DispositivoApi = {
  idDispositivo: number | string;
  codigo?: string | null;
  modelo?: string | null;
  activo?: number | null;
  status?: number | null;
};

type DispositivoOption = {
  id: string;
  label: string;
};

const sanitize = (value?: string | null): string => (value ?? '').trim();

const buildDispositivoLabel = (item: DispositivoApi): string => {
  const traccarId = sanitize(item.codigo);
  const modeloBruto = sanitize(item.modelo);
  const [codigoUsuarioRaw, modeloUsuarioRaw] = modeloBruto ? modeloBruto.split(',') : [];
  const codigoUsuario = sanitize(codigoUsuarioRaw);
  const modeloUsuario = sanitize(modeloUsuarioRaw);

  const partes: string[] = [];
  if (codigoUsuario) {
    partes.push(codigoUsuario);
  } else if (modeloBruto) {
    partes.push(modeloBruto);
  }
  if (modeloUsuario && modeloUsuario !== codigoUsuario) {
    partes.push(modeloUsuario);
  }
  if (traccarId) {
    partes.push(`ID ${traccarId}`);
  }

  const label = partes.filter(Boolean).join(' - ');
  return label || 'Sin codigo';
};

const getTodayAsInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const filterOnlyDigits = (value: string, maxLength?: number): string => {
  const digits = value.replace(/\D/g, '');
  if (typeof maxLength === 'number') {
    return digits.slice(0, maxLength);
  }
  return digits;
};

const VehiculoForm: React.FC = () => {
  const navigate = useNavigate();
  const { token, authorizedFetch } = useAuthorizedApi();

  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [capacidadKg, setCapacidadKg] = useState('');
  const [estado, setEstado] = useState<EstadoVehiculo>('Nuevo');
  const [fechaMantenimiento, setFechaMantenimiento] = useState('');
  const [dispositivoId, setDispositivoId] = useState('');

  const [dispositivos, setDispositivos] = useState<DispositivoOption[]>([]);
  const [dispositivosLoading, setDispositivosLoading] = useState(false);
  const [dispositivosError, setDispositivosError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setDispositivos([]);
      setDispositivoId('');
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const obtenerDispositivos = async (): Promise<void> => {
      setDispositivosLoading(true);
      setDispositivosError(null);
      try {
        const response = await authorizedFetch('/api/v1/dispositivosGps/disponibles', {
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Error al obtener dispositivos (${response.status}).`);
        }

        const json = (await response.json()) as { data?: DispositivoApi[] };
        if (!isMounted) {
          return;
        }

        const options = Array.isArray(json.data)
          ? json.data.map((item) => ({
              id: String(item.idDispositivo),
              label: buildDispositivoLabel(item),
            }))
          : [];

        setDispositivos(options);
        setDispositivoId((prev) => (prev && options.some((opt) => opt.id === prev) ? prev : ''));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Error al obtener dispositivos', error);
        if (isMounted) {
          setDispositivosError('No se pudieron cargar los dispositivos. Registra uno nuevo antes de continuar.');
          setDispositivos([]);
          setDispositivoId('');
        }
      } finally {
        if (isMounted) {
          setDispositivosLoading(false);
        }
      }
    };

    void obtenerDispositivos();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [authorizedFetch, token]);

  const recordarRegistroDispositivo = () => {
    alert('Recuerda registrar el dispositivo GPS en el sistema antes de asociarlo a un vehiculo.');
  };

  const resetForm = () => {
    setPlaca('');
    setMarca('');
    setModelo('');
    setAnio('');
    setCapacidadKg('');
    setEstado('Nuevo');
    setFechaMantenimiento('');
    setDispositivoId('');
  };

  const handleGuardar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setSubmitError('No se encontro un token de autenticacion. Vuelve a iniciar sesion.');
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(null);

    if (!dispositivoId) {
      setSubmitError('Selecciona un dispositivo GPS disponible.');
      return;
    }

    if (anio && anio.length !== 4) {
      setSubmitError('El anio del vehiculo debe tener 4 digitos.');
      return;
    }

    const parsedAnio = anio.trim() ? Number(anio.trim()) : null;
    if (parsedAnio !== null && (Number.isNaN(parsedAnio) || parsedAnio < 1900)) {
      setSubmitError('El anio del vehiculo no es valido.');
      return;
    }

    const parsedCapacidad = capacidadKg.trim() ? Number(capacidadKg.trim()) : null;
    if (parsedCapacidad !== null && (Number.isNaN(parsedCapacidad) || parsedCapacidad < 0)) {
      setSubmitError('La capacidad del vehiculo debe ser un numero valido.');
      return;
    }

    if (fechaMantenimiento && fechaMantenimiento < minFechaMantenimiento) {
      setSubmitError('Selecciona una fecha de mantenimiento futura.');
      return;
    }

    const payload = {
      idDispositivoGps: Number(dispositivoId),
      placa: sanitize(placa),
      marca: sanitize(marca),
      modelo: sanitize(modelo),
      anio: parsedAnio,
      capacidadKg: parsedCapacidad,
      estadoVehiculo: estado,
      fechaUltimoMantenimiento: fechaMantenimiento || null,
      status: 1,
    };

    setIsSubmitting(true);

    try {
      const response = await authorizedFetch('/api/v1/vehiculos/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error al registrar el vehiculo (${response.status}).`);
      }

      setSubmitSuccess('Vehiculo registrado correctamente.');
      resetForm();
      setTimeout(() => {
        navigate('/menu/vehiculos');
      }, 1500);
    } catch (error) {
      console.error('Error al registrar vehiculo', error);
      setSubmitError(error instanceof Error ? error.message : 'No se pudo registrar el vehiculo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelar = () => navigate('/menu/vehiculos');

  const dispositivosOptions = useMemo(() => dispositivos, [dispositivos]);
  const minFechaMantenimiento = useMemo(() => getTodayAsInputValue(), []);

  const handleMarcaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = event.target.value.replace(/\d+/g, '');
    setMarca(cleaned);
  };

  const handleAnioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = filterOnlyDigits(event.target.value, 4);
    setAnio(digits);
  };

  const handleCapacidadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = filterOnlyDigits(event.target.value);
    setCapacidadKg(digits);
  };

  return (
    <form onSubmit={handleGuardar}>
      <div className="mb-4 text-sm text-dark/70">
        <span className="font-medium">Menu</span>
        <span className="mx-2">&gt;</span>
        <span className="font-medium">Vehiculos</span>
        <span className="mx-2">&gt;</span>
        <span className="text-dark font-semibold">Registro</span>
      </div>

      <h3 className="text-2xl font-semibold text-center mb-4">Formulario de registro de vehiculo</h3>

      <div className="rounded-xl dark:shadow-dark-md shadow-md bg-white dark:bg-darkgray p-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="xl:col-span-6 col-span-12">
            <h6 className="text-base font-medium mb-4">Ingrese los datos.</h6>
            <div className="flex flex-col gap-4">
              <div>
                <Label className="mb-2 block">Placa</Label>
                <TextInput value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ej. ABC-1234" className="form-control form-rounded-xl" required />
              </div>
              <div>
                <Label className="mb-2 block">Marca</Label>
                <TextInput value={marca} onChange={handleMarcaChange} placeholder="ej. Toyota" className="form-control form-rounded-xl" required />
              </div>
              <div>
                <Label className="mb-2 block">Modelo</Label>
                <TextInput value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="ej. Hilux" className="form-control form-rounded-xl" required />
              </div>
              <div>
                <Label className="mb-2 block">Anio</Label>
                <TextInput
                  value={anio}
                  onChange={handleAnioChange}
                  placeholder="ej. 2021"
                  className="form-control form-rounded-xl"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div>
                <Label className="mb-2 block">Capacidad del vehiculo (Kg)</Label>
                <TextInput
                  value={capacidadKg}
                  onChange={handleCapacidadChange}
                  placeholder="1500"
                  className="form-control form-rounded-xl"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label className="mb-2 block">Estado del vehiculo</Label>
                <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoVehiculo)} className="select-md">
                  <option>Nuevo</option>
                  <option>Semi Nuevo</option>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Fecha de mantenimiento</Label>
                <TextInput
                  type="date"
                  value={fechaMantenimiento}
                  onChange={(e) => setFechaMantenimiento(e.target.value)}
                  className="form-control form-rounded-xl"
                  min={minFechaMantenimiento}
                />
              </div>
            </div>
          </div>

          <div className="xl:col-span-1 col-span-12 hidden xl:block">
            <div className="w-px h-full bg-black/10 mx-auto" />
          </div>

          <div className="xl:col-span-5 col-span-12">
            <h6 className="text-base font-medium mb-4">Seleccione el dispositivo GPS instalado en el vehiculo</h6>
            <div className="flex flex-col gap-4">
              <Button type="button" color="warning" onClick={recordarRegistroDispositivo} className="w-full md:w-fit">
                Recordatorio: registra el dispositivo GPS primero
              </Button>
              <div>
                <Select
                  value={dispositivoId}
                  onChange={(e) => setDispositivoId(e.target.value)}
                  className="select-md"
                  required
                  disabled={dispositivosLoading || dispositivosOptions.length === 0}
                >
                  <option value="" disabled>
                    {dispositivosLoading ? 'Cargando dispositivos...' : 'Selecciona un dispositivo disponible'}
                  </option>
                  {dispositivosOptions.map((dispositivo) => (
                    <option key={dispositivo.id} value={dispositivo.id}>
                      {dispositivo.label}
                    </option>
                  ))}
                </Select>
                {dispositivosError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{dispositivosError}</p>}
                {!dispositivosError && dispositivosOptions.length === 0 && !dispositivosLoading && (
                  <p className="mt-2 text-sm text-dark/60">No hay dispositivos disponibles. Registra uno antes de continuar.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <Button color="primary" type="submit" className="px-6" disabled={isSubmitting || dispositivosOptions.length === 0}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button color="gray" type="button" onClick={handleCancelar} className="px-6" disabled={isSubmitting}>
            Cancelar
          </Button>
        </div>
        {submitError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{submitError}</p>}
        {submitSuccess && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{submitSuccess}</p>}
      </div>
    </form>
  );
};

export default VehiculoForm;
