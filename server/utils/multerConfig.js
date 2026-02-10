import multer from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { typeCheck } from './typeValidation.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { MULTER_MODE } = SERVER_CONSTANTS;

const getMulterErrorMap = (context) => ({
    LIMIT_UNEXPECTED_FILE: { // Возникает при превышении лимита количества файлов ОДНОГО ПОЛЯ
        type: 'unexpectedFile',
        message: `Получен неожиданный файл в поле ${context.field}`
    },
    LIMIT_FILE_COUNT: { // Возникает при превышении лимита общего количества файлов для ВСЕХ ПОЛЕЙ
        type: 'tooManyFiles',
        message: `Превышено общее допустимое количество файлов для всех полей (${context.filesLimit})`
    },
    LIMIT_FILE_SIZE: {
        type: 'fileTooLarge',
        message: `Один или несколько файлов слишком большие. Максимальный размер: ${context.maxSizeMB} МБ`
    },
    INVALID_FORMAT: {
        type: 'invalidMimeType',
        message: context.message
    }
});

const createMulterConfig = ({
    type,
    fields,
    filesLimit = 1,
    storageMode = MULTER_MODE.DISK,
    storagePath,
    allowedMimeTypes,
    maxSizeMB
}) => {
    // Проверки параметров
    const allowedConfigTypes = ['single', 'array', 'fields', 'any'];

    if (!allowedConfigTypes.includes(type)) {
        throw new TypeError(`type должен быть одним из: ${allowedConfigTypes.join(', ')}`);
    }

    switch (type) {
        case 'single':
            if (!typeCheck.string(fields)) {
                throw new TypeError('В параметре fields для типа "single" ожидается строка');
            }
            break;
    
        case 'array':
            if (
                !typeCheck.string(fields) &&
                !(
                    typeCheck.object(fields) &&
                    typeCheck.string(fields.name) &&
                    (
                        fields.maxCount !== undefined &&
                        Number.isInteger(Number(fields.maxCount)) &&
                        fields.maxCount >= 0
                    )
                )
            ) {
                throw new TypeError('В параметре fields для типа "array" ожидается строка или'
                    + ' объект со строковым полем name и опциональным числовым полем maxCount');
            }
            break;
    
        case 'fields':
            if (
                !typeCheck.array(fields) ||
                !fields.every(field =>
                    typeCheck.object(field) &&
                    typeCheck.string(field.name) &&
                    (
                        field.maxCount !== undefined &&
                        Number.isInteger(Number(field.maxCount)) &&
                        field.maxCount >= 0
                    )
                )
            ) {
                throw new TypeError('В параметре fields для типа "fields" ожидается массив объектов'
                    + ' { name, maxCount }, где name - строка, а опциональный maxCount - число');
            }
            break;
    
        case 'any':
            break;
    }

    if (
        filesLimit !== undefined &&
        (!Number.isInteger(Number(filesLimit)) || filesLimit < 0)
    ) {
        throw new TypeError('filesLimit должен быть натуральным числом или undefined');
    }

    if (![MULTER_MODE.DISK, MULTER_MODE.MEMORY].includes(storageMode)) {
        throw new TypeError('Некорректный storageMode');
    }

    if (storageMode === MULTER_MODE.DISK && (!typeCheck.string(storagePath) || storagePath.trim() === '')) {
        throw new TypeError('storagePath должен быть непустой строкой');
    }

    if (
        !Array.isArray(allowedMimeTypes) ||
        allowedMimeTypes.length === 0 ||
        allowedMimeTypes.some(t => typeof t !== 'string' || t.trim() === '')
    ) {
        throw new TypeError('allowedMimeTypes должен быть непустым массивом непустых строк');
    }

    if (!typeCheck.number(maxSizeMB) || maxSizeMB <= 0) {
        throw new TypeError('maxSizeMB должен быть конечным числом больше 0');
    }

    // Настройка хранения файла
    const storage = storageMode === MULTER_MODE.MEMORY
        ? multer.memoryStorage()
        : multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, storagePath);
            },
            filename: (req, file, cb) => {
                cb(null, `${randomUUID()}${extname(file.originalname)}`);
            }
        });

    // Фильтрация файлов
    const fileFilter = (req, file, cb) => {
        // Проверка формата файла
        const mimeSet = new Set(allowedMimeTypes);

        if (!mimeSet.has(file.mimetype)) {
            const error = new Error(`Недопустимый формат файла в поле ${file.fieldname}`);
            error.isMulterError = true;
            error.code = 'INVALID_FORMAT';
            error.field = file.fieldname;
            return cb(error, false);
        }
        
        cb(null, true);
    };

    // Ограничение размера и количества файлов
    const limits = {
        files: filesLimit, // Опционально
        fileSize: Math.floor(maxSizeMB * 1024 * 1024)
    };

    // Конфигурация Multer
    const multerConfig = multer({ storage, fileFilter, limits });

    // Определение типа загрузки файла(-ов)
    const multerUpload = (() => {
        switch (type) {
            case 'single': return multerConfig.single(fields);
            case 'array': return typeCheck.string(fields)
                ? multerConfig.array(fields)
                : multerConfig.array(fields.name, fields.maxCount);
            case 'fields': return multerConfig.fields(fields);
            default: return multerConfig.any();
        }
    })();

    // Обработчик ошибок Multer
    return (req, res, next) => {
        multerUpload(req, res, (err) => {
            if (err) {
                const isMulterError = err instanceof multer.MulterError || err.isMulterError;
                if (!isMulterError) return next(err);

                const field = err.field || 'globalFiles';
                const multerErrorMap = getMulterErrorMap({
                    field,
                    filesLimit,
                    maxSizeMB,
                    message: err.message
                });
                const errorSpec = err.code && multerErrorMap[err.code];
        
                if (errorSpec) {
                    req.fileUploadError = {
                        field,
                        type: errorSpec.type,
                        message: errorSpec.message
                    };
                }
        
                return next();
            }
        
            next();
        });
    };
};

export default createMulterConfig;



//Примеры конфигураций по типам:
//type: 'single', fields: 'avatar'
//type: 'array', fields: 'images'
//type: 'array', fields: { name: 'photos', maxCount: 5 }
//type: 'array', fields: { name: 'photos' } - Без ограничений на количество для поля
//type: 'fields', fields: [{ name: 'passport', maxCount: 2 }, { name: 'images' }]

//Тип загрузки:	    Где лежат файлы:
//single	        req.file (сразу данные файла)
//array	            req.files (массив файлов)
//fields	        req.files (объект, где каждое поле — массив файлов: req.files['fieldName'])
