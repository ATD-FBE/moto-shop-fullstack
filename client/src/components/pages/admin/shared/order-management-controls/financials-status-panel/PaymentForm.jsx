import React, { useMemo, useReducer, useState, useRef, useEffect }  from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import Collapsible from '@/components/common/Collapsible.jsx';
import FormFooter from '@/components/common/FormFooter.jsx';
import { sendOrderOfflinePaymentApplyRequest } from '@/api/orderRequests.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { isEqualCurrency } from '@shared/commonHelpers.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import {
    PAYMENT_METHOD,
    OFFLINE_PAYMENT_METHOD_OPTIONS,
    OFFLINE_PAYMENT_METHODS,
    BANK_PROVIDER_OPTIONS,
    ORDER_STATUS,
    CASH_ON_RECEIPT_ALLOWED_STATUSES,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = (markAsFailed) => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, FORBIDDEN, BAD_REQUEST, NOT_FOUND, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Внести оплату';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [FORBIDDEN]: { ...base[FORBIDDEN], submitBtnLabel: actionLabel },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходный заказ или связанный с ним ресурс не найден.'
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: markAsFailed
                ? 'Оплата зафиксирована как неуспешная'
                : 'Оплата за заказ внесена!',
            submitBtnLabel: markAsFailed ? 'Отправлено' : 'Оплачено'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const isCashOnReceiptUnavailable = (method, orderStatus) =>
    method === PAYMENT_METHOD.CASH_ON_RECEIPT &&
    !CASH_ON_RECEIPT_ALLOWED_STATUSES.includes(orderStatus);

const isPaymentBlocked = ({ method, orderStatus, isPaymentDisabled }) =>
    isCashOnReceiptUnavailable(method, orderStatus) &&
    !isPaymentDisabled;

const fieldConfigs = [
    {
        name: 'method',
        label: 'Способ оплаты',
        elem: 'select',
        options: [
            { value: '', label: '--- Выбрать способ оплаты ---' },
            ...OFFLINE_PAYMENT_METHOD_OPTIONS
        ],
        note: 'Заказ ещё не принят',
        shouldNote: isPaymentBlocked,
    },
    {
        name: 'provider',
        label: 'Банк',
        elem: 'select',
        options: BANK_PROVIDER_OPTIONS,
        canApply: ({ method }) => method === PAYMENT_METHOD.BANK_TRANSFER
    },
    {
        name: 'amount',
        label: 'Сумма оплаты',
        elem: 'input',
        type: 'number',
        step: 0.01,
        min: 0,
        shouldDisable: isPaymentBlocked,
        canApply: ({ method }) => Boolean(method)
    },
    {
        name: 'transactionId',
        label: 'ID транзакции',
        elem: 'input',
        type: 'text',
        placeholder: 'Укажите ID банковского перевода',
        autoComplete: 'off',
        trim: true,
        canApply: ({ method }) => method === PAYMENT_METHOD.BANK_TRANSFER
    },
    {
        name: 'markAsFailed',
        label: 'Результат перевода',
        elem: 'checkbox',
        checkboxLabel: 'Отметить платёж как неудачный',
        canApply: ({ method }) => method === PAYMENT_METHOD.BANK_TRANSFER
    },
    {
        name: 'failureReason',
        label: 'Причина отказа (опционально)',
        elem: 'input',
        type: 'text',
        placeholder: 'Укажите причину отмены перевода',
        autoComplete: 'off',
        trim: true,
        optional: true,
        canApply: ({ method, markAsFailed }) => method === PAYMENT_METHOD.BANK_TRANSFER && markAsFailed
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

export default function PaymentForm({
    orderId,
    orderStatus,
    defaultMethod,
    netPaid,
    totalAmount
}) {
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);
    const [initialized, setInitialized] = useState(false);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const method = fieldsState.method.value;
    const markAsFailed = fieldsState.markAsFailed.value;

    const applicabilityMap = useMemo(
        () => Object.fromEntries(
            fieldConfigs.map(cfg => [
                cfg.name,
                typeof cfg.canApply === 'function' ? cfg.canApply({ method, markAsFailed }) : true
            ])
        ),
        [method, markAsFailed]
    );
    const { submitStates, lockedStatuses } = useMemo(
        () => getSubmitStates(markAsFailed),
        [markAsFailed]
    );
    
    const isCancelledOrder = orderStatus === ORDER_STATUS.CANCELLED;
    const isPaymentDisabled =
        (!isCancelledOrder && (isEqualCurrency(netPaid, totalAmount) || netPaid > totalAmount)) ||
        (isCancelledOrder && (isEqualCurrency(netPaid, 0) || netPaid > 0));
    
    const isFormLocked = lockedStatuses.has(submitStatus) || isPaymentDisabled;

    const getDefaultFieldsState = ({ keepValueFields = [], currentValues = {} } = {}) => {
        const baseDefaults = {
            method: OFFLINE_PAYMENT_METHODS.includes(defaultMethod) ? defaultMethod : '',
            provider: BANK_PROVIDER_OPTIONS[0].value,
            amount: 0,
            transactionId: '',
            markAsFailed: false,
            failureReason: ''
        };
    
        return Object.fromEntries(
            Object.entries(baseDefaults).map(([name, defaultValue]) => {
                const keep = keepValueFields.includes(name);
                const value = keep ? currentValues[name]?.value ?? defaultValue : defaultValue;
                return [name, { value, uiStatus: '', error: '' }];
            })
        );
    };

    const handleFieldChange = (e) => {
        const { type, name, value, checked } = e.target;
        let processedValue;

        if (type === 'number' && value !== '') {
            processedValue = Number(value.replace(',', '.'));
        } else if (type === 'checkbox') {
            processedValue = checked;
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

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const isApplicable = applicabilityMap[name];
                if (!isApplicable) return acc;

                const validation = validationRules.payment[name];
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
                        : fieldErrorMessages.payment[name].default || fieldErrorMessages.DEFAULT
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

        if (isCashOnReceiptUnavailable(method, orderStatus)) {
            return setSubmitStatus(FORM_STATUS.FORBIDDEN);
        }

        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const requestData = { transaction: formFields };
        const responseData = await dispatch(sendOrderOfflinePaymentApplyRequest(orderId, requestData));
        if (isUnmountedRef.current) return;

        const { status, message, fieldErrors } = responseData;
        const LOG_CTX = 'ORDER: OFFLINE PAYMENT';

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
                    if (isUnmountedRef.current) return;

                    const resetPayload = getDefaultFieldsState({
                        keepValueFields: ['method', 'provider'],
                        currentValues: fieldsState
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: resetPayload });

                    setSubmitStatus(FORM_STATUS.DEFAULT);
                    dispatch(setIsNavigationBlocked(false));
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

    // Установка дефолтных значений полей при инициализации и очистка при размонтировании
    useEffect(() => {
        dispatchFieldsState({ type: 'UPDATE', payload: getDefaultFieldsState() });
        setInitialized(true);

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Сброс ошибок полей и статуса формы при смене метода
    useEffect(() => {
        const fieldStateUpdates = {};
        Object.keys(fieldsState).forEach(name => {
            fieldStateUpdates[name] = { uiStatus: '', error: '' };
        });
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        
        setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [method]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    if (!initialized) return null;

    return (
        <form className="payment-form" onSubmit={handleFormSubmit} noValidate>
            <div className="form-body">
                {fieldConfigs.map(({
                    name,
                    label,
                    elem,
                    type,
                    placeholder,
                    autoComplete,
                    step,
                    min,
                    options,
                    checkboxLabel,
                    trim,
                    note,
                    shouldNote,
                    shouldDisable,
                    canApply
                }) => {
                    const fieldId = `order-${orderId}-payment-${toKebabCase(name)}`;
                    const fieldInfoClass = getFieldInfoClass(elem, type, name);
                    const isApplicable = applicabilityMap[name];
                    const showNote  = typeof shouldNote === 'function'
                        ? shouldNote({ method, orderStatus, isPaymentDisabled })
                        : false;
                    const isDisabled = typeof shouldDisable === 'function'
                        ? shouldDisable({ method, orderStatus, isPaymentDisabled })
                        : false;
                    const collapsible = !!canApply;

                    const elemProps = {
                        id: fieldId,
                        name,
                        type,
                        step,
                        min,
                        placeholder,
                        value: fieldsState[name]?.value,
                        autoComplete,
                        onChange: handleFieldChange,
                        onBlur: trim ? handleTrimmedFieldBlur : undefined,
                        disabled: isFormLocked || !isApplicable || isDisabled
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
                            <label htmlFor={fieldId} className="form-entry-label">{label}:</label>

                            <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                {fieldElem}

                                {showNote  && <span className="note">*{note}</span>}

                                {fieldsState[name]?.error && !showNote  && (
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
