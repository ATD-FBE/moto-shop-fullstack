import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import ImageUploader from '@/components/common/ImageUploader.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import FormFooter from '@/components/common/FormFooter.jsx';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';
import { openImageViewerModal } from '@/services/modalImageViewerService.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { sendProductCreateRequest, sendProductUpdateRequest } from '@/api/productRequests.js';
import { toKebabCase, formatProductTitle, getFieldInfoClass } from '@/helpers/textHelpers.js';
import moveKeyToEndInFormData from '@/helpers/moveKeyToEndInFormData.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { validationRules, fieldErrorMessages } from '@shared/validation.js';
import {
    ALLOWED_IMAGE_MIME_TYPES,
    PRODUCT_FILES_LIMIT,
    MAX_PRODUCT_IMAGE_SIZE_MB
} from '@shared/constants.js';
import { PRODUCT_UNITS, CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

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
            mainMessage: 'Исходный товар или связанный с ним ресурс не найден.'
        },
        [UNCHANGED]: { ...base[UNCHANGED], addMessage: 'Товар не изменён.', submitBtnLabel: actionLabel },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: isEditMode ? 'Товар обновлён.' : 'Новый товар добавлен!',
            addMessage: 'Список товаров будет обновлён.',
            submitBtnLabel: 'Выполнено'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const getFieldConfigs = (isEditMode, product, allowedCategories) => {
    const initCategory = product && allowedCategories.find(cat => cat.id === product.category);

    const fieldConfigs = [
        {
            name: 'images',
            label: 'Фотографии (опционально)',
            elem: 'input',
            type: 'file',
            files: [],
            multiple: true,
            accept: ALLOWED_IMAGE_MIME_TYPES.join(', '),
            filesLimit: PRODUCT_FILES_LIMIT,
            allowedTypes: ALLOWED_IMAGE_MIME_TYPES,
            maxSizeMB: MAX_PRODUCT_IMAGE_SIZE_MB,
            optional: true
        },
        {
            name: 'sku',
            label: 'Артикул (опционально)',
            elem: 'input',
            type: 'text',
            placeholder: isEditMode ? 'Укажите новый артикул' : 'Укажите артикул товара',
            value: product?.sku ?? '',
            autoComplete: 'off',
            trim: true,
            optional: true,
            allowEmpty: true
        },
        {
            name: 'name',
            label: 'Наименование',
            elem: 'input',
            type: 'text',
            placeholder: isEditMode ? 'Укажите новое наименование' : 'Укажите наименование товара',
            value: product?.name ?? '',
            trim: true,
            autoComplete: 'off'
        },
        {
            name: 'brand',
            label: 'Бренд (опционально)',
            elem: 'input',
            type: 'text',
            placeholder: isEditMode ? 'Укажите новый бренд' : 'Укажите бренд товара',
            value: product?.brand ?? '',
            autoComplete: 'off',
            trim: true,
            optional: true,
            allowEmpty: true
        },
        {
            name: 'description',
            label: 'Описание (опционально)',
            elem: 'textarea',
            placeholder: isEditMode ? 'Введите новое описание' : 'Введите описание товара',
            value: product?.description ?? '',
            autoComplete: 'off',
            trim: true,
            optional: true,
            allowEmpty: true
        },
        {
            name: 'stock',
            label: 'Количество на складе',
            elem: 'input',
            type: 'number',
            step: 1,
            min: 0,
            value: product?.stock ?? 0
        },
        {
            name: 'unit',
            label: 'Единица измерения',
            elem: 'select',
            options: PRODUCT_UNITS.map(unit => ({ value: unit, label: unit })),
            value: product?.unit ?? PRODUCT_UNITS[0]
        },
        {
            name: 'price',
            label: 'Цена (руб.)',
            elem: 'input',
            type: 'number',
            step: 0.01,
            min: 0,
            value: product?.price ?? 0
        },
        {
            name: 'discount',
            label: 'Уценка (%)',
            elem: 'input',
            type: 'number',
            step: 0.5,
            min: 0,
            max: 100,
            value: product?.discount ?? 0
        },
        {
            name: 'category',
            label: 'Категория товаров',
            elem: 'select',
            options: allowedCategories.map(cat => ({ value: cat.id, label: cat.name })),
            value: initCategory?.id ?? (allowedCategories[0]?.id || '')
        },
        {
            name: 'tags',
            label: 'Теги (через запятую, опционально)',
            elem: 'input',
            type: 'text',
            placeholder: isEditMode ? 'Укажите новые теги' : 'Укажите теги',
            value: product?.tags ?? '',
            autoComplete: 'off',
            trim: true,
            optional: true,
            allowEmpty: true
        },
        {
            name: 'isActive',
            label: 'Активность',
            elem: 'checkbox',
            checkboxLabel: 'Доступен для продажи',
            value: product?.isActive ?? true
        }
    ];

    const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
        acc[config.name] = config;
        return acc;
    }, {});

    return { fieldConfigs, fieldConfigMap };
};

