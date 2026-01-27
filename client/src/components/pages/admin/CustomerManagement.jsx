import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import Collapsible from '@/components/common/Collapsible.jsx';
import NotificationEditor from './customer-management/NotificationEditor.jsx';
import Toolbar from '@/components/common/Toolbar.jsx';
import CustomerTable from './customer-management/CustomerTable.jsx';
import {
    getInitFilterParams,
    getInitSortParam,
    getInitPageParam,
    getInitLimitParam
} from '@/helpers/initParamsHelper.js';
import { customersFilterOptions } from '@shared/filterOptions.js';
import { customersPageLimitOptions } from '@shared/pageLimitOptions.js';
import { customersSortOptions } from '@shared/sortOptions.js';
import {
    sendCustomerListRequest,
    sendCustomerDiscountUpdateRequest,
    sendCustomerBanToggleRequest
} from '@/api/customerRequests.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { routeConfig } from '@/config/appRouting.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { trimSetByFilter } from '@shared/commonHelpers.js';
import { DATA_LOAD_STATUS, REQUEST_STATUS } from '@shared/constants.js';
 
export default function CustomerManagement() {
    const [initialized, setInitialized] = useState(false);
    
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState(new URLSearchParams());
    const [sort, setSort] = useState(customersSortOptions[0].dbField);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(customersPageLimitOptions[0]);

    const [initCustomersReady, setInitCustomersReady] = useState(false);
    const [customersLoading, setCustomersLoading] = useState(true);
    const [customersLoadError, setCustomersLoadError] = useState(false);
    const [customerOperationBusy, setCustomerOperationBusy] = useState(false);
    const [filteredCustomerNamesMap, setFilteredCustomerNamesMap] = useState({});
    const [filteredCustomerIds, setFilteredCustomerIds] = useState(new Set());
    const [paginatedCustomerList, setPaginatedCustomerList] = useState([]);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
    const [expandedCustomerIds, setExpandedCustomerIds] = useState(new Set());

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const [locationState] = useState(location.state);
    const [isNotifEditorExpanded, setIsNotifEditorExpanded] = useState(
        locationState?.isExpanded || false
    );

    const customersLoadStatus =
        customersLoading
            ? DATA_LOAD_STATUS.LOADING
            : customersLoadError
                ? DATA_LOAD_STATUS.ERROR
                : !filteredCustomerIds.size
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const isCustomerUiBlocked =
        customersLoading ||
        customersLoadError ||
        customerOperationBusy;

    const loadCustomers = async (urlParams) => {
        setCustomersLoadError(false);
        setCustomersLoading(true);

        const responseData = await dispatch(sendCustomerListRequest(urlParams));
        if (isUnmountedRef.current) return;
        
        const { status, message, filteredCustomerNamesMap, paginatedCustomerList } = responseData;
        logRequestStatus({ context: 'CUSTOMER: LOAD LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setCustomersLoadError(true);
        } else {
            setFilteredCustomerNamesMap(filteredCustomerNamesMap);
            setFilteredCustomerIds(new Set(Object.keys(filteredCustomerNamesMap)));
            setPaginatedCustomerList(paginatedCustomerList);
            setInitCustomersReady(true);
        }

        setCustomersLoading(false);
    }

    const reloadCustomers = async () => {
        const urlParams = location.search.slice(1);
        await loadCustomers(urlParams);
    };

    const applyCustomerUpdates = (customerId, updatedFields) =>
        setPaginatedCustomerList(prev => prev.map(customer =>
            customer.id === customerId
                ? { ...customer, ...updatedFields }
                : customer
        ));

    const updateCustomerDiscount = async (customerId, discount) => {
        setCustomerOperationBusy(true);

        const responseData = await dispatch(sendCustomerDiscountUpdateRequest(customerId, discount));
        if (isUnmountedRef.current) return;

        const { status, message, fieldErrors, updatedFields } = responseData;
        logRequestStatus({
            context: 'CUSTOMER: UPDATE DISCOUNT',
            status,
            message,
            ...(fieldErrors && { details: fieldErrors })
        });
        
        if (status !== REQUEST_STATUS.SUCCESS) {
            return {
                success: false,
                ...(fieldErrors && { fieldErrors }),
                onComplete: function() {
                    if (!fieldErrors) {
                        openAlertModal({
                            type: 'error',
                            dismissible: false,
                            title: 'Не удалось изменить клиентскую скидку',
                            message:
                                'Ошибка при изменении скидки клиента.\n' +
                                'Подробности ошибки в консоли.'
                        });
                    }
                    setCustomerOperationBusy(false);
                }
            };
        }
        
        return {
            success: true,
            onComplete: function() {
                applyCustomerUpdates(customerId, updatedFields);
                setCustomerOperationBusy(false);
            }
        };
    };

    const toggleCustomerBanStatus = async (customerId, newBanStatus) => {
        setCustomerOperationBusy(true);

        const responseData = await dispatch(sendCustomerBanToggleRequest(customerId, newBanStatus));
        if (isUnmountedRef.current) return;

        const { status, message, updatedFields } = responseData;
        logRequestStatus({ context: 'CUSTOMER: TOGGLE BAN', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось изменить статус бана',
                message:
                    'Ошибка при изменении статуса блокировки клиента.\n' +
                    'Подробности ошибки в консоли.'
            });
        } else {
            applyCustomerUpdates(customerId, updatedFields);
        }

        setCustomerOperationBusy(false);
    };

    const toggleAllCustomerSelection = async (areAllCustomersSelected) => {
        if (!filteredCustomerIds.size) return;
        setSelectedCustomerIds(new Set(areAllCustomersSelected ? [] : filteredCustomerIds));
    };

    const toggleCustomerSelection = (customerId) => {
        setSelectedCustomerIds(prev => {
            const newSelection = new Set(prev);

            if (newSelection.has(customerId)) {
                newSelection.delete(customerId);
            } else {
                newSelection.add(customerId);
            }
    
            return newSelection;
        });
    };

    const toggleCustomerExpansion = async (customerId) => {
        setExpandedCustomerIds(prev => {
            const newExpandedSet = new Set(prev);

            if (newExpandedSet.has(customerId)) {
                newExpandedSet.delete(customerId);
            } else {
                newExpandedSet.add(customerId);
            }

            return newExpandedSet;
        });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка начальных значений параметров при первой загрузке
    useEffect(() => {
        const params = new URLSearchParams(location.search);

        setSearch(params.get('search') || '');
        setFilter(getInitFilterParams(params, customersFilterOptions));
        setSort(getInitSortParam(params, customersSortOptions));
        setPage(getInitPageParam(params));
        setLimit(getInitLimitParam(params, customersPageLimitOptions));
        
        setInitialized(true);
    }, []);

    // Обновление URL и загрузка клиентов с обновлёнными параметрами
    useEffect(() => {
        if (!initialized) return;

        const timeZoneOffset = new Date().getTimezoneOffset();
        const params = new URLSearchParams({ page, limit, search, sort, timeZoneOffset });
        filter.forEach((value, key) => params.append(key, value));
        const urlParams = params.toString();

        if (location.search !== `?${urlParams}`) {
            const newUrl = `${location.pathname}?${urlParams}`;
            navigate(newUrl, { replace: true }); // Также очищается loacation.state
        }

        loadCustomers(urlParams);
    }, [initialized, search, filter, sort, page, limit]);

    // Удаление отсутствующих в загруженной выборке клиентов из выбранных и раскрытых ранее
    useEffect(() => {
        const [trimmedSelected, selectedChanged] =
            trimSetByFilter(selectedCustomerIds, filteredCustomerIds);
        const [trimmedExpanded, expandedChanged] =
            trimSetByFilter(expandedCustomerIds, filteredCustomerIds);
    
        if (selectedChanged) setSelectedCustomerIds(trimmedSelected);
        if (expandedChanged) setExpandedCustomerIds(trimmedExpanded);
    }, [filteredCustomerIds]);

    if (!initialized) return null;

    return (
        <div className="customer-management-page">
            <header className="customer-management-header">
                <h2>Список клиентов</h2>
                <p>Поиск, оповещение, управление скидками и доступом</p>
            </header>

            <div className="customers-notification">
                <div className="customers-notification-controls">
                    <button
                        className={isNotifEditorExpanded ? 'enabled' : null}
                        onClick={() => setIsNotifEditorExpanded(prev => !prev)}
                    >
                        <span className="icon">📝</span>
                        Написать уведомление
                    </button>
                    <button
                        onClick={() => navigate(routeConfig.adminNotifications.paths[0])}
                        aria-label="Перейти к управлению уведомлениями"
                    >
                        <span className="icon">📜</span>
                        Просмотр уведомлений
                    </button>
                </div>

                <Collapsible
                    isExpanded={isNotifEditorExpanded}
                    className="notification-editor-collapsible"
                >
                    <NotificationEditor
                        notificationId={locationState?.notificationId || null}
                        filteredCustomerNamesMap={filteredCustomerNamesMap}
                        selectedCustomerIds={selectedCustomerIds}
                        setSelectedCustomerIds={setSelectedCustomerIds}
                    />
                </Collapsible>
            </div>
            
            <Toolbar
                position="top"
                activeControls={['limit', 'sort', 'search', 'filter', 'pages']}
                uiBlocked={isCustomerUiBlocked}
                initDataReady={initCustomersReady}
                search={search}
                setSearch={setSearch}
                searchPlaceholder="По ID, логину или email клиента"
                filter={filter}
                setFilter={setFilter}
                filterOptions={customersFilterOptions}
                sort={sort}
                setSort={setSort}
                sortOptions={customersSortOptions}
                page={page}
                setPage={setPage}
                limit={limit}
                setLimit={setLimit}
                limitOptions={customersPageLimitOptions}
                totalItems={filteredCustomerIds.size}
            />

            <CustomerTable
                loadStatus={customersLoadStatus}
                uiBlocked={isCustomerUiBlocked}
                paginatedItems={paginatedCustomerList}
                filteredItems={filteredCustomerIds}
                selectedItems={selectedCustomerIds}
                expandedItems={expandedCustomerIds}
                toggleAllItemSelection={toggleAllCustomerSelection}
                toggleItemSelection={toggleCustomerSelection}
                toggleItemExpansion={toggleCustomerExpansion}
                updateItemDiscount={updateCustomerDiscount}
                toggleItemBanStatus={toggleCustomerBanStatus}
                reloadItems={reloadCustomers}
            />

            <Toolbar
                position="bottom"
                activeControls={['info', 'pages']}
                loadStatus={customersLoadStatus}
                uiBlocked={isCustomerUiBlocked}
                initDataReady={initCustomersReady}
                page={page}
                setPage={setPage}
                limit={limit}
                totalItems={filteredCustomerIds.size}
                label="Клиенты"
            />
        </div>
    );
};
