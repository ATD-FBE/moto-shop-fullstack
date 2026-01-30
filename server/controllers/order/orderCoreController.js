import { join } from 'path';
import Order from '../../database/models/Order.js';
import Product from '../../database/models/Product.js';
import { ORDER_STORAGE_PATH } from '../../config/paths.js';
import { ORDER_VIEW_MATRIX } from '../../config/viewPolicy.js';
import * as sseOrderManagement from '../../services/sse/sseOrderManagementService.js';
import {
    orderDotNotationMap,
    prepareOrderData,
    getLastActiveStatus,
    prepareShippingCost,
    getFinancialsState,
    getOrderTransitionData,
    returnProductsToStore,
    getFieldErrors,
    updateCustomerTotalSpent
} from '../../services/orderService.js';
import { applyProductBulkUpdate } from '../../services/productService.js';
import {
    buildSearchMatch,
    buildFilterMatch,
    parseSortParam
} from '../../utils/aggregationBuilders.js';
import {
    normalizeInputDataToNull,
    dotNotationToObject,
    deepMergeNewNullable
} from '../../utils/normalizeUtils.js';
import { collectDbChanges } from '../../utils/compareUtils.js';
import { typeCheck, validateInputTypes } from '../../utils/typeValidation.js';
import { runInTransaction } from '../../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../../utils/errorUtils.js';
import { parseValidationErrors } from '../../utils/errorUtils.js';
import safeSendResponse from '../../utils/safeSendResponse.js';
import { cleanupFiles } from '../../utils/fsUtils.js';
import { ordersFilterOptions } from '../../../shared/filterOptions.js';
import { ordersSortOptions } from '../../../shared/sortOptions.js';
import { ordersPageLimitOptions } from '../../../shared/pageLimitOptions.js';
import { isEqualCurrency, makeOrderItemQuantityFieldName, } from '../../../shared/commonHelpers.js';
import { calculateOrderTotals, calculateOrderFinancials } from '../../../shared/calculations.js';
import { validationRules, fieldErrorMessages } from '../../../shared/validation.js';
import {
    DEFAULT_SEARCH_TYPE,
    MIN_ORDER_AMOUNT,
    DELIVERY_METHOD,
    ORDER_STATUS,
    ORDER_ACTIVE_STATUSES,
    ORDER_FINAL_STATUSES,
    ORDER_ACTION,
    REQUEST_STATUS
} from '../../../shared/constants.js';

