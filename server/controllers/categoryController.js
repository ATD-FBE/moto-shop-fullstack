import mongoose from 'mongoose';
import Category from '../database/models/Category.js';
import Product from '../database/models/Product.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { UNSORTED_CATEGORY_SLUG } from '../../shared/constants.js';

/// Загрузка всех категорий ///
export const handleCategoryListRequest = async (req, res, next) => {
    try {
        const dbCategoryList = await Category.find().select('-__v').lean();
        checkTimeout(req);

        const categoryList = dbCategoryList.map(({ _id, ...rest }) => ({ id: _id, ...rest }));

        safeSendResponse(res, 200, { message: 'Категории товаров успешно загружены', categoryList });
    } catch (err) {
        next(err);
    }
};

/// Создание категории ///
export const handleCategoryCreateRequest = async (req, res, next) => {
    const { name, slug, order, parent } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        name: { value: name, type: 'string', form: true },
        slug: { value: slug, type: 'string', form: true },
        order: { value: order, type: 'number', form: true },
        parent: { value: parent, type: 'nullableObjectId', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'category');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка числовых полей
    const orderNum = Number(order);

    if (!Number.isInteger(orderNum) || orderNum < 0) {
        return safeSendResponse(res, 400, { message: 'Некорректное значение поля: order' });
    }

    try {
        const { newCategory, movedProductCount } = await runInTransaction(async (session) => {
            // Проверка родительской категории
            if (parent !== null) {
                const dbParentCategory = await Category.findById(parent).session(session);
                checkTimeout(req);

                if (!dbParentCategory) {
                    throw createAppError(404, `Родительская категория товаров (ID: ${parent}) отсутствует`);
                }
                if (dbParentCategory.restricted) {
                    throw createAppError(
                        400,
                        `В категории товаров "${dbParentCategory.name}" нельзя создавать подкатегории`
                    );
                }
            }

            // Корректировка порядковых номеров создаваемой категории и её соседей (индексация от 0)
            const neighborCount = await Category.countDocuments({ parent }).session(session);
            checkTimeout(req);

            const correctedOrder = Math.min(Math.max(0, orderNum), neighborCount);

            if (neighborCount && correctedOrder < neighborCount) {
                await Category.updateMany(
                    { parent, order: { $gte: correctedOrder } }, // Поиск док-та с номером >= correctedOrder
                    { $inc: { order: 1 } }, // Инкремент поля order у найденных документов на 1
                    { session }
                );
                checkTimeout(req);
            }

            // Создание категории с корректированным номером
            const [createdCategory] = await Category.create(
                [
                    {
                        name: name.trim(),
                        slug: slug.trim().toLowerCase(),
                        order: correctedOrder,
                        parent
                    }
                ],
                { session }
            );
            checkTimeout(req);

            // Перемещение товаров родительской категории, если она была листовой
            const unsortedCategory = await Category.findOne({ slug: UNSORTED_CATEGORY_SLUG }).session(session);
            checkTimeout(req);

            if (!unsortedCategory) {
                throw createAppError(
                    500,
                    `Корневая категория с URL "${UNSORTED_CATEGORY_SLUG}" отсутствует в базе данных`
                );
            }

            const productsMovedResult = await Product.updateMany(
                { category: parent },
                { category: unsortedCategory._id },
                { session }
            );
            checkTimeout(req);

            return {
                newCategory: createdCategory,
                movedProductCount: productsMovedResult.modifiedCount
            };
        });

        // Транзакция успешно завершена - ответ клиенту об успехе
        safeSendResponse(res, 201, {
            message: `Категория товаров "${newCategory.name}" успешно создана`,
            newCategoryId: newCategory._id,
            movedProductCount
        });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'category');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение категории ///
export const handleCategoryUpdateRequest = async (req, res, next) => {
    const categoryId = req.params.categoryId;
    const { name, slug, order, parent } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        categoryId: { value: categoryId, type: 'objectId' },
        name: { value: name, type: 'string', form: true },
        slug: { value: slug, type: 'string', form: true },
        order: { value: order, type: 'number', form: true },
        parent: { value: parent, type: 'nullableObjectId', form: true },
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'category');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка числовых полей
    const orderNum = Number(order);

    if (!Number.isInteger(orderNum) || orderNum < 0) {
        return safeSendResponse(res, 400, { message: 'Некорректное значение поля: order' });
    }

    // Проверка отличия родителя от самой категории
    if (parent === categoryId) {
        return safeSendResponse(res, 400, {
            message: 'Категория товаров не может быть родителем самой себя'
        });
    }

    try {
        const { dbCategory, movedProductCount } = await runInTransaction(async (session) => {
            // Проверка существования изменяемой категории
            const dbCategory = await Category.findById(categoryId).session(session);
            checkTimeout(req);
            
            if (!dbCategory) {
                throw createAppError(404, `Категория товаров (ID: ${categoryId}) не найдена`);
            }

            const currentParent = dbCategory.parent?.toString() ?? null; // Строка ID или null
            const currentOrder = dbCategory.order; // Число
            let correctedOrder = orderNum;

            // Проверка родительской категории, если это не корень
            if (parent !== null) {
                const dbParentCategory = await Category.findById(parent).session(session);
                checkTimeout(req);

                if (!dbParentCategory) {
                    throw createAppError(404, `Родительская категория товаров (ID: ${parent}) отсутствует`);
                }
                
                // Родительская категория меняется
                if (parent !== currentParent) {
                    // Проверка ограничений новой родительской категории
                    if (dbParentCategory.restricted) {
                        throw createAppError(
                            400,
                            `Категория товаров "${dbParentCategory.name}" не может иметь подкатегории`
                        );
                    }
                    
                    // Поиск новой родительской категории среди потомков изменяемой
                    const isDescendant = await Category.aggregate([
                        // Нахождение нового родителя (один документ в результате агрегатного запроса)
                        { $match: { _id: mongoose.Types.ObjectId.createFromHexString(parent) } },

                        // Поиск вверх по дереву от нового родителя по id и сбор всех его предков в массив
                        {
                            $graphLookup: {
                                from: 'categories', // Имя коллекции, где осуществляется поиск
                                startWith: '$parent', // Начало поиска со значения поля parent нового родителя
                                connectFromField: 'parent', // Продолжение с поля parent найденных категорий
                                connectToField: '_id', // Поле parent сопоставляется с _id других категорий
                                as: 'ancestors' // Документы найденных предков помещаются в массив ancestors,
                            }                   // который создаётся в документе результата агрегаии
                        },

                        // Фильтрация массива результатов агрегатного запроса (содержит только нового родителя)
                        { $match: { 'ancestors._id': mongoose.Types.ObjectId.createFromHexString(categoryId) } }
                    ]).session(session);
                    checkTimeout(req);
                      
                    if (isDescendant.length) {
                        throw createAppError(400, 'Категория товаров не может быть вложена в своего потомка');
                    }
                }
            }

            // Корректировка порядковых номеров изменяемой категории и её соседей (индексация от 0)
            if (parent !== currentParent) { // Категория перемещается, номер влияет на старых и новых соседей
                // Попытка перемещения защищённой категории
                if (dbCategory.restricted) {
                    throw createAppError(400, `Категорию товаров "${dbCategory.name}" нельзя перемещать`);
                }

                // Сдвиг номера у старых соседей
                await Category.updateMany(
                    { parent: currentParent, order: { $gt: currentOrder } },
                    { $inc: { order: -1 } },
                    { session }
                );
                checkTimeout(req);

                // Сдвиг номера у новых соседей
                const neighborCount = await Category.countDocuments({ parent }).session(session);
                checkTimeout(req);

                correctedOrder = Math.min(Math.max(0, orderNum), neighborCount);

                if (neighborCount && correctedOrder < neighborCount) {
                    await Category.updateMany(
                        { parent, order: { $gte: correctedOrder } },
                        { $inc: { order: 1 } },
                        { session }
                    );
                    checkTimeout(req);
                }
            } else if (orderNum !== currentOrder) { // Категория остаётся на месте, но её номер меняется
                const neighborCount = await Category.countDocuments({ parent }).session(session);
                checkTimeout(req);

                correctedOrder = Math.min(Math.max(0, orderNum), neighborCount - 1);

                const rangeFilter = correctedOrder < currentOrder
                    ? { $gte: correctedOrder, $lt: currentOrder }
                    : { $gt: currentOrder, $lte: correctedOrder };
                const increment = correctedOrder < currentOrder ? 1 : -1;

                await Category.updateMany(
                    { parent, order: rangeFilter },
                    { $inc: { order: increment } },
                    { session }
                );
                checkTimeout(req);
            }

            // Установка новых данных и проверка их изменений
            dbCategory.set({
                name: name.trim(),
                slug: slug.trim().toLowerCase(),
                order: correctedOrder,
                parent
            });

            if (!dbCategory.isModified()) {
                throw createAppError(204);
            }
            
            // Сохранение в базе MongoDB
            await dbCategory.save({ session });
            checkTimeout(req);

            // Перемещение товаров новой родительской категории, если она была листовой
            let movedProductCount = 0;

            if (parent !== currentParent) {
                const unsortedCategory = await Category.findOne({ slug: UNSORTED_CATEGORY_SLUG }).session(session);
                checkTimeout(req);

                if (!unsortedCategory) {
                    throw createAppError(
                        500,
                        `Корневая категория с URL "${UNSORTED_CATEGORY_SLUG}" отсутствует в базе данных`
                    );
                }
    
                const productsMovedResult = await Product.updateMany(
                    { category: parent },
                    { category: unsortedCategory._id },
                    { session }
                );
                checkTimeout(req);

                movedProductCount = productsMovedResult.modifiedCount;
            }

            return { dbCategory, movedProductCount };
        });

        // Транзакция успешно завершена - ответ клиенту об успехе
        safeSendResponse(res, 200, {
            message: `Категория товаров "${dbCategory.name}" успешно изменена`,
            movedProductCount
        });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(res, err.statusCode, prepareAppErrorData(err));
        }
        
        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'category');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Удаление категории ///
