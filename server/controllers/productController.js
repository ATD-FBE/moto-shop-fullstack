import Product from '../database/models/Product.js';
import Category from '../database/models/Category.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { storageService } from '../services/storage/storageService.js';
import {
    prepareProductData,
    cleanupBulkProductFiles,
    redistributeProductProportionallyInDraftOrders,
    buildProductsComputedFields,
    buildCategoriesPipeline
} from '../services/productService.js';
import {
    buildSearchMatch,
    buildFilterMatch,
    buildSortPipeline,
    buildPaginatedPipeline,
    buildOrderedFiltersPipeline
} from '../utils/aggregationBuilders.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { isArrayContentDifferent } from '../utils/compareUtils.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { ensureArray } from '../../shared/commonHelpers.js';
import { productsFilterOptions, productEditorFilterOptions } from '../../shared/filterOptions.js';
import { productsSortOptions, productEditorSortOptions } from '../../shared/sortOptions.js';
import { productsPageLimitOptions, productEditorPageLimitOptions } from '../../shared/pageLimitOptions.js';
import { DEFAULT_SEARCH_TYPE, PRODUCT_FILES_LIMIT, REQUEST_STATUS } from '../../shared/constants.js';

/// Загрузка ID всех отфильтрованных товаров и данных товаров для одной страницы ///
export const handleProductListRequest = async (req, res, next) => {
    const isAdmin = req.dbUser?.role === 'admin';
    const isEditor = req.query.context === 'catalogManagement';

    // Определение опций фильтрации
    const filterOptions = isAdmin && isEditor ? productEditorFilterOptions : productsFilterOptions;
    const sortOptions = isAdmin && isEditor ? productEditorSortOptions : productsSortOptions;
    const pageLimitOptions = isAdmin && isEditor ? productEditorPageLimitOptions : productsPageLimitOptions;

    // Создание вычисляемых полей для фильтра
    const computedFields = buildProductsComputedFields(req.query);

    // Настройка фильтра поиска
    const allowedSearchFields = ['sku', 'name', 'brand', 'tags'];
    const searchMatch = buildSearchMatch(req.query.search, allowedSearchFields, DEFAULT_SEARCH_TYPE);

    // Настройка фильтра по параметрам
    const filterMatch = buildFilterMatch(req.query, filterOptions);

    // Настройка фильтра категорий
    const categoriesPipeline = buildCategoriesPipeline(req.query.category);

    // Установка порядка всех фильтров в зависимости от типа поиска
    const allFiltersPipeline = buildOrderedFiltersPipeline({
        computedFields,
        searchMatch,
        filterMatch,
        extraFilters: categoriesPipeline
    });

    // Пайплайн вывода ID всех отфильтрованных результатов
    const filteredPipeline = [{ $project: { _id: 1 } }];

    // Пайплайн вывода результатов на странице
    const paginatedPipeline = buildPaginatedPipeline(req.query, sortOptions, pageLimitOptions);

    // Сборка пайплайна для агрегатора
    const pipeline = [
        ...allFiltersPipeline, // Фильтры
        {
            $facet: { // Сбор результатов
                filteredProductIdList: filteredPipeline,
                paginatedProductList: paginatedPipeline
            }
        }
    ];

    try {
        // Агрегатный запрос с информацией для отладки
        //const explainResult = await Product.aggregate(pipeline).explain('executionStats');
        //console.dir(explainResult.stages[0].$cursor, { depth: null });

        // Агрегатный запрос
        const aggregateResult = await Product.aggregate(pipeline);
        checkTimeout(req);
        
        const filteredProductIdList = aggregateResult[0]?.filteredProductIdList.map(c => c._id) || [];
        const dbPaginatedProductList = aggregateResult[0]?.paginatedProductList || [];

        const paginatedProductList = dbPaginatedProductList.map(product => prepareProductData(product, {
            managed: isAdmin,
            now: Date.now()
        }));

        safeSendResponse(req, res, 200, {
            message: 'Товары успешно загружены',
            ...(isAdmin && isEditor 
                ? { filteredProductIdList }
                : { productCount: filteredProductIdList.length }),
            paginatedProductList
        });
    } catch (err) {
        next(err);
    }
};

