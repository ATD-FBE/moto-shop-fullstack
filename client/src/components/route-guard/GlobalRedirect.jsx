import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation, Navigate } from 'react-router-dom';

export default function GlobalRedirect({ children }) {
    const { lockedRoute } = useSelector(state => state.ui);
    const { isAuthenticated, suppressAuthRedirect } = useSelector(state => state.auth);
    const location = useLocation();

    if (
        lockedRoute &&
        isAuthenticated &&
        !suppressAuthRedirect &&
        location.pathname !== lockedRoute.path
    ) {
        return <Navigate to={lockedRoute.path} replace />;
    }

    return children;
};
