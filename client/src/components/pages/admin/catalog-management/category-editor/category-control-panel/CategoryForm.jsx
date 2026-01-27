import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { sendCategoryCreateRequest, sendCategoryUpdateRequest } from '@/api/categoryRequests.js';
import { toKebabCase, getFieldInfoClass } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS } = CLIENT_CONSTANTS;

const getSubmitStates = (isEditMode) => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, BAD_REQUEST, NOT_FOUND, UNCHANGED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const actionLabel = isEditMode ? 'Изменить' : 'Создать';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходная категория или связанный с ней ресурс не найден.'
        },
        [UNCHANGED]: {
            ...base[UNCHANGED],
            addMessage: 'Категория не изменена.',
            submitBtnLabel: actionLabel
        },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: isEditMode ? 'Категория обновлена.' : 'Новая категория добавлена!',
            addMessage: 'Категории товаров будут обновлены.',
            submitBtnLabel: 'Выполнено'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const getFieldConfigs = (
    isEditMode,
    initValues,
    defaultOrder,
    maxOrder,
    safeParentData,
    parentName,
    isRestricted
) => {
    const fieldConfigs = [
        {
            name: 'name',
            label: 'Название',
            elem: 'input',
            type: 'text',
            value: initValues.name,
            placeholder: isEditMode ? 'Укажите новое название категории' : 'Укажите название категории',
            autoComplete: 'off',
            trim: true,
            lock: isRestricted && !isEditMode
        },
        {
            name: 'slug',
            label: 'URL-адрес',
            elem: 'input',
            type: 'text',
            value: initValues.slug,
            placeholder: isEditMode ? 'Укажите новый адрес категории' : 'Укажите адрес категории',
            autoComplete: 'off',
            trim: true,
            lock: isRestricted
        },
        {
            name: 'order',
            label: 'Порядковый номер',
            elem: 'input',
            type: 'number',
            value: (isEditMode ? initValues.order : defaultOrder) + 1,
            min: 1,
            max: maxOrder + 1,
            lock: isRestricted && !isEditMode
        },
        {
            name: 'parent',
            label: 'Родительская категория',
            elem: isEditMode ? 'select' : 'input',
            type: isEditMode ? undefined : 'hidden',
            options: isEditMode
                ? safeParentData.selectOptions.map(opt => ({ value: opt.id, label: opt.label }))
                : undefined,
            value: initValues.parent || '',
            outputValue: !isEditMode ? parentName : undefined,
            lock: isRestricted
        }
    ];

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.name] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name, value, max }) => {
        acc[name] = { value, ...(name === 'order' && { max }), uiStatus: '', error: '' };
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

        case 'RESET':
            return payload;

        default:
            return state;
    }
};