/// Загрузка данных товаров при поиске нужного товара ///
/*export const handleProductListSearchRequest = async (req, res, next) => {
    // Настройка фильтра поиска
    const allowedSearchFields = ['sku', 'name', 'brand', 'tags'];
    const searchMatch = buildSearchMatch(req.query.search, allowedSearchFields, DEFAULT_SEARCH_TYPE);

    // Настройка сортировки
    const sortField = productsSortOptions[0].dbField;
    const sortOrder = productsSortOptions[0].defaultOrder === 'asc' ? 1 : -1;

    // Пайплайн сортировки
    const sortPipeline = buildSortPipeline(sortField, sortOrder, productsSortOptions);

    // Пайплайн вывода ограниченных результатов
    const limitedPipeline = [...sortPipeline];

    limitedPipeline.push({ $limit: 15 }); // Количество выводимых результатов

    // Сборка пайплайна для агрегатора
    const pipeline = [
        { $match: searchMatch }, // Поиск
        {
            $facet: { // Сбор результатов
                totalCount: [{ $count: 'count' }],
                limitedProductList: limitedPipeline
            }
        }
    ];

    try {
        // Агрегатный запрос с информацией для отладки
        //const explainResult = await Product.aggregate(pipeline).explain('executionStats');
        //console.dir(explainResult.stages[0].$cursor, { depth: null });

        // Агрегатный запрос
        const aggregateResult = await Product.aggregate(pipeline);
        checkTimeout(req);
        
        const productCount = aggregateResult[0]?.totalCount[0]?.count || 0;
        const dbLimitedProductList = aggregateResult[0]?.limitedProductList || [];

        const limitedProductList = dbLimitedProductList.map(product => prepareProductData(product, {
            managed: isAdmin,
            now: Date.now()
        }));

        safeSendResponse(req, res, 200, {
            message: 'Товары успешно загружены',
            limitedProductList,
            productCount
        });
    } catch (err) {
        next(err);
    }
};*/

