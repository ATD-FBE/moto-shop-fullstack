import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { sendBulkProductUpdateRequest } from '@/api/productRequests.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { PRODUCT_UNITS, CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, BAD_REQUEST, NOT_FOUND, UNCHANGED,
        NO_SELECTION, INVALID, ERROR, NETWORK, PARTIAL, SUCCESS
    } = FORM_STATUS;
    const actionLabel = 'Сохранить';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Выбранные товары или связанные с ними ресурсы не найдены.',
            locked: false
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Товары не сохранены.',
            submitBtnLabel: actionLabel
        },
        [NO_SELECTION]: {
            ...base[NO_SELECTION],
            mainMessage: 'Товары не выбраны.',
            addMessage: 'Выберите хотя бы один товар, чтобы продолжить.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [PARTIAL]: {
            ...base[PARTIAL],
            addMessage: 'Не все товары были сохранены.',
            submitBtnLabel: 'Сохранено'
        },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Выбранные товары сохранены!',
            addMessage: 'Список товаров будет обновлён.',
            submitBtnLabel: 'Сохранено'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const { submitStates, lockedStatuses } = getSubmitStates();

const getFieldConfigs = (allowedCategories) => {
    const fieldConfigs = [
        {
            name: 'brand',
            label: 'Бренд',
            elem: 'input',
            type: 'text',
            value: '',
            placeholder: 'Укажите бренд товаров',
            autoComplete: 'off',
            trim: true,
            allowEmpty: true,
            enabled: false
        },
        {
            name: 'unit',
            label: 'Единица измерения',
            elem: 'select',
            options: PRODUCT_UNITS.map(unit => ({ value: unit, label: unit })),
            value: PRODUCT_UNITS[0],
            enabled: false
        },
        {
            name: 'discount',
            label: 'Уценка (%)',
            elem: 'input',
            type: 'number',
            step: 0.5,
            min: 0,
            max: 100,
            value: 0,
            enabled: false
        },
        {
            name: 'category',
            label: 'Категория товаров',
            elem: 'select',
            options: allowedCategories.map(cat => ({ value: cat.id, label: cat.name })),
            value: allowedCategories[0]?.id || '',
            enabled: false
        },
        {
            name: 'tags',
            label: 'Теги (через запятую)',
            elem: 'input',
            type: 'text',
            placeholder: 'Укажите общие теги',
            value: '',
            autoComplete: 'off',
            trim: true,
            allowEmpty: true,
            enabled: false
        },
        {
            name: 'isActive',
            label: 'Активность',
            elem: 'checkbox',
            checkboxLabel: 'Доступен для продажи',
            value: true
        }
    ];

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.name] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name, enabled, value }) => {
        acc[name] = { enabled, value, uiStatus: '', error: '' };
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

        case 'TOGGLE_ENABLED':
            const name = payload.name;
            return {
                ...state,
                [name]: { ...state[name], enabled: !state[name].enabled }
            };

        case 'RESET':
            return payload;

        default:
            return state;
    }
};