/// Загрузка списка заказов для одной страницы ///
export const handleOrderListRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    
    // Настройка фильтра поиска
    const allowedSearchFields = ['orderNumber'];
    const searchMatch = buildSearchMatch(req.query.search, allowedSearchFields, DEFAULT_SEARCH_TYPE);
                
    // Настройка фильтра по параметрам
    const filterMatch = buildFilterMatch(req.query, ordersFilterOptions);

    // Общая фильтрация по поиску и параметрам
    const baseFilter = { ...searchMatch, ...filterMatch };

    // Настройка пагинации
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || ordersPageLimitOptions[0], 1);
    const skip = (page - 1) * limit;

    try {
        let isManaged = false;
        let dbPaginatedOrderList;

        switch (dbUser.role) {
            case 'admin': {
                isManaged = true;

                if (!baseFilter.currentStatus) {
                    const activeFilter = { ...baseFilter, currentStatus: { $in: ORDER_ACTIVE_STATUSES } };
                    const completedFilter = { ...baseFilter, currentStatus: ORDER_STATUS.COMPLETED };
                    const cancelledFilter = { ...baseFilter, currentStatus: ORDER_STATUS.CANCELLED };
    
                    const [activeCount, completedCount] = await Promise.all([
                        Order.countDocuments(activeFilter),
                        Order.countDocuments(completedFilter)
                        // Без cancelledCount, т.к. dbCancelledOrders ограничивается в конце общим limit
                    ]);
    
                    // Сначала активные, потом завершённые, потом отменённые
                    let dbActiveOrders = [], dbCompletedOrders = [], dbCancelledOrders = [];
    
                    if (skip < activeCount) {
                        const activeLimit = Math.min(limit, activeCount - skip);
    
                        dbActiveOrders = await Order.find(activeFilter)
                            .sort({ lastActivityAt: -1 })
                            .skip(skip)
                            .limit(activeLimit)
                            .lean();
                        
                        const remaining1 = limit - dbActiveOrders.length;
    
                        if (remaining1 > 0) {
                            dbCompletedOrders = await Order.find(completedFilter)
                                .sort({ lastActivityAt: -1 })
                                .limit(remaining1)
                                .lean();
                            
                            const remaining2 = remaining1 - dbCompletedOrders.length;
    
                            if (remaining2 > 0) {
                                dbCancelledOrders = await Order.find(cancelledFilter)
                                    .sort({ lastActivityAt: -1 })
                                    .limit(remaining2)
                                    .lean();
                            }
                        }
                    } else if (skip < activeCount + completedCount) {
                        const completedSkip = skip - activeCount;
                        const completedLimit = Math.min(limit, completedCount - completedSkip);
    
                        dbCompletedOrders = await Order.find(completedFilter)
                            .sort({ lastActivityAt: -1 })
                            .skip(completedSkip)
                            .limit(completedLimit)
                            .lean();
                        
                        const remaining = limit - dbCompletedOrders.length;
    
                        if (remaining > 0) {
                            dbCancelledOrders = await Order.find(cancelledFilter)
                                .sort({ lastActivityAt: -1 })
                                .limit(remaining)
                                .lean();
                        }
                    } else {
                        const cancelledSkip = skip - activeCount - completedCount;
    
                        dbCancelledOrders = await Order.find(cancelledFilter)
                            .sort({ lastActivityAt: -1 })
                            .skip(cancelledSkip)
                            .limit(limit)
                            .lean();
                    }
    
                    dbPaginatedOrderList = [...dbActiveOrders, ...dbCompletedOrders, ...dbCancelledOrders];

                } else {
                    dbPaginatedOrderList = await Order.find({ ...baseFilter })
                        .sort({ lastActivityAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .lean();
                }

                break;
            }

            case 'customer': {
                const { sortField, sortOrder } = parseSortParam(req.query.sort, ordersSortOptions);

                baseFilter.customerId = dbUser._id;

                dbPaginatedOrderList = await Order.find({ ...baseFilter })
                    .sort({ [sortField]: sortOrder })
                    .skip(skip)
                    .limit(limit)
                    .lean();

                break;
            }

            default:
                return safeSendResponse(req, res, 403, {
                    message: 'Запрещено: несоответствующая роль',
                    reason: REQUEST_STATUS.DENIED
                });
        }

        if (!baseFilter.currentStatus) baseFilter.currentStatus = { $ne: ORDER_STATUS.DRAFT };
        const dbFilteredOrders = await Order.find({ ...baseFilter }).select('_id').lean();
        const filteredOrderIdList = dbFilteredOrders.map(ord => ord._id);

        const paginatedOrderList = dbPaginatedOrderList.map(dbOrder => prepareOrderData(dbOrder, {
            inList: true,
            managed: isManaged,
            details: true,
            viewerRole: dbUser.role
        }));

        safeSendResponse(req, res, 200, {
            message: 'Заказы успешно загружены',
            filteredOrderIdList,
            paginatedOrderList
        });
    } catch (err) {
        next(err);
    }
};

/// Загрузка или обновление отдельного заказа ///
export const handleOrderRequest = async (req, res, next) => {
    const viewerRole = req.dbUser.role;
    const viewMode = req.query.viewMode;
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }
    if (!['page', 'list'].includes(viewMode)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: viewMode' });
    }

    try {
        const dbOrder = await Order.findById(orderId).populate('customerId', 'name email').lean();
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;
        
        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }

        const viewConfig = ORDER_VIEW_MATRIX[viewerRole][viewMode];
        const order = prepareOrderData(dbOrder, { ...viewConfig, viewerRole });

        safeSendResponse(req, res, 200, { message: `Заказ ${orderLbl} успешно загружен`, order });
    } catch (err) {
        next(err);
    }
};

