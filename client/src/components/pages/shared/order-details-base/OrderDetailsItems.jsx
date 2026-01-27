import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import { sendOrderItemsAvailabilityRequest } from '@/api/orderRequests.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { formatCurrency, formatProductTitle } from '@/helpers/textHelpers.js';
import { makeOrderItemQuantityFieldName } from '@shared/commonHelpers.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { REQUEST_STATUS, CLIENT_CONSTANTS } from '@shared/constants.js';

const { PRODUCT_IMAGE_PLACEHOLDER, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getFieldConfigs = (orderItemList, itemsAvailabilityMap) => {
    const fieldConfigs = orderItemList.map(item => ({
        id: item.productId,
        name: makeOrderItemQuantityFieldName(item.productId),
        elem: 'input',
        type: 'number',
        step: 1,
        min: 0,
        max: item.quantity + (itemsAvailabilityMap?.[item.productId] ?? 0),
        defaultValue: item.quantity
    }));

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.id] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name, defaultValue }) => {
        acc[name] = { value: defaultValue, uiStatus: '', error: '' };
        return acc;
    }, {});

const fieldsStateReducer = (state, action) => {
    const { type, payload } = action;

    switch (type) {
        case 'UPDATE':
            const newState = { ...state };
            for (const name in payload) {
                newState[name] = { ...(state[name] ?? {}), ...payload[name] };
            }
            return newState;

        case 'RESET':
            return payload;

        default:
            return state;
    }
};

