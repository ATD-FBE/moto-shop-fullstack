import Promo from '../database/models/Promo.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { preparePromoData } from '../services/promoService.js';
import { storageService } from '../services/storage/storageService.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { PROMO_ANNOUNCE_OFFSET_DAYS } from '../../shared/constants.js';

/// Загрузка всех акций ///
export const handlePromoListRequest = async (req, res, next) => {
    const isAdmin = req.dbUser?.role === 'admin';
    const selectedDbFields = '_id title imageFilename description startDate endDate' +
        (isAdmin ? ' createdBy createdAt updateHistory' : '');
    const sortRules = isAdmin ? { createdAt: -1 } : { startDate: -1 };

    try {
        let findRules = {};

        if (!isAdmin) {
            const timestamp = Number(req.query.timestamp);
            const timeZoneOffset = parseInt(req.query.timeZoneOffset, 10) || 0;
            const clientDateTimeUTC = new Date(timestamp - timeZoneOffset * 60 * 1000);

            if (isNaN(clientDateTimeUTC.getTime())) {
                return safeSendResponse(req, res, 400, { message: 'Неверный формат даты' });
            }

            const announceStart = new Date(clientDateTimeUTC);
            announceStart.setDate(announceStart.getDate() + PROMO_ANNOUNCE_OFFSET_DAYS);

            findRules = {
                startDate: { $lte: announceStart },
                endDate: { $gte: clientDateTimeUTC }
            };
        }

        let dbPromoQuery = Promo.find(findRules) // Поиск акций
            .sort(sortRules) // Сортировка от новой акции к старой
            .select(selectedDbFields); // Выборка только нужных полей

        if (isAdmin) { // Заполнение полей с именами пользователей по ссылкам на их _id в коллекции users
            dbPromoQuery = dbPromoQuery
                .populate('createdBy', 'name')
                .populate('updateHistory.updatedBy', 'name');
        }

        const dbPromoList = await dbPromoQuery.lean(); // Преобразование в обычный JS-объект
        checkTimeout(req);

        const promoList = dbPromoList.map(promo => preparePromoData(promo, { managed: isAdmin }));

        safeSendResponse(req, res, 200, { message: 'Акции успешно загружены', promoList });
    } catch (err) {
        next(err);
    }
};

