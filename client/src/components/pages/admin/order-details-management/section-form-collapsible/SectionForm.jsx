import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import Collapsible from '@/components/common/Collapsible.jsx';
import FormFooter from '@/components/common/FormFooter.jsx';
import { sendOrderDetailsUpdateRequest, sendOrderItemsUpdateRequest } from '@/api/orderRequests.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { formatOrderItemsAdjustmentLogs } from '@/services/orderService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { toKebabCase, getFieldInfoClass, formatCurrency } from '@/helpers/textHelpers.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import {
    MIN_ORDER_AMOUNT,
    DELIVERY_METHOD,
    DELIVERY_METHOD_OPTIONS,
    PAYMENT_METHOD_OPTIONS,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, BAD_REQUEST, NOT_FOUND, UNCHANGED, LIMITATION,
        MODIFIED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Сохранить';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходный заказ или связанный с ним ресурс не найден.'
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Данные заказа не изменены.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [LIMITATION]: { ...base[LIMITATION], submitBtnLabel: actionLabel, locked: false },
        [MODIFIED]: {
            ...base[MODIFIED],
            mainMessage: 'Заказ не изменён.',
            addMessage: 'Обнаружены корректировки.',
            submitBtnLabel: actionLabel
        },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Данные заказа обновлены!',
            submitBtnLabel: 'Сохранено'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const { submitStates, lockedStatuses } = getSubmitStates();

const isDeliveryRequired = (deliveryMethod) =>
    deliveryMethod && deliveryMethod !== DELIVERY_METHOD.SELF_PICKUP;

