import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import {
    sendNotificationRequest,
    sendNotificationCreateRequest,
    sendNotificationUpdateRequest
} from '@/api/notificationRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;
const ARRAY_SEPARATOR = ', ';

const getSubmitStates = (isEditMode) => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, LOADING, LOAD_ERROR, BAD_REQUEST, NOT_FOUND,
        UNCHANGED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = isEditMode ? 'Изменить' : 'Создать';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [LOADING]: { ...base[LOADING], mainMessage: 'Загрузка черновика уведомления...' },
        [LOAD_ERROR]: {
            ...base[LOAD_ERROR],
            mainMessage: 'Не удалось загрузить черновик уведомления.'
        },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходное уведомление или связанный с ним ресурс не найден.'
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Уведомление не изменено.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: isEditMode ? 'Уведомление изменено.' : 'Уведомление создано!',
            addMessage: 'Вы будете перенаправлены на страницу управления уведомлениями.',
            submitBtnLabel: 'Перенаправление...'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const getFieldConfigs = (totalSelectedCustomers) => {
    const fieldConfigs = [
        {
            name: 'recipients',
            label: `Клиенты-получатели (${totalSelectedCustomers})`,
            elem: 'input',
            type: 'text',
            placeholder: 'Выберите получателей',
            autoComplete: 'off'
        },
        {
            name: 'subject',
            label: 'Тема уведомления',
            elem: 'input',
            type: 'text',
            placeholder: 'Укажите тему уведомления',
            autoComplete: 'on',
            trim: true
        },
        {
            name: 'message',
            label: 'Текст сообщения',
            elem: 'textarea',
            placeholder: 'Введите текст уведомления',
            autoComplete: 'off',
            trim: true
        },
        {
            name: 'signature',
            label: 'Отправитель',
            elem: 'input',
            type: 'text',
            value: 'Администрация «Мото-Магазина»',
            placeholder: 'Укажите отправителя',
            autoComplete: 'on',
            trim: true
        }
    ];

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.name] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name, value }) => {
        acc[name] = { value: value === undefined ? '' : value, uiStatus: '', error: '' };
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

export default function NotificationEditor({
    notificationId,
    filteredCustomerNamesMap,
    selectedCustomerIds,
    setSelectedCustomerIds
}) {
    const isEditMode = Boolean(notificationId);

    const { submitStates, lockedStatuses } = useMemo(() => getSubmitStates(isEditMode), [isEditMode]);
    const { fieldConfigs, fieldConfigMap } = useMemo(
        () => getFieldConfigs(selectedCustomerIds.size),
        [selectedCustomerIds.size]
    );

    const [fieldsState, dispatchFieldsState] = useReducer(
        fieldsStateReducer,
        fieldConfigs,
        initFieldsStateReducer
    );
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS[isEditMode ? 'LOADING' : 'DEFAULT']);
    const [lockedRecipientNames, setLockedRecipientNames] = useState('');

    const initValuesRef = useRef({});
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const isFormLocked = lockedStatuses.has(submitStatus);

    const displayRecipientNames = (selectedCustomerIds = new Set()) =>
        [...selectedCustomerIds]
            .map(id => filteredCustomerNamesMap[id] ?? `<имя неизвестно (ID: ${id})>`)
            .join(ARRAY_SEPARATOR);

    const loadNotification = async (notificationId) => {
        setSubmitStatus(FORM_STATUS.LOADING);

        const responseData = await dispatch(sendNotificationRequest(notificationId));
        if (isUnmountedRef.current) return;

        const { status, message: statusMsg, notification } = responseData;
        logRequestStatus({ context: 'NOTIFICATION: LOAD SINGLE', status, message: statusMsg });

        if (status !== FORM_STATUS.SUCCESS) {
            const finalStatus = submitStates[status].locked ? status : FORM_STATUS.LOAD_ERROR;
            return setSubmitStatus(finalStatus);
        }

        const { recipients, subject, message, signature } = notification;

        initValuesRef.current = {
            recipients, // Массив
            subject,
            message,
            signature
        };

        dispatchFieldsState({
            type: 'UPDATE',
            payload: {
                recipients: { value: recipients.join(ARRAY_SEPARATOR) }, // Строка
                subject: { value: subject },
                message: { value: message },
                signature: { value: signature }
            }
        });

        setSelectedCustomerIds(new Set(recipients));
        setSubmitStatus(FORM_STATUS.DEFAULT);
    };

    const reloadNotification = () => loadNotification(notificationId);

    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        if (name === 'recipients') return; // Блокировка поля получателей от изменения вручную

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value, uiStatus: '', error: '' } }
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

    const processRecipientsField = (config, validation, value, initValue) => {
        const { name } = config;
        const recipientSet = new Set(value.split(ARRAY_SEPARATOR).filter(Boolean));
        const uniqueRecipients = [...recipientSet];
        const initRecipientSet = new Set(initValue || []);

        const isValid = validation(uniqueRecipients);
        const fieldEntries = [[name, uniqueRecipients]];
        const isValueChanged = recipientSet.size !== initRecipientSet.size ||
            uniqueRecipients.some(id => !initRecipientSet.has(id));
    
        return { isValid, normalizedValue: value, fieldEntries, isValueChanged };
    };    

    const processGenericField = (config, validation, value, initValue) => {
        const { name, trim, optional } = config;
        const normalizedValue = trim ? value.trim() : value;

        const isValid = validation.test(normalizedValue);
        const hasValue = !optional || normalizedValue !== '';
        const fieldEntries = isValid && hasValue ? [[name, normalizedValue]] : [];
        const isValueChanged = normalizedValue !== initValue;
    
        return { isValid, normalizedValue, fieldEntries, isValueChanged };
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const validation = validationRules.notification[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const config = fieldConfigMap[name];
                const initValue = initValuesRef.current[name];
    
                const processFieldResult = name === 'recipients'
                    ? processRecipientsField(config, validation, value, initValue)
                    : processGenericField(config, validation, value, initValue);

                const { isValid, normalizedValue, fieldEntries, isValueChanged } = processFieldResult;
    
                acc.fieldStateUpdates[name] = {
                    value: normalizedValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.notification[name].default || fieldErrorMessages.DEFAULT
                };
    
                if (isValid) {
                    fieldEntries.forEach(([key, val]) => {
                        acc.formFields[key] = val;
                    });
                    
                    if (isValueChanged) acc.changedFields.push(name);
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

        const namesSnapshot = displayRecipientNames(selectedCustomerIds);
        setLockedRecipientNames(namesSnapshot);

        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (isEditMode && !changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const requestThunk = isEditMode
            ? sendNotificationUpdateRequest(notificationId, formFields)
            : sendNotificationCreateRequest(formFields);
        const { status, message, fieldErrors } = await dispatch(requestThunk);
        if (isUnmountedRef.current) return;

        const LOG_CTX = `NOTIFICATION: ${isEditMode ? 'UPDATE' : 'CREATE'}`;

        switch (status) {
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.USER_GONE:
            case FORM_STATUS.DENIED:
            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.NOT_FOUND:
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

                const fieldStateUpdates = {};
                changedFields.forEach(name => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                setSubmitStatus(status);

                setTimeout(() => {
                    if (isUnmountedRef.current) return;
                    navigate(routeConfig.adminNotifications.paths[0]);
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

    // Стартовая загрузка уведомления в режиме редактирования и очистка при размонтировании
    useEffect(() => {
        if (isEditMode) loadNotification(notificationId);

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Изменение значения поля recipients в стейте (не в инпуте) через выбор клиентов в таблице
    useEffect(() => {
        dispatchFieldsState({
            type: 'UPDATE',
            payload: {
                recipients: {
                    value: [...selectedCustomerIds].join(ARRAY_SEPARATOR),
                    ...(!isFormLocked && {
                        uiStatus: '',
                        error: ''
                    })
                }
            }
        });
    }, [selectedCustomerIds]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <div className="notification-editor">
            <header className="notification-editor-header">
                <h3>{`${isEditMode ? 'Изменение' : 'Создание'} черновика уведомления`}</h3>
            </header>

            <form className="notification-form" onSubmit={handleFormSubmit} noValidate>
                <div className="form-body">
                    {fieldConfigs.map(({
                        name,
                        label,
                        elem,
                        type,
                        placeholder,
                        autoComplete,
                        trim
                    }) => {
                        const fieldInfoClass = getFieldInfoClass(elem, type, name);
                        const fieldId = `notification-${toKebabCase(name)}`;
                        const recipientsValue = isFormLocked
                            ? lockedRecipientNames
                            : displayRecipientNames(selectedCustomerIds);
    
                        const elemProps = {
                            id: fieldId,
                            name,
                            type,
                            placeholder,
                            value: name === 'recipients' ? recipientsValue : fieldsState[name]?.value,
                            autoComplete,
                            onChange: handleFieldChange,
                            onBlur: trim ? handleTrimmedFieldBlur : undefined,
                            disabled: isFormLocked
                        };

                        return (
                            <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                                <label htmlFor={`notification-${name}`} className="form-entry-label">
                                    {label}:
                                </label>

                                <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                    {React.createElement(elem, elemProps)}
                                    
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
                    reloadData={isEditMode ? reloadNotification : undefined}
                />
            </form>
        </div>
    );
};
