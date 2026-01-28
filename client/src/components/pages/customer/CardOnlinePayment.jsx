import React, { useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import useExternalScript from '@/hooks/useExternalScript.js';
import { sendOrderOnlinePaymentCreateRequest } from '@/api/orderRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { YOOKASSA_SCRIPT } from '@/config/externalScripts.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { parseRouteParams } from '@/helpers/routeHelpers.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import {
    TRANSACTION_TYPE,
    CARD_ONLINE_PROVIDER_OPTIONS,
    resolveRequestStatus,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const {
    YOOKASSA_SHOP_ID,
    FORM_STATUS,
    BASE_SUBMIT_STATES,
    FIELD_UI_STATUS,
    SUCCESS_DELAY
} = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, LOADING, LOAD_ERROR, BAD_REQUEST, NOT_FOUND, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Оплатить';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [LOADING]: { ...base[LOADING], mainMessage: 'Загрузка ресурсов...' },
        [LOAD_ERROR]: { ...base[LOAD_ERROR], mainMessage: 'Не удалось загрузить ресурсы.' },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходный заказ или связанный с ним ресурс не найден.',
            addMessage: 'Оплата невозможна.',
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Платёж создан и обрабатывается!',
            addMessage: 'Вы будете перенаправлены на страницу деталей заказа.',
            submitBtnLabel: 'Перенаправление...'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const { submitStates, lockedStatuses } = getSubmitStates();

const fieldConfigs = [
    {
        name: 'provider',
        label: 'Провайдер',
        elem: 'select',
        options: CARD_ONLINE_PROVIDER_OPTIONS
    },
    {
        name: 'amount',
        label: 'Сумма оплаты',
        elem: 'input',
        type: 'number',
        step: 0.01,
        min: 0
    },
    {
        name: 'cardNumber',
        checkoutName: 'number',
        checkoutErrorCode: 'invalid_number',
        label: 'Номер банковской карты',
        elem: 'input',
        type: 'text',
        maxLength: 19, // 4 * 4 цифры + 3 пробела между группами
        placeholder: '0000 0000 0000 0000',
        autoComplete: 'cc-number',
        format: (value) => {
            const digits = value.replace(/\D/g, '').slice(0, 16);
        
            return digits.length < 16
                ? digits.replace(/(\d{4})/g, '$1 ')
                : digits.replace(/(\d{4})(?=\d)/g, '$1 ');
        },
        submitTransform: (value) => value.replace(/\s/g, '')
    },
    {
        name: 'cvc',
        checkoutName: 'cvc',
        checkoutErrorCode: 'invalid_cvc',
        label: 'Код CVC',
        elem: 'input',
        type: 'password',
        maxLength: 4,
        placeholder: '000 или 0000',
        autoComplete: 'cc-csc',
        format: (value) => value.replace(/\D/g, '').slice(0, 4)
    },
    {
        name: 'expiryMonth',
        checkoutName: 'month',
        checkoutErrorCode: 'invalid_expiry_month',
        label: 'Месяц истечения срока действия карты',
        elem: 'input',
        type: 'text',
        maxLength: 2,
        placeholder: 'MM',
        autoComplete: 'cc-exp-month',
        trim: true,
        format: (value) => value.replace(/\D/g, '').slice(0, 2)
    },
    {
        name: 'expiryYear',
        checkoutName: 'year',
        checkoutErrorCode: 'invalid_expiry_year',
        label: 'Год истечения срока действия карты',
        elem: 'input',
        type: 'text',
        maxLength: 2,
        placeholder: 'YY',
        autoComplete: 'cc-exp-year',
        trim: true,
        format: (value) => value.replace(/\D/g, '').slice(0, 2)
    }
];

const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
    acc[config.name] = config;
    return acc;
}, {});

const fieldNameByCheckoutErrorCode = fieldConfigs.reduce((acc, config) => {
    if (!config.checkoutErrorCode) return acc;

    acc[config.checkoutErrorCode] = config.name;
    return acc;
}, {});