const getFieldConfigs = (section) => {
    const baseFieldConfigsBySection = {
        customerInfoSection: [
            {
                name: 'firstName',
                label: 'Имя',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите имя покупателя',
                trim: true
            },
            {
                name: 'lastName',
                label: 'Фамилия',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите фамилию покупателя',
                trim: true
            },
            {
                name: 'middleName',
                label: 'Отчество (опционально)',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите отчество покупателя, если есть',
                trim: true,
                optional: true
            },
            {
                name: 'email',
                label: 'Email',
                elem: 'input',
                type: 'text', // Чтобы срабатывали изменения для пробелов в начале и конце
                placeholder: 'Укажите почтовый ящик',
                trim: true
            },
            {
                name: 'phone',
                label: 'Телефон',
                elem: 'input',
                type: 'tel',
                placeholder: 'Укажите номер телефона',
                trim: true
            }
        ],
        deliverySection: [
            {
                name: 'deliveryMethod',
                label: 'Метод доставки',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать метод доставки ---' },
                    ...DELIVERY_METHOD_OPTIONS
                ],
                relatedField: 'allowCourierExtra'
            },
            {
                name: 'allowCourierExtra',
                label: 'Курьер-экстра',
                elem: 'checkbox',
                checkboxLabel: 'Выбрать дополнительную услугу курьера',
                relatedField: 'deliveryMethod',
                tooltip:
                    'При удалении свыше 10 км от магазина возможен выезд курьера с доплатой. ' +
                    'Стоимость рассчитывается индивидуально.',
                canApply: ({ deliveryMethod }) => deliveryMethod === DELIVERY_METHOD.COURIER
            },
            {
                name: 'region',
                label: 'Область/Регион (опционально)',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите полное название региона',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'district',
                label: 'Район (опционально)',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите район',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'city',
                label: 'Город',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите город',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'street',
                label: 'Улица',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите улицу',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'house',
                label: 'Дом',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер дома',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'apartment',
                label: 'Квартира (опционально)',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер квартиры',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'postalCode',
                label: 'Почтовый индекс (опционально)',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите почтовый индекс',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            }
        ],
        paymentSection: [
            {
                name: 'defaultPaymentMethod',
                label: 'Способ оплаты',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать способ оплаты ---' },
                    ...PAYMENT_METHOD_OPTIONS
                ]
            }
        ],
        itemsSection: []
    };

    const editReasonConfig = {
        name: 'editReason',
        label: 'Причина изменения',
        elem: 'textarea',
        placeholder: 'Укажите причину изменения',
        trim: true
    };

    const fieldConfigs = [...baseFieldConfigsBySection[section], editReasonConfig];

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.name] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name }) => {
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

export default function SectionForm({
    section,
    order,
    itemsSubmitResult,
    setIsItemsSubmitting,
    onItemsResponseResult
}) {
    const { fieldConfigs, fieldConfigMap } = useMemo(() => getFieldConfigs(section), [section]);
    
    const [fieldsState, dispatchFieldsState] = useReducer(
        fieldsStateReducer,
        fieldConfigs,
        initFieldsStateReducer
    );
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);
    const initValuesRef = useRef({});
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const deliveryMethod = fieldsState.deliveryMethod?.value || '';

    const applicabilityMap = useMemo(
        () => Object.fromEntries(
            fieldConfigs.map(cfg => [
                cfg.name,
                typeof cfg.canApply === 'function' ? cfg.canApply({ deliveryMethod }) : true
            ])
        ),
        [deliveryMethod]
    );

    const isFormLocked = lockedStatuses.has(submitStatus);
    const isItemsSection = section === 'itemsSection';

    const handleFieldChange = (e) => {
        const { type, name, value, checked } = e.target;
        const processedValue = type === 'checkbox' ? checked : value;

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

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const isApplicable = applicabilityMap[name];
                if (!isApplicable) {
                    acc.formFields[name] = ''; // Для удаления поля в БД
                    return acc;
                }

                const validation = validationRules.order[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const { trim, optional, relatedField } = fieldConfigMap[name] ?? {};
                const normalizedValue = trim ? value.trim() : value;
                const ruleCheck =
                    typeof validation === 'function'
                        ? validation(normalizedValue)
                        : validation.test(normalizedValue);

                const isValid = optional ? (!normalizedValue || ruleCheck) : ruleCheck;

                acc.fieldStateUpdates[name] = {
                    value: normalizedValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.order[name].default || fieldErrorMessages.DEFAULT
                };

                if (isValid) {
                    const initValue = initValuesRef.current[name];

                    if (normalizedValue !== initValue) {
                        acc.formFields[name] = normalizedValue;
                        acc.changedFields.push(name);

                        if (relatedField) {
                            acc.formFields[relatedField] = fieldsState[relatedField]?.value;
                        }
                    }
                } else {
                    acc.allValid = false;
                }
        
                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, formFields: {}, changedFields: [] }
        );
    
        return result;
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();

        if (isItemsSection) {
            setIsItemsSubmitting(true);
        } else {
            const formFieldsResult = prepareFormFields();
            if (!formFieldsResult) return;
    
            const { formFields, changedFields } = formFieldsResult;
            performFormSubmission(formFields, changedFields);
        }
    };

    const handleItemsSectionFormSubmit = async (itemsSubmitResult) => {
        const formFieldsResult = prepareFormFields();

        if (!formFieldsResult || !itemsSubmitResult.ok) {
            return setIsItemsSubmitting(false);
        }

        const { formFields, changedFields } = formFieldsResult;
        formFields.items = itemsSubmitResult.items;
        await performFormSubmission(formFields, changedFields, itemsSubmitResult.changedFields);
    };

    const prepareFormFields = () => {
        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            setSubmitStatus(FORM_STATUS.INVALID);
            return null;
        } else if (!changedFields.length) {
            setSubmitStatus(FORM_STATUS.UNCHANGED);
            return null;
        }

        return { formFields, changedFields };
    };

    const performFormSubmission = async (formFields, changedFields, changedItemsFields) => {
        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const requestThunk = isItemsSection
            ? sendOrderItemsUpdateRequest(order.id, formFields)
            : sendOrderDetailsUpdateRequest(order.id, formFields);
        const responseData = await dispatch(requestThunk);
        if (isUnmountedRef.current) return;

        const { status, message, orderItemsAdjustments, fieldErrors, itemFieldErrors } = responseData;
        const hasAdjustments = orderItemsAdjustments?.length > 0;
        const LOG_CTX = 'ORDER: UPDATE';

        switch (status) {
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.USER_GONE:
            case FORM_STATUS.DENIED:
            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.NOT_FOUND:
            case FORM_STATUS.CONFLICT:
            case FORM_STATUS.UNCHANGED:
            case FORM_STATUS.ERROR:
            case FORM_STATUS.NETWORK:
                logRequestStatus({ context: LOG_CTX, status, message });
                if (isItemsSection) setIsItemsSubmitting(false);
                setSubmitStatus(status);
                dispatch(setIsNavigationBlocked(false));
                break;

            // Секция items: сумма заказа меньше минимальной в результате изменения кол-ва товаров
            case FORM_STATUS.LIMITATION: {
                logRequestStatus({ context: LOG_CTX, status, message });
                setIsItemsSubmitting(false);
                setSubmitStatus(status);

                const minOrderAmountMsg =
                    'Сумма заказа после изменения количества товаров стала меньше минимальной.\n' +
                    'Минимальная сумма заказа — ' +
                    `<span className="color-blue">${formatCurrency(MIN_ORDER_AMOUNT)}</span> ₽. `;

                const adjustmentsMsg = hasAdjustments
                    ? '<span className="bold underline">' +
                        'Корректировки при изменении товаров в заказе:</span>\n\n' +
                        formatOrderItemsAdjustmentLogs(orderItemsAdjustments)
                    : '';

                openAlertModal({
                    openDelay: 1000,
                    type: 'error',
                    dismissible: false,
                    title: 'Сумма заказа меньше минимальной',
                    message: minOrderAmountMsg + (hasAdjustments ? `\n\n\n${adjustmentsMsg}` : ''),
                    onClose: () => dispatch(setIsNavigationBlocked(false))
                });
                break;
            }

            // Секция items: изменений в количестве товаров нет, имеются корректировки изменений
            case FORM_STATUS.MODIFIED: {
                logRequestStatus({ context: LOG_CTX, status, message });
                setIsItemsSubmitting(false);
                setSubmitStatus(status);

                onItemsResponseResult({ shouldRefreshItemsAvailability: true });

                openAlertModal({
                    openDelay: 1000,
                    type: 'warning',
                    dismissible: false,
                    title: 'Корректировки при изменении товаров в заказе',
                    message: formatOrderItemsAdjustmentLogs(orderItemsAdjustments),
                    onClose: () => dispatch(setIsNavigationBlocked(false))
                });
                break;
            }

            case FORM_STATUS.INVALID: {
                const combinedErrors = { ...(fieldErrors ?? {}), ...(itemFieldErrors ?? {}) };
                logRequestStatus({ context: LOG_CTX, status, message, details: combinedErrors });

                if (fieldErrors) {
                    const fieldStateUpdates = {};
                    Object.entries(fieldErrors).forEach(([name, error]) => {
                        fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
                }

                if (isItemsSection) {
                    setIsItemsSubmitting(false);

                    if (itemFieldErrors) {
                        onItemsResponseResult({ fieldErrors: itemFieldErrors });
                    }
                }

                setSubmitStatus(status);
                dispatch(setIsNavigationBlocked(false));
                break;
            }
        
            case FORM_STATUS.SUCCESS: {
                logRequestStatus({ context: LOG_CTX, status, message });

                const fieldStateUpdates = {};
                changedFields.forEach(name => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                if (isItemsSection) onItemsResponseResult({ changedFields: changedItemsFields });
                setSubmitStatus(status);

                setTimeout(() => {
                    if (isUnmountedRef.current) return;

                    if (hasAdjustments) {
                        openAlertModal({
                            type: 'warning',
                            dismissible: false,
                            title: 'Корректировки при изменении товаров в заказе',
                            message: formatOrderItemsAdjustmentLogs(orderItemsAdjustments),
                            onClose: () => dispatch(setIsNavigationBlocked(false))
                        });
                    }

                    changedFields.forEach(name => {
                        fieldStateUpdates[name] = {
                            ...(name === 'editReason' && { value: '' }),
                            uiStatus: ''
                        };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                    if (isItemsSection) setIsItemsSubmitting(false);
                    setSubmitStatus(FORM_STATUS.DEFAULT);
                    dispatch(setIsNavigationBlocked(false));
                }, SUCCESS_DELAY);
                break;
            }
        
            default:
                logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                if (isItemsSection) setIsItemsSubmitting(false);
                setSubmitStatus(FORM_STATUS.UNKNOWN);
                dispatch(setIsNavigationBlocked(false));
                break;
        }
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка начальных значений полей заказа после загрузки/апдейта заказа
    useEffect(() => {
        // Выпрямление начальных значений полей и установка их в состояние редьюсера
        const { customerInfo = {}, delivery = {}, financials = {} } = order;
        const { deliveryMethod, allowCourierExtra = false, shippingAddress = {} } = delivery;

        const allFlatInitValues = {
            ...customerInfo,
            deliveryMethod,
            allowCourierExtra,
            ...shippingAddress,
            ...financials
        };

        const fieldStateUpdates = {};

        fieldConfigs.forEach(cfg => {
            if (cfg.name === 'editReason') return;

            const initValue = allFlatInitValues[cfg.name] ?? '';

            initValuesRef.current[cfg.name] = initValue;
            fieldStateUpdates[cfg.name] = { value: initValue };
        });

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [order, fieldConfigs]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    // Отправка данных после обработки полей количества товара в заказе (для секции )
    useEffect(() => {
        if (!isItemsSection) return;
        if (!itemsSubmitResult) return;

        handleItemsSectionFormSubmit(itemsSubmitResult);
    }, [isItemsSection, itemsSubmitResult]);

    return (
        <form className="order-details-section-form" onSubmit={handleFormSubmit} noValidate>
            <div className="form-body">
                {fieldConfigs.map(({
                    name,
                    label,
                    elem,
                    type,
                    step,
                    min,
                    options,
                    placeholder,
                    checkboxLabel,
                    tooltip,
                    trim,
                    canApply
                }) => {
                    const fieldId = `order-details-${section}-${toKebabCase(name)}`;
                    const fieldInfoClass = getFieldInfoClass(elem, type, name);
                    const isApplicable = applicabilityMap[name];
                    const collapsible = !!canApply;

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
                        disabled: isFormLocked || !isApplicable
                    };

                    let fieldElem;

                    if (elem === 'select') {
                        fieldElem = (
                            <select {...elemProps}>
                                {options.map((option, idx) => (
                                    <option key={`${idx}-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        );
                    } else if (elem === 'checkbox') {
                        fieldElem = (
                            <DesignedCheckbox
                                {...elemProps}
                                label={checkboxLabel}
                                checked={fieldsState[name]?.value}
                                value={undefined}
                            />
                        );
                    } else {
                        fieldElem = React.createElement(elem, elemProps);
                    }

                    const formEntryElem = (
                        <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                            <label htmlFor={fieldId} className="form-entry-label">
                                {label}
                                {tooltip && <span className="info" title={tooltip}>ⓘ</span>}
                                :
                            </label>

                            <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                {fieldElem}

                                {fieldsState[name]?.error && (
                                    <span className="invalid-message">
                                        *{fieldsState[name].error}
                                    </span>
                                )}
                            </div>
                        </div>
                    );

                    if (collapsible) {
                        return (
                            <Collapsible
                                key={`field-${name}`}
                                isExpanded={isApplicable}
                                className="form-entry-collapsible"
                                showContextIndicator={false}
                            >
                                {formEntryElem}
                            </Collapsible>
                        );
                    }

                    return formEntryElem;
                })}
            </div>

            <FormFooter
                submitStates={submitStates}
                submitStatus={submitStatus}
                uiBlocked={isFormLocked}
            />
        </form>
    );
};
