import React, { useReducer, useState, useRef, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cn from 'classnames';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import Collapsible from '@/components/common/Collapsible.jsx';
import FormFooter from '@/components/common/FormFooter.jsx';
import {
    sendAuthCheckoutPrefsRequest,
    sendAuthCheckoutPrefsUpdateRequest
} from '@/api/authRequests.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import {
    CLIENT_CONSTANTS,
    DELIVERY_METHOD,
    DELIVERY_METHOD_OPTIONS,
    PAYMENT_METHOD_OPTIONS
} from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, LOADING, LOAD_ERROR, BAD_REQUEST, NOT_FOUND,
        UNCHANGED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Сохранить';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [LOADING]: { ...base[LOADING], mainMessage: 'Загрузка настроек заказа...' },
        [LOAD_ERROR]: { ...base[LOAD_ERROR], mainMessage: 'Не удалось загрузить настройки заказа.' },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходные настройки заказа или связанные с ними ресурсы не найдены.'
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Настройки заказа не изменены.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Настройки заказа сохранены!',
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

const formGroupConfigs = [
    {
        name: 'customerGroup',
        title: 'Основные данные покупателя',
        fieldConfigs: [
            {
                name: 'firstName',
                label: 'Имя',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите имя покупателя',
                trim: true,
                optional: true
            },
            {
                name: 'lastName',
                label: 'Фамилия',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите фамилию покупателя',
                trim: true,
                optional: true
            },
            {
                name: 'middleName',
                label: 'Отчество',
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
                type: 'email',
                placeholder: 'Укажите почтовый ящик',
                trim: true,
                optional: true
            },
            {
                name: 'phone',
                label: 'Телефон (РФ)',
                elem: 'input',
                type: 'tel',
                placeholder: 'Укажите номер телефона',
                trim: true,
                optional: true
            },
        ]
    },
    {
        name: 'deliveryGroup',
        title: 'Информация для доставки заказа',
        fieldConfigs: [
            {
                name: 'deliveryMethod',
                label: 'Метод доставки',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать метод доставки ---' },
                    ...DELIVERY_METHOD_OPTIONS
                ],
                optional: true
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
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'street',
                label: 'Улица',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите улицу',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'house',
                label: 'Дом',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер дома',
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            },
            {
                name: 'apartment',
                label: 'Квартира',
                elem: 'input',
                type: 'text',
                placeholder: 'Укажите номер квартиры',
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
                trim: true,
                optional: true,
                canApply: ({ deliveryMethod }) => isDeliveryRequired(deliveryMethod)
            }
        ]
    },
    {
        name: 'paymentGroup',
        title: 'Выбор способа оплаты',
        fieldConfigs: [
            {
                name: 'defaultPaymentMethod',
                label: 'Способ оплаты',
                elem: 'select',
                options: [
                    { value: '', label: '--- Выбрать способ оплаты ---' },
                    ...PAYMENT_METHOD_OPTIONS
                ],
                optional: true
            }
        ]
    }
];

const fieldConfigs = formGroupConfigs
    .flatMap(groupConfig => groupConfig.fieldConfigs ?? null)
    .filter(Boolean);

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
 
