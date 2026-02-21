import React, { useReducer, useState, useRef, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import FormFooter from '@/components/common/FormFooter.jsx';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import { sendOrderDraftUpdateRequest, sendOrderDraftConfirmRequest } from '@/api/checkoutRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { clearLockedRoute } from '@/redux/slices/uiSlice.js';
import { setCart } from '@/redux/slices/cartSlice.js';
import { applyCartState, refreshCartTotals } from '@/services/cartService.js';
import { formatOrderAdjustmentLogs } from '@/services/checkoutService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import {
    formatProductTitle,
    formatCurrency,
    toKebabCase,
    pluralize,
    getFieldInfoClass
} from '@/helpers/textHelpers.js';
import generateSlug from '@/helpers/generateSlug.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/fieldRules.js';
import {
    CLIENT_CONSTANTS,
    DELIVERY_METHOD,
    DELIVERY_METHOD_OPTIONS,
    PAYMENT_METHOD_OPTIONS,
    MIN_ORDER_AMOUNT
} from '@shared/constants.js';

const {
    FORM_STATUS,
    NO_VALUE_LABEL,
    PRODUCT_IMAGE_PLACEHOLDER,
    FIELD_UI_STATUS,
    FIELD_SAVE_STATUS,
    FIELD_SAVE_STATUS_MESSAGES,
    SUCCESS_DELAY
} = CLIENT_CONSTANTS;

const isDeliveryRequired = (deliveryMethod) =>
    deliveryMethod && deliveryMethod !== DELIVERY_METHOD.SELF_PICKUP;

const formGroupConfigs = [
    {
        name: 'orderItemsGroup',
        title: 'Товары в заказе',
        description: 'Основные данные товаров в заказе',
        collapsible: true
    },
    {
        name: 'customerGroup',
        title: 'Покупатель',
        description: 'Основные данные покупателя',
        collapsible: true,
        fieldConfigs: [
            {
                name: 'firstName',
                label: 'Имя',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите имя покупателя',
                autocomplete: 'given-name',
                trim: true
            },
            {
                name: 'lastName',
                label: 'Фамилия',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите фамилию покупателя',
                autocomplete: 'family-name',
                trim: true
            },
            {
                name: 'middleName',
                label: 'Отчество',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите отчество покупателя, если есть',
                autocomplete: 'additional-name',
                trim: true,
                optional: true
            },
            {
                name: 'email',
                label: 'Email',
                elem: 'input',
                type: 'text', // Чтобы срабатывали изменения для пробелов в начале и конце
                placeholder: 'Укажите почтовый ящик',
                autocomplete: 'email',
                trim: true
            },
            {
                name: 'phone',
                label: 'Телефон',
                elem: 'input',
                type: 'tel',
                placeholder: 'Укажите номер телефона',
                autocomplete: 'tel',
                trim: true
            }
        ]
    },
    {
        name: 'deliveryGroup',
        title: 'Доставка',
        description: 'Информация для доставки заказа',
        collapsible: true,
        fieldConfigs: [
            {
                name: 'deliveryMethod',
                label: 'Метод доставки',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать метод доставки ---' },
                    ...DELIVERY_METHOD_OPTIONS
                ]
            },
            {
                name: 'allowCourierExtra',
                label: 'Курьер-экстра',
                elem: 'checkbox',
                checkboxLabel: 'Выбрать дополнительную услугу курьера',
                tooltip:
                    'При удалении свыше 10 км от магазина возможен выезд курьера с доплатой. ' +
                    'Стоимость рассчитывается индивидуально.',
                canApply: ({ deliveryMethod }) => deliveryMethod === DELIVERY_METHOD.COURIER
            },
            {
                name: 'region',
                label: 'Область/Регион',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите полное название региона',
                autocomplete: 'address-level1',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'district',
                label: 'Район',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите район',
                autocomplete: 'address-level2',
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
                autocomplete: 'address-level2',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'street',
                label: 'Улица',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите улицу',
                autocomplete: 'street-address',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'house',
                label: 'Дом',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер дома',
                autocomplete: 'address-line1',
                trim: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'apartment',
                label: 'Квартира',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер квартиры',
                autocomplete: 'address-line2',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'postalCode',
                label: 'Почтовый индекс',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите почтовый индекс',
                autocomplete: 'postal-code',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            }
        ]
    },
    {
        name: 'paymentGroup',
        title: 'Оплата',
        description: 'Выбор способа оплаты',
        collapsible: true,
        fieldConfigs: [
            {
                name: 'defaultPaymentMethod',
                label: 'Способ оплаты',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать способ оплаты ---' },
                    ...PAYMENT_METHOD_OPTIONS
                ]
            }
        ]
    },
    {
        name: 'customerCommentGroup',
        collapsible: false,
        fieldConfigs: [
            {
                name: 'customerComment',
                label: 'Комментарий',
                elem: 'textarea',
                placeholder: 'Напишите комментарий к заказу',
                trim: true,
                optional: true
            }
        ]
    }
];

