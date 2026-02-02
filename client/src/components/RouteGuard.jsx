import React from 'react';
import { Outlet } from 'react-router-dom';
import GlobalRedirect from '@/components/route-guard/GlobalRedirect.jsx';
import ProtectedRoute from '@/components/route-guard/ProtectedRoute.jsx';
import ProtectedPageContent from '@/components/route-guard/ProtectedPageContent.jsx';

export default function RouteGuard({ access }) {
    return (
        <GlobalRedirect>
            <ProtectedRoute access={access}>
                <ProtectedPageContent>
                    <Outlet />
                </ProtectedPageContent>
            </ProtectedRoute>
        </GlobalRedirect>
    );
};