export default function CheckoutPreferences() {
    const user = useSelector(state => state.auth.user);

    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.LOADING);

    const initValuesRef = useRef({});
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();

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

    const loadCheckoutPrefs = async () => {
        setSubmitStatus(FORM_STATUS.LOADING);

        const responseData = await dispatch(sendAuthCheckoutPrefsRequest());
        if (isUnmountedRef.current) return;

        const { status, message, checkoutPrefs } = responseData;
        logRequestStatus({ context: 'AUTH: LOAD CHECKOUT PREFS', status, message });

        if (status !== FORM_STATUS.SUCCESS) {
            const finalStatus = lockedStatuses.has(status) ? status : FORM_STATUS.LOAD_ERROR;
            return setSubmitStatus(finalStatus);
        }

        const { customerInfo = {}, delivery = {}, financials = {} } = checkoutPrefs ?? {};
        const { deliveryMethod, allowCourierExtra = false, shippingAddress = {} } = delivery;

        initValuesRef.current = {
            ...customerInfo,
            ...(deliveryMethod && { deliveryMethod }),
            allowCourierExtra,
            ...shippingAddress,
            ...financials
        };

        if (Object.keys(initValuesRef.current).length > 0) {
            dispatchFieldsState({
                type: 'UPDATE',
                payload: Object.fromEntries(
                    Object.entries(initValuesRef.current).map(([key, value]) => ([key, { value }]))
                )
            });
        }
        
        setSubmitStatus(FORM_STATUS.DEFAULT);
    };

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

    const fillRegistrationEmail = () => {
        dispatchFieldsState({
            type: 'UPDATE',
            payload: { email: { value: user.email, uiStatus: '', error: '' } }
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
                    if (normalizedValue !== '') acc.formFields[name] = normalizedValue;

                    const initValue = initValuesRef.current[name] ?? '';
                    if (normalizedValue !== initValue) acc.changedFields.push(name);
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

        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (!changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const responseData = await dispatch(sendAuthCheckoutPrefsUpdateRequest(formFields));
        if (isUnmountedRef.current) return;

        const { status, message, fieldErrors } = responseData;
        const LOG_CTX = 'AUTH: UPDATE CHECKOUT PREFS';

        switch (status) {
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.USER_GONE:
            case FORM_STATUS.DENIED:
            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.UNCHANGED:
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

                // Обновление начальных значений полей
                initValuesRef.current = Object.fromEntries(
                    Object.entries(fieldsState)
                        .map(([key, { value }]) => ([key, value]))
                        .filter(([_, value]) => Boolean(value))
                );

                const fieldStateUpdates = {};
                changedFields.forEach(name => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                setSubmitStatus(status);

                setTimeout(() => {
                    if (isUnmountedRef.current) return;

                    changedFields.forEach(name => {
                        fieldStateUpdates[name] = { uiStatus: '' };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

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

    // Стартовая загрузка настроек заказа и очистка при размонтировании
    useEffect(() => {
        loadCheckoutPrefs();

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <div className="checkout-preferences-page">
            <header className="checkout-preferences-header">
                <h2>Настройки заказа</h2>
                <p>Данные будут использоваться по умолчанию при оформлении заказа</p>
            </header>

            <form className="checkout-preferences-form" onSubmit={handleFormSubmit} noValidate>
                <div className="form-body">
                    {formGroupConfigs.map(({ name, title, fieldConfigs }) => (
                        <div key={name} className={cn('form-group', toKebabCase(name))}>
                            <div className="form-group-title">
                                <h4>{title}</h4>
                            </div>

                            <FormGroupEntries
                                fieldConfigs={fieldConfigs}
                                fieldsState={fieldsState}
                                applicabilityMap={applicabilityMap}
                                handleFieldChange={handleFieldChange}
                                handleTrimmedFieldBlur={handleTrimmedFieldBlur}
                                isFormLocked={isFormLocked}
                                fillRegistrationEmail={fillRegistrationEmail}
                            />
                        </div>
                    ))}
                </div>

                <FormFooter
                    submitStates={submitStates}
                    submitStatus={submitStatus}
                    uiBlocked={isFormLocked}
                    reloadData={loadCheckoutPrefs}
                />
            </form>
        </div>
    );
};

function FormGroupEntries({
    fieldConfigs,
    fieldsState,
    applicabilityMap,
    handleFieldChange,
    handleTrimmedFieldBlur,
    isFormLocked,
    fillRegistrationEmail
}) {
    return (
        <div className="form-group-entries">
            {fieldConfigs.map(({
                name,
                label,
                elem,
                type,
                options,
                placeholder,
                checkboxLabel,
                tooltip,
                trim,
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
                    <div key={`field-${name}`} className={cn('form-entry', fieldInfoClass)}>
                        <label htmlFor={fieldId} className="form-entry-label">
                            {label}
                            {tooltip && <span className="info" title={tooltip}>ⓘ</span>}
                            :
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
    );
}
