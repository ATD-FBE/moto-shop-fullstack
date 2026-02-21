import React, { useReducer, useState, useRef, useEffect }  from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import { sendOrderInternalNoteUpdateRequest } from '@/api/orderRequests.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { validationRules, fieldErrorMessages } from '@shared/fieldRules.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, FORBIDDEN, BAD_REQUEST, NOT_FOUND, UNCHANGED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Сохранить';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [FORBIDDEN]: { ...base[FORBIDDEN], submitBtnLabel: actionLabel },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходный заказ или связанный с ним ресурс не найден.'
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Заметка не изменена.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Заметка обновлена!',
            submitBtnLabel: 'Сохранено'
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
        name: 'internalNote',
        label: 'Заметка к заказу',
        elem: 'textarea',
        placeholder: 'Укажите содержание заметки',
        trim: true,
        optional: true
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

export default function InternalNoteForm({ orderId, internalNote }) {
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);
    const initValuesRef = useRef({});
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();
    
    const isFormLocked = lockedStatuses.has(submitStatus);

    const handleFieldChange = (e) => {
        const { name, value } = e.target;

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

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const validation = validationRules.order[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const { trim, optional } = fieldConfigMap[name] ?? {};
                const normalizedValue = trim ? value.trim() : value;
                const ruleCheck = validation.test(normalizedValue);

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

        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (!changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const responseData = await dispatch(sendOrderInternalNoteUpdateRequest(orderId, formFields));
        if (isUnmountedRef.current) return;

        const { status, message, fieldErrors } = responseData;
        const LOG_CTX = 'ORDER: INTERNAL NOTE UPDATE';

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

    // Установка дефолтного значения в состояние и очистка при размонтировании
    useEffect(() => {
        dispatchFieldsState({
            type: 'UPDATE',
            payload: { internalNote: { value: internalNote ?? '' } }
        });

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Обновление начального значения полей через SSE
    useEffect(() => {
        initValuesRef.current.internalNote = internalNote ?? '';
    }, [internalNote]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <form className="internal-note-form" onSubmit={handleFormSubmit} noValidate>
            <div className="form-body">
                {fieldConfigs.map(({ name, label, elem, type, placeholder, trim, optional }) => {
                    const fieldId = `order-${orderId}-payment-${toKebabCase(name)}`;
                    const fieldInfoClass = getFieldInfoClass(elem, type, name);

                    const elemProps = {
                        id: fieldId,
                        name,
                        type,
                        placeholder,
                        value: fieldsState[name]?.value,
                        autoComplete: 'off',
                        onChange: handleFieldChange,
                        onBlur: trim ? handleTrimmedFieldBlur : undefined,
                        disabled: isFormLocked
                    };

                    return (
                        <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                            <label htmlFor={fieldId} className="form-entry-label">
                                {label}:
                                {optional && <small className="optional">опционально</small>}
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
            />
        </form>
    );
};