export default function BulkProductForm({ uiBlocked, productIds, allowedCategories, onSubmit }) {
    const { fieldConfigs, fieldConfigMap } = useMemo(
        () => getFieldConfigs(allowedCategories),
        [allowedCategories]
    );
    
    const [fieldsState, dispatchFieldsState] = useReducer(
        fieldsStateReducer,
        fieldConfigs,
        initFieldsStateReducer
    );
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const isFormLocked = lockedStatuses.has(submitStatus) || uiBlocked;

    const toggleFieldEnable = (name) => {
        dispatchFieldsState({
            type: 'TOGGLE_ENABLED',
            payload: { name }
        });
    };

    const handleFieldChange = (e) => {
        const { name, type, value, checked } = e.target;
        let processedValue;
        
        if (type === 'number' && value !== '') {
            processedValue = Number(value.replace(',', '.'))
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

    const processGenericField = (enabled, config, validation, value) => {
        const { name, trim, allowEmpty } = config;
        const normalizedValue = trim ? value.trim() : value;
        const fieldStateValue = { value: normalizedValue };
        const ruleCheck =
            typeof validation === 'function'
                ? validation(normalizedValue)
                : validation.test(normalizedValue);

        const hasValue = normalizedValue !== '';
        const isValid = (!hasValue && allowEmpty) || ruleCheck;
        const fieldEntries = enabled && isValid ? [[name, normalizedValue]] : [];
    
        return { isValid, fieldStateValue, fieldEntries };
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { enabled, value }]) => {
                const config = fieldConfigMap[name];
                const validation = validationRules.product[name];

                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                // Валидация значений полей, формирование данных на отправку и проверка на изменение
                const processFieldResult = processGenericField(enabled, config, validation, value);
                const { isValid, fieldStateValue, fieldEntries } = processFieldResult;
    
                // Сбор данных для обновления состояния поля
                acc.fieldStateUpdates[name] = {
                    ...fieldStateValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.product[name]?.default || fieldErrorMessages.DEFAULT
                };

                if (!isValid) {
                    acc.allValid = false;
                } else if (enabled) {
                    // Сбор данных для отправки
                    fieldEntries.forEach(([key, val]) => {
                        acc.formFields[key] = val;
                    });
                        
                    // Запоминание изменённого поля
                    acc.changedFields.push(name);
                }
    
                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, formFields: {}, changedFields: [] }
        );

        return result;
    };
    
    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (!productIds.length) {
            return setSubmitStatus(FORM_STATUS.NO_SELECTION);
        }
        
        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        
        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (!changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        const performFormSubmission = async () => {
            setSubmitStatus(FORM_STATUS.SENDING);
            dispatch(setIsNavigationBlocked(true));

            const responseData = await dispatch(sendBulkProductUpdateRequest(productIds, formFields));
            if (isUnmountedRef.current) return;

            const { status, message, fieldErrors, updatedProducts } = responseData;
            const LOG_CTX = 'PRODUCT: UPDATE BULK';

            switch (status) {
                case FORM_STATUS.UNAUTH:
                case FORM_STATUS.USER_GONE:
                case FORM_STATUS.DENIED:
                case FORM_STATUS.BAD_REQUEST:
                case FORM_STATUS.NO_SELECTION:
                case FORM_STATUS.NOT_FOUND:
                case FORM_STATUS.UNCHANGED:
                case FORM_STATUS.ERROR:
                case FORM_STATUS.NETWORK:
                    logRequestStatus({ context: LOG_CTX, status, message });
                    setSubmitStatus(status);
                    dispatch(setIsNavigationBlocked(false));
                    break;

                case FORM_STATUS.INVALID: {
                    logRequestStatus({
                        context: LOG_CTX,
                        status,
                        message,
                        details: fieldErrors
                    });
    
                    const fieldStateUpdates = {};
                    Object.entries(fieldErrors).forEach(([name, error]) => {
                        fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
    
                    setSubmitStatus(status);
                    dispatch(setIsNavigationBlocked(false));
                    break;
                }
            
                case FORM_STATUS.PARTIAL:
                case FORM_STATUS.SUCCESS: {
                    logRequestStatus({ context: LOG_CTX, status, message });

                    const fieldStateUpdates = {};
                    changedFields.forEach(name => {
                        fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                    setSubmitStatus(status);

                    await new Promise(resolve => setTimeout(() => {
                        if (isUnmountedRef.current) return;

                        dispatchFieldsState({
                            type: 'RESET',
                            payload: initFieldsStateReducer(fieldConfigs)
                        });

                        setSubmitStatus(FORM_STATUS.DEFAULT);
                        dispatch(setIsNavigationBlocked(false));
                        resolve();
                    }, SUCCESS_DELAY));

                    return { status, affectedProducts: updatedProducts ?? [] };
                }
            
                default:
                    logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                    setSubmitStatus(FORM_STATUS.UNKNOWN);
                    dispatch(setIsNavigationBlocked(false));
                    break;
            }

            return { status };
        };

        onSubmit(performFormSubmission);
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);
    
    // Сброс состояния полей при изменении их конфигов
    useEffect(() => {
        setSubmitStatus(FORM_STATUS.DEFAULT);
        dispatchFieldsState({ type: 'RESET', payload: initFieldsStateReducer(fieldConfigs) });
    }, [fieldConfigs]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <form className="bulk-product-form" onSubmit={handleFormSubmit} noValidate>
            <header className="form-header">
                <h2>Редактирование группы выбранных товаров</h2>
            </header>

            <div className="form-body">
                {fieldConfigs.map(({
                    name,
                    label,
                    elem,
                    type,
                    placeholder,
                    min,
                    max,
                    step,
                    multiple,
                    accept,
                    options,
                    checkboxLabel,
                    autoComplete,
                    trim
                }) => {
                    const fieldInfoClass = getFieldInfoClass(elem, type, name);
                    const fieldId = `bulk-products-${toKebabCase(name)}`;
                    const isEnabled = fieldsState[name]?.enabled;
                    
                    const elemProps = {
                        //id: fieldId, // id привязан к чекбоксу активации поля формы
                        name,
                        type,
                        placeholder,
                        value: fieldsState[name]?.value,
                        min,
                        max,
                        step,
                        multiple,
                        accept,
                        autoComplete,
                        onChange: handleFieldChange,
                        onBlur: trim ? handleTrimmedFieldBlur : undefined,
                        disabled: !isEnabled || isFormLocked
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

                    return (
                        <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                            <div className="form-entry-checkbox-label">
                                <DesignedCheckbox
                                    id={fieldId}
                                    name={name}
                                    checked={isEnabled}
                                    onChange={() => toggleFieldEnable(name)}
                                    disabled={isFormLocked}
                                />

                                <label htmlFor={fieldId} className="form-entry-label">{label}:</label>
                            </div>

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
            />
        </form>
    );
};
