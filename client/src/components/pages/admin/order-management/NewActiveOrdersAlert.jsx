import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cn from 'classnames';
import {
    resetNewManagedActiveOrdersCount as resetNewActiveOrdersCount
} from '@/redux/slices/uiSlice.js';
import { getInitFilterParams } from '@/helpers/initParamsHelper.js';
import { ordersFilterOptions } from '@shared/filterOptions.js';

const resetedFilter = getInitFilterParams(null, ordersFilterOptions);

export default function NewActiveOrdersAlert({
    search,
    setSearch,
    filter,
    setFilter,
    page,
    setPage,
    limit,
    totalFilteredOrders,
    reloadOrders
}) {
    const newActiveOrdersCount = useSelector(state => state.ui.newManagedActiveOrdersCount);
    const [newActiveOrdersAvailable, setNewActiveOrdersAvailable] = useState(false);
    const dispatch = useDispatch();

    const showNewManagedActiveOrders = async () => {
        const isFilterReseted = filter.toString() === resetedFilter.toString();

        if (search !== '' || page !== 1 || !isFilterReseted) {
            setSearch('');
            setPage(1);
            setFilter(resetedFilter);
        } else { // Фильтры сброшены, страница первая => обновление заказов
            setNewActiveOrdersAvailable(false);
            const isSuccess = await reloadOrders();
            if (!isSuccess) setNewActiveOrdersAvailable(true);
        }
    };

    // Сброс счётчика новых заказов при размонтировании
    useEffect(() => {
        return () => {
            dispatch(resetNewActiveOrdersCount());
        };
    }, [dispatch]);

    // Установка флага доступности новых заказов
    useEffect(() => {
        if (newActiveOrdersCount > 0) setNewActiveOrdersAvailable(true);
    }, [newActiveOrdersCount]);

    // Сброс флага новых заказов при изменении параметров, если заказ на выбранной странице
    useEffect(() => {
        const isFilterReseted = filter.toString() === resetedFilter.toString();
        if (search === '' && page === 1 && isFilterReseted) {
            setNewActiveOrdersAvailable(false);
        }
    }, [search, filter, page, limit]);

    // Сброс счётчика новых заказов после изменения их общего количества (уже включает их в себя)
    useEffect(() => {
        dispatch(resetNewActiveOrdersCount());
    }, [totalFilteredOrders, dispatch]);

    return (
        <div className={cn(
            'new-items-alert',
            'active-orders',
            { 'enabled': newActiveOrdersAvailable }
        )}>
            <p>Оформлены новые заказы!</p>
            <button
                className="load-items-btn"
                onClick={showNewManagedActiveOrders}
                disabled={!newActiveOrdersAvailable}
            >
                <span className="icon">🔔</span>
                Сбросить фильтры и загрузить
            </button>
        </div>
    );
};