const initialFieldsState = fieldConfigs.reduce((acc, { name, options }) => {
    acc[name] = { value: options?.[0].value ?? '', uiStatus: '', error: '' };
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

export default function CardOnlinePayment() {
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.LOADING);

    const checkoutRef = useRef(null);
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const { orderNumber, orderId } = parseRouteParams({
        routeKey: 'customerOrderCardOnlinePayment',
        params: useParams(),
        routeConfig
    });

    const isFormLocked = lockedStatuses.has(submitStatus);

    const onCheckoutLoad = () => {
        if (isUnmountedRef.current) return;
        
        if (!checkoutRef.current) {
            checkoutRef.current = new window.YooMoneyCheckout(YOOKASSA_SHOP_ID, { language: 'ru' });
        }

        setSubmitStatus(FORM_STATUS.DEFAULT);
    };

    const onCheckoutLoadError = () => {
        if (isUnmountedRef.current) return;

        console.error('Ошибка при загрузке скрипта Checkout.js');
        setSubmitStatus(FORM_STATUS.LOAD_ERROR);
    };

    const onCheckoutReload = () => {
        setSubmitStatus(FORM_STATUS.LOADING);
        reloadScript();
    }

    const handleFieldChange = (e) => {
        const { name, type, value } = e.target;
        const { format } = fieldConfigMap[name] ?? {};
        let processedValue;

        if (format) {
            processedValue = format(value)
        } else if (type === 'number' && value !== '') {
            processedValue = Number(value.replace(',', '.'));
        } else {
            processedValue = value;
        }

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

    const collectAndValidateFields = (fieldsState) => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const validation = validationRules.payment[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const { checkoutName, trim, optional, submitTransform } = fieldConfigMap[name] ?? {};
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
                        : fieldErrorMessages.payment[name]?.default || fieldErrorMessages.DEFAULT
                };

                if (isValid) {
                    const submittedValue = submitTransform?.(normalizedValue) ?? normalizedValue;

                    if (checkoutName) {
                        acc.checkoutFields[checkoutName] = submittedValue;
                    } else {
                        acc.formFields[name] = submittedValue;
                    }

                    acc.changedFields.push(name);
                } else {
                    acc.allValid = false;
                }
        
                return acc;
            },
            {
                allValid: true,
                fieldStateUpdates: {},
                checkoutFields: {},
                formFields: {},
                changedFields: []
            }
        );
    
        return result;
    };

    const tokenizeCheckoutFields = async (checkout, checkoutFields) => {
        try {
            const response = await checkout.tokenize(checkoutFields);
    
            if (response.status === 'error') {
                if (response.error.type === 'validation_error') {
                    const checkoutFieldErrors = {};
        
                    response.error.params.forEach(param => {
                        const fieldName = fieldNameByCheckoutErrorCode[param.code];
                        if (!fieldName) return;
        
                        checkoutFieldErrors[fieldName] = {
                            uiStatus: FIELD_UI_STATUS.INVALID,
                            error:
                                fieldErrorMessages.payment[fieldName]?.default ||
                                param.message ||
                                fieldErrorMessages.DEFAULT
                        };
                    });
        
                    return {
                        errorRequestStatus: FORM_STATUS.INVALID,
                        checkoutFieldErrors
                    };
                }
        
                console.warn('YooKassa error:', response.error);
                
                const rawStatusCode = Number(response.error.status_code);
                const statusCode = Number.isInteger(rawStatusCode) && rawStatusCode >= 500 ? 500 : 400;
                return { errorRequestStatus: resolveRequestStatus(statusCode) };
            }
        
            return { paymentToken: response.data.response.paymentToken };
        } catch (err) {
            return { errorRequestStatus: FORM_STATUS.ERROR };
        }
    };

    const processFormFields = async () => {
        // Валидация, сбор и структуризация значений полей
        const collected = collectAndValidateFields(fieldsState);
    
        if (!collected.allValid) {
            return {
                fieldStateUpdates: collected.fieldStateUpdates,
                errorRequestStatus: FORM_STATUS.INVALID
            };
        }
    
        // Валидация полей карты через скрипт YouMoney и получение платёжного токена
        const checkoutResult = await tokenizeCheckoutFields(
            checkoutRef.current,
            collected.checkoutFields
        );

        // Объединение состояний полей при ошибках валидации через скрипт
        let mergedFieldStateUpdates = collected.fieldStateUpdates;

        if (checkoutResult.checkoutFieldErrors) {
            mergedFieldStateUpdates = Object.fromEntries(
                Object.entries(collected.fieldStateUpdates).map(([name, state]) => [
                    name,
                    checkoutResult.checkoutFieldErrors[name]
                        ? { ...state, ...checkoutResult.checkoutFieldErrors[name] }
                        : state
                ])
            );
        }
    
        return {
            fieldStateUpdates: mergedFieldStateUpdates,
            errorRequestStatus: checkoutResult.errorRequestStatus,
            paymentToken: checkoutResult.paymentToken,
            formFields: collected.formFields,
            changedFields: collected.changedFields
        };
    };
    
    const handleFormSubmit = async (e) => {
        e.preventDefault();

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const {
            fieldStateUpdates, errorRequestStatus, paymentToken, formFields, changedFields
        } = await processFormFields();
        if (isUnmountedRef.current) return;

        console.log(paymentToken);

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (errorRequestStatus) {
            setSubmitStatus(errorRequestStatus);
            dispatch(setIsNavigationBlocked(false));
            return;
        }

        // Отправка данных на сервер
        const requestData = { paymentToken, transaction: formFields };
        const responseData = await dispatch(
            sendOrderOnlinePaymentCreateRequest(orderId, requestData)
        );
        if (isUnmountedRef.current) return;

        const { status, message, fieldErrors, confirmationUrl } = responseData;
        const LOG_CTX = 'ORDER: ONLINE PAYMENT';

        switch (status) {
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.USER_GONE:
            case FORM_STATUS.DENIED:
            case FORM_STATUS.FORBIDDEN:
            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.NOT_FOUND:
            case FORM_STATUS.CONFLICT:
            case FORM_STATUS.ERROR:
            case FORM_STATUS.NETWORK:
                logRequestStatus({ context: LOG_CTX, status, message });
                setSubmitStatus(status);
                dispatch(setIsNavigationBlocked(false));
                break;

            case FORM_STATUS.INVALID: {
                logRequestStatus({ context: LOG_CTX, status, message, details: fieldErrors });

                const fieldStateUpdates = {};
                Object.entries(fieldErrors).forEach(([name, error]) => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

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

                setSubmitStatus(status);

                setTimeout(() => {
                    if (confirmationUrl) {
                        // Переход на страницу 3-D Secure платёжки
                        // Текущий адрес не сохраняется в истории браузера
                        window.location.replace(confirmationUrl);
                    } else {
                        if (isUnmountedRef.current) return;
                        
                        navigate(
                            routeConfig.customerOrderDetails.generatePath({ orderNumber, orderId })
                        );
                    }
                }, SUCCESS_DELAY);
                break;
            }
        
            default:
                logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                setSubmitStatus(FORM_STATUS.UNKNOWN);
                dispatch(setIsNavigationBlocked(false));
                break;
        }
    };

    // Загрузка скрипта YooKassa
    const { status: scriptStatus, reload: reloadScript } = useExternalScript(YOOKASSA_SCRIPT);

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Обработка статуса загрузки скрипта YooKassa
    useEffect(() => {
        if (scriptStatus === 'ready') onCheckoutLoad();
        if (scriptStatus === 'error') onCheckoutLoadError();
    }, [scriptStatus]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <div className="card-online-payment-page">
            <header className="card-online-payment-header">
                <h3>Оплата заказа банковской картой</h3>
            </header>

            <form className="card-online-payment-form" onSubmit={handleFormSubmit} noValidate>
                <div className="form-body">
                    {fieldConfigs.map(({
                        name,
                        label,
                        elem,
                        type,
                        options,
                        maxLength,
                        placeholder,
                        autoComplete,
                        trim
                    }) => {
                        const fieldId = `news-${toKebabCase(name)}`;
                        const fieldInfoClass = getFieldInfoClass(elem, type, name);

                        const elemProps = {
                            id: fieldId,
                            name,
                            type,
                            maxLength,
                            placeholder,
                            value: fieldsState[name]?.value,
                            autoComplete,
                            onChange: handleFieldChange,
                            onBlur: trim ? handleTrimmedFieldBlur : undefined,
                            disabled: isFormLocked
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
                        } else {
                            fieldElem = React.createElement(elem, elemProps);
                        }

                        return (
                            <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                                <label htmlFor={fieldId} className="form-entry-label">{label}:</label>

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
                    })}
                </div>

                <FormFooter
                    submitStates={submitStates}
                    submitStatus={submitStatus}
                    uiBlocked={isFormLocked}
                    reloadData={onCheckoutReload}
                />
            </form>
        </div>
    );
};
