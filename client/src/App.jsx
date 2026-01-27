import './styles/global.scss';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useSelector, useDispatch, Provider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { loadSession } from '@/services/authService.js';
import { routeConfig } from '@/config/appRouting.js';
import Layout from '@/components/Layout.jsx';
import RouteGuard from '@/components/RouteGuard.jsx';
import AppStore from '@/redux/Store.jsx';
import { StructureRefsProvider } from '@/context/StructureRefsContext.js';
import useDeviceInfo from '@/hooks/useDeviceInfo.js';

const App = () => {
    const sessionReady = useSelector(state => state.ui.sessionReady);
    const dispatch = useDispatch();

    useDeviceInfo();

    // Возобновление текущей сессии
    useEffect(() => {
        dispatch(loadSession());
    }, [dispatch]);

    if (!sessionReady) return <div className="global-loader">Глобальный лоадер</div>;

    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={
                    <StructureRefsProvider>
                        <Layout />
                    </StructureRefsProvider>
                }>
                    {Object.values(routeConfig).map(({ paths, access, component }, idx) =>
                        paths.map(path => (
                            <Route
                                key={`${idx}-${path}`}
                                path={path}
                                element={
                                    // Outlet для Layout
                                    <RouteGuard path={path} access={access} />
                                }
                            >
                                // Outlet для ProtectedPageContent (вложенный маршрут)
                                <Route index element={React.createElement(component)} />
                            </Route>
                        ))
                    )}
                </Route>
            </Routes>
        </BrowserRouter>
    );
};

// BrowserRouter обёрнут снаружи App для работы useLocation
ReactDOM
    .createRoot(document.getElementById('app'))
    .render(
        <Provider store={AppStore}>
            <App />
        </Provider>
    );


    
/*Поток при рендере страницы:
Router → Layout → Outlet для Layout → RouteGuard → GlobalRedirect → ProtectedRoute →
ProtectedPageContent → Outlet для ProtectedPageContent → (контент страницы)*/