export default function OrderDetailsItems({
    isEditMode,
    orderId,
    orderItemList,
    isItemsSubmitting,
    itemsResponseResult,
    clearItemsSubmitResult,
    onItemsSubmitResult,
    clearItemsResponseResult
}) {
    const [itemsAvailabilityReady, setItemsAvailabilityReady] = useState(false);
    const [itemsAvailabilityLoading, setItemsAvailabilityLoading] = useState(false);
    const [itemsAvailabilityMap, setItemsAvailabilityMap] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const { fieldConfigs, fieldConfigMap } = useMemo(
        () => getFieldConfigs(orderItemList, itemsAvailabilityMap),
        [orderItemList, itemsAvailabilityMap]
    );
    const [fieldsState, dispatchFieldsState] = useReducer(
        fieldsStateReducer,
        fieldConfigs,
        initFieldsStateReducer
    );

    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const loadItemsAvailability = async () => {
        setItemsAvailabilityLoading(true);

        const responseData = await dispatch(sendOrderItemsAvailabilityRequest(orderId));
        if (isUnmountedRef.current) return;

        const { status, message, orderItemsAvailabilityMap } = responseData;
        logRequestStatus({ context: 'ORDER: LOAD ITEMS AVAILABILITY', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось загрузить данные для заказа',
                message:
                    'Ошибка при попытке получить доступное на складе количество товаров в заказе.\n' +
                    'Подробности ошибки в консоли.'
            });
        } else {
            setItemsAvailabilityMap(orderItemsAvailabilityMap);
            setItemsAvailabilityReady(true);
        }

        setItemsAvailabilityLoading(false);
    };

    const handleFieldChange = (e) => {
        const { type, name, value } = e.target;
        const processedValue = type === 'number' && value !== '' ? Number(value) : value;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value: processedValue, uiStatus: '', error: '' } }
        });
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const validation = validationRules.order.itemQuantity;
                if (!validation) {
                    console.error('Отсутствует правило валидации для поля: itemQuantity');
                    return acc;
                }

                const productId = name.split('-')[1];
                const { min, max, defaultValue } = fieldConfigMap[productId] ?? {};
                const ruleCheck = validation.test(value);

                const isValid = ruleCheck && value >= min && value <= max;

                acc.fieldStateUpdates[name] = {
                    value,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.order.itemQuantity?.default || fieldErrorMessages.DEFAULT
                };

                if (isValid && value !== defaultValue) {
                    acc.items.push({ productId, quantity: value });
                    acc.changedFields.push(name);
                }
                
                if (!isValid) {
                    acc.allValid = false;
                }
        
                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, items: [], changedFields: [] }
        );
    
        return result;
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Загрузка доступного количества товара (обновление через SSE)
    useEffect(() => {
        if (!isEditMode) return;
        if (isItemsSubmitting) return;

        setItemsAvailabilityReady(false);
    }, [orderItemList]);

    // Загрузка доступного кол-ва товаров на складе и сброс флага готовности с состоянием полей
    useEffect(() => {
        if (isEditMode) {
            if (!itemsAvailabilityLoading && !itemsAvailabilityReady) {
                loadItemsAvailability();
            }
        } else {
            setItemsAvailabilityReady(false);
            dispatchFieldsState({ type: 'RESET', payload: initFieldsStateReducer(fieldConfigs) });
        }
    }, [isEditMode, itemsAvailabilityLoading, itemsAvailabilityReady]);

    // Сброс всех полей при изменении их конфигов
    useEffect(() => {
        dispatchFieldsState({ type: 'RESET', payload: initFieldsStateReducer(fieldConfigs) });
    }, [fieldConfigs]);

    // Формирование и очистка данных для запроса
    useEffect(() => {
        if (!isItemsSubmitting) {
            setSubmitting(false);
            clearItemsSubmitResult();
            return;
        }

        const { allValid, fieldStateUpdates, items, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return onItemsSubmitResult({ ok: false });
        }

        setSubmitting(true);
        onItemsSubmitResult({ ok: true, items, changedFields });
    }, [isItemsSubmitting]);

    // Обработка и очистка результата запроса
    useEffect(() => {
        if (!itemsResponseResult) return;

        const { shouldRefreshItemsAvailability, fieldErrors, changedFields } = itemsResponseResult;

        if (shouldRefreshItemsAvailability) {
            loadItemsAvailability(); // Для обновления максимального количества товаров
            clearItemsResponseResult();
            return;
        }

        // Обработка полей с ошибками
        const fieldStateUpdates = {};

        if (fieldErrors) {
            Object.entries(fieldErrors).forEach(([name, error]) => {
                fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
            });
            dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

            clearItemsResponseResult();
            return;
        }
        
        // Обработка изменённых полей
        let highlightTimerId = null;

        if (changedFields) {
            changedFields.forEach(name => {
                fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
            });
            dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

            highlightTimerId = setTimeout(() => {
                changedFields.forEach(name => {
                    fieldStateUpdates[name] = { uiStatus: '' };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                clearItemsResponseResult();
                loadItemsAvailability(); // Для обновления максимального количества товаров
            }, SUCCESS_DELAY);
        }

        return () => {
            clearTimeout(highlightTimerId);
        };
    }, [itemsResponseResult]);

    return (
        <div role="table" className={cn(
            'entity-table',
            'order-details-items-table',
            { 'edit-mode': isEditMode }
        )}>
            <div role="rowgroup" className="table-header">
                <div role="row">
                    <div role="columnheader" className="row-cell thumb">Фото</div>
                    <div role="columnheader" className="row-cell sku">Артикул</div>
                    <div role="columnheader" className="row-cell title">Наименование</div>
                    <div role="columnheader" className="row-cell price">Цена</div>
                    <div role="columnheader" className="row-cell discount">Скидка</div>
                    <div role="columnheader" className="row-cell quantity">Количество</div>
                    <div role="columnheader" className="row-cell total-price">Сумма</div>
                </div>
            </div>

            <div role="rowgroup" className="table-body">
                {orderItemList.map(({
                    productId,
                    image,
                    sku,
                    name,
                    brand,
                    originalUnitPrice,
                    finalUnitPrice,
                    appliedDiscount,
                    appliedDiscountSource,
                    quantity,
                    unit,
                    totalPrice: finalTotalPrice
                }) => {
                    const title = formatProductTitle(name, brand);

                    const thumbImageSrc = image ?? PRODUCT_IMAGE_PLACEHOLDER;
                    const thumbImageAlt = image ? title : '';

                    const originalTotalPrice = originalUnitPrice * quantity;

                    const formattedOriginalPrice = formatCurrency(originalUnitPrice);
                    const formattedFinalPrice = formatCurrency(finalUnitPrice);
                    const formattedOriginalTotalPrice = formatCurrency(originalTotalPrice);
                    const formattedFinalTotalPrice = formatCurrency(finalTotalPrice);

                    const hasDiscount = appliedDiscount > 0;

                    const discountSource = ({
                        customer: 'клиентская скидка',
                        product: 'скидка на товар',
                        none: ''
                    })[appliedDiscountSource];

                    const fieldConfig = fieldConfigMap[productId];

                    return (
                        <div key={productId} data-id={productId} className="table-row">
                            <div role="row" className="table-row-main">
                                <div role="cell" className="row-cell thumb">
                                    <div className="cell-label">Фото:</div>
                                    <div className="cell-content">
                                        <div className="product-thumb">
                                            <TrackedImage
                                                className="product-thumb-img"
                                                src={thumbImageSrc}
                                                alt={thumbImageAlt}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div role="cell" className="row-cell sku">
                                    <div className="cell-label">Артикул:</div>
                                    <div className="cell-content">{sku}</div>
                                </div>
                                <div role="cell" className="row-cell title">
                                    <div className="cell-label">Наименование:</div>
                                    <div className="cell-content">{title}</div>
                                </div>
                                <div role="cell" className="row-cell price">
                                    <div className="cell-label">Цена:</div>
                                    <div className="cell-content">
                                        {hasDiscount ? (
                                            <>
                                                <p>
                                                    <span className="meta-label">Без скидки: </span>
                                                    {formattedOriginalPrice} руб.
                                                </p>
                                                <p>
                                                    <span className="meta-label">Со скидкой: </span>
                                                    {formattedFinalPrice} руб.
                                                </p>
                                            </>
                                        ) : (
                                            `${formattedFinalPrice} руб.`
                                        )}
                                    </div>
                                </div>
                                <div role="cell" className="row-cell discount">
                                    <div className="cell-label">Скидка:</div>
                                    <div className="cell-content">
                                        {appliedDiscount}%
                                        {hasDiscount && (
                                            <span className="meta-label"> ({discountSource})</span>
                                        )}
                                    </div>
                                </div>
                                <div role="cell" className="row-cell quantity">
                                    <div className="cell-label">Количество:</div>
                                    <div className="cell-content">
                                            {isEditMode ? (
                                                <div className={cn(
                                                    'form-field',
                                                    fieldsState[fieldConfig.name]?.uiStatus
                                                )}>
                                                    <input
                                                        name={fieldConfig.name}
                                                        type={fieldConfig.type}
                                                        step={fieldConfig.step}
                                                        min={fieldConfig.min}
                                                        max={fieldConfig.max}
                                                        value={fieldsState[fieldConfig.name]?.value}
                                                        onChange={handleFieldChange}
                                                        disabled={
                                                            !itemsAvailabilityReady ||
                                                            itemsAvailabilityLoading ||
                                                            submitting
                                                        }
                                                    />
                                                    {' '}
                                                    {unit}
                                                    
                                                    {fieldsState[fieldConfig.name]?.error && (
                                                        <p className="invalid-message">
                                                            *{fieldsState[fieldConfig.name].error}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                `${quantity} ${unit}`
                                            )}
                                    </div>
                                </div>
                                <div role="cell" className="row-cell total-price">
                                    <div className="cell-label">Сумма:</div>
                                    <div className="cell-content">
                                        {hasDiscount ? (
                                            <>
                                                <p>
                                                    <span className="meta-label">Без скидки: </span>
                                                    {formattedOriginalTotalPrice} руб.
                                                </p>
                                                <p>
                                                    <span className="meta-label">Со скидкой: </span>
                                                    {formattedFinalTotalPrice} руб.
                                                </p>
                                            </>
                                        ) : (
                                            `${formattedFinalTotalPrice} руб.`
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