/// Загрузка отдельной акции для редактирования ///
export const handlePromoRequest = async (req, res, next) => {
    const promoId = req.params.promoId;

    if (!typeCheck.objectId(promoId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: promoId' });
    }

    try {
        const dbPromo = await Promo.findById(promoId)
            .select('title imageFilename description startDate endDate')
            .lean();
        checkTimeout(req);

        if (!dbPromo) {
            return safeSendResponse(req, res, 404, { message: `Акция (ID: ${promoId}) не найдена` });
        }

        safeSendResponse(req, res, 200, {
            message: `Акция "${dbPromo.title}" успешно загружена`,
            promo: preparePromoData(dbPromo)
        });
    } catch (err) {
        next(err);
    }
};

/// Создание акции ///
export const handlePromoCreateRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const userId = req.dbUser._id;
    const { file: image, fileUploadError } = req; // Проверено в multer
    const { title, description, startDate, endDate } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        image: { value: image, type: 'object', optional: true, form: true },
        title: { value: title, type: 'string', form: true },
        description: { value: description, type: 'string', form: true },
        startDate: { value: startDate, type: 'date', form: true },
        endDate: { value: endDate, type: 'date', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'promotion');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    let newPromoId = null;

    // Создание документа в базе MongoDB
    try {
        const { promoLbl } = await runInTransaction(async (session) => {
            // Подготовка данных
            const prepDbFields = {
                title: title.trim(),
                imageFilename: image?.filename,
                description: description.trim()
            };

            const startDateUTC = new Date(startDate);
            startDateUTC.setUTCHours(0, 0, 0, 0); // Возвращает таймстемп, startDateUTC остаётся объектом
            prepDbFields.startDate = startDateUTC;

            const endDateUTC = new Date(endDate);
            endDateUTC.setUTCHours(23, 59, 59, 999); // Возвращает таймстемп, endDateUTC остаётся объектом
            prepDbFields.endDate = endDateUTC;

            // Предварительное создание документа для валидации до сохранения
            const newPromoDoc = new Promo(prepDbFields);

            // Отметка поля фотографий невалидным при ошибке в multer
            if (fileUploadError) {
                const { field, type, message } = fileUploadError; // field = 'image' - поле из формы
                newPromoDoc.invalidate(field, message);
            }

            // Отметка поля даты окончания акции невалидным, если оно раньше даты старта
            if (endDateUTC < startDateUTC) {
                newPromoDoc.invalidate('endDate', 'rangeError');
            }

            // Предварительная валидация до работы с файловой системой
            await newPromoDoc.validate();
            checkTimeout(req);

            // Сохранение картинки акции в хранилище файлов и добавление URL картинки в БД
            if (image) {
                newPromoId = newPromoDoc._id.toString(); // ID создался при валидации
                await storageService.savePromoImage(newPromoId, image);
                checkTimeout(req);
            }

            // Добавление лога создания и сохранение в базе MongoDB
            newPromoDoc.createdBy = userId;
            const newDbPromo = await newPromoDoc.save({ session });
            checkTimeout(req);

            return { promoLbl: `"${newDbPromo.title}"` };
        });

        // Отправка успешного ответа клиенту
        safeSendResponse(req, res, 201, { message: `Акция ${promoLbl} успешно создана` });
    } catch (err) {
        // Очистка файла картинки акции в хранилище (безопасно)
        if (image) {
            storageService.deleteTempFiles(image, reqCtx);
            storageService.cleanupPromoFiles(newPromoId, reqCtx);
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'promotion');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение акции ///
export const handlePromoUpdateRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const userId = req.dbUser._id;
    const promoId = req.params.promoId;
    const { file: image, fileUploadError } = req; // Проверено в multer
    const { title, description, startDate, endDate, removeImage } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        promoId: { value: promoId, type: 'objectId' },
        image: { value: image, type: 'object', optional: true, form: true },
        title: { value: title, type: 'string', form: true },
        description: { value: description, type: 'string', form: true },
        startDate: { value: startDate, type: 'date', form: true },
        endDate: { value: endDate, type: 'date', form: true },
        removeImage: { value: removeImage, type: 'boolean', optional: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'promotion');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const shouldRemoveImage = removeImage === 'true';
    const newImageFilename = image?.filename;
    let rollbackCleanupFiles = false;

    // Апдейт документа в базе MongoDB
    try {
        const { promoLbl, postUpdateFileCleanup } = await runInTransaction(async (session) => {
            // Проверка на существование изменяемой акции
            const dbPromo = await Promo.findById(promoId).session(session);
            checkTimeout(req);

            const promoLbl = dbPromo ? `"${dbPromo.title}"` : `(ID: ${promoId})`;
            
            if (!dbPromo) {
                throw createAppError(404, `Акция ${promoLbl} не найдена`);
            }

            const oldImageFilename = dbPromo.imageFilename;
            const hasImage = Boolean(oldImageFilename);
            rollbackCleanupFiles = !hasImage;
        
            // Проверка на согласованность флага удаления старого файла картинки и нового файла
            if (
                (hasImage && image && !shouldRemoveImage) ||
                (shouldRemoveImage && !hasImage)
            ) {
                throw createAppError(400, `Несогласованные данные для изображения акции ${promoLbl}`);
            }

            // Подготовка данных
            const prepDbFields = {
                title: title.trim(),
                description: description.trim()
            };

            dbPromo.imageFilename = hasImage
                ? shouldRemoveImage ? newImageFilename : oldImageFilename
                : newImageFilename;

            const startDateUTC = new Date(startDate);
            startDateUTC.setUTCHours(0, 0, 0, 0); // Возвращает таймстемп, startDateUTC остаётся объектом
            prepDbFields.startDate = startDateUTC;

            const endDateUTC = new Date(endDate);
            endDateUTC.setUTCHours(23, 59, 59, 999); // Возвращает таймстемп, endDateUTC остаётся объектом
            prepDbFields.endDate = endDateUTC;

            // Установка новых данных и проверка их изменений
            dbPromo.set(prepDbFields);
            
            // isModified() проверяет только новые данные. При fileUploadError данные могут совпасть
            if (!dbPromo.isModified() && !fileUploadError) {
                throw createAppError(204);
            }

            // Отметка поля фотографий невалидным при ошибке в multer
            if (fileUploadError) {
                const { field, message } = fileUploadError; // field = 'image' - поле из формы
                dbPromo.invalidate(field, message);
            }

            // Отметка поля даты окончания акции невалидным, если оно раньше даты старта
            if (endDateUTC < startDateUTC) {
                dbPromo.invalidate('endDate', 'rangeError');
            }

            // Предварительная валидация до работы с файловой системой
            await dbPromo.validate();
            checkTimeout(req);

            // Сохранение нового файла картинки в хранилище файлов, если есть
            if (image) {
                await storageService.savePromoImage(promoId, image);
                checkTimeout(req);
            }
            
            // Добавление лога редактирования и сохранение в базе MongoDB
            dbPromo.updateHistory.push({ updatedBy: userId, updatedAt: new Date() });
            await dbPromo.save({ session });
            checkTimeout(req);

            // Подготовка данных для удаления файлов
            const postUpdateFileCleanup = shouldRemoveImage
                ? {
                    filename: oldImageFilename,
                    fullCleanup: !image
                }
                : null;

            return { promoLbl, postUpdateFileCleanup };
        });

        // Отправка успешного ответа клиенту
        safeSendResponse(req, res, 200, { message: `Акция "${promoLbl}" успешно изменена` });

        // Удаление старого файла картинки или папки файлов акции (безопасно)
        if (postUpdateFileCleanup) {
            if (postUpdateFileCleanup.fullCleanup) {
                storageService.cleanupPromoFiles(promoId, reqCtx);
            } else {
                storageService.deletePromoImage(promoId, postUpdateFileCleanup.filename, reqCtx);
            }
        }
    } catch (err) {
        // Очистка нового файла картинки акции (безопасно)
        if (image) {
            storageService.deleteTempFiles(image, reqCtx);

            if (rollbackCleanupFiles) {
                storageService.cleanupPromoFiles(promoId, reqCtx);
            } else {
                storageService.deletePromoImage(promoId, newImageFilename, reqCtx);
            }
        }

        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'promotion');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Удаление акции ///
export const handlePromoDeleteRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const promoId = req.params.promoId;

    if (!typeCheck.objectId(promoId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: promoId' });
    }

    try {
        const { promoLbl } = await runInTransaction(async (session) => {
            const dbPromo = await Promo.findByIdAndDelete(promoId).session(session);
            checkTimeout(req);

            const promoLbl = dbPromo ? `"${dbPromo.title}"` : `(ID: ${promoId})`;

            if (!dbPromo) {
                throw createAppError(404, `Акция (ID: ${promoId}) не найдена`);
            }

            return { promoLbl };
        });

        safeSendResponse(req, res, 200, { message: `Акция ${promoLbl} успешно удалена` });
        storageService.cleanupPromoFiles(promoId, reqCtx);
    } catch (err) {
        if (err.isAppError) {
            safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
            if (err.statusCode === 404) storageService.cleanupPromoFiles(promoId, reqCtx);
            return;
        }

        next(err);
    }
};