const initFieldsStateReducer = (fieldConfigs) =>
    fieldConfigs.reduce((acc, { name, type, files, value }) => {
        acc[name] = {
            ...(type === 'file' ? { files } : { value }),
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

        case 'RESET':
            return payload;

        default:
            return state;
    }
};

const prepareExistingImages = ({
    images = [],
    title = '',
    mainImageIndex = 0,
}) => {
    return images.map((img, idx) => ({
        type: 'existing',
        filename: img.filename,
        previewUrl: img.thumbnails.small,
        originalUrl: img.original,
        title,
        main: idx === mainImageIndex,
        markedForDeletion: false
    }));
};

const prepareNewImages = ({
    files,
    currentImages = [],
    title = '',
}) => {
    const hasMainImage = currentImages.some(img => img.main);

    return Array.from(files).map((file, idx) => {
        const objectUrl = URL.createObjectURL(file);
    
        return {
            type: 'new',
            previewUrl: objectUrl,
            originalUrl: objectUrl,
            file,
            title,
            main: !hasMainImage && idx === 0,
            markedForDeletion: false,
            invalid: false
        };
    });
};

export default function ProductForm({ uiBlocked, product, allowedCategories, onSubmit }) {
    const isEditMode = Boolean(product);
    const title = formatProductTitle(product?.name, product?.brand); // Если product нет, вернёт ''

    const { submitStates, lockedStatuses } = useMemo(() => getSubmitStates(isEditMode), [isEditMode]);
    const { fieldConfigs, fieldConfigMap } = useMemo(
        () => getFieldConfigs(isEditMode, product, allowedCategories),
        [isEditMode, product, allowedCategories]
    );
    
    const [fieldsState, dispatchFieldsState] = useReducer(
        fieldsStateReducer,
        fieldConfigs,
        initFieldsStateReducer
    );
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);
    const [images, setImages, imagesRef] = useSyncedStateWithRef(() => prepareExistingImages({
        images: product?.images,
        title,
        mainImageIndex: product?.mainImageIndex
    }));
    const imagesFileInputRef = useRef(null);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const isFormLocked = lockedStatuses.has(submitStatus) || uiBlocked;

    const setNewImages = (files) => {
        const newImages = prepareNewImages({
            files,
            currentImages: images,
            title: title || 'Фото нового товара'
        });

        setImages(prevImages => [...prevImages, ...newImages]);

        // Очистка файлов в инпуте
        if (imagesFileInputRef.current) {
            imagesFileInputRef.current.value = '';
        }
    };

    const handleThumbImageClick = (idx) => {
        openImageViewerModal({
            images: images.map(img => ({ url: img.originalUrl, title: img.title })),
            initialIndex: idx
        });
    };

    const setMainImage = (targetIdx) => {
        setImages(prevImages => prevImages.map((img, idx) => ({ ...img, main: idx === targetIdx })));
    };

    const toggleImageDeletion = (targetIdx) => {
        setImages(prevImages => {
            const newImages = [...prevImages];
            const targetImage = newImages[targetIdx];
    
            const isDeleting = !targetImage.markedForDeletion;
            const isMain = targetImage.main;
            const isInvalid = targetImage.invalid;

            // Смена флага удаления
            targetImage.markedForDeletion = isDeleting;
            
            if (isDeleting) {
                // При удалении главной картинки - установить главной первую неудалённую
                if (isMain) {
                    targetImage.main = false;

                    const newMainImage = newImages.find(img => !img.markedForDeletion && !img.invalid);
                    if (newMainImage) newMainImage.main = true;
                }

                // Очистка при удалении сообщения об ошибке поля
                if (isInvalid) {
                    const hasActiveInvalidNewImages = newImages
                        .some(img => img.invalid && !img.markedForDeletion);

                    if (!hasActiveInvalidNewImages) {
                        dispatchFieldsState({
                            type: 'UPDATE',
                            payload: { images: { uiStatus: '', error: '' } }
                        });
                    }
                }
            } else {
                // При отмене удаления и отсутствии главной картинки - установить как главную
                const hasMainImage = newImages.some(img => img.main);
                if (!hasMainImage && !targetImage.invalid) targetImage.main = true;
            }
    
            return newImages;
        });
    };

    const flagInvalidNewImages = (invalidNewImages) => {
        setImages(prevImages => {
            // Установка флага для всех невалидных картинок и снятие с них флага главной
            const newImages = prevImages.map(img => ({
                ...img,
                ...(invalidNewImages.has(img.previewUrl) && { invalid: true, main: false })
            }));

            // Проверка, был снят флаг главной картинки с одной из невалидных
            const hasMainImage = newImages.some(img => img.main);

            // Установка новой главной картинки, если таковой не нашлось
            if (!hasMainImage) {
                const newMainImage = newImages.find(img => !img.markedForDeletion && !img.invalid);
                if (newMainImage) newMainImage.main = true;
            }

            return newImages;
        });
    };

    const handleFilesDrop = (files) => {
        setNewImages(files);
    };

    const handleFieldChange = (e) => {
        const { name, type, files, value, checked } = e.target;
        let processedValue;
        
        if (type === 'number' && value !== '') {
            processedValue = Number(value.replace(',', '.'))
        } else if (type === 'checkbox') {
            processedValue = checked;
        } else if (type !== 'files') {
            processedValue = value;
        }

        if (name === 'images' && files.length) {
            setNewImages(files);
        }

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: {
                ...(type === 'file' ? { files } : { value: processedValue }),
                ...(name !== 'images' && { uiStatus: '', error: '' })
            } }
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

    const revokeNewImageObjectUrls = (images) => {
        (images ?? []).forEach(img => {
            if (img.type === 'new') {
                URL.revokeObjectURL(img.previewUrl); // Для originalUrl такой же ObjectURL
            }
        });
    };
    
    const areGenericFieldValuesEqual = (a, b) => {
        if (
            (a === undefined || a === null || a === '') &&
            (b === undefined || b === null || b === '')
        ) return true;
    
        const bothAreNumericLike = !isNaN(a) && !isNaN(b);
    
        if (bothAreNumericLike) {
            return Number(a) === Number(b);
        }
    
        return String(a) === String(b);
    };

    const processImagesField = (config, validation, invalidNewImages) => {
        const { filesLimit, allowedTypes, maxSizeMB, optional } = config;
        const activeImages = images.filter(img => !img.markedForDeletion);

        if (activeImages.length > filesLimit) {
            return { isValid: false };
        }

        const newImages = activeImages.filter(img => img.type === 'new');
        const newImageFiles = [];
    
        newImages.forEach(img => {
            const isValid = validation(img.file, allowedTypes, maxSizeMB);
    
            if (isValid) {
                newImageFiles.push(img.file);
            } else {
                invalidNewImages.add(img.previewUrl);
            }
        });
    
        if (invalidNewImages.size || (!newImageFiles.length && !optional)) {
            return { isValid: false };
        }
    
        const existingImageFilenamesToDelete = images
            .filter(img => img.type === 'existing' && img.markedForDeletion)
            .map(img => img.filename);

        const mainImageIndex = activeImages.findIndex(img => img.main);

        const fieldEntries = [
            ...existingImageFilenamesToDelete.map(url => ['imageFilenamesToDelete', url]),
            ...newImageFiles.map(file => ['images', file])
        ];
        if (mainImageIndex !== -1) {
            fieldEntries.push(['mainImageIndex', mainImageIndex]);
        }

        const initMainImageIndex = product?.mainImageIndex;
        const isValueChanged = Boolean(
            newImages.length ||
            existingImageFilenamesToDelete.length ||
            (typeof initMainImageIndex !== 'number' && mainImageIndex !== -1) ||
            (typeof initMainImageIndex === 'number' && mainImageIndex !== initMainImageIndex)
        );
    
        return { isValid: true, fieldStateValue: { files: [] }, fieldEntries, isValueChanged };
    };

    const processGenericField = (config, validation, value) => {
        const { name, trim, optional, allowEmpty } = config;
        const initValue = product?.[name];
        const normalizedValue = trim ? value.trim() : value;
        const fieldStateValue = { value: normalizedValue };
        const ruleCheck =
            typeof validation === 'function'
                ? validation(normalizedValue)
                : validation.test(normalizedValue);
    
        const hasValue = !optional || normalizedValue !== ''; // Все опциональные поля текстовые
        const isValid = (!hasValue && allowEmpty) || ruleCheck;
        const fieldEntries = hasValue && isValid ? [[name, normalizedValue]] : [];
        const isValueChanged = !areGenericFieldValuesEqual(normalizedValue, initValue);
    
        return { isValid, fieldStateValue, fieldEntries, isValueChanged };
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const config = fieldConfigMap[name];
                const validation = validationRules.product[name];

                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                // Валидация значений полей, формирование данных на отправку и проверка на изменение
                const processFieldResult = name === 'images'
                    ? processImagesField(config, validation, acc.invalidNewImages)
                    : processGenericField(config, validation, value);

                const { isValid, fieldStateValue, fieldEntries, isValueChanged } = processFieldResult;
    
                // Сбор данных для обновления состояния поля
                acc.fieldStateUpdates[name] = {
                    ...fieldStateValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.product[name]?.default || fieldErrorMessages.DEFAULT
                };

                if (isValid) {
                    // Сбор данных для отправки
                    fieldEntries.forEach(([key, val]) => {
                        acc.formData.append(key, val);
                    });
                        
                    // Запоминание изменённого поля
                    if (isValueChanged) acc.changedFields.push(name);
                } else {
                    acc.allValid = false;
                }
    
                return acc;
            },
            {
                allValid: true,
                invalidNewImages: new Set(),
                fieldStateUpdates: {},
                formData: new FormData(),
                changedFields: []
            }
        );

        return {
            ...result,
            formData: moveKeyToEndInFormData(result.formData, 'images'), // Размещение images в конце
        };
    };
    
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        const {
            allValid,
            invalidNewImages,
            fieldStateUpdates,
            formData,
            changedFields
        } = processFormFields();

        if (invalidNewImages.size) flagInvalidNewImages(invalidNewImages);
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
                ? sendProductUpdateRequest(product.id, formData)
                : sendProductCreateRequest(formData);
            const responseData = await dispatch(requestThunk);
            if (isUnmountedRef.current) return;

            const { status, message, fieldErrors, newProduct, updatedProduct } = responseData;
            const LOG_CTX = `PRODUCT: ${isEditMode ? 'UPDATE SINGLE' : 'CREATE'}`;

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

                    await new Promise(resolve => setTimeout(() => {
                        if (isUnmountedRef.current) return;

                        // Очистка состояния фотографий
                        revokeNewImageObjectUrls(imagesRef.current);
                        setImages([]);

                        // Очистка всех полей формы в режиме создания
                        // (при редактировании компонент формы размонтируется из-за обновления таблицы)
                        if (!isEditMode) {
                            dispatchFieldsState({
                                type: 'RESET',
                                payload: initFieldsStateReducer(fieldConfigs)
                            });
                        }

                        setSubmitStatus(FORM_STATUS.DEFAULT);
                        dispatch(setIsNavigationBlocked(false));
                        resolve();
                    }, SUCCESS_DELAY));

                    const affected = isEditMode ? updatedProduct : newProduct;
                    return { status, affectedProducts: affected ? [affected] : [] };
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
            revokeNewImageObjectUrls(imagesRef.current);
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
        <form className="product-form" onSubmit={handleFormSubmit} noValidate>
            <header className="form-header">
                <h2>{isEditMode ? 'Редактирование товара' : 'Создание нового товара'}</h2>
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
                    const fieldId = `product-${isEditMode ? product.id : 'create'}-${toKebabCase(name)}`;
                    const isImages = name === 'images';
                    
                    const elemProps = {
                        id: fieldId,
                        name,
                        ref: isImages ? imagesFileInputRef : undefined,
                        type,
                        placeholder,
                        value: fieldsState[name]?.value,
                        min,
                        max,
                        step,
                        multiple,
                        accept,
                        autoComplete,
                        style: isImages ? { display: 'none' } : undefined,
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
                            <label htmlFor={fieldId} className="form-entry-label">{label}:</label>

                            <div className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                {fieldElem}

                                {isImages && (
                                    <ImageUploader
                                        images={images}
                                        onZoom={handleThumbImageClick}
                                        onMainSelect={setMainImage}
                                        onDeleteToggle={toggleImageDeletion}
                                        fileInputRef={imagesFileInputRef}
                                        onFilesDropped={handleFilesDrop}
                                        uiBlocked={isFormLocked}
                                    />
                                )}
                                
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
