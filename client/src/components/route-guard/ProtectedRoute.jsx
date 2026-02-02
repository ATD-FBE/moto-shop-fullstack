import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation, Navigate } from 'react-router-dom';
import { routeConfig } from '@/config/appRouting.js';

export default function ProtectedRoute({ access, children }) {
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

    // Защита маршрутов в соответствии с их доступом и роли пользователя
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
