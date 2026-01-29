import React, { useMemo, useReducer, useState, useRef, useEffect }  from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import { sendOrderStatusUpdateRequest } from '@/api/orderRequests.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { isEqualCurrency } from '@shared/commonHelpers.js';
import {
    MIN_ORDER_AMOUNT,
    REQUEST_STATUS,
    INTENT,
    DELIVERY_METHOD,
    ORDER_STATUS,
    ORDER_STATUS_CONFIG,
    ORDER_ACTIVE_STATUSES,
    ORDER_ACTION,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { FIELD_UI_STATUS } = CLIENT_CONSTANTS;

const fieldConfigs = [
    {
        name: 'shippingCost',
        label: 'Стоимость доставки',
        elem: 'input',
        type: 'number',
        step: 0.01,
        min: 0,
        canApply: ({ stepStatus, deliveryMethod, allowCourierExtra }) =>
            stepStatus === ORDER_STATUS.DELIVERED &&
            (
                deliveryMethod === DELIVERY_METHOD.TRANSPORT_COMPANY ||
                (deliveryMethod === DELIVERY_METHOD.COURIER && allowCourierExtra)
            )
    },
    {
        name: 'cancellationReason',
        label: 'Причина отмены',
        elem: 'textarea',
        placeholder: 'Укажите причину отмены заказа',
        trim: true,
        canApply: ({ stepStatus }) => stepStatus === ORDER_STATUS.CANCELLED
    }
];

const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
    acc[config.name] = config;
    return acc;
}, {});

const initialFieldsState = fieldConfigs.reduce((acc, { name }) => {
    acc[name] = { value: '', uiStatus: '', error: '' };
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

        default:
            return state;
    }
};