/// Загрузка доступного на складе количества товаров в заказе ///
export const handleOrderItemsAvailabilityRequest = async (req, res, next) => {
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        const dbOrder = await Order.findById(orderId).select('items.productId').lean();
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;
        
        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }

        const productIds = dbOrder.items.map(item => item.productId);
        const dbOrderProducts = await Product.find({ _id: { $in: productIds } })
            .select('stock reserved')
            .lean();

        const dbOrderProductMap = new Map(dbOrderProducts.map(prod => [prod._id.toString(), prod]));

        const orderItemsAvailabilityMap = Object.fromEntries(
            productIds.map(productObjectId => {
                const productId = productObjectId.toString();
                const dbOrderProduct = dbOrderProductMap.get(productId);
                if (!dbOrderProduct) return [productId, 0];
                return [productId, Math.max(0, dbOrderProduct.stock - dbOrderProduct.reserved)]
            })
        );

        safeSendResponse(req, res, 200, {
            message: `Доступное количество на складе товаров в заказе ${orderLbl} успешно загружено`,
            orderItemsAvailabilityMap
        });
    } catch (err) {
        next(err);
    }
};

/// Повтор завершённого или отменённого заказа ///
export const handleOrderRepeatRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        const dbOrder = await Order.findById(orderId).select('customerId currentStatus items').lean();
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }
        if (dbUser._id.toString() !== dbOrder.customerId.toString()) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`,
                reason: REQUEST_STATUS.DENIED
            });
        }
        if (!ORDER_FINAL_STATUSES.includes(dbOrder.currentStatus)) {
            return safeSendResponse(req, res, 403, {
                message: `Статус заказа ${orderLbl} не позволяет его повторить`,
                reason: REQUEST_STATUS.DENIED
            });
        }

        dbUser.cart = dbOrder.items.map(({ productId, quantity, name, brand }) => ({
            productId,
            quantity,
            nameSnapshot: name,
            brandSnapshot: brand ?? null
        }));
        await dbUser.save();

        safeSendResponse(req, res, 200, {
            message: `Товары из заказа ${orderLbl} повторно добавлены в корзину`
        });
    } catch (err) {
        next(err);
    }
};

/// Изменение внутренней заметки заказа (SSE у клиента) ///
export const handleOrderInternalNoteUpdateRequest = async (req, res, next) => {
    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const { internalNote } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        internalNote: { value: internalNote, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'order');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Работа с базой данных
    try {
        const dbOrder = await Order.findById(orderId);
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }

        // Подготовка данных и проверка на изменение
        const prepDbFields = { internalNote: internalNote?.trim() || null };
        dbOrder.set(prepDbFields);
                
        if (!dbOrder.isModified()) {
            return safeSendResponse(req, res, 204);
        }

        // Сохранение заказа
        await dbOrder.save();

        // Формирование данных для SSE-сообщения
        const orderPatches = [{ path: 'internalNote', value: prepDbFields.internalNote }];
        const updatedOrderData = { orderPatches };

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, { message: `Внутренняя заметка заказа ${orderLbl} изменена` });
    } catch (err) {
        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'order');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение деталей подтверждённого заказа (SSE у клиента) ///
export const handleOrderDetailsUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const {
        firstName, lastName, middleName, email, phone,
        deliveryMethod, allowCourierExtra,
        region, district, city, street, house, apartment, postalCode,
        defaultPaymentMethod,
        editReason
    } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        firstName: { value: firstName, type: 'string', optional: true, form: true },
        lastName: { value: lastName, type: 'string', optional: true, form: true },
        middleName: { value: middleName, type: 'string', optional: true, form: true },
        email: { value: email, type: 'string', optional: true, form: true },
        phone: { value: phone, type: 'string', optional: true, form: true },
        deliveryMethod: { value: deliveryMethod, type: 'string', optional: true, form: true },
        allowCourierExtra:
            { value: allowCourierExtra, type: 'emptyableBoolean', optional: true, form: true },
        region: { value: region, type: 'string', optional: true, form: true },
        district: { value: district, type: 'string', optional: true, form: true },
        city: { value: city, type: 'string', optional: true, form: true },
        street: { value: street, type: 'string', optional: true, form: true },
        house: { value: house, type: 'string', optional: true, form: true },
        apartment: { value: apartment, type: 'string', optional: true, form: true },
        postalCode: { value: postalCode, type: 'string', optional: true, form: true },
        defaultPaymentMethod: { value: defaultPaymentMethod, type: 'string', optional: true, form: true },
        editReason: { value: editReason, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'order');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка на согласованность данных для метода курьерской доставки
    const isCourierMethod = deliveryMethod === DELIVERY_METHOD.COURIER;
    const isAllowCourierExtra = allowCourierExtra !== undefined && allowCourierExtra !== '';

    if ((isCourierMethod && !isAllowCourierExtra) || (!isCourierMethod && isAllowCourierExtra)) {
        return safeSendResponse(req, res, 400, { message: 'Несогласованные данные для метода доставки' });
    }

    // Заполнение данных только для пришедших полей через дот-нотационные названия полей
    const updateFields = Object.fromEntries(
        Object.entries(inputTypeMap)
            .filter(([key, { form, value }]) => form && orderDotNotationMap[key] && value !== undefined)
            .map(([key, { value }]) => [orderDotNotationMap[key], value])
    );

    if (!Object.keys(updateFields).length) {
        return safeSendResponse(req, res, 204);
    }

    try {
        const { orderLbl, updatedOrderData } = await runInTransaction(async (session) => {
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;
            
            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }
            if (dbOrder.currentStatus !== ORDER_STATUS.CONFIRMED) {
                throw createAppError(409, `На данном этапе заказ ${orderLbl} изменить невозможно`);
            }

            // Объединение нормализованных изменённых полей с существующими через дот-нотацию
            const currentOrder = dbOrder.toObject();
            const normalizedUpdateFields = normalizeInputDataToNull(updateFields);
            const newOrderData = dotNotationToObject(normalizedUpdateFields);
            const mergedOrder = deepMergeNewNullable(currentOrder, newOrderData);

            if (deliveryMethod !== undefined) {
                mergedOrder.delivery.shippingCost = prepareShippingCost(deliveryMethod, allowCourierExtra);
            }

            // Сбор данных изменения полей
            const updateZones = ['customerInfo', 'delivery', 'financials'];
            const fieldsPreserveNull = [orderDotNotationMap.shippingCost]; // Поля с валидным null-значением
            const currencyFields = [orderDotNotationMap.shippingCost]; // Поля со значением валюты
            let changes = [];

            for (const zone of updateZones) {
                changes = collectDbChanges(
                    currentOrder[zone],
                    mergedOrder[zone],
                    zone, // Для параметра path в collectDbChanges
                    fieldsPreserveNull,
                    currencyFields,
                    changes
                );
            }

            // Проверка на изменение полей
            if (!changes.length) {
                throw createAppError(204);
            }

            // Добавление записи для аудита
            const auditLog = Array.isArray(currentOrder.auditLog) ? [...currentOrder.auditLog] : [];
            auditLog.push({
                changes,
                reason: editReason,
                changedBy: { id: dbUser._id, name: dbUser.name, role: dbUser.role },
                changedAt: new Date()
            });
            mergedOrder.auditLog = auditLog;

            // Установка через set и сохранение через save для удаления null-полей и пустых объектов
            dbOrder.set(mergedOrder);
            const updatedDbOrder = await dbOrder.save({ session });

            // Формирование данных для SSE-сообщения
            const orderPatches = changes.map(({ field, newValue }) => ({ path: field, value: newValue }));
            const newAuditLogEntry = updatedDbOrder.auditLog.at(-1).toObject();
            const updatedOrderData = { orderPatches, newAuditLogEntry };

            return { orderLbl, updatedOrderData };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, { message: `Заказ ${orderLbl} успешно изменён` });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'order');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }
        
        next(err);
    }
};

/// Изменение товаров подтверждённого заказа (SSE у клиента) ///
export const handleOrderItemsUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const { items, editReason } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        items: { value: items, type: 'arrayOf', elemType: 'object' },
        editReason: { value: editReason, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'order');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }

    // Проверка содержимого массива items
    const itemFieldErrors = {};

    for (const { productId, quantity } of items) {
        if (!typeCheck.objectId(productId)) {
            return safeSendResponse(req, res, 400, { message: 'Неверный формат данных в items' });
        }

        // Проверка нового значения поля для количества товара
        const isValid = validationRules.order.itemQuantity.test(quantity);

        if (!isValid) {
            const fieldName = makeOrderItemQuantityFieldName(productId);
            itemFieldErrors[fieldName] =
                fieldErrorMessages.order.itemQuantity.default ||
                fieldErrorMessages.DEFAULT;
        }
    }

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    const hasItemFieldErrors = Object.keys(itemFieldErrors).length > 0;

    if (hasFieldErrors || hasItemFieldErrors) {
        return safeSendResponse(req, res, 422, {
            message: 'Неверный формат данных',
            ...(hasFieldErrors && { fieldErrors }),
            ...(hasItemFieldErrors && { itemFieldErrors })
        });
    }

    // Отсутствуют поля в массиве товаров
    if (!items.length) {
        return safeSendResponse(req, res, 204);
    }

    try {
        const { orderLbl, updatedOrderData, itemsAdjustments } = await runInTransaction(async (session) => {
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;
            
            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }
            if (dbOrder.currentStatus !== ORDER_STATUS.CONFIRMED) {
                throw createAppError(409, `На данном этапе заказ ${orderLbl} изменить невозможно`);
            }

            // Обработка изменения количества товаров в заказе
            const updatedOrder = dbOrder.toObject();
            const updatedItems = [...updatedOrder.items];

            const itemsAdjustments = [];
            const changes = [];

            const productIds = items.map(item => item.productId);
            const dbProducts = await Product.find({ _id: { $in: productIds } }).lean().session(session);

            const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
            const orderItemsDeltaQty = [];

            items.forEach(async ({ productId, quantity }) => {
                const dbProduct = dbProductMap.get(productId);
                const adjustments = {};

                // Товар удалён - сбор данных для логов и выход
                if (!dbProduct) {
                    adjustments.deleted = true;
                    itemsAdjustments.push({ id: productId, adjustments });
                    return;
                }

                // Товар в заказе не найден - значит, добавлен новый (не реализовано)
                const currentItem = updatedItems.find(item => item.productId.toString() === productId);
                if (!currentItem) return;

                // Количество не изменилось
                const currentQuantity = currentItem.quantity;
                if (quantity === currentQuantity) return;

                const { name, brand } = currentItem;

                // Количество товара добавлено, но он закончился - сбор данных для логов и выход
                const available = Math.max(0, dbProduct.stock - dbProduct.reserved);

                if (quantity > currentQuantity && available === 0) {
                    adjustments.outOfStock = true;
                    itemsAdjustments.push({ id: productId, name, brand, adjustments });
                    return;
                }

                // Новое количество товара больше заказанного + доступного - сбор данных для логов
                const maxQuantity = currentQuantity + available;
                const correctedQuantity = Math.min(quantity, maxQuantity);

                if (correctedQuantity < quantity) {
                    adjustments.quantityReduced = {
                        old: quantity,
                        corrected: correctedQuantity
                    };
                    itemsAdjustments.push({ id: productId, name, brand, adjustments });
                }

                // Сбор дельты изменения количества для обновления товаров в БД
                const deltaQuantity = correctedQuantity - currentQuantity; // Значение всегда !== 0
                orderItemsDeltaQty.push({ productId, quantity: deltaQuantity });

                // Установка нового количества товара в заказе и сбор изменений для товара
                const currentItemIdx = updatedItems.findIndex(
                    item => item.productId.toString() === productId
                );

                if (quantity === 0) { // Удаление товара с количеством 0
                    changes.push({
                        field: `items[${currentItemIdx}]`,
                        oldValue: JSON.stringify(currentItem),
                        newValue: undefined
                    });
                    updatedItems.splice(currentItemIdx, 1);

                    // Удаление картинки товара (безопасно)
                    if (currentItem.imageFilename) {
                        const imagePath = join(ORDER_STORAGE_PATH, orderId, currentItem.imageFilename);
                        await cleanupFiles([imagePath]);
                    }
                } else { // Установка нового количества и пересчёт суммы
                    const finalUnitPrice = currentItem.finalUnitPrice;
                    const oldTotalPrice = currentItem.totalPrice;
                    const newTotalPrice = Number((correctedQuantity * finalUnitPrice).toFixed(2));

                    changes.push({
                        field: `items[${currentItemIdx}].quantity`,
                        oldValue: currentQuantity,
                        newValue: correctedQuantity
                    });
                    changes.push({
                        field: `items[${currentItemIdx}].totalPrice`,
                        oldValue: oldTotalPrice,
                        newValue: newTotalPrice,
                        currency: true
                    });
                    
                    updatedItems[currentItemIdx].quantity = correctedQuantity;
                    updatedItems[currentItemIdx].totalPrice = newTotalPrice;
                }
            });

            if (changes.length > 0) { // Есть изменения
                // Пересчёт сумм и проверка минимальной суммы заказа
                const orderTotals = calculateOrderTotals(updatedItems, { confirmed: true });

                if (orderTotals.totalAmount < MIN_ORDER_AMOUNT) {
                    throw createAppError(422, `Сумма заказа ${orderLbl} меньше минимальной`, {
                        reason: REQUEST_STATUS.LIMITATION,
                        orderItemsAdjustments: itemsAdjustments
                    });
                }

                // Изменение количества товаров на складе
                await applyProductBulkUpdate(orderItemsDeltaQty, 'adjustAfterCommit', session);

                // Сбор данных для логов изменения сумм
                Object.entries(updatedOrder.totals)
                    .forEach(([field, oldValue]) => {
                        const newValue = orderTotals[field];
                        if (oldValue === newValue) return;

                        changes.push({
                            field: orderDotNotationMap[field],
                            oldValue,
                            newValue,
                            currency: true
                        });
                    });

                // Пересчёт финансового статуса заказа
                const netPaid = updatedOrder.financials.totalPaid - updatedOrder.financials.totalRefunded;
                const currentFinancialsState = updatedOrder.financials.state;
                const newFinancialsState = getFinancialsState(
                    updatedOrder.currentStatus,
                    netPaid,
                    orderTotals.totalAmount,
                    updatedOrder.financials.eventHistory
                );

                // Фиксирование изменений в заказе
                if (newFinancialsState !== currentFinancialsState) {
                    changes.push({
                        field: orderDotNotationMap.financialsState,
                        oldValue: currentFinancialsState,
                        newValue: newFinancialsState
                    });
                    updatedOrder.financials.state = newFinancialsState;
                }

                updatedOrder.totals = orderTotals;
                updatedOrder.items = updatedItems;
            } else { // Нет изменений
                if (itemsAdjustments.length > 0) { // Есть корректировки изменений
                    throw createAppError(412, `Заказ ${orderLbl} не изменён в связи с корректировками`, {
                        orderItemsAdjustments: itemsAdjustments
                    });
                } else { // Нет корректировок изменений
                    throw createAppError(204);
                }
            }

            // Добавление записи для аудита
            const auditLog = Array.isArray(updatedOrder.auditLog) ? [...updatedOrder.auditLog] : [];
            auditLog.push({
                changes,
                reason: editReason,
                changedBy: { id: dbUser._id, name: dbUser.name, role: dbUser.role },
                changedAt: new Date()
            });
            updatedOrder.auditLog = auditLog;

            // Установка через set и сохранение через save для удаления null-полей и пустых объектов
            dbOrder.set(updatedOrder);
            const updatedDbOrder = await dbOrder.save({ session });

            // Формирование данных для SSE-сообщения
            const orderPatches = changes.map(({ field, newValue }) => ({ path: field, value: newValue }));
            const newAuditLogEntry = updatedDbOrder.auditLog.at(-1).toObject();
            const updatedOrderData = { orderPatches, newAuditLogEntry };

            return { orderLbl, updatedOrderData, itemsAdjustments };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, {
            message: `Заказ ${orderLbl} успешно изменён`,
            orderItemsAdjustments: itemsAdjustments
        });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'order');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }
        
        next(err);
    }
};

/// Изменение статуса заказа (SSE у клиента) ///
export const handleOrderStatusUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;
    const { action, formFields } = req.body ?? {};
    const { shippingCost, cancellationReason } = typeCheck.object(formFields) ? formFields : {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        action: { value: action, type: 'string' },
        formFields: { value: formFields, type: 'object', optional: true },
        shippingCost: { value: shippingCost, type: 'number', optional: true, form: true },
        cancellationReason: { value: cancellationReason, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'order');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка доступных значений для action
    if (!Object.values(ORDER_ACTION).includes(action)) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: action' });
    }

    try {
        // Транзакция MongoDB
        const { orderLbl, updatedOrderData } = await runInTransaction(async (session) => {
            // Поиск и проверка наличия документа заказа
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }

            // Проверка разрешения операций для текущего статуса
            const currentOrderStatus = dbOrder.currentStatus;

            if (!ORDER_ACTIVE_STATUSES.includes(currentOrderStatus)) {
                throw createAppError(409, `Заказ ${orderLbl} не активен`);
            }

            // Обработка действий (action) - сбор новых данных, проверка, валидация
            const deliveryMethod = dbOrder.delivery.deliveryMethod;
            const currentShippingCost = dbOrder.delivery.shippingCost;
            const totalAmount = dbOrder.totals.totalAmount;
            const currentFinancialsState = dbOrder.financials.state;
            const financialsEventHistory = dbOrder.financials.eventHistory;

            const { totalPaid, totalRefunded } = calculateOrderFinancials(financialsEventHistory);
            const netPaid = totalPaid - totalRefunded;

            const prepDbFields = {
                shippingCost: shippingCost !== undefined ? Number(shippingCost) : currentShippingCost,
                cancellationReason: cancellationReason?.trim()
            };
            const prepDbOrderStatusEntry = {
                changedBy: { id: dbUser._id, name: dbUser.name, role: dbUser.role },
                changedAt: new Date()
            };
            const invalidFields = [];
            let newShippingCost = currentShippingCost;

            switch (action) {
                case ORDER_ACTION.NEXT: {
                    // Проверка минимальной суммы заказа
                    if (totalAmount < MIN_ORDER_AMOUNT) {
                        throw createAppError(422, `Сумма заказа ${orderLbl} меньше минимальной`, {
                            reason: REQUEST_STATUS.LIMITATION
                        });
                    }

                    // Получение нового статуса
                    const {
                        newOrderStatus
                    } = getOrderTransitionData(deliveryMethod, currentOrderStatus, 1);

                    // Проверка оплаты заказа при изменении статуса на COMPLETED
                    if (
                        newOrderStatus === ORDER_STATUS.COMPLETED &&
                        !isEqualCurrency(netPaid, totalAmount) &&
                        netPaid < totalAmount
                    ) {
                        throw createAppError(403, `Запрещено: заказ ${orderLbl} ещё не оплачен`);
                    }

                    // Установка статуса
                    prepDbOrderStatusEntry.status = newOrderStatus;

                    // Обработка нового статуса DELIVERED
                    if (newOrderStatus === ORDER_STATUS.DELIVERED) {
                        // Проверка наличия стоимости за доставку при изменении статуса на DELIVERED
                        if (prepDbFields.shippingCost === undefined || prepDbFields.shippingCost < 0) {
                            invalidFields.push('shippingCost');
                        }

                        // Выход сразу для формирования ошибок невалидных полей в ответе
                        if (invalidFields.length > 0) break;

                        // Изменение стоимости доставки
                        newShippingCost = prepDbFields.shippingCost;
                    }
                    break;
                }

                case ORDER_ACTION.ROLLBACK: {
                    // Получение нового статуса и флага для текущего статуса
                    const {
                        newOrderStatus,
                        rollbackAllowed
                    } = getOrderTransitionData(deliveryMethod, currentOrderStatus, -1);
                    
                    // Проверка возможности отката для текущего статуса
                    if (!rollbackAllowed) {
                        throw createAppError(400, `Текущий статус заказа ${orderLbl} откатить нельзя`);
                    }

                    // Установка статуса и флага отката
                    prepDbOrderStatusEntry.status = newOrderStatus;
                    prepDbOrderStatusEntry.isRollback = true;

                    // Сброс стоимости доставки при возврате на статусе DELIVERED
                    const allowCourierExtra = dbOrder.delivery.allowCourierExtra;

                    if (
                        currentOrderStatus === ORDER_STATUS.DELIVERED &&
                        (deliveryMethod !== DELIVERY_METHOD.COURIER || allowCourierExtra)
                    ) {
                        newShippingCost = prepareShippingCost(deliveryMethod, allowCourierExtra);
                    }
                    break;
                }

                case ORDER_ACTION.CANCEL: {
                    // Установка нового статуса
                    prepDbOrderStatusEntry.status = ORDER_STATUS.CANCELLED;

                    // Проверка наличия причины отмены заказа
                    if (!prepDbFields.cancellationReason) {
                        invalidFields.push('cancellationReason');
                    }

                    // Выход сразу для формирования ошибок невалидных полей в ответе
                    if (invalidFields.length > 0) break;

                    // Установка причины отмены
                    prepDbOrderStatusEntry.cancellationReason = prepDbFields.cancellationReason;

                    // Удаление уточняющейся стоимости доставки
                    if (currentShippingCost === null) {
                        newShippingCost = undefined;
                    }
                    break;
                }

                default:
                    throw createAppError(400, `Действие не поддерживается: ${action}`);
            }

            // Сбор ошибок для невалидных полей и отправка их в ответе
            if (invalidFields.length > 0) {
                throw createAppError(422, 'Некорректные данные', {
                    fieldErrors: getFieldErrors(invalidFields, 'order')
                });
            }

            // Проверка изменения статуса заказа
            if (prepDbOrderStatusEntry.status === currentOrderStatus) {
                throw createAppError(400, `Статус заказа ${orderLbl} не изменился`);
            }

            // Установка нового финансового состояния
            const newFinancialsState = getFinancialsState(
                prepDbOrderStatusEntry.status,
                netPaid,
                totalAmount,
                financialsEventHistory
            );

            // Сбор изменений в полях и установка новых значений в документ
            const changes = [];

            // Проверка стоимости доставки
            if (newShippingCost !== currentShippingCost) {
                changes.push({
                    field: orderDotNotationMap.shippingCost,
                    oldValue: currentShippingCost,
                    newValue: newShippingCost,
                    currency: true
                });
                dbOrder.delivery.shippingCost = newShippingCost;
            }

            // Проверка финансового состояния
            if (newFinancialsState !== currentFinancialsState) {
                changes.push({
                    field: orderDotNotationMap.financialsState,
                    oldValue: currentFinancialsState,
                    newValue: newFinancialsState
                });
                dbOrder.financials.state = newFinancialsState;
            }

            if (changes.length > 0) {
                prepDbOrderStatusEntry.changes = changes;
            }

            dbOrder.currentStatus = prepDbOrderStatusEntry.status;
            dbOrder.lastActivityAt = prepDbOrderStatusEntry.changedAt;
            dbOrder.statusHistory.push(prepDbOrderStatusEntry);
            
            // Сохранение докумета
            const updatedDbOrder = await dbOrder.save({ session });

            // Обновление общей суммы оплат покупателя при завершении заказа
            if (updatedDbOrder.currentStatus === ORDER_STATUS.COMPLETED) {
                await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaid, session, req.logCtx);
            }

            // Возвращение заказанного количества товаров на склад при отмене заказа
            if (updatedDbOrder.currentStatus === ORDER_STATUS.CANCELLED) {
                await returnProductsToStore(updatedDbOrder.items, session);
            }

            // Формирование данных для SSE-сообщения
            const orderPatches = changes.map(({ field, newValue }) => ({ path: field, value: newValue }));
            let newOrderStatusEntry = updatedDbOrder.statusHistory.at(-1).toObject();

            if (updatedDbOrder.currentStatus === ORDER_STATUS.CANCELLED) {
                newOrderStatusEntry.lastActiveStatus = getLastActiveStatus(updatedDbOrder.statusHistory);
            }

            const updatedOrderData = {
                ...(orderPatches.length > 0 && { orderPatches }),
                newOrderStatusEntry
            };

            return { orderLbl, updatedOrderData };
        });

        const newOrderStatus = updatedOrderData.newOrderStatusEntry.status;

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        if (ORDER_FINAL_STATUSES.includes(newOrderStatus)) {
            sseMessageData.newManagedActiveOrdersCount = -1;
        }
        sseOrderManagement.sendToAllClients(sseMessageData);

        // Отправка ответа заказчику
        safeSendResponse(req, res, 200, {
            message: `Статус заказа ${orderLbl} успешно изменён: ${newOrderStatus}`
        });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'order');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};
