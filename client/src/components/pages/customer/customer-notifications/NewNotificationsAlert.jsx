import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cn from 'classnames';
import { resetNewNotificationsCount } from '@/redux/slices/uiSlice.js';

export default function NewNotificationsAlert({
    sort,
    page,
    limit,
    totalNotifications,
    setPage,
    reloadNotifications
}) {
    const newNotificationsCount = useSelector(state => state.ui.newNotificationsCount);
    const [newNotificationsAvailable, setNewNotificationsAvailable] = useState(false);
    const dispatch = useDispatch();

    const getTargetPageForNewNotifications = () => {
        if (sort.includes('sentAt')) {
            return sort.startsWith('-')
                ? 1
                : Math.ceil((totalNotifications + newNotificationsCount) / limit);
        }
        return 1;
    };

    const showNewNotifications = async () => {
        const targetPage = getTargetPageForNewNotifications();

        if (page === targetPage) {
            setNewNotificationsAvailable(false);
            const isSuccess = await reloadNotifications();
            if (!isSuccess) setNewNotificationsAvailable(true);
        } else {
            const currentTotalPages = Math.ceil(totalNotifications / limit);

            if (targetPage > currentTotalPages) {
                setNewNotificationsAvailable(false);
                const isSuccess = await reloadNotifications(); // Обновление нового количества страниц

                if (isSuccess) {
                    setPage(targetPage); // Триггер загрузки данных для выбранной страницы
                } else {
                    setNewNotificationsAvailable(true);
                }
            } else {
                setPage(targetPage); // Триггер загрузки данных для выбранной страницы
            }
        }
    };

    // Сброс флага и счётчика новых уведомлений при размонтировании
    useEffect(() => {
        return () => {
            dispatch(resetNewNotificationsCount());
        };
    }, [dispatch]);

    // Установка флага доступности новых уведомлений
    useEffect(() => {
        if (newNotificationsCount > 0) setNewNotificationsAvailable(true);
    }, [newNotificationsCount]);

    // Сброс флага новых уведомлений при изменении параметров, если сообщение на выбранной странице
    useEffect(() => {
        const targetPage = getTargetPageForNewNotifications();
        if (page === targetPage) setNewNotificationsAvailable(false);
    }, [sort, page, limit]);

    // Сброс счётчика новых уведомлений после изменения количества уведомлений (уже включает их в себя)
    useEffect(() => {
        dispatch(resetNewNotificationsCount());
    }, [totalNotifications, dispatch]);

    return (
        <div className={cn(
            'new-items-alert',
            'notifications',
            { 'enabled': newNotificationsAvailable }
        )}>
            <p>Получены новые уведомления!</p>
            <button
                className="load-items-btn"
                onClick={showNewNotifications}
                disabled={!newNotificationsAvailable}
            >
                <span className="icon">🔔</span>
                Загрузить
            </button>
        </div>
    );
};