export default function OrderStatusSteps({
    orderId,
    currentOrderStatus,
    lastActiveOrderStatus,
    deliveryMethod,
    allowCourierExtra,
    shippingCost,
    netPaid,
    totalAmount
}) {
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [orderStatusLoading, setOrderStatusLoading] = useState(false);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const orderStatusSteps = useMemo(() => {
        return Object.entries(ORDER_STATUS_CONFIG)
            .filter(([_, cfg]) =>
                cfg.step &&
                (
                    cfg.step.deliveryMethods.includes('all') ||
                    cfg.step.deliveryMethods.includes(deliveryMethod)
                )
            )
            .sort((a, b) => a[1].step.order - b[1].step.order)
            .map(([status, cfg]) => ({ status, ...cfg.step }));
    }, [deliveryMethod]);

    const nextStepIdx = useMemo(() => {
        const idx = orderStatusSteps.findIndex(step => step.status === currentOrderStatus);
        return idx >= 0 ? idx + 1 : 0;
    }, [orderStatusSteps, currentOrderStatus]);
    
    // Индекс последнего активного шага для галочек при отмене заказа
    const lastActiveStatusStepIdx = useMemo(() => {
        if (currentOrderStatus !== ORDER_STATUS.CANCELLED) return nextStepIdx - 1;
        if (!lastActiveOrderStatus) return 0;
    
        const stepIdx = orderStatusSteps.findIndex(cfg => cfg.status === lastActiveOrderStatus);
        return Math.max(stepIdx, 0);
    }, [currentOrderStatus, lastActiveOrderStatus, orderStatusSteps, nextStepIdx]);

    const stepsGridClassName = deliveryMethod === DELIVERY_METHOD.SELF_PICKUP
        ? 'grid-pickup'
        : 'grid-delivery';

    const isStepFormVisible = (stepStatus, stepIdx) => {
        // Если заказ завершён — никаких кнопок
        if (currentOrderStatus === ORDER_STATUS.COMPLETED) return false;

        // Кнопка для отмены только если заказ ещё не отменён
        if (stepStatus === ORDER_STATUS.CANCELLED && currentOrderStatus !== ORDER_STATUS.CANCELLED) {
            return true;
        }

        // Обычные кнопки действий для следующего шага
        return stepIdx === nextStepIdx;
    };

    const isRollbackFormVisible = (stepIdx) =>
        ORDER_ACTIVE_STATUSES.includes(currentOrderStatus) &&
        orderStatusSteps[stepIdx - 1]?.rollbackAllowed;

    const isUpdateOrderStatusBtnDisabled = (stepStatus) =>
        orderStatusLoading ||
        (
            stepStatus === ORDER_STATUS.COMPLETED &&
            !isEqualCurrency(netPaid, totalAmount) &&
            netPaid < totalAmount
        ) ||
        (
            stepStatus !== ORDER_STATUS.CANCELLED &&
            totalAmount < MIN_ORDER_AMOUNT
        );

    const isRollbackOrderStatusBtnDisabled = (stepIdx) => orderStatusLoading || stepIdx !== nextStepIdx;

    const getStepIntent = (stepStatus, stepIdx) => {
        if (stepStatus === ORDER_STATUS.CANCELLED) {
            if (currentOrderStatus === ORDER_STATUS.COMPLETED) return INTENT.NEUTRAL;
            return INTENT.NEGATIVE;
        }

        if (currentOrderStatus === ORDER_STATUS.CANCELLED) return INTENT.NEUTRAL;

        if (stepIdx < nextStepIdx) return INTENT.POSITIVE;
        if (stepIdx > nextStepIdx) return INTENT.NEUTRAL;
        return INTENT.HIGHLIGHT; // stepIdx === nextStepIdx
    };

    const getOrderStatusStepIcon = (stepStatus, stepIdx) => {
        if (currentOrderStatus === ORDER_STATUS.CANCELLED) {
            if (stepStatus === ORDER_STATUS.CANCELLED) return '✅';
            if (stepIdx <= lastActiveStatusStepIdx) return '✅';
            return null;
        }
        if (stepIdx < nextStepIdx) return '✅';
        if (stepIdx > nextStepIdx) return '⋯';
    };

    const handleFieldChange = (e) => {
        const { type, name, value } = e.target;
        const processedValue = type === 'number' && value !== ''
            ? Number(value.replace(',', '.'))
            : value;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value: processedValue, uiStatus: '', error: '' } }
        });
    };

    const handleTrimmedFieldBlur = (e) => {
        const { name, value } = e.target;
        const normalizedValue = value.trim();
        if (normalizedValue === value) return;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value: normalizedValue } }
        });
    };

    const processFormFields = (newStatus) => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const fieldConfig = fieldConfigMap[name];
                if (!fieldConfig) return acc;

                const { trim, canApply } = fieldConfig;

                const isApplicable = canApply({
                    stepStatus: newStatus,
                    deliveryMethod,
                    allowCourierExtra
                });
                if (!isApplicable) return acc;

                const validation = validationRules.order[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const normalizedValue = trim ? value.trim() : value;
                const ruleCheck = validation.test(normalizedValue);
                const isValid = ruleCheck;

                acc.fieldStateUpdates[name] = {
                    value: normalizedValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.order[name].default || fieldErrorMessages.DEFAULT
                };

                if (isValid) {
                    acc.formFields[name] = normalizedValue;
                } else {
                    acc.allValid = false;
                }
        
                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, formFields: {} }
        );
    
        return result;
    };

    const handleFormSubmit = async (e, { newStatus, rollback }) => {
        e.preventDefault();

        let formFields;
    
        if (!rollback) {
            const processed = processFormFields(newStatus);
            const { allValid, fieldStateUpdates } = processed;
            formFields = processed.formFields;
        
            dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
            if (!allValid) return;
        }
    
        setOrderStatusLoading(true);
    
        const action =
            rollback
                ? ORDER_ACTION.ROLLBACK
                : newStatus === ORDER_STATUS.CANCELLED
                    ? ORDER_ACTION.CANCEL
                    : ORDER_ACTION.NEXT;

        const requestData = {
            action,
            ...(!rollback && formFields && Object.keys(formFields).length > 0 && { formFields })
        };
    
        const responseData = await dispatch(sendOrderStatusUpdateRequest(orderId, requestData));
        if (isUnmountedRef.current) return;
    
        const { status, message, fieldErrors } = responseData;
    
        logRequestStatus({
            context: 'ORDER: STATUS UPDATE',
            status,
            message,
            ...(fieldErrors && { details: fieldErrors })
        });
    
        if (status === REQUEST_STATUS.INVALID && !rollback) {
            const fieldStateUpdates = {};
            Object.entries(fieldErrors).forEach(([name, error]) => {
                fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
            });
            dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        } else if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось изменить статус заказа',
                message: 'Ошибка при изменении статуса заказа.\nПодробности ошибки в консоли.'
            });
        }
    
        setOrderStatusLoading(false);
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка дефолтного значения для поля shippingCost
    useEffect(() => {
        dispatchFieldsState({
            type: 'UPDATE',
            payload: { shippingCost: { value: shippingCost ?? 0 } }
        });
    }, [shippingCost]);
    
    return (
        <div className={`order-status-steps ${stepsGridClassName}`}>
            {orderStatusSteps.map(({status, label, actionBtnLabel, className }, idx) => (
                <div
                    key={status}
                    className={cn('order-status-step', className, getStepIntent(status, idx))}
                >
                    <div className="order-status-step-header">
                        {status !== ORDER_STATUS.CANCELLED && (
                            <span className="order-status-step-number">{idx + 1}</span>
                        )}

                        <span className="order-status-step-label">{label}</span>

                        {isRollbackFormVisible(idx) && (
                            <form
                                className="order-status-form"
                                data-type="rollback"
                                onSubmit={(e) => handleFormSubmit(e, { rollback: true })}
                                noValidate
                            >
                                <button
                                    type="submit"
                                    name="submit-rollback-order-status-btn"
                                    className="rollback-order-status-btn"
                                    title="Откатить на предыдущий шаг"
                                    disabled={isRollbackOrderStatusBtnDisabled(idx)}
                                >
                                    ↩️
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="order-status-step-controls">
                        {isStepFormVisible(status, idx) ? (
                            <form
                                className="order-status-form"
                                data-type="change"
                                onSubmit={(e) => handleFormSubmit(e, { newStatus: status })}
                                noValidate
                            >
                                {fieldConfigs.map(({
                                    name,
                                    label,
                                    elem,
                                    type,
                                    step,
                                    min,
                                    placeholder,
                                    trim,
                                    canApply
                                }) => {
                                    const fieldId = `order-${orderId}-status-${toKebabCase(name)}`;
                                    const fieldInfoClass = getFieldInfoClass(elem, type, name);
                                    const isApplicable = canApply({
                                        stepStatus: status,
                                        deliveryMethod,
                                        allowCourierExtra
                                    });

                                    const elemProps = {
                                        id: fieldId,
                                        name,
                                        type,
                                        step,
                                        min,
                                        placeholder,
                                        value: fieldsState[name]?.value,
                                        autoComplete: 'off',
                                        onChange: handleFieldChange,
                                        onBlur: trim ? handleTrimmedFieldBlur : undefined,
                                        disabled: orderStatusLoading || !isApplicable
                                    };

                                    if (!isApplicable) return null;

                                    return (
                                        <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                                            <label htmlFor={fieldId} className="form-entry-label">
                                                {label}:
                                            </label>

                                            <div className={cn(
                                                'form-entry-field',
                                                fieldsState[name]?.uiStatus
                                            )}>
                                                {React.createElement(elem, elemProps)}

                                                {fieldsState[name]?.error && (
                                                    <span className="invalid-message">
                                                        *{fieldsState[name].error}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}

                                <button
                                    type="submit"
                                    name="submit-update-order-status-btn"
                                    className="update-order-status-btn"
                                    disabled={isUpdateOrderStatusBtnDisabled(status)}
                                >
                                    {actionBtnLabel}
                                </button>
                            </form>
                        ) : idx !== nextStepIdx && (
                            <span className="order-status-step-icon">
                                {getOrderStatusStepIcon(status, idx)}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
