import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import {
    sendPromoRequest,
    sendPromoCreateRequest,
    sendPromoUpdateRequest
} from '@/api/promoRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import moveKeyToEndInFormData from '@/helpers/moveKeyToEndInFormData.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_PROMO_IMAGE_SIZE_MB } from '@shared/constants.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

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
        [LOADING]: { ...base[LOADING], mainMessage: 'Загрузка акции...' },
        [LOAD_ERROR]: { ...base[LOAD_ERROR], mainMessage: 'Не удалось загрузить акцию.' },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходная акция или связанный с ней ресурс не найден.'
        },
        [UNCHANGED]: { ...base[UNCHANGED], addMessage: 'Акция не изменена.', submitBtnLabel: actionLabel },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: isEditMode ? 'Акция отредактирована.' : 'Акция создана!',
            addMessage: 'Вы будете перенаправлены на страницу акций магазина.',
            submitBtnLabel: 'Перенаправление...'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const fieldConfigs = [
    {
        name: 'title',
        label: 'Название акции',
        elem: 'input',
        type: 'text',
        placeholder: 'Укажите название акции',
        autoComplete: 'off',
        trim: true
    },
    {
        name: 'image',
        label: 'Изображение (опционально)',
        elem: 'input',
        type: 'file',
        accept: ALLOWED_IMAGE_MIME_TYPES.join(', '),
        allowedTypes: ALLOWED_IMAGE_MIME_TYPES,
        maxSizeMB: MAX_PROMO_IMAGE_SIZE_MB,
        optional: true
    },
    {
        name: 'description',
        label: 'Описание акции',
        elem: 'textarea',
        placeholder: 'Введите текст акции',
        autoComplete: 'off',
        trim: true
    },
    {
        name: 'startDate',
        label: 'Дата начала акции',
        elem: 'input',
        type: 'date'
    },
    {
        name: 'endDate',
        label: 'Дата окончания акции (включительно)',
        elem: 'input',
        type: 'date'
    }
];

const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
    acc[config.name] = config;
    return acc;
}, {});

