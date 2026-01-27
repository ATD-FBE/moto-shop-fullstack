import { promises as fsp } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import Product from '../database/models/Product.js';
import Category from '../database/models/Category.js';
import { productsFilterOptions, productEditorFilterOptions } from '../../shared/filterOptions.js';
import { productsSortOptions, productEditorSortOptions } from '../../shared/sortOptions.js';
import { productsPageLimitOptions, productEditorPageLimitOptions } from '../../shared/pageLimitOptions.js';
import {
    DEFAULT_SEARCH_TYPE,
    PRODUCT_THUMBNAIL_PRESETS,
    PRODUCT_FILES_LIMIT
} from '../../shared/constants.js';
import { PRODUCT_STORAGE_PATH, ORIGINALS_FOLDER, THUMBNAILS_FOLDER } from '../config/paths.js';
import {
    prepareProductData,
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
import { runInTransaction } from '../utils/transaction.js';
import { isArrayContentDifferent } from '../utils/compareUtils.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import { cleanupFiles, cleanupFolder } from '../utils/fsUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { ensureArray } from '../../shared/commonHelpers.js';
import { REQUEST_STATUS } from '../../shared/constants.js';

sharp.cache(false); // Отменить кэширование оригинальных файлов картинок, чтобы они удалялись при ошибке

const productThumbnailSizes = Object.values(PRODUCT_THUMBNAIL_PRESETS);

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
        
        const filteredProductIdList = aggregateResult[0]?.filteredProductIdList.map(c => c._id) || [];
        const dbPaginatedProductList = aggregateResult[0]?.paginatedProductList || [];

        const now = Date.now();
        const paginatedProductList = dbPaginatedProductList.map(product => prepareProductData(product, {
            managed: isAdmin,
            now
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
        
        const productCount = aggregateResult[0]?.totalCount[0]?.count || 0;
        let limitedProductList = aggregateResult[0]?.limitedProductList || [];

        const now = Date.now();
        limitedProductList = limitedProductList.map(product => prepareProductData(product, {
            managed: isAdmin,
            now
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
    const userId = req.dbUser._id;
    const { files: images, fileUploadError } = req; // Проверено в multer
    const {
        mainImageIndex, sku, name, brand, description,
        stock, unit, price, discount, category, tags, isActive
    } = req.body ?? {};
    
    let productFilesDir;

    try {
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
            throw createAppError(400, `Неверный формат данных: ${invalidInputKeys.join(', ')}`);
        }
        if (Object.keys(fieldErrors).length > 0) {
            throw createAppError(422, 'Неверный формат данных', { fieldErrors });
        }

        // Проверка индекса фотографий
        const mainImageIndexNum = Number(mainImageIndex);

        if (
            mainImageIndex !== undefined &&
            (!Number.isInteger(mainImageIndexNum) || mainImageIndexNum < 0)
        ) {
            throw createAppError(400, 'Некорректное значение поля: mainImageIndex');
        }

        // Проверка на согласованность индекса и количества фотографий
        const noImagesLeft = images.length === 0;
        const indexOutOfRange = mainImageIndexNum >= images.length;

        if (
            (images.length > 0 && mainImageIndex === undefined) ||
            (!fileUploadError && mainImageIndex !== undefined && (noImagesLeft || indexOutOfRange))
        ) {
            throw createAppError(400, 'Несогласованные данные для фотографий товара');
        }

        // Проверка на существование категории товара
        const dbCategory = await Category.findById(category);
            
        if (!dbCategory) {
            throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
        }

        // Проверка того, что категория товара не имеет подкатегорий
        const hasSubcategories = await Category.exists({ parent: category });

        if (hasSubcategories) {
            throw createAppError(
                400,
                `Категория "${dbCategory.name}" не является конечной и не может содержать товар`
            );
        }

        // Подготовка данных
        const prepDbFields = {
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
        await newProductDoc.validate({ pathsToSkip: ['imageFilenames'] });

        // Перенос файлов фотографий в папку файлов товара и создание иконок
        if (images.length > 0) {
            // Создание папок для хранения фотографий товаров
            const newProductId = newProductDoc._id.toString(); // ID создался при валидации
            productFilesDir = join(PRODUCT_STORAGE_PATH, newProductId);
            await fsp.mkdir(productFilesDir, { recursive: true });
    
            const originalsDir = join(productFilesDir, ORIGINALS_FOLDER);
            await fsp.mkdir(originalsDir, { recursive: true });
    
            const thumbnailsDir = join(productFilesDir, THUMBNAILS_FOLDER);
    
            for (const size of productThumbnailSizes) {
                const thumbImgDir = join(thumbnailsDir, `${size}px`);
                await fsp.mkdir(thumbImgDir, { recursive: true });
            }

            const imageFilenames = [];

            for (const img of images) {
                const origImagePath = join(originalsDir, img.filename);
                await fsp.rename(img.path, origImagePath);

                for (const size of productThumbnailSizes) {
                    const thumbImagePath = join(thumbnailsDir, `${size}px`, img.filename);
            
                    await sharp(origImagePath)
                        .resize(size, size, { fit: 'inside' }) // Сохранение пропорций со стороной size
                        .toFile(thumbImagePath);
                }
    
                imageFilenames.push(img.filename);
            }
    
            newProductDoc.imageFilenames = imageFilenames;
        }

        // Добавление лога создания и сохранение документа товара
        newProductDoc.createdBy = userId;
        await newProductDoc.save();

        // Отправка успешного ответа клиенту

        safeSendResponse(req, res, 201, {
            message: `Товар "${newProductDoc.name}" успешно создан`,
            newProduct: prepareProductData(newProductDoc, { managed: true })
        });
    } catch (err) {
        // Очистка файлов фотографий и папки файлов товара (безопасно)
        if (images.length > 0) {
            await cleanupFiles(images.map(img => img.path), req);
            await cleanupFolder(productFilesDir, req);
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
    const userId = req.dbUser._id;
    const productId = req.params.productId;
    const imageFilenamesToDelete = ensureArray(req.body?.imageFilenamesToDelete);
    const { files: images, fileUploadError } = req; // Проверено в multer
    const {
        mainImageIndex, sku, name, brand, description,
        stock, unit, price, discount, category, tags, isActive
    } = req.body ?? {};

    const newImagePaths = [];
    let currentImageFilenames, productFilesDir;

    try {
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
            throw createAppError(400, `Неверный формат данных: ${invalidInputKeys.join(', ')}`);
        }
        if (Object.keys(fieldErrors).length > 0) {
            throw createAppError(422, 'Неверный формат данных', { fieldErrors });
        }

        // Проверка индекса фотографий
        const mainImageIndexNum = Number(mainImageIndex);

        if (
            mainImageIndex !== undefined &&
            (!Number.isInteger(mainImageIndexNum) || mainImageIndexNum < 0)
        ) {
            throw createAppError(400, 'Некорректное значение поля: mainImageIndex');
        }

        // Транзакция MongoDB
        const updatedDbProduct = await runInTransaction(async (session) => {
            // Проверка на существование изменяемого товара
            const dbProduct = await Product.findById(productId).session(session);
                
            if (!dbProduct) {
                throw createAppError(404, `Товар (ID: ${productId}) не найден`);
            }

            // Проверки новой катагории товара
            if (category !== dbProduct.category.toString()) {
                // Проверка на существование категории товара
                const dbCategory = await Category.findById(category).session(session);
                            
                if (!dbCategory) {
                    throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
                }

                // Проверка того, что категория товара не имеет подкатегорий
                const hasSubcategories = await Category.exists({ parent: category }).session(session);

                if (hasSubcategories) {
                    throw createAppError(
                        400,
                        `Категория "${dbCategory.name}" не является конечной и не может содержать товар`
                    );
                }
            }

            // Фильтрация существующих имён файлов фотографий для удаления и их апдейт
            currentImageFilenames = dbProduct.imageFilenames;
            const actualImageFilenamesToDelete = imageFilenamesToDelete
                .filter(filename => currentImageFilenames.includes(filename));
            const imageFilenamesToDeleteSet = new Set(actualImageFilenamesToDelete);
            const newImageFilenames = images.map(img => img.filename);
            const preparedImageFilenames = currentImageFilenames
                .filter(filename => !imageFilenamesToDeleteSet.has(filename))
                .concat(newImageFilenames);

            // Проверка на согласованность индекса и изменённого количества фотографий
            const noImagesLeft = preparedImageFilenames.length === 0;
            const indexOutOfRange = mainImageIndexNum >= preparedImageFilenames.length;

            if (
                (preparedImageFilenames.length > 0 && mainImageIndex === undefined) ||
                (!fileUploadError && mainImageIndex !== undefined && (noImagesLeft || indexOutOfRange))
            ) {
                throw createAppError(400, 'Несогласованные данные для фотографий товара');
            }

            // Проверка на изменение массивов фотографий и тегов
            const preparedTags = [...new Set(tags?.split(',').map(tag => tag.trim()).filter(Boolean) ?? [])];

            const modifiableArrayFields = [
                ['imageFilenames', preparedImageFilenames],
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

            // Установка новых данных (без массивов) и проверка их изменений
            dbProduct.set(prepDbFields);

            // isModified() проверяет только новые данные. При fileUploadError данные могут совпасть
            if (!dbProduct.isModified() && !fileUploadError) {
                throw createAppError(204);
            }

            // Инвалидация полей
            if (fileUploadError) { // Отметка поля фотографий невалидным при ошибке в multer
                const { field, type, message } = fileUploadError; // field = 'images' - поле из формы
                dbProduct.invalidate(field, message);
            }
            if (preparedImageFilenames.length > PRODUCT_FILES_LIMIT) {
                dbProduct.invalidate('images'); // Превышение лимита общего количества фотографий
            }
            if (!Number.isInteger(prepDbFields.stock)) {
                dbProduct.invalidate('stock');
            }

            // Предварительная валидация до работы с файловой системой
            await dbProduct.validate({ pathsToSkip: ['imageFilenames', 'tags'] });

            // Перенос новых фотографий в папку файлов товара
            productFilesDir = join(PRODUCT_STORAGE_PATH, productId);
            const originalsDir = join(productFilesDir, ORIGINALS_FOLDER);
            const thumbnailsDir = join(productFilesDir, THUMBNAILS_FOLDER);

            if (images.length > 0) {
                if (!currentImageFilenames.length) {
                    await fsp.mkdir(productFilesDir, { recursive: true });
                    await fsp.mkdir(originalsDir, { recursive: true });
    
                    for (const size of productThumbnailSizes) {
                        const thumbImgDir = join(thumbnailsDir, `${size}px`);
                        await fsp.mkdir(thumbImgDir, { recursive: true });
                    }
                }

                for (const img of images) {
                    const origImagePath = join(originalsDir, img.filename);
                    await fsp.rename(img.path, origImagePath);
                    newImagePaths.push(origImagePath);

                    for (const size of productThumbnailSizes) {
                        const thumbImagePath = join(thumbnailsDir, `${size}px`, img.filename);
                
                        await sharp(origImagePath)
                            .resize(size, size, { fit: 'inside' }) // Сохранение пропорций со стороной size
                            .toFile(thumbImagePath);
                        newImagePaths.push(thumbImagePath);
                    }
                }
            }

            // Добавление лога редактирования и сохранение в базе MongoDB с валидацией полей
            dbProduct.updatedBy = userId;
            await dbProduct.save({ session });

            // Пропорциональное распределение зарезервированных товаров среди клиентов, оформляющих заказ
            if (hasReservedOverflow) {
                await redistributeProductProportionallyInDraftOrders(productId, newStock, session);
            }

            // Удаление выбранных для удаления файлов старых фотографий (безопасно)
            if (actualImageFilenamesToDelete.length > 0) {
                if (preparedImageFilenames.length > 0) {
                    const actualImagePathsToDelete = actualImageFilenamesToDelete.flatMap(filename => {
                        return [
                            join(originalsDir, filename),
                            ...productThumbnailSizes.map(size => join(thumbnailsDir, `${size}px`, filename))
                        ];
                    });
                    await cleanupFiles(actualImagePathsToDelete, req);
                } else {
                    await cleanupFolder(productFilesDir, req);
                }
            }

            return dbProduct;
        });

        // Отправка успешного ответа клиенту
        safeSendResponse(req, res, 200, {
            message: `Товар "${updatedDbProduct.name}" успешно обновлён`,
            updatedProduct: prepareProductData(updatedDbProduct, { managed: true })
        });
    } catch (err) {
        // Очистка новых файлов фотографий или созданной папки файлов товара (безопасно)
        await cleanupFiles(images.map(img => img.path), req);
        
        if (currentImageFilenames?.length > 0) {
            await cleanupFiles(newImagePaths, req);
        } else {
            await cleanupFolder(productFilesDir, req);
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

    try {
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
            throw createAppError(400, `Неверный формат данных: ${invalidInputKeys.join(', ')}`);
        }
        if (Object.keys(fieldErrors).length > 0) {
            throw createAppError(422, 'Неверный формат данных', { fieldErrors });
        }

        // Проверка выбранных товаров для апдейта
        const uniqueProductIds = [...new Set(productIds)];
        const total = uniqueProductIds.length;

        if (!total) {
            throw createAppError(400, 'Товары для изменения не выбраны', {
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

        // Обработка категории
        if (category !== undefined) {
            // Проверка на существование категории товара
            const dbCategory = await Category.findById(category);
                        
            if (!dbCategory) {
                throw createAppError(404, `Категория товаров (ID: ${category}) не найдена`);
            }

            // Проверка того, что категория товара не имеет подкатегорий
            const hasSubcategories = await Category.exists({ parent: category });

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
            { runValidators: true } // Разрешить валидировать изменяемые поля на каждом документе
        );
        const { matchedCount, modifiedCount } = updateResult;

        // Отправка ответов клиенту
        if (matchedCount === 0) {
            return safeSendResponse(req, res, 404, { message: 'Ни один товар не найден' });
        }
        if (modifiedCount === 0) { // Не срабатывает из-за изменения updatedAt
            return safeSendResponse(req, res, 204);
        }

        // Сбор данных по всем обновлённым документам и отправка их в успешных ответах
        const dbUpdatedProducts = await Product.find({ _id: { $in: uniqueProductIds } }).lean();
        const now = Date.now();
        const updatedProducts = dbUpdatedProducts.map(product => prepareProductData(product, {
            managed: true,
            now
        }));

        if (matchedCount < total) {
            return safeSendResponse(req, res, 207, {
                message: `Товары частично обновлены: ${modifiedCount} из ${total}`,
                updatedProducts
            });
        }

        safeSendResponse(req, res, 200, {
            message: 'Все товары успешно обновлены',
            updatedProducts
        });
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
    const productId = req.params.productId;

    if (!typeCheck.objectId(productId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: productId' });
    }

    try {
        // Поиск и удаление документа в базе MongoDB
        const dbProduct = await Product.findByIdAndDelete(productId);

        if (!dbProduct) {
            return safeSendResponse(req, res, 404, { message: `Товар (ID: ${productId}) не найден` });
        }

        // Удаление папки с файлами фотографий товара
        const productFilesDir = join(PRODUCT_STORAGE_PATH, productId);
        await cleanupFolder(productFilesDir, req);

        safeSendResponse(req, res, 200, { message: `Товар "${dbProduct.name}" успешно удалён` });
    } catch (err) {
        next(err);
    }
};

/// Удаление группы товаров ///
export const handleBulkProductDeleteRequest = async (req, res, next) => {
    try {
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

        // Поиск и сбор ID удаляемых товаров
        const existingProductDocs = await Product.find({ _id: { $in: uniqueProductIds } }, '_id');
        const existingProductIds = existingProductDocs.map(doc => doc._id.toString());

        if (!existingProductIds.length) {
            return safeSendResponse(req, res, 404, { message: 'Ни один товар не найден' });
        }

        // Поиск и удаление документа в базе MongoDB
        const deletionResult = await Product.deleteMany({ _id: { $in: existingProductIds } });
        const { deletedCount } = deletionResult;

        // Удаление папок с фотографиями товаров (безопасно)
        await Promise.all(existingProductIds.map(id => cleanupFolder(join(PRODUCT_STORAGE_PATH, id), req)));

        // Отправка успешных ответов клиенту
        if (deletedCount < total) {
            return safeSendResponse(req, res, 207, {
                message: `Товары частично удалены: ${deletedCount} из ${total}`
            });
        }

        safeSendResponse(req, res, 200, { message: 'Все товары успешно удалены' });
    } catch (err) {
        next(err);
    }
};