const collapsibleFormGroupNames = formGroupConfigs
    .map(groupConfig => groupConfig.collapsible && groupConfig.name)
    .filter(Boolean);

const fieldConfigs = formGroupConfigs
    .flatMap(groupConfig => groupConfig.fieldConfigs ?? null)
    .filter(Boolean);

const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
    acc[config.name] = config;
    return acc;
}, {});

const initialFieldsState = fieldConfigs.reduce((acc, { name }) => {
    acc[name] = {
        value: '',
        uiStatus: '',
        error: '',
        savedValue: '',
        saveStatus: '',
        saveStatusMessage: ''
    };
    return acc;
}, {});

const fieldsStateReducer = (state, action) => {
    const { type, payload } = action;

    switch (type) {
        case 'UPDATE': {
            const newState = { ...state };
            for (const name in payload) {
                newState[name] = { ...(state[name] ?? {}), ...payload[name] };
            }
            return newState;
        }

        case 'SAVE': {
            const { fields, status } = payload;
            const saveState = { ...state };

            for (const name in fields) {
                saveState[name] = {
                    ...state[name],
                    savedValue: status === 'success' ? fields[name] : state[name].savedValue,
                    saveStatus: status,
                    saveStatusMessage: status
                        ? FIELD_SAVE_STATUS_MESSAGES[status]
                        : state[name].saveStatusMessage
                };
            }
            return saveState;
        }

        default:
            return state;
    }
};