const initialFieldsState = fieldConfigs.reduce((acc, { name, type }) => {
    acc[name] = {
        ...(type === 'file' ? { files: [] } : { value: '' }),
        uiStatus: '',
        error: ''
    };
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

export default function PromoEditor({ promoId }) {
    const isEditMode = Boolean(promoId);

    const { submitStates, lockedStatuses } = useMemo(() => getSubmitStates(isEditMode), [isEditMode]);
    
    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS[isEditMode ? 'LOADING' : 'DEFAULT']);
    const [shouldRemoveImage, setShouldRemoveImage] = useState(false);
    const initValuesRef = useRef({});
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const isFormLocked = lockedStatuses.has(submitStatus);

    const loadPromo = async (promoId) => {
        setSubmitStatus(FORM_STATUS.LOADING);

        const { status, message, promo } = await dispatch(sendPromoRequest(promoId));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'PROMO: LOAD SINGLE', status, message });

        if (status !== FORM_STATUS.SUCCESS) {
            const finalStatus = submitStates[status].locked ? status : FORM_STATUS.LOAD_ERROR;
            return setSubmitStatus(finalStatus);
        }

        const { title, image, description, startDate, endDate } = promo;
        const formattedStartDate = startDate.split('T')[0];
        const formattedEndDate = endDate.split('T')[0];

        initValuesRef.current = {
            title,
            image, // URL или undefined
            description,
            startDate: formattedStartDate,
            endDate: formattedEndDate
        };

        dispatchFieldsState({
            type: 'UPDATE',
            payload: {
                title: { value: title },
                description: { value: description },
                startDate: { value: formattedStartDate },
                endDate: { value: formattedEndDate }
            }
        });
        
        setSubmitStatus(FORM_STATUS.DEFAULT);
    };

    const reloadPromo = () => loadPromo(promoId);

    const handleFieldChange = (e) => {
        const { name, type, files, value } = e.target;

        const fieldStateUpdates = {
            [name]: {
                ...(type === 'file' ? { files } : { value }),
                uiStatus: '',
                error: ''
            }
        };

        // Настройка ограничения дат
        if (type === 'date' && value) {
            if (name === 'startDate') {
                const endDateValue = fieldsState.endDate.value;
                const end = endDateValue ? new Date(endDateValue) : null;
                const start = new Date(value);

                if (end && end < start) {
                    fieldStateUpdates.endDate = {
                        value,
                        uiStatus: '',
                        error: ''
                    };
                }
            }

            if (name === 'endDate') {
                const startDateValue = fieldsState.startDate.value;
                const start = startDateValue ? new Date(startDateValue) : null;
                const end = new Date(value);

                if (start && end < start) {
                    fieldStateUpdates.endDate.value = startDateValue;
                }
            }
        }

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
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

    const processImageField = (config, validation, files, initValue, shouldRemoveImage) => {
        const { name, optional, allowedTypes, maxSizeMB } = config;
        const imageFile = files[0];
        const fieldStateValue = { files };
        const fieldEntries = [];
        let isValueChanged = false;
    
        // Старая картинка есть и не удаляется — ничего не делается
        if (initValue && !shouldRemoveImage) {
            return { isValid: true, fieldStateValue, fieldEntries, isValueChanged };
        }
    
        // Старая картинка есть и должна быть удалена — добавление флага удаления
        if (initValue && shouldRemoveImage) {
            fieldEntries.push(['removeImage', true]);
            isValueChanged = true;
        }
    
        // Загружен новый файл — валидация и добавление
        if (imageFile instanceof File) {
            const ruleCheck = validation(imageFile, allowedTypes, maxSizeMB, optional);
            const isValid = optional ? (!imageFile || ruleCheck) : ruleCheck;
            if (!isValid) return { isValid: false, fieldStateValue };
    
            fieldEntries.push([name, imageFile]);
            if (!initValue) isValueChanged = true;
        }
    
        // Если файл не загружен, то поле опционально, иначе всё валидно
        return {
            isValid: imageFile ? true : optional,
            fieldStateValue,
            fieldEntries,
            isValueChanged
        };
    };
    
    const processGenericField = (config, validation, value, initValue) => {
        const { name, trim, optional } = config;
        const normalizedValue = trim ? value.trim() : value;
        const fieldStateValue = { value: normalizedValue };
        const ruleCheck = validation.test(normalizedValue);

        const isValid = optional ? (!normalizedValue || ruleCheck) : ruleCheck;
        const fieldEntries = (isValid && (!optional || normalizedValue !== ''))
            ? [[name, normalizedValue]]
            : [];
        const isValueChanged = normalizedValue !== initValue;
    
        return { isValid, fieldStateValue, fieldEntries, isValueChanged };
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value, files }]) => {
                const validation = validationRules.promotion[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const config = fieldConfigMap[name];
                const initValue = initValuesRef.current[name];
                const isImage = name === 'image';
        
                let processFieldResult = isImage
                    ? processImageField(config, validation, files, initValue, shouldRemoveImage)
                    : processGenericField(config, validation, value, initValue);
        
                const { isValid, fieldStateValue, fieldEntries, isValueChanged } = processFieldResult;
        
                acc.fieldStateUpdates[name] = {
                    ...fieldStateValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.promotion[name].default || fieldErrorMessages.DEFAULT
                };
        
                if (isValid) {
                    fieldEntries.forEach(([key, val]) => {
                        acc.formData.append(key, val);
                    });

                    if (isValueChanged) acc.changedFields.push(name);
                } else {
                    acc.allValid = false;
                }
        
                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, formData: new FormData(), changedFields: [] }
        );
    
        return {
            ...result,
            formData: moveKeyToEndInFormData(result.formData, 'image'), // Размещение image в конце
        };
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        const { allValid, fieldStateUpdates, formData, changedFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        
        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (isEditMode && !changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const requestThunk = isEditMode
            ? sendPromoUpdateRequest(promoId, formData)
            : sendPromoCreateRequest(formData);
        const { status, fieldErrors, message } = await dispatch(requestThunk);
        if (isUnmountedRef.current) return;

        const LOG_CTX = `PROMO: ${isEditMode ? 'UPDATE' : 'CREATE'}`;

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
                    navigate(routeConfig.promotions.paths[0]);
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

    // Стартовая загрузка акции в режиме редактирования и очистка при размонтировании
    useEffect(() => {
        if (isEditMode) loadPromo(promoId);

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
        <div className="promo-editor">
            <header className="promo-editor-header">
                <h3>{isEditMode ? 'Редактирование акции' : 'Создание акции'}</h3>
            </header>

            <form className="promo-form" onSubmit={handleFormSubmit} noValidate>
                <div className="form-body">
                    {fieldConfigs.map(({
                        name,
                        label,
                        elem,
                        type,
                        placeholder,
                        accept,
                        autoComplete,
                        trim
                    }) => {
                        const fieldInfoClass = getFieldInfoClass(elem, type, name);
                        const fieldId = `promo-${toKebabCase(name)}`;
                        const hasPrevImage = name === 'image' && initValuesRef.current?.[name];

                        const elemProps = {
                            id: fieldId,
                            name,
                            type,
                            placeholder,
                            value: fieldsState[name]?.value,
                            min: name === 'endDate' ? fieldsState.startDate?.value : undefined,
                            accept,
                            autoComplete,
                            onChange: handleFieldChange,
                            onBlur: trim ? handleTrimmedFieldBlur : undefined,
                            disabled: isFormLocked || (hasPrevImage && !shouldRemoveImage)
                        };

                        return (
                            <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                                <label htmlFor={fieldId} className="form-entry-label">{label}:</label>

                                <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                    {hasPrevImage && (
                                        <div className="promo-image-remove-box">
                                            <DesignedCheckbox
                                                label="Удалить текущее"
                                                name="remove-promo-image"
                                                checked={shouldRemoveImage}
                                                onChange={(e) => setShouldRemoveImage(e.target.checked)}
                                                disabled={isFormLocked}
                                            />
                                        </div>
                                    )}

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
                    reloadData={isEditMode ? reloadPromo : undefined}
                />
            </form>
        </div>
    );
};
