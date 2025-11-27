import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from 'src/context/AuthContext';

type AllowedRole = 'administrador' | 'conductor';

const ROLE_DEFAULT_PATH: Record<AllowedRole, string> = {
  administrador: '/menu/reportes',
  conductor: '/menu/entregas',
};

type RoleProtectedRouteProps = {
  allowedRoles: AllowedRole[];
  children: React.ReactElement;
};

const SessionClosedMessage: React.FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
    <div className="max-w-md space-y-3">
      <h2 className="text-2xl font-semibold text-dark">Sesion finalizada</h2>
      <p className="text-sm text-dark/70">
        Tu sesion ya no esta activa. Cierra esta pestana y vuelve a ingresar desde el enlace seguro enviado por el sistema.
      </p>
    </div>
  </div>
);

const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { auth } = useAuth();

  if (!auth.isAuthenticated) {
    return <SessionClosedMessage />;
  }

  const role = auth.roleName;
  if (allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
    const fallback = role ? ROLE_DEFAULT_PATH[role] ?? '/inicio' : '/inicio';
    return <Navigate to={fallback} replace />;
  }

  return children;
};

export default RoleProtectedRoute;
