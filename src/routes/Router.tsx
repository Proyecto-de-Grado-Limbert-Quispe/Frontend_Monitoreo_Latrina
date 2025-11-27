// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import  { lazy, type ReactElement } from 'react';
import { Navigate, createBrowserRouter } from "react-router";
import Loadable from 'src/layouts/full/shared/loadable/Loadable';
import RoleProtectedRoute from './RoleProtectedRoute';




/* ***Layouts**** */
const FullLayout = Loadable(lazy(() => import('../layouts/full/FullLayout')));
const BlankLayout = Loadable(lazy(() => import('../layouts/blank/BlankLayout')));

// Home principal (dentro del layout con menú)
import Home from '../views/home/Home';
// Pantalla de bienvenida (sin menú)
const Welcome = Loadable(lazy(() => import('../views/landing/Welcome')));

// utilities
const Typography = Loadable(lazy(() => import("../views/typography/Typography")));
const Table = Loadable(lazy(() => import("../views/tables/Table")));
const Form = Loadable(lazy(() => import("../views/forms/Form")));
const Alert = Loadable(lazy(() => import("../views/alerts/Alerts")));
const Buttons = Loadable(lazy(() => import("../views/buttons/Buttons")));

// icons
const Solar = Loadable(lazy(() => import("../views/icons/Solar")));

// Vehículos
const Vehiculos = Loadable(lazy(() => import("../views/vehiculos/Vehiculos")));
const VehiculoForm = Loadable(lazy(() => import("../views/vehiculos/VehiculoForm")));
// Dispositivos
const Dispositivos = Loadable(lazy(() => import("../views/dispositivos/Dispositivos")));
// Conductores
const Conductores = Loadable(lazy(() => import("../views/conductores/Conductores")));
const Entregas = Loadable(lazy(() => import("../views/conductores/Entregas")));
const ProgramacionSalidas = Loadable(lazy(() => import("../views/conductores/ProgramacionSalidas")));
const EntregaDetalle = Loadable(lazy(() => import("../views/conductores/EntregaDetalle")));
const EntregaObservacion = Loadable(lazy(() => import("../views/conductores/EntregaObservacion")));
// Programar Salida
const ProgramarSalida = Loadable(lazy(() => import("../views/programar-salida/ProgramarSalida")));
// Panel de Monitoreo
const PanelMonitoreo = Loadable(lazy(() => import("../views/monitoreo/PanelMonitoreo")));
const SalidaDetalle = Loadable(lazy(() => import("../views/monitoreo/SalidaDetalle")));
const NotaSalidaDetalle = Loadable(lazy(() => import("../views/monitoreo/NotaSalidaDetalle")));
const RecorridoMapa = Loadable(lazy(() => import("../views/monitoreo/RecorridoMapa")));
// Perfil
const Perfil = Loadable(lazy(() => import("../views/profile/Profile")));
// Reportes
const Reportes = Loadable(lazy(() => import("../views/reportes/Reportes")));

// authentication
const Login = Loadable(lazy(() => import('../views/auth/login/Login')));
const Register = Loadable(lazy(() => import('../views/auth/register/Register')));
const SamplePage = Loadable(lazy(() => import('../views/sample-page/SamplePage')));
const Error = Loadable(lazy(() => import('../views/auth/error/Error')));

const withRoleGuard = (element: ReactElement, roles: Array<'administrador' | 'conductor'>) => (
  <RoleProtectedRoute allowedRoles={roles}>{element}</RoleProtectedRoute>
);

const Router = [
  // Primero: rutas sin menú (pantalla de bienvenida y auth)
  {
    path: '/',
    element: <BlankLayout />,
    children: [
      { path: '/', exact: true, element: <Welcome /> },
      { path: '/auth/login', element: <Login /> },
      { path: '/auth/register', element: <Register /> },
      { path: '404', element: <Error /> },
      { path: '/auth/404', element: <Error /> },
    ],
  },
  // Después: rutas del app con menú
  {
    path: '/',
    element: <FullLayout />,
    children: [
      { path: '/inicio', exact: true, element: <Home/> },
      { path: '/ui/typography', exact: true, element: <Typography/> },
      { path: '/ui/table', exact: true, element: <Table/> },
      { path: '/ui/form', exact: true, element: <Form/> },
      { path: '/ui/alert', exact: true, element: <Alert/> },
      { path: '/ui/buttons', exact: true, element: <Buttons/> },
      { path: '/icons/solar', exact: true, element: <Solar /> },
      { path: '/menu/vehiculos', exact: true, element: withRoleGuard(<Vehiculos />, ['administrador']) },
      { path: '/menu/vehiculos/nuevo', exact: true, element: withRoleGuard(<VehiculoForm />, ['administrador']) },
      { path: '/menu/dispositivos', exact: true, element: withRoleGuard(<Dispositivos />, ['administrador']) },
      { path: '/menu/conductores', exact: true, element: withRoleGuard(<Conductores />, ['administrador']) },
      {
        path: '/menu/entregas',
        exact: true,
        element: withRoleGuard(<Entregas />, ['administrador', 'conductor']),
      },
      {
        path: '/menu/entregas/:id/salidas',
        exact: true,
        element: withRoleGuard(<ProgramacionSalidas />, ['administrador', 'conductor']),
      },
      {
        path: '/menu/entregas/:id',
        exact: true,
        element: withRoleGuard(<EntregaDetalle />, ['administrador', 'conductor']),
      },
      {
        path: '/menu/entregas/:id/observacion/:productoId',
        exact: true,
        element: withRoleGuard(<EntregaObservacion />, ['administrador', 'conductor']),
      },
      { path: '/menu/programar-salida', exact: true, element: withRoleGuard(<ProgramarSalida />, ['administrador']) },
      { path: '/menu/panel-monitoreo', exact: true, element: withRoleGuard(<PanelMonitoreo />, ['administrador']) },
      { path: '/menu/panel-monitoreo/salidas/:id', exact: true, element: withRoleGuard(<SalidaDetalle />, ['administrador']) },
      {
        path: '/menu/panel-monitoreo/salidas/:id/recorrido',
        exact: true,
        element: withRoleGuard(<RecorridoMapa />, ['administrador']),
      },
      {
        path: '/menu/panel-monitoreo/salidas/:id/detalle/:notaId',
        exact: true,
        element: withRoleGuard(<NotaSalidaDetalle />, ['administrador']),
      },
      { path: '/menu/perfil', exact: true, element: <Perfil /> },
      { path: '/menu/reportes', exact: true, element: withRoleGuard(<Reportes />, ['administrador']) },
      { path: '/sample-page', exact: true, element: <SamplePage /> },
      { path: '*', element: <Navigate to="/auth/404" /> },
    ],
  },
];

const router = createBrowserRouter(Router)

export default router;