export default function CheckoutForm({
    registrationEmail,
    productMap,
    topStickyOffset,
    cartPath,
    orderId,
    orderDraft,
    submitStates,
    lockedStatuses,
    submitStatus,
    setSubmitStatus,
    setOrderDraft,
    reloadOrderDraft
}) {
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    
    const [initializedValues, setInitializedValues] = useState(false);
    const [expandedFormGroup, setExpandedFormGroup] = useState('');
    const [visitedFormGroups, setVisitedFormGroups] = useState(new Set());
    const [isAllGroupsVisited, setIsAllGroupsVisited] = useState(false);
    const [isOrderItemsValid, setIsOrderItemsValid] = useState(false);
    
    const formGroupRefs = useRef({});
    const updateDebounceTimerRef = useRef(null);
    const saveStatusTimersRef = useRef({});
    const submitInProgressRef = useRef(false);
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const applicabilityMap = useMemo(
        () => Object.fromEntries(
            fieldConfigs.map(cfg => [
                cfg.name,
                typeof cfg.canApply === 'function'
                    ? cfg.canApply({ deliveryMethod: fieldsState.deliveryMethod.value })
                    : true
            ])
        ),
        [fieldsState.deliveryMethod.value]
    );

    const isFormLocked = lockedStatuses.has(submitStatus);
    const orderItemList = orderDraft?.items ?? null;

    const scrollToFormGroup = (groupName) => {
        const groupTop = formGroupRefs.current[groupName]?.getBoundingClientRect().top ?? 0;
        const scrollY = window.scrollY + groupTop - topStickyOffset;
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
    };

    const toggleFormGroupExpansion = (groupName) => {
        setVisitedFormGroups(prev => new Set(prev).add(groupName));
        setExpandedFormGroup(prev => (prev === groupName ? '' : groupName));

        // Клик на title группы => скроллинг страницы только при раскрытии группы
        const willExpandFormGroup = groupName !== expandedFormGroup;

        if (willExpandFormGroup) {
            setTimeout(() => {
                if (isUnmountedRef.current) return;
                scrollToFormGroup(groupName);
            }, 320);
        }
    };

    const scheduleClearSaveStatus = (fieldName) => {
        saveStatusTimersRef.current[fieldName] = setTimeout(() => {
            if (isUnmountedRef.current) return;

            delete saveStatusTimersRef.current[fieldName];
            dispatchFieldsState({
                type: 'SAVE',
                payload: { fields: { [fieldName]: true }, status: '' }
            });
        }, 3000);
    };

    const updateOrderDraft = async (updatedField = null) => {
        const updateFieldEntries = Object.entries(fieldsState).reduce((acc, [name, state]) => {
            const value = name === updatedField?.name ? updatedField.value : state.value;
            const normalizedValue = fieldConfigMap[name]?.trim ? value.trim() : value;

            if (
                normalizedValue !== state.savedValue &&
                state.saveStatus !== FIELD_SAVE_STATUS.SAVING
            ) {
                acc.push([name, normalizedValue]);
            }
            return acc;
        }, []);

        if (!updateFieldEntries.length) return;

        updateFieldEntries.forEach(([name, _]) => {
            if (saveStatusTimersRef.current[name]) {
                clearTimeout(saveStatusTimersRef.current[name]);
                delete saveStatusTimersRef.current[name];
            }
        });

        const updateFields = Object.fromEntries(updateFieldEntries);
        dispatchFieldsState({
            type: 'SAVE',
            payload: { fields: updateFields, status: FIELD_SAVE_STATUS.SAVING }
        });

        const responseData = await dispatch(sendOrderDraftUpdateRequest(orderId, updateFields));
        if (isUnmountedRef.current) return;

        const { status, message } = responseData;
        logRequestStatus({ context: 'CHECKOUT: UPDATE', status, message });

        if (status !== FORM_STATUS.SUCCESS && lockedStatuses.has(status)) {
            dispatch(clearLockedRoute());
            setSubmitStatus(status);
        }
        
        const saveStatus = status === FORM_STATUS.SUCCESS
            ? FIELD_SAVE_STATUS.SUCCESS
            : FIELD_SAVE_STATUS.ERROR;
        dispatchFieldsState({
            type: 'SAVE',
            payload: { fields: updateFields, status: saveStatus }
        });

        Object.keys(updateFields).forEach(scheduleClearSaveStatus);
    };

    const handleFieldChange = (e) => {
        clearTimeout(updateDebounceTimerRef.current);

        const { type, name, value, checked } = e.target;
        const fieldValue = type === 'checkbox' ? checked : value;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value: fieldValue, uiStatus: '', error: '' } }
        });
    
        updateDebounceTimerRef.current = setTimeout(() => {
            if (isUnmountedRef.current) return;
            updateDebounceTimerRef.current = null;

            updateOrderDraft({ name, value: fieldValue });
        }, 1250);
    };

    const handleFieldBlur = (e) => {
        clearTimeout(updateDebounceTimerRef.current);
        updateDebounceTimerRef.current = null;

        const { type, name, value, checked } = e.target;
        const fieldValue = type === 'checkbox' ? checked : value;
        const normalizedValue = fieldConfigMap[name]?.trim ? fieldValue.trim() : fieldValue;

        if (normalizedValue !== value) {
            dispatchFieldsState({
                type: 'UPDATE',
                payload: { [name]: { value: normalizedValue } }
            });
        }

        updateOrderDraft({ name, value: fieldValue });
    };
    
    const fillRegistrationEmail = () => {
        clearTimeout(updateDebounceTimerRef.current);
        updateDebounceTimerRef.current = null;
        
        updateOrderDraft({ name: 'email', value: registrationEmail });

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { email: { value: registrationEmail, uiStatus: '', error: '' } }
        });
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const isApplicable = applicabilityMap[name];
                if (!isApplicable) return acc;

                const validation = validationRules.checkout[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const { trim, optional } = fieldConfigMap[name] ?? {};
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
                        : fieldErrorMessages.checkout[name].default || fieldErrorMessages.DEFAULT
                };
        
                if (isValid) {
                    if (normalizedValue !== '') {
                        acc.formFields[name] = normalizedValue;
                        acc.changedFields.push(name);
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
    
    const handleFormSubmit = async (e) => {
        e.preventDefault();

        submitInProgressRef.current = true;

        clearTimeout(updateDebounceTimerRef.current);
        updateDebounceTimerRef.current = null;

        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();
        
        setIsOrderItemsValid(true);
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            submitInProgressRef.current = false;
            updateOrderDraft(); // Синхронизация сохранённых значений полей с текущими
            setSubmitStatus(FORM_STATUS.INVALID);
            return;
        }

        setSubmitStatus(FORM_STATUS.SENDING);

        const responseData = await dispatch(sendOrderDraftConfirmRequest(orderId, formFields));
        if (isUnmountedRef.current) return;

        const {
            status, message, fieldErrors, orderAdjustments,
            purchaseProductList, customerDiscount, orderDraft
        } = responseData;
        const LOG_CTX = 'CHECKOUT: CONFIRM';

        switch (status) {
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.USER_GONE:
            case FORM_STATUS.DENIED:
            case FORM_STATUS.FORBIDDEN:
            case FORM_STATUS.NOT_FOUND:
                logRequestStatus({ context: LOG_CTX, status, message });
                dispatch(clearLockedRoute());
                setSubmitStatus(status);
                break;

            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.ERROR:
            case FORM_STATUS.NETWORK:
                submitInProgressRef.current = false;
                logRequestStatus({ context: LOG_CTX, status, message });
                updateOrderDraft(); // Синхронизация сохранённых значений полей с текущими
                setSubmitStatus(status);
                break;

            // Товары в корзине и заказе не совпадают
            case FORM_STATUS.CONFLICT:
                logRequestStatus({ context: LOG_CTX, status, message });
                setIsOrderItemsValid(false);
                setSubmitStatus(status);

                const conflictMsg =
                    'Товары в корзине и черновике заказа не совпадают.\n' +
                    '<span className="color-red">Заказ отменён!</span> ' +
                    'Вы будете перенаправлены на страницу корзины.';

                openAlertModal({
                    openDelay: 1000,
                    type: 'error',
                    dismissible: false,
                    title: 'Произошла рассинхронизация',
                    message: conflictMsg,
                    dismissBtnLabel: 'Перейти в корзину',
                    onClose: () => {
                        dispatch(clearLockedRoute());
                        navigate(cartPath);
                    }
                });
                break;

            // Сумма заказа меньше минимальной
            case FORM_STATUS.LIMITATION: {
                logRequestStatus({ context: LOG_CTX, status, message });
                dispatch(applyCartState(purchaseProductList, orderDraft.items, customerDiscount));
                setIsOrderItemsValid(false);
                setSubmitStatus(status);

                const amountToAdd = Math.max(0, MIN_ORDER_AMOUNT - orderDraft.totals.totalAmount);
                const minOrderAmountMsg =
                    'Сумма заказа после синхронизации с текущими данными каталога ' +
                    'стала меньше минимальной.\n' +
                    '<span className="color-red">Заказ отменён!</span> ' +
                    'Вы будете перенаправлены на страницу корзины.\n\n' +
                    'Минимальная сумма заказа — ' +
                    `<span className="color-blue">${formatCurrency(MIN_ORDER_AMOUNT)}</span> ₽. ` +
                    'Добавьте товаров ещё на ' +
                    `<span className="color-green">${formatCurrency(amountToAdd)}</span> ₽.`;

                const hasAdjustments = orderAdjustments?.length > 0;
                const adjustmentsMsg = hasAdjustments
                    ? '<span className="bold underline">Изменения товаров в заказе:</span>\n\n' +
                        formatOrderAdjustmentLogs(orderAdjustments, productMap)
                    : '';

                openAlertModal({
                    openDelay: 1000,
                    type: 'error',
                    dismissible: false,
                    title: 'Сумма заказа меньше минимальной',
                    message: minOrderAmountMsg + (hasAdjustments ? `\n\n\n${adjustmentsMsg}` : '' ),
                    dismissBtnLabel: 'Перейти в корзину',
                    onClose: () => {
                        dispatch(clearLockedRoute());
                        navigate(cartPath);
                    }
                });
                
                break;
            }

            // Изменения в результате синхронизации черновика заказа
            case FORM_STATUS.MODIFIED: {
                submitInProgressRef.current = false;
                logRequestStatus({ context: LOG_CTX, status, message });
                updateOrderDraft(); // Синхронизация сохранённых значений полей с текущими
                dispatch(applyCartState(purchaseProductList, orderDraft.items, customerDiscount));
                setOrderDraft(orderDraft);
                setIsOrderItemsValid(false);
                setSubmitStatus(status);

                const adjustmentsMsg =
                    '<span className="bold underline">Изменения товаров в заказе:</span>\n\n' +
                    formatOrderAdjustmentLogs(orderAdjustments, productMap);

                openAlertModal({
                    openDelay: 1000,
                    type: 'warning',
                    dismissible: false,
                    title: 'Заказ был синхронизирован с текущими данными каталога',
                    message: adjustmentsMsg + '\n\n\nПожалуйста, подтвердите заказ ещё раз.',
                    onClose: () => {
                        if (expandedFormGroup === 'orderItemsGroup') {
                            scrollToFormGroup('orderItemsGroup');
                        } else {
                            setExpandedFormGroup('orderItemsGroup');
                            setTimeout(() => {
                                if (isUnmountedRef.current) return;
                                scrollToFormGroup('orderItemsGroup');
                            }, 320);
                        }
                    }
                });

                break;
            }

            // Ошибки валидации полей
            case FORM_STATUS.INVALID: {
                submitInProgressRef.current = false;
                logRequestStatus({
                    context: LOG_CTX,
                    status,
                    message,
                    details: fieldErrors
                });
                updateOrderDraft(); // Синхронизация сохранённых значений полей с текущими

                const fieldStateUpdates = {};
                Object.entries(fieldErrors).forEach(([name, error]) => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                setSubmitStatus(status);
                break;
            }
        
            case FORM_STATUS.SUCCESS: {
                logRequestStatus({ context: LOG_CTX, status, message });

                const fieldStateUpdates = {};
                changedFields.forEach(name => {
                    fieldStateUpdates[name] = {
                        savedValue: fieldsState[name].value,
                        uiStatus: FIELD_UI_STATUS.CHANGED
                    };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                setSubmitStatus(status);

                setTimeout(() => {
                    if (isUnmountedRef.current) return;
                    
                    dispatch(setCart([])); // До обновления сумм!
                    dispatch(refreshCartTotals());

                    dispatch(clearLockedRoute());
                    navigate(routeConfig.customerOrders.paths[0]);
                }, SUCCESS_DELAY);
                break;
            }
        
            default:
                submitInProgressRef.current = false;
                logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                updateOrderDraft(); // Синхронизация сохранённых значений полей с текущими
                setSubmitStatus(FORM_STATUS.UNKNOWN);
                break;
        }
    };
    
    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка начальных значений полей заказа после первой загрузки данных
    useEffect(() => {
        if (initializedValues) return;
        if (!orderDraft) return;

        // Выпрямление начальных значений полей и установка их в состояние редьюсера
        const { customerInfo = {}, delivery = {}, financials = {}, customerComment } = orderDraft;
        const { deliveryMethod, allowCourierExtra = false, shippingAddress = {} } = delivery;

        const flatInitValues = {
            ...customerInfo,
            ...shippingAddress,
            ...(deliveryMethod && { deliveryMethod }),
            allowCourierExtra,
            ...financials,
            ...(customerComment && { customerComment })
        };

        if (Object.keys(flatInitValues).length > 0) {
            dispatchFieldsState({
                type: 'UPDATE',
                payload: Object.fromEntries(
                    Object.entries(flatInitValues)
                        .map(([name, value]) => ([name, { value, savedValue: value }]))
                )
            });
        }

        // Раскрытие первой группы формы с товарами в заказе
        setExpandedFormGroup('orderItemsGroup');
        setVisitedFormGroups(prev => new Set(prev).add('orderItemsGroup'));

        setInitializedValues(true);
    }, [initializedValues, orderDraft]);

    // Отслеживание посещения всех свёрнутых групп формы
    useEffect(() => {
        const allVisited = collapsibleFormGroupNames.every(name => visitedFormGroups.has(name));
        if (allVisited) setIsAllGroupsVisited(true);
    }, [visitedFormGroups.size]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <form className="checkout-form" onSubmit={handleFormSubmit} noValidate>
            <div className="form-body">
                {formGroupConfigs.map(({ name, title, description, fieldConfigs }, idx) => {
                    const isVisited = visitedFormGroups.has(name);
                    
                    const isValid = fieldConfigs?.filter(cfg => applicabilityMap[cfg.name])
                        .every(cfg =>
                            [FIELD_UI_STATUS.VALID, FIELD_UI_STATUS.CHANGED]
                                .includes(fieldsState[cfg.name]?.uiStatus)
                        ) ?? false;

                    const isInvalid = !isValid && (fieldConfigs?.some(cfg =>
                        fieldsState[cfg.name]?.uiStatus === FIELD_UI_STATUS.INVALID
                    ) ?? false);

                    return (
                        <div
                            key={name}
                            ref={(elem) => (formGroupRefs.current[name] = elem)}
                            className={cn('form-group', toKebabCase(name))}
                        >
                            {name === 'orderItemsGroup' ? (
                                <>
                                    <div
                                        className={cn(
                                            'form-group-title',
                                            { 'visited': isVisited },
                                            { 'valid': isOrderItemsValid }
                                        )}
                                        title={description}
                                        onClick={() => isVisited && toggleFormGroupExpansion(name)}
                                    >
                                        <h4>
                                            <span className="form-group-number">{idx + 1}</span>
                                            {title}
                                            {orderItemList && (
                                                ` (${orderItemList.length} ${pluralize(
                                                    orderItemList.length,
                                                    ['позиция', 'позиции', 'позиций']
                                                )})`
                                            )}
                                        </h4>
                                        {isVisited && (
                                            <p className="form-group-action">Просмотр</p>
                                        )}
                                    </div>

                                    <Collapsible
                                        isExpanded={expandedFormGroup === name}
                                        className="order-items-collapsible"
                                    >
                                        <OrderItems
                                            orderItemList={orderItemList}
                                            productMap={productMap}
                                            formGroupName={name}
                                            collapsibleFormGroupNames={collapsibleFormGroupNames}
                                            toggleFormGroupExpansion={toggleFormGroupExpansion}
                                        />
                                    </Collapsible>
                                </>
                            ) : name === 'customerCommentGroup' ? (
                                <FormGroupEntries
                                    fieldConfigs={fieldConfigs}
                                    fieldsState={fieldsState}
                                    applicabilityMap={applicabilityMap}
                                    handleFieldChange={handleFieldChange}
                                    handleFieldBlur={handleFieldBlur}
                                    isFormLocked={isFormLocked}
                                    isSubmitInProgress={submitInProgressRef.current}
                                />
                            ) : (
                                <>
                                    <div
                                        className={cn(
                                            'form-group-title',
                                            { 'visited': isVisited },
                                            { 'valid': isValid },
                                            { 'invalid': isInvalid }
                                        )}
                                        title={description}
                                        onClick={() => isVisited && toggleFormGroupExpansion(name)}
                                    >
                                        <h4>
                                            <span className="form-group-number">{idx + 1}</span>
                                            {title}
                                        </h4>
                                        {isVisited && (
                                            <p className="form-group-action">Редактирование</p>
                                        )}
                                    </div>

                                    <Collapsible
                                        isExpanded={isVisited && expandedFormGroup !== name}
                                        className="form-group-summary-collapsible"
                                        showContextIndicator={false}
                                    >
                                        <FormGroupSummary
                                            fieldConfigs={fieldConfigs}
                                            fieldsState={fieldsState}
                                        />
                                    </Collapsible>

                                    <Collapsible
                                        isExpanded={expandedFormGroup === name}
                                        className="form-group-entries-collapsible"
                                    >
                                        <FormGroupEntries
                                            fieldConfigs={fieldConfigs}
                                            fieldsState={fieldsState}
                                            applicabilityMap={applicabilityMap}
                                            handleFieldChange={handleFieldChange}
                                            handleFieldBlur={handleFieldBlur}
                                            fillRegistrationEmail={fillRegistrationEmail}
                                            isFormLocked={isFormLocked}
                                            isSubmitInProgress={submitInProgressRef.current}
                                            formGroupName={name}
                                            collapsibleFormGroupNames={collapsibleFormGroupNames}
                                            toggleFormGroupExpansion={toggleFormGroupExpansion}
                                        />
                                    </Collapsible>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            <FormFooter
                submitStates={submitStates}
                submitStatus={submitStatus}
                uiBlocked={isFormLocked || !isAllGroupsVisited}
                reloadData={reloadOrderDraft}
            />
        </form>
    );
};

function OrderItems({
    orderItemList,
    productMap,
    formGroupName,
    collapsibleFormGroupNames,
    toggleFormGroupExpansion
}) {
    if (!orderItemList) return null;

    return (
        <div role="list" className="order-items">
            <div className="order-items-headers">
                <div className="product-thumb">Фото</div>
                <div className="product-title">Наименование</div>
                <div className="product-sku">Артикул</div>
                <div className="product-quantity">Количество</div>
                <div className="product-total-amounts">Сумма</div>
            </div>

            {orderItemList.map(orderItem => {
                const { id, quantity, priceSnapshot, appliedDiscountSnapshot } = orderItem;

                const product = productMap[id];
                const {
                    images = [],
                    mainImageIndex = 0,
                    sku,
                    name,
                    brand,
                    unit = 'ед.'
                } = product ?? {};

                const title = formatProductTitle(name, brand) || `Товар (${id})`;
                const slug = generateSlug(title);
                const productUrl = routeConfig.productDetails.generatePath({ slug, sku, productId: id });

                const hasImages = images.length > 0;
                const thumbImageSrc = hasImages
                    ? (images[mainImageIndex] ?? images[0]).thumbnails.small
                    : PRODUCT_IMAGE_PLACEHOLDER;
                const thumbImageAlt = hasImages ? title : '';

                const hasDiscount = appliedDiscountSnapshot > 0;
                const currentPrice = hasDiscount
                    ? priceSnapshot * (1 - appliedDiscountSnapshot / 100)
                    : priceSnapshot;
                const originalTotal = priceSnapshot * quantity;
                const currentTotal = currentPrice * quantity;

                const formattedOriginalTotal = formatCurrency(originalTotal);
                const formattedCurrentTotal = formatCurrency(currentTotal)

                return (
                    <article
                        key={id}
                        role="listitem"
                        data-id={id}
                        className={cn('order-item', { 'has-discount': hasDiscount })}
                    >
                        <div className="product-thumb">
                            <BlockableLink to={productUrl}>
                                <TrackedImage
                                    className="product-thumb-img"
                                    src={thumbImageSrc}
                                    alt={thumbImageAlt}
                                />
                            </BlockableLink>
                        </div>

                        <div className="product-title">
                            <BlockableLink to={productUrl}>
                                {title}
                            </BlockableLink>
                        </div>

                        <div className="product-sku product-info-item">
                            {sku && (
                                <>
                                    <p className="label">Артикул<span className="colon">:</span></p>
                                    <p className="value">{sku}</p>
                                </>
                            )}
                        </div>

                        <div className="product-quantity product-info-item">
                            <p className="label">Количество<span className="colon">:</span></p>
                            <p className="value">{quantity} {unit}</p>
                        </div>

                        <div className="product-total-amounts product-info-item">
                            <p className="label">Сумма<span className="colon">:</span></p>
                            <div className="value">
                                {hasDiscount && (
                                    <p className="product-original-total">
                                        {formattedOriginalTotal} руб.
                                    </p>
                                )}
                                <p className="product-current-total">
                                    {formattedCurrentTotal} руб.
                                </p>
                            </div>
                        </div>
                    </article>
                );
            })}

            <FormGroupControls
                formGroupName={formGroupName}
                collapsibleFormGroupNames={collapsibleFormGroupNames}
                toggleFormGroupExpansion={toggleFormGroupExpansion}
            />
        </div>
    );
}

function FormGroupSummary({ fieldConfigs, fieldsState }) {
    return (
        <div className="form-group-summary">
            {fieldConfigs.map(fieldConfig => {
                const fieldState = fieldsState[fieldConfig.name];
                const displayValue =
                    fieldConfig.elem === 'select' && fieldState?.value
                        ? fieldConfig.options.find(opt => opt.value === fieldState.value)?.label
                        : fieldState?.value
                    || NO_VALUE_LABEL;
        
                return (
                        <p
                            key={`summary-${fieldConfig.name}`}
                            className={cn('form-entry-summary', { error: fieldState?.error })}
                        >
                            <span className="form-entry-summary-label">{fieldConfig.label}:</span>
                            {' '}
                            <span className="form-entry-summary-value">{displayValue}</span>
                        </p>
                );
            })}
        </div>
    );
}

function FormGroupEntries({
    fieldConfigs,
    fieldsState,
    applicabilityMap,
    handleFieldChange,
    handleFieldBlur,
    fillRegistrationEmail,
    isFormLocked,
    isSubmitInProgress,
    formGroupName,
    collapsibleFormGroupNames,
    toggleFormGroupExpansion
}) {
    return (
        <div className="form-group-entries">
            {fieldConfigs.map(({
                name,
                label,
                elem,
                type,
                options,
                checkboxLabel,
                placeholder,
                autoComplete,
                tooltip,
                optional,
                canApply
            }) => {
                const fieldId = `checkout-${toKebabCase(name)}`;
                const fieldInfoClass = getFieldInfoClass(elem, type, name);
                const isApplicable = applicabilityMap[name];
                const collapsible = !!canApply;

                const elemProps = {
                    id: fieldId,
                    name,
                    type,
                    placeholder,
                    value: fieldsState[name]?.value,
                    autoComplete,
                    onChange: handleFieldChange,
                    onBlur: handleFieldBlur,
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
                    <div key={`field-${name}`} className={cn('form-entry', fieldInfoClass)}>
                        <label htmlFor={fieldId} className="form-entry-label">
                            {label}
                            {tooltip && <span className="info" title={tooltip}>ⓘ</span>}
                            :
                            {optional && <small className="optional">опционально</small>}
                        </label>

                        <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                            {name === 'email' && (
                                <button
                                    type="button"
                                    className="auto-fill-email-btn"
                                    title="Вставить email, указанный при регистрации"
                                    onClick={fillRegistrationEmail}
                                    disabled={isFormLocked}
                                >
                                    📧
                                </button>
                            )}

                            {fieldElem}

                            <span className={cn(
                                'save-status',
                                { [fieldsState[name]?.saveStatus ?? '']: !isSubmitInProgress }
                            )}>
                                {fieldsState[name]?.saveStatusMessage ?? ''}
                            </span>

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

            {formGroupName && collapsibleFormGroupNames && toggleFormGroupExpansion && (
                <FormGroupControls
                    formGroupName={formGroupName}
                    collapsibleFormGroupNames={collapsibleFormGroupNames}
                    toggleFormGroupExpansion={toggleFormGroupExpansion}
                />
            )}
        </div>
    );
}

function FormGroupControls({ formGroupName, collapsibleFormGroupNames, toggleFormGroupExpansion }) {
    const fromGroupIdx = collapsibleFormGroupNames.indexOf(formGroupName);
    if (fromGroupIdx === -1) return null;

    const prevFormGroupName = collapsibleFormGroupNames[fromGroupIdx - 1];
    const nextFormGroupName = collapsibleFormGroupNames[fromGroupIdx + 1];

    return (
        <div className="form-group-controls">
            <div className="prev-form-group-btn-box">
                {fromGroupIdx > 0 && (
                    <button
                        type="button"
                        className="prev-form-group-btn"
                        onClick={() => toggleFormGroupExpansion(prevFormGroupName)}
                    >
                        <span className="icon">⮜</span> Назад
                    </button>
                )}
            </div>
            
            <div className="next-form-group-btn-box">
                {fromGroupIdx < collapsibleFormGroupNames.length - 1 && (
                    <button
                        type="button"
                        className="next-form-group-btn"
                        onClick={() => toggleFormGroupExpansion(nextFormGroupName)}
                    >
                        Вперёд <span className="icon">⮞</span>
                    </button>
                )}
            </div>
        </div>
    );
}