export const handleCategoryDeleteRequest = async (req, res, next) => {
    const categoryId = req.params.categoryId;

    if (!typeCheck.objectId(categoryId)) {
        return safeSendResponse(res, 400, { message: 'Неверный формат данных: categoryId' });
    }

    // Удаление документа в базе MongoDB с использованием транзакции
    // (удаляются все дочерние подкатегории, задеваются номера соседних с удаляемой категорий,
    // все товары удаляемой и дочерних подкатегорий переносятся в корневую категорию c URL "unsorted")
    try {
        const transactionResult = await runInTransaction(async (session) => {
            // Поиск удаляемой категории и всех её потомков
            const categoryObjectId = mongoose.Types.ObjectId.createFromHexString(categoryId);

            const aggregateResult = await Category.aggregate([
                // Нахождение удаляемой категории (один документ в результате агрегатного запроса)
                { $match: { _id: categoryObjectId } },

                // Поиск вниз по дереву от удаляемой категории по id и сбор всех её потомков в массив
                {
                    $graphLookup: {
                        from: 'categories', // Имя коллекции, где осуществляется поиск
                        startWith: '$_id', // Начало поиска со значения поля _id удаляемой категории
                        connectFromField: '_id', // Продолжение с поля _id найденных категорий
                        connectToField: 'parent', // Поле _id сопоставляется с полем parent других категорий
                        as: 'descendants' // Документы найденных потомков помещаются в массив descendants,
                    }                     // который создаётся в документе результата агрегатного запроса
                }
            ]).session(session);
            checkTimeout(req);

            // Проверка существования изменяемой категории
            const dbCategory = aggregateResult[0];
            const descendantCategories = dbCategory?.descendants || [];

            if (!dbCategory) {
                throw createAppError(404, `Категория товаров (ID: ${categoryId}) не найдена`);
            }
            if (dbCategory.restricted) {
                throw createAppError(400, `Категорию товаров "${dbCategory.name}" нельзя удалять`);
            }

            // Сдвиг номера у соседей
            const parent = dbCategory.parent ?? null; // ObjectId или null
            const order = dbCategory.order; // Число

            await Category.updateMany(
                { parent, order: { $gt: order } },
                { $inc: { order: -1 } },
                { session }
            );
            checkTimeout(req);

            // Удаление категории и всех её потомков
            const deletingCategoryIds = [categoryObjectId, ...descendantCategories.map(d => d._id)];

            const deleteResult = await Category.deleteMany(
                { _id: { $in: deletingCategoryIds } },
                { session }
            );
            checkTimeout(req);

            if (deleteResult.deletedCount !== deletingCategoryIds.length) {
                throw createAppError(
                    500,
                    'Удалено не всё дерево категорий. Возможна рассинхронизация данных.'
                );
            }

            // Перемещение товаров удалённых категорий в категорию неотсортированных товаров
            const unsortedCategory = await Category.findOne({ slug: UNSORTED_CATEGORY_SLUG }).session(session);
            checkTimeout(req);

            if (!unsortedCategory) {
                throw createAppError(
                    500,
                    `Корневая категория с URL "${UNSORTED_CATEGORY_SLUG}" отсутствует в базе данных`
                );
            }

            const productsMovedResult = await Product.updateMany(
                { category: { $in: deletingCategoryIds } },
                { category: unsortedCategory._id },
                { session }
            );
            checkTimeout(req);

            return {
                dbCategory,
                descendantCategories,
                movedProductCount: productsMovedResult.modifiedCount
            };
        });

        const { dbCategory, descendantCategories, movedProductCount } = transactionResult;

        // Транзакция успешно завершена - ответ клиенту об успехе
        const message = `Категория товаров "${dbCategory.name}" успешно удалена` +
            (descendantCategories.length
                ? ` вместе со всеми её подкатегориями (${descendantCategories.length}): "` +
                    descendantCategories.map(d => d.name).join('", "') + '"'
                : '');

        safeSendResponse(res, 200, { message, movedProductCount });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};
