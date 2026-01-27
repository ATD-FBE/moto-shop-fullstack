import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation, matchPath, Navigate } from 'react-router-dom';
import { routeConfig } from '@/config/appRouting.js';

export default function ProtectedRoute({ path, access, children }) {
    const {
        isAuthenticated,
        user,
        suppressAuthRedirect,
        forceRedirectToLogin
    } = useSelector(state => state.auth);
    const location = useLocation();

    const loginPath = routeConfig.login.paths[0];

    // Аварийный выход на страницу авторизации при UNAUTH (401) и USER_GONE (410)
    if (forceRedirectToLogin && location.pathname !== loginPath) {
        return <Navigate to={loginPath} state={{ from: location }} replace />;
    }

    // Синхронизация путей при разлогинивании
    const matchesPath = path === '*' || matchPath({ path, end: false }, location.pathname);

    if (!isAuthenticated && !matchesPath) {
        return <div className="global-loader">Глобальный лоадер</div>;
    }

    // Защита маршрутов в соответствии их доступа и роли пользователя
    const userRole = user?.role || 'guest';
    const isPrivilegedUser = ['admin'].includes(userRole);
    const personalPath = routeConfig[`${userRole}Personal`]?.paths[0] || '/';

    switch (access) {
        case 'admin':
            if (!isAuthenticated || !isPrivilegedUser) {
                return <Navigate to={isAuthenticated ? personalPath : loginPath} replace />;
            }
            return children;

        case 'customer':
            if (!isAuthenticated || isPrivilegedUser) {
                return <Navigate to={isAuthenticated ? personalPath : loginPath} replace />;
            }
            return children;

        case 'auth':
            if (isAuthenticated && !suppressAuthRedirect) {
                return <Navigate to={personalPath} replace />;
            }
            return children;

        case 'public':
        default:
            return children;
    }
};
