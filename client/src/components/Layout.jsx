import React, { useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, matchPath, Outlet } from 'react-router-dom';
import BackgroundImage from './layout/BackgroundImage.jsx';
import MainHeader from './layout/MainHeader.jsx';
import MainFooter from './layout/MainFooter.jsx';
import FloatingCart from '@/components/common/FloatingCart.jsx';
import AlertModal from '@/components/common/AlertModal.jsx';
import ConfirmModal from '@/components/common/ConfirmModal.jsx';
import ImageViewerModal from '@/components/common/ImageViewerModal.jsx';
import SseNotifications from '@/components/sse/SseNotifications.jsx';
import SseOrderManagement from '@/components/sse/SseOrderManagement.jsx';
import { useStructureRefs } from '@/context/StructureRefsContext.js';
import { routeConfig } from '@/config/appRouting.js';
import { setKeyboardInput, setPointerInput } from '@/helpers/inputMethod.js';
import { handleLogout } from '@/services/authService.js';

const cartHiddenRoutes = [
    ...routeConfig.customerCart.paths,
    ...routeConfig.customerCheckout.paths
];

export default function Layout() {
    const { mainHeaderRef, mainFooterRef } = useStructureRefs();
    const { isAuthenticated, user } = useSelector(state => state.auth);
    const { dashboardPanelActive } = useSelector(state => state.ui);
    const isAuthenticatedRef = useRef(isAuthenticated);
    const location = useLocation();
    const dispatch = useDispatch();

    const userRole = user?.role ?? 'guest';

    const showFloatingCart = !isAuthenticated ||
        (
            userRole === 'customer' &&
            !dashboardPanelActive &&
            !cartHiddenRoutes.some(pattern => matchPath(pattern, location.pathname))
        );
    const showSseNotifications = isAuthenticated && userRole === 'customer';
    const showSseOrderManagement = isAuthenticated && userRole === 'admin';

    // Прослушивание и установка типа последнего ввода на всём сайте
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Tab' || e.key?.startsWith('Arrow')) {
                setKeyboardInput();
            }
        };
    
        const onPointerDown = () => {
            setPointerInput();
        };
    
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
    
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, []);

    // Приём сигнала для выхода на всех вкладках браузера
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === 'auth:logout' && isAuthenticatedRef.current) {
                dispatch(handleLogout());
            }
        };
    
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Обновление рефа флага авторизации
    useEffect(() => {
        isAuthenticatedRef.current = isAuthenticated;
    }, [isAuthenticated]);

    return (
        <div className="layout">
            <BackgroundImage />
            
            <MainHeader ref={mainHeaderRef} />
            <main>
                <Outlet />
            </main>
            <MainFooter ref={mainFooterRef} />

            {showFloatingCart && <FloatingCart />}
            
            <AlertModal />
            <ConfirmModal />
            <ImageViewerModal />

            {showSseNotifications && <SseNotifications />}
            {showSseOrderManagement && <SseOrderManagement />}
        </div>
    );
};
