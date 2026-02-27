import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useOutlet } from 'react-router-dom';
import Breadcrumbs from '@/components/common/Breadcrumbs.jsx';
import { checkAuth } from '@/services/authService.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { abortAllApiControllers } from '@/services/apiControllerService.js';
import { routeConfig } from '@/config/appRouting.js';

export default function ProtectedPageContent() {
    const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
    const [displayedContent, setDisplayedContent] = useState(null);

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();

    // Контент страницы вложенного маршрута (статичен). Если отсутствует - страница не найдена.
    const outlet = useOutlet() || React.createElement(routeConfig.notFound.component);

    // Маршрут для хлебных крошек
    const [breadcrumbPath, setBreadcrumbPath] = useState(location.pathname);

    const handleRouteChange = async () => {
        abortAllApiControllers(); // Отмена API-запросов через контроллеры

        if (isAuthenticated) {
            dispatch(setIsNavigationBlocked(true));

            await dispatch(checkAuth());
            if (isUnmountedRef.current) return;

            dispatch(setIsNavigationBlocked(false));
        }

        setBreadcrumbPath(location.pathname); // Обновление хлебных крошек
        setDisplayedContent(outlet); // Обновление контента страницы
    };
    
    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Обработка изменения маршрута
    useEffect(() => {
        handleRouteChange();
    }, [location.pathname]);

    // Показ контента предыдущего маршрута, пока проверяются права доступа
    return (
        <>
            <Breadcrumbs path={breadcrumbPath} />
            <div className="page-content">{displayedContent}</div>
            <Breadcrumbs path={breadcrumbPath} />
        </>
    );
};