export default function CategoryForm({
    categoryId, // В режиме edit, может быть пустой строкой (категория не выбрана)
    initValues, // { name, slug, order, parent }
    maxOrder,
    defaultOrder, // В режиме create
    isRestricted,
    safeParentData, // В режиме edit, { selectOptions: [...], subcatCounts: {...} }
    parentName, // В режиме create
    onSubmit,
    uiBlocked
}) {
    const isEditMode = categoryId !== undefined;

    const { submitStates, lockedStatuses } = useMemo(() => getSubmitStates(isEditMode), [isEditMode]);
    const { fieldConfigs, fieldConfigMap } = useMemo(
        () => getFieldConfigs(isEditMode, initValues, defaultOrder, maxOrder, safeParentData,
            parentName, isRestricted),
        [isEditMode, initValues, defaultOrder, maxOrder, safeParentData, parentName, isRestricted]
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

    const handleFieldChange = (e) => {
        const { name, type, value } = e.target;
        const processedValue = type === 'number' && value !== '' ? Number(value) : value;

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
                const validation = validationRules.category[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const normalizedValue = fieldConfigMap[name]?.trim ? value.trim() : value;
                const submittedValue =
                    name === 'order'
                        ? normalizedValue - 1
                        : (name === 'parent' && normalizedValue === '')
                            ? null
                            : normalizedValue;
                const ruleCheck =
                    typeof validation === 'function'
                        ? validation(submittedValue)
                        : validation.test(submittedValue);

                const isValid = ruleCheck;

                acc.fieldStateUpdates[name] = {
                    value: normalizedValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.category[name]?.default || fieldErrorMessages.DEFAULT
                };
        
                if (isValid) {
                    acc.formFields[name] = submittedValue;
                    
                    const initValue = initValues[name];
                    const isValueChanged = isEditMode
                        ? submittedValue !== initValue
                        : name !== 'parent';
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
        
        // Попытка отправки формы, находясь в корне категорий
        if (isEditMode && !categoryId) {
            console.error('Категория товаров не выбрана. Редактирование невозможно.');
            return setSubmitStatus(FORM_STATUS.BAD_REQUEST);
        }
        
        const { allValid, fieldStateUpdates, formFields, changedFields } = processFormFields();

        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        
        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        } else if (isEditMode && !changedFields.length) {
            return setSubmitStatus(FORM_STATUS.UNCHANGED);
        }

        const performFormSubmission = async () => {
            setSubmitStatus(FORM_STATUS.SENDING);
            dispatch(setIsNavigationBlocked(true));

            const requestThunk = isEditMode
                ? sendCategoryUpdateRequest(categoryId, formFields)
                : sendCategoryCreateRequest(formFields);
            const responseData = await dispatch(requestThunk);
            if (isUnmountedRef.current) return;
            
            const {
                status,
                message,
                fieldErrors,
                newCategoryId,
                movedProductCount
            } = responseData;
            const LOG_CTX = `CATEGORY: ${isEditMode ? 'UPDATE' : 'CREATE'}`;

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
            
                case FORM_STATUS.SUCCESS: {
                    logRequestStatus({ context: LOG_CTX, status, message });

                    const fieldStateUpdates = {};
                    changedFields.forEach(name => {
                        fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                    });
                    dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                    setSubmitStatus(status);

                    const finalizeSuccessHandling = () => {
                        if (isUnmountedRef.current) return;

                        changedFields.forEach(name => fieldStateUpdates[name] = { uiStatus: '' });
                        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                        setSubmitStatus(FORM_STATUS.DEFAULT);
                        dispatch(setIsNavigationBlocked(false));
                    };

                    return { status, finalizeSuccessHandling, newCategoryId, movedProductCount };
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

    // Очистка при размонтировании формы
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Обновление всех полей при изменении их конфигов (смена категории, пересоздание карты)
    useEffect(() => {
        setSubmitStatus(FORM_STATUS.DEFAULT);
        dispatchFieldsState({ type: 'RESET', payload: initFieldsStateReducer(fieldConfigs) });
    }, [fieldConfigs]);

    // Обновление поля order при изменении родителя категории в режиме редактирования
    useEffect(() => {
        if (!isEditMode) return;

        const selectedParentId = fieldsState.parent.value;
        const subCount = safeParentData.subcatCounts[selectedParentId];
        if (subCount === undefined) return;

        const isCurrentParent = selectedParentId === (initValues.parent || '');

        dispatchFieldsState({
            type: 'UPDATE',
            payload: {
                order: {
                    value: isCurrentParent ? initValues.order + 1 : subCount + 1,
                    max: isCurrentParent ? subCount : subCount + 1,
                    uiStatus: '',
                    error: ''
                }
            }
        });
    }, [fieldsState.parent.value, safeParentData]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <form className="category-form" onSubmit={handleFormSubmit} noValidate>
            <header className="form-header">
                <h3>{`${isEditMode ? 'Изменение' : 'Создание'} категории товаров`}</h3>
            </header>

            <div className="form-body">
                {fieldConfigs.map(({
                    name,
                    label,
                    elem,
                    type,
                    placeholder,
                    autoComplete,
                    min,
                    trim,
                    options,
                    outputValue,
                    lock: isFieldLocked
                }) => {
                    const fieldId = `category-${isEditMode ? 'edit' : 'create'}-${toKebabCase(name)}`;
                    const fieldInfoClass = getFieldInfoClass(elem, type, name);
                    const labelFor = elem === 'input' && type === 'hidden' ? undefined : fieldId;
                    
                    const elemProps = {
                        id: fieldId,
                        name,
                        type,
                        placeholder,
                        value: fieldsState[name]?.value,
                        min,
                        max: fieldsState[name]?.max,
                        autoComplete,
                        onChange: handleFieldChange,
                        onBlur: trim ? handleTrimmedFieldBlur : undefined,
                        disabled: isFormLocked || isFieldLocked
                    };

                    const elemChildren = elem === 'select'
                        ? options.map((option, idx) => (
                            <option key={`${idx}-${option.value}`} value={option.value}>
                                {option.label}
                            </option>
                        ))
                        : null;

                    return (
                        <div key={fieldId} className={cn('form-entry', fieldInfoClass)}>
                            <label htmlFor={labelFor} className="form-entry-label">{label}:</label>

                            <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                {React.createElement(elem, elemProps, elemChildren)}

                                {outputValue && <output>{outputValue}</output>}
                                
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