/// Загрузка отдельного товара на его странице ///
export const handleProductRequest = async (req, res, next) => {
    const isAdmin = req.dbUser?.role === 'admin';
    const productId = req.params.productId;

    if (!typeCheck.objectId(productId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: productId' });
    }

    try {
        const dbProduct = await Product.findById(productId).lean();
        checkTimeout(req);

        if (!dbProduct) {
            return safeSendResponse(req, res, 404, { message: `Товар (ID: ${productId}) не найден` });
        }

        safeSendResponse(req, res, 200, {
            message: 'Товар успешно загружен',
            product: prepareProductData(dbProduct, { managed: isAdmin })
        });
    } catch (err) {
        next(err);
    }
};

/// Создание товара ///
export const handleProductCreateRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const userId = req.dbUser._id;
    const { files: images, fileUploadError } = req; // Проверено в multer
    const {
        mainImageIndex, sku, name, brand, description,
        stock, unit, price, discount, category, tags, isActive
    } = req.body ?? {};
    
    // Предварительная проверка формата данных
    const inputTypeMap = {
        images: { value: images, type: 'array', form: true },
        mainImageIndex: { value: mainImageIndex, type: 'number', optional: true },
        sku: { value: sku, type: 'string', optional: true, form: true },
        name: { value: name, type: 'string', form: true },
        brand: { value: brand, type: 'string', optional: true, form: true },
        description: { value: description, type: 'string', optional: true, form: true },
        stock: { value: stock, type: 'number', form: true },
        unit: { value: unit, type: 'string', form: true },
        price: { value: price, type: 'number', form: true },
        discount: { value: discount, type: 'number', form: true },
        category: { value: category, type: 'objectId', form: true },
        tags: { value: tags, type: 'string', optional: true, form: true },
        isActive: { value: isActive, type: 'boolean', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'product');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка индекса фотографий
    const mainImageIndexNum = Number(mainImageIndex);

    if (mainImageIndex !== undefined &&  (!Number.isInteger(mainImageIndexNum) || mainImageIndexNum < 0)) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: mainImageIndex' });
    }

    // Проверка на согласованность индекса и количества фотографий
    const noImages = images.length === 0;
    const indexOutOfRange = mainImageIndexNum >= images.length;

    if (
        (images.length > 0 && mainImageIndex === undefined) ||
        (!fileUploadError && mainImageIndex !== undefined && (noImages || indexOutOfRange))
    ) {
        return safeSendResponse(req, res, 400, { message: 'Несогласованные данные для фотографий товара' });
    }
    
    let newProductId;

    try {
        const { newDbProduct } = await runInTransaction(async (session) => {
            // Проверка на существование категории товара
            const dbCategory = await Category.findById(category).session(session);
            checkTimeout(req);
                
            if (!dbCategory) {
                throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
            }

            // Проверка того, что категория товара не имеет подкатегорий
            const hasSubcategories = await Category.exists({ parent: category }).session(session);
            checkTimeout(req);

            if (hasSubcategories) {
                throw createAppError(
                    400,
                    `Категория "${dbCategory.name}" не является конечной и не может содержать товар`
                );
            }

            // Подготовка данных
            const prepDbFields = {
                imageFilenames: images.map(img => img.filename),
                mainImageIndex: mainImageIndex === undefined ? null : mainImageIndexNum,
                sku: sku?.trim() || null,
                name: name.trim(),
                brand: brand?.trim() || null,
                description: description?.trim() || null,
                stock: Number(stock),
                reserved: 0,
                unit,
                price: Number(price),
                discount: Number(discount),
                category,
                tags: [...new Set(tags?.split(',').map(tag => tag.trim()).filter(Boolean) ?? [])],
                isActive: isActive === 'true'
            };

            // Предварительное создание документа для валидации до сохранения
            const newProductDoc = new Product(prepDbFields);

            // Инвалидация полей
            if (fileUploadError) {// Отметка поля фотографий невалидным при ошибке в multer
                const { field, type, message } = fileUploadError; // field = 'images' - поле из формы
                newProductDoc.invalidate(field, message);
            }
            if (!Number.isInteger(prepDbFields.stock)) {
                newProductDoc.invalidate('stock');
            }

            // Предварительная валидация до работы с файловой системой
            await newProductDoc.validate();
            checkTimeout(req);

            // Перенос файлов фотографий в хранилище файлов товара и создание иконок
            if (images.length > 0) {
                newProductId = newProductDoc._id.toString(); // ID создался при валидации
                await storageService.saveProductImages(newProductId, images, req);
                checkTimeout(req);
            }

            // Добавление лога создания и сохранение документа товара
            newProductDoc.createdBy = userId;
            const newDbProduct = await newProductDoc.save({ session });
            checkTimeout(req);

            return { newDbProduct };
        });

        // Отправка успешного ответа клиенту
        safeSendResponse(req, res, 201, {
            message: `Товар "${newDbProduct.name}" успешно создан`,
            newProduct: prepareProductData(newDbProduct, { managed: true })
        });
    } catch (err) {
        // Очистка файлов фотографий товара в хранилище (безопасно)
        if (images.length > 0) {
            storageService.deleteTempFiles(images, reqCtx);
            storageService.cleanupProductFiles(newProductId, reqCtx);
        }

        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'product');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение товара ///
export const handleProductUpdateRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const userId = req.dbUser._id;
    const productId = req.params.productId;
    const imageFilenamesToDelete = ensureArray(req.body?.imageFilenamesToDelete);
    const { files: images, fileUploadError } = req; // Проверено в multer
    const {
        mainImageIndex, sku, name, brand, description,
        stock, unit, price, discount, category, tags, isActive
    } = req.body ?? {};
    
    // Предварительная проверка формата данных
    const inputTypeMap = {
        productId: { value: productId, type: 'objectId' },
        imageFilenamesToDelete: { value: imageFilenamesToDelete, type: 'arrayOf', elemType: 'string' },
        images: { value: images, type: 'array', form: true },
        mainImageIndex: { value: mainImageIndex, type: 'number', optional: true },
        sku: { value: sku, type: 'string', optional: true, form: true },
        name: { value: name, type: 'string', form: true },
        brand: { value: brand, type: 'string', optional: true, form: true },
        description: { value: description, type: 'string', optional: true, form: true },
        stock: { value: stock, type: 'number', form: true },
        unit: { value: unit, type: 'string', form: true },
        price: { value: price, type: 'number', form: true },
        discount: { value: discount, type: 'number', form: true },
        category: { value: category, type: 'objectId', form: true },
        tags: { value: tags, type: 'string', optional: true, form: true },
        isActive: { value: isActive, type: 'boolean', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'product');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка индекса фотографий
    const mainImageIndexNum = Number(mainImageIndex);

    if (mainImageIndex !== undefined && (!Number.isInteger(mainImageIndexNum) || mainImageIndexNum < 0)) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: mainImageIndex' });
    }

    const newImageFilenames = images.map(img => img.filename);
    let rollbackCleanupFiles = false;

    try {
        const transactionResult = await runInTransaction(async (session) => {
            // Проверка на существование изменяемого товара
            const dbProduct = await Product.findById(productId).session(session);
            checkTimeout(req);

            const prodLbl = dbProduct ? `"${dbProduct.name}"` : `(ID: ${productId})`;
                
            if (!dbProduct) {
                throw createAppError(404, `Товар ${prodLbl} не найден`);
            }

            const oldImageFilenames = dbProduct.imageFilenames;
            rollbackCleanupFiles = !oldImageFilenames.length;

            // Проверки новой катагории товара
            if (category !== dbProduct.category.toString()) {
                // Проверка на существование категории товара
                const dbCategory = await Category.findById(category).session(session);
                checkTimeout(req);
                            
                if (!dbCategory) {
                    throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
                }

                // Проверка того, что категория товара не имеет подкатегорий
                const hasSubcategories = await Category.exists({ parent: category }).session(session);
                checkTimeout(req);

                if (hasSubcategories) {
                    throw createAppError(
                        400,
                        `Категория "${dbCategory.name}" не является конечной и не может содержать товар`
                    );
                }
            }

            // Фильтрация существующих имён файлов фотографий для удаления и их апдейт
            const actualImgFilenamesToDelete = imageFilenamesToDelete
                .filter(filename => oldImageFilenames.includes(filename));
            const imgFilenamesToDeleteSet = new Set(actualImgFilenamesToDelete);
            const preparedImgFilenames = oldImageFilenames
                .filter(filename => !imgFilenamesToDeleteSet.has(filename))
                .concat(newImageFilenames);

            // Проверка на согласованность индекса и изменённого количества фотографий
            const noImages = preparedImgFilenames.length === 0;
            const indexOutOfRange = mainImageIndexNum >= preparedImgFilenames.length;

            if (
                (preparedImgFilenames.length > 0 && mainImageIndex === undefined) ||
                (!fileUploadError && mainImageIndex !== undefined && (noImages || indexOutOfRange))
            ) {
                throw createAppError(400, `Несогласованные данные для фотографий товара ${prodLbl}`);
            }

            // Подготовка данных
            const newStock = Number(stock);
            const hasRestock = newStock > dbProduct.stock;
            const hasReservedOverflow = newStock < dbProduct.reserved;

            const prepDbFields = {
                mainImageIndex: mainImageIndex === undefined ? null : mainImageIndexNum,
                sku: sku?.trim() || null,
                name: name.trim(),
                brand: brand?.trim() || null,
                description: description?.trim() || null,
                stock: newStock,
                reserved: Math.min(newStock, dbProduct.reserved),
                ...(hasRestock && { lastRestockAt: new Date() }),
                unit,
                price: Number(price),
                discount: Number(discount),
                category,
                isActive: isActive === 'true'
            };

            const preparedTags = [...new Set(tags?.split(',').map(tag => tag.trim()).filter(Boolean) ?? [])];

            // Проверка на изменение и установка в документ массивов фотографий и тегов
            const modifiableArrayFields = [
                ['imageFilenames', preparedImgFilenames],
                ['tags', preparedTags]
            ];

            modifiableArrayFields.forEach(([field, newArray]) => {
                const oldArray = dbProduct[field];
                const isFieldChanged = isArrayContentDifferent(oldArray, newArray);

                if (isFieldChanged) {
                    dbProduct[field] = newArray;
                    dbProduct.markModified(field);
                }
            });

            // Установка полей без массивов
            dbProduct.set(prepDbFields);

            // Проверка изменений. При fileUploadError данные могут совпасть
            if (!dbProduct.isModified() && !fileUploadError) {
                throw createAppError(204);
            }

            // Инвалидация полей
            if (fileUploadError) { // Отметка поля фотографий невалидным при ошибке в multer
                const { field, type, message } = fileUploadError; // field = 'images' - поле из формы
                dbProduct.invalidate(field, message);
            }
            if (preparedImgFilenames.length > PRODUCT_FILES_LIMIT) {
                dbProduct.invalidate('images'); // Превышение лимита общего количества фотографий
            }
            if (!Number.isInteger(prepDbFields.stock)) {
                dbProduct.invalidate('stock');
            }

            // Предварительная валидация до работы с файловой системой
            // Массивы исключены, так как проверены ранее отдельно
            await dbProduct.validate({ pathsToSkip: ['imageFilenames', 'tags'] });
            checkTimeout(req);

            // Перенос новых фотографий в хранилище файлов товара
            if (images.length > 0) {
                await storageService.saveProductImages(productId, images, req);
                checkTimeout(req);
            }

            // Добавление лога редактирования и сохранение в базе MongoDB с валидацией полей
            dbProduct.updatedBy = userId;
            const updatedDbProduct = await dbProduct.save({ session });
            checkTimeout(req);

            // Пропорциональное распределение зарезервированных товаров среди клиентов, оформляющих заказ
            if (hasReservedOverflow) {
                await redistributeProductProportionallyInDraftOrders(productId, newStock, session);
                checkTimeout(req);
            }

            // Подготовка данных для удаления файлов
            const postUpdateFileCleanup = actualImgFilenamesToDelete.length > 0
                ? {
                    filenames: actualImgFilenamesToDelete,
                    fullCleanup: preparedImgFilenames.length === 0
                }
                : null;

            return { prodLbl, updatedDbProduct, postUpdateFileCleanup };
        });

        const { prodLbl, updatedDbProduct, postUpdateFileCleanup } = transactionResult;

        // Отправка успешного ответа клиенту
        safeSendResponse(req, res, 200, {
            message: `Товар "${prodLbl}" успешно обновлён`,
            updatedProduct: prepareProductData(updatedDbProduct, { managed: true })
        });

        // Удаление выбранных файлов старых фотографий товара (безопасно)
        if (postUpdateFileCleanup) {
            if (postUpdateFileCleanup.fullCleanup) {
                storageService.cleanupProductFiles(productId, reqCtx);
            } else {
                storageService.deleteProductImages(productId, postUpdateFileCleanup.filenames, reqCtx);
            }
        }
    } catch (err) {
        // Очистка новых файлов фотографий товара (безопасно)
        if (images.length > 0) {
           storageService.deleteTempFiles(images, reqCtx);

            if (rollbackCleanupFiles) {
                storageService.cleanupProductFiles(productId, reqCtx);
            } else {
                storageService.deleteProductImages(productId, newImageFilenames, reqCtx);
            }
        }

        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'product');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение группы товаров ///
export const handleBulkProductUpdateRequest = async (req, res, next) => {
    const userId = req.dbUser._id;
    const { productIds, formFields } = req.body ?? {};
    const { brand, unit, discount, category, tags, isActive } = formFields ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        productIds: { value: productIds, type: 'arrayOf', elemType: 'objectId' },
        formFields: { value: formFields, type: 'object' },
        brand: { value: brand, type: 'string', optional: true, form: true },
        unit: { value: unit, type: 'string', optional: true, form: true },
        discount: { value: discount, type: 'number', optional: true, form: true },
        category: { value: category, type: 'objectId', optional: true, form: true },
        tags: { value: tags, type: 'string', optional: true, form: true },
        isActive: { value: isActive, type: 'boolean', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'product');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка выбранных товаров для апдейта
    const uniqueProductIds = [...new Set(productIds)];
    const total = uniqueProductIds.length;

    if (!total) {
        return safeSendResponse(req, res, 400, 'Товары для изменения не выбраны', {
            reason: REQUEST_STATUS.NO_SELECTION
        });
    }
    
    // Проверка выбранных полей для апдейта
    const noFormUpdates = Object.values(inputTypeMap)
        .filter(({ form }) => form)
        .every(({ value }) => value === undefined);

    if (noFormUpdates) {
        return safeSendResponse(req, res, 204);
    }

    try {
        const { statusCode, responseData } = await runInTransaction(async (session) => {
            // Обработка категории
            if (category !== undefined) {
                // Проверка на существование категории товара
                const dbCategory = await Category.findById(category).session(session);
                checkTimeout(req);
                            
                if (!dbCategory) {
                    throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
                }

                // Проверка того, что категория товара не имеет подкатегорий
                const hasSubcategories = await Category.exists({ parent: category }).session(session);
                checkTimeout(req);

                if (hasSubcategories) {
                    throw createAppError(
                        400,
                        `Категория "${dbCategory.name}" не является конечной и не может содержать товар`
                    );
                }
            }

            // Подготовка данных
            const updateDoc = { $set: {}, $unset: {} };

            if (brand !== undefined) {
                const trimmedBrand = brand.trim();

                if (trimmedBrand) {
                    updateDoc.$set.brand = trimmedBrand;
                } else {
                    updateDoc.$unset.brand = 1;
                }
            }

            if (unit !== undefined) updateDoc.$set.unit = unit;
            if (discount !== undefined) updateDoc.$set.discount = Number(discount);
            if (category !== undefined) updateDoc.$set.category = category;
            if (tags !== undefined) {
                updateDoc.$set.tags = [...new Set(tags.split(',').map(t => t.trim()).filter(Boolean))];
            }
            if (isActive !== undefined) updateDoc.$set.isActive = isActive;

            updateDoc.$set.updatedBy = userId;
        
            // Сохранение в базе MongoDB с валидацией полей
            const updateResult = await Product.updateMany(
                { _id: { $in: uniqueProductIds } },
                updateDoc,
                { session, runValidators: true } // Валидация изменяемых полей на каждом документе вкл.
            );
            checkTimeout(req);

            const { matchedCount, modifiedCount } = updateResult;

            // Отправка ответов клиенту
            if (matchedCount === 0) {
                return { statusCode: 404, responseData: { message: 'Ни один товар не найден' } };
            }
            if (modifiedCount === 0) { // Не срабатывает из-за изменения updatedAt
                return { statusCode: 204 };
            }

            // Сбор данных по всем обновлённым документам
            const dbUpdatedProducts = await Product
                .find({ _id: { $in: uniqueProductIds } })
                .lean()
                .session(session);
            checkTimeout(req);

            const now = Date.now();
            const updatedProducts = dbUpdatedProducts.map(product => prepareProductData(product, {
                managed: true,
                now
            }));

            if (matchedCount < total) {
                return {
                    statusCode: 207,
                    responseData: {
                        message: `Товары частично обновлены: ${modifiedCount} из ${total}`,
                        updatedProducts
                    }
                };
            }

            return {
                statusCode: 200,
                responseData: {
                    message: 'Все выбранные товары успешно обновлены',
                    updatedProducts
                }
            };
        });

        safeSendResponse(req, res, statusCode, responseData);
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'product');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Удаление товара ///
export const handleProductDeleteRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;
    const productId = req.params.productId;

    if (!typeCheck.objectId(productId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: productId' });
    }

    try {
        const dbProduct = await runInTransaction(async (session) => {
            // Поиск и удаление документа в базе MongoDB
            const dbProduct = await Product.findByIdAndDelete(productId).session(session);
            checkTimeout(req);

            if (!dbProduct) {
                throw createAppError(404, `Товар (ID: ${productId}) не найден`);
            }

            return dbProduct;
        });

        safeSendResponse(req, res, 200, { message: `Товар "${dbProduct.name}" успешно удалён` });

        // Удаление файлов фотографий товара, если они были (безопасно)
        storageService.cleanupProductFiles(productId, reqCtx);
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Удаление группы товаров ///
export const handleBulkProductDeleteRequest = async (req, res, next) => {
    const reqCtx = req.reqCtx;

    // Предварительная проверка формата данных
    const { productIds } = req.body ?? {};

    if (!typeCheck.arrayOf(productIds, 'objectId', typeCheck) ) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: productIds' });
    }

    const uniqueProductIds = [...new Set(productIds)];
    const total = uniqueProductIds.length;

    if (!total) {
        return safeSendResponse(req, res, 400, {
            message: 'Товары для удаления не выбраны',
            reason: REQUEST_STATUS.NO_SELECTION
        });
    }

    try {
        const { statusCode, responseData } = await runInTransaction(async (session) => {
            // Поиск и сбор ID удаляемых товаров
            const existingProductDocs = await Product
                .find({ _id: { $in: uniqueProductIds } }, '_id')
                .session(session);
            checkTimeout(req);

            if (!existingProductDocs.length) {
                throw createAppError(404, 'Ни один товар не найден');
            }

            // Поиск по ID и удаление документов в базе MongoDB
            const existingProductIds = existingProductDocs.map(doc => doc._id.toString());
            const deletionResult = await Product
                .deleteMany({ _id: { $in: existingProductIds } })
                .session(session);
            checkTimeout(req);

            // Подготовка успешных ответов
            const { deletedCount } = deletionResult;

            if (deletedCount < total) {
                return {
                    statusCode: 207,
                    responseData: { message: `Товары частично удалены: ${deletedCount} из ${total}` }
                };
            }

            return {
                statusCode: 200,
                responseData: { message: 'Все товары успешно удалены' }
            };
        });

        safeSendResponse(req, res, statusCode, responseData);

        // Удаление файлов фотографий товара, если они были (безопасно)
        cleanupBulkProductFiles(uniqueProductIds, reqCtx);
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));

            // Удаление файлов фотографий товара, если они были (безопасно)
            if (err.statusCode === 404) cleanupBulkProductFiles(uniqueProductIds, reqCtx);

            return;
        }

        next(err);
    }
};
