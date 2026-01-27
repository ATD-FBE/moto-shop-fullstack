import { promises as fsp } from 'fs';
import { join } from 'path';
import Order from '../database/models/Order.js';
import Counter from '../database/models/Counter.js';
import {
    PRODUCT_STORAGE_PATH,
    THUMBNAILS_FOLDER,
    ORDER_STORAGE_PATH
} from '../config/paths.js';
import * as sseOrderManagement from '../services/sse/sseOrderManagementService.js';
import {
    prepareDraftOrderData,
    syncDraftOrderData,
    reserveProducts,
    releaseReservedProducts,
    commitProductPurchase,
    replaceListItemsByKey,
    isCartDifferentFromOrder
} from '../services/checkoutService.js';
import { orderDotNotationMap, prepareShippingCost } from '../services/orderService.js';
import {
    normalizeInputDataToNull,
    dotNotationToObject,
    deepMergeNewNullable
} from '../utils/normalizeUtils.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { cleanupFolder } from '../utils/fsUtils.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { calculateOrderTotals } from '../../shared/calculations.js';
import {
    DISCOUNT_SOURCES,
    MIN_ORDER_AMOUNT,
    PRODUCT_THUMBNAIL_PRESETS,
    ORDER_MODEL_TYPE,
    DELIVERY_METHOD,
    ORDER_STATUS,
    REQUEST_STATUS,
    SERVER_CONSTANTS
} from '../../shared/constants.js';

const { ORDER_DRAFT_EXPIRATION } = SERVER_CONSTANTS;

/// Загрузка черновика заказа ///
export const handleOrderDraftRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const customerDiscount = dbUser.discount;
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        const orderLbl = `(ID: ${orderId})`;

        const { statusCode, responseData } = await runInTransaction(async (session) => {
            const dbOrderDraft = await Order.findById(orderId).session(session);

            if (!dbOrderDraft) {
                throw createAppError(404, `Черновик заказа ${orderLbl} не найден`);
            }
            if (dbUser._id.toString() !== dbOrderDraft.customerId.toString()) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }
            if (dbOrderDraft.currentStatus !== ORDER_STATUS.DRAFT) {
                throw createAppError(403, `Заказ ${orderLbl} уже оформлен, загрузка невозможна`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }

            // Заказ просрочен => освобождение резервов и удаление заказа
            if (new Date() >= new Date(dbOrderDraft.expiresAt)) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 404,
                    responseData: { message: `Черновик заказа ${orderLbl} просрочен` }
                };
            }

            // Товары в корзине и в заказе отличаются => освобождение резервов и удаление заказа
            if (isCartDifferentFromOrder(dbUser.cart, dbOrderDraft.items)) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 409,
                    responseData: {
                        message: `Состав корзины не совпадает с черновиком заказа ${orderLbl}`
                    }
                };
            }

            const {
                fixedDbCart,
                fixedDbOrderItems,
                orderItemList,
                orderAdjustments,
                purchaseProductList,
                cartItemList
            } = await syncDraftOrderData(dbOrderDraft.items, customerDiscount);

            const orderTotals = calculateOrderTotals(fixedDbOrderItems);
            const isTotalAmountUnderMinimum = orderTotals.totalAmount < MIN_ORDER_AMOUNT;

            // Есть изменения в заказываемых товарах (вмешательство админа в каталог)
            if (orderAdjustments.length > 0) {
                // Обновление корзины клиента перед выходом
                dbUser.cart = fixedDbCart;
                await dbUser.save({ session });
                
                // Сумма заказа НЕ меньше минимальной => обработка изменений в черновике заказа
                if (!isTotalAmountUnderMinimum) {
                    // Освобождение резервов для деактивированных товаров в заказе
                    const reservedOrderItemList = orderAdjustments
                        .filter(adj => adj.releaseQuantity)
                        .map(adj => ({ productId: adj.productId, quantity: adj.releaseQuantity }));

                    if (reservedOrderItemList.length > 0) {
                        await releaseReservedProducts(reservedOrderItemList, session);
                    }

                    // Обновление черновика заказа с последующим выходом
                    dbOrderDraft.items = fixedDbOrderItems;
                    dbOrderDraft.totals = orderTotals;
                    await dbOrderDraft.save({ session });
                }
            }

            // Сумма заказа меньше минимальной => освобождение резервов и удаление заказа
            if (isTotalAmountUnderMinimum) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 422,
                    responseData: {
                        message: `Сумма заказа ${orderLbl} после синхронизации меньше минимальной`,
                        reason: REQUEST_STATUS.LIMITATION,
                        orderAdjustments,
                        purchaseProductList,
                        cartItemList,
                        customerDiscount,
                        orderDraft: {
                            items: orderItemList,
                            totals: orderTotals
                        }
                    }
                };
            }

            return {
                statusCode: 200,
                responseData: {
                    message: orderAdjustments.length > 0
                        ? `Черновик заказа ${orderLbl} синхронизирован с текущими данными каталога`
                        : `Черновик заказа ${orderLbl} успешно загружен`,
                    purchaseProductList,
                    cartItemList,
                    customerDiscount,
                    orderAdjustments,
                    orderDraft: {
                        expiresAt: dbOrderDraft.expiresAt,
                        items: orderItemList,
                        totals: dbOrderDraft.totals,
                        customerInfo: dbOrderDraft.customerInfo,
                        delivery: dbOrderDraft.delivery,
                        financials: dbOrderDraft.financials,
                        customerComment: dbOrderDraft.customerComment
                    }
                }
            };
        });

        safeSendResponse(req, res, statusCode, responseData);
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Создание черновика заказа ///
export const handleOrderDraftCreateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const customerId = dbUser._id;
    const customerDiscount = dbUser.discount;

    // Предварительная проверка данных
    const { cartProductSnapshots } = req.body ?? {};

    if (!typeCheck.array(cartProductSnapshots) || !cartProductSnapshots.length) {
        return safeSendResponse(req, res, 400, {
            message: 'Неверный формат данных: cartProductSnapshots'
        });
    }

    for (const productSnapshot of cartProductSnapshots) {
        const {
            id,
            priceSnapshot,
            appliedDiscountSnapshot,
            appliedDiscountSourceSnapshot
        } = productSnapshot ?? {};

        if (
            !typeCheck.objectId(id) ||
            !typeCheck.number(priceSnapshot) ||
            priceSnapshot < 0 ||
            !typeCheck.number(appliedDiscountSnapshot) ||
            appliedDiscountSnapshot < 0 ||
            appliedDiscountSnapshot > 100 ||
            !typeCheck.string(appliedDiscountSourceSnapshot) ||
            !DISCOUNT_SOURCES.includes(appliedDiscountSourceSnapshot)
        ) {
            return safeSendResponse(req, res, 400, {
                message: 'Неверный формат данных: cartProductSnapshots'
            });
        }
    }

    // Поиск существующих черновиков, возврат зарезервированных товаров и удаление заказов
    try {
        await runInTransaction(async (session) => {
            const existingOrderDrafts = await Order
                .find({ customerId, currentStatus: ORDER_STATUS.DRAFT })
                .session(session);

            if (existingOrderDrafts.length) {
                const reservedOrderItemList = existingOrderDrafts.flatMap(order => order.items);
                await releaseReservedProducts(reservedOrderItemList, session);
                await Order.deleteMany({ customerId, currentStatus: ORDER_STATUS.DRAFT }).session(session);
            }
        });
    } catch (err) {
        return next(err);
    }

    // Актуализация данных, резервирование товаров и создание документа черновика заказа
    try {
        const cartProductSnapshotMap = new Map(
            cartProductSnapshots.map(({ id, ...rest }) => [id, { productId: id, ...rest }])
        );

        const { statusCode, responseData } = await runInTransaction(async (session) => {
            // Автоисправление товаров в заказе, корзине и получение актуальных данных
            let {
                fixedDbCart,
                fixedDbOrderItems,
                orderAdjustments,
                purchaseProductList,
                cartItemList
            } = await prepareDraftOrderData(dbUser.cart, cartProductSnapshotMap, customerDiscount);

            // Проверка итоговой суммы
            let orderTotals = calculateOrderTotals(fixedDbOrderItems);
            let currentTotal = orderTotals.totalAmount;
            
            if (currentTotal < MIN_ORDER_AMOUNT) {
                // Сохранение корзины пользователя перед выходом, если были изменения
                if (orderAdjustments.length > 0) {
                    dbUser.cart = fixedDbCart;
                    await dbUser.save({ session });
                }

                return {
                    statusCode: 422,
                    responseData: {
                        message: 'Сумма заказа меньше минимальной',
                        reason: REQUEST_STATUS.LIMITATION,
                        orderAdjustments,
                        purchaseProductList,
                        cartItemList,
                        customerDiscount,
                        currentTotal,
                        orderId: null
                    }
                };
            }

            // Резервирование товаров АТОМАРНО, с избежанием гонки при сохранении данных
            let remainingOrderItemsToReserve = fixedDbOrderItems.slice(); // Копия заказа

            while (remainingOrderItemsToReserve.length) {
                const failedItemIdsSet = await reserveProducts(remainingOrderItemsToReserve, session);

                // Выход из цикла, если все товары зарезервированы
                if (!failedItemIdsSet.size) break;

                await new Promise(resolve => setTimeout(resolve, 750));

                // Не все товары зарезервированы => Повтор сбора данных, проверки суммы и резервирования
                const failedOrderItems = remainingOrderItemsToReserve
                    .filter(i => failedItemIdsSet.has(i.productId.toString()));

                // Повтор подготовки данных заказа, только для провальных при резервировании товаров
                const {
                    fixedDbCart: failedFixedDbCart,
                    fixedDbOrderItems: failedFixedDbOrderItems,
                    orderAdjustments: failedOrderAdjustments,
                    purchaseProductList: failedPurchaseProductList,
                    cartItemList: failedCartItemList
                } = await prepareDraftOrderData(failedOrderItems, cartProductSnapshotMap, customerDiscount);

                // Замена в массивах проблемных товаров
                fixedDbCart = replaceListItemsByKey(fixedDbCart, failedFixedDbCart, 'productId');
                fixedDbOrderItems = replaceListItemsByKey(
                    fixedDbOrderItems, failedFixedDbOrderItems, 'productId'
                );
                orderAdjustments = replaceListItemsByKey(orderAdjustments, failedOrderAdjustments, 'id');
                purchaseProductList = replaceListItemsByKey(
                    purchaseProductList, failedPurchaseProductList, 'id'
                );
                cartItemList = replaceListItemsByKey(cartItemList, failedCartItemList, 'id');

                // Повтор проверки итоговой суммы
                orderTotals = calculateOrderTotals(fixedDbOrderItems);
                currentTotal = orderTotals.totalAmount;

                if (currentTotal < MIN_ORDER_AMOUNT) {
                    // Сохранение корзины пользователя перед выходом, если были изменения
                    if (orderAdjustments.length > 0) {
                        dbUser.cart = fixedDbCart;
                        await dbUser.save({ session });
                    }

                    return {
                        statusCode: 422,
                        responseData: {
                            message: 'Сумма заказа меньше минимальной',
                            reason: REQUEST_STATUS.LIMITATION,
                            orderAdjustments,
                            purchaseProductList,
                            cartItemList,
                            customerDiscount,
                            currentTotal,
                            orderId: null
                        }
                    };
                }

                // Замена массива остатков для их повторного резервирования
                remainingOrderItemsToReserve = failedFixedDbOrderItems;
            }

            // Сохранение корзины пользователя, если были изменения
            if (orderAdjustments.length > 0) {
                dbUser.cart = fixedDbCart;
                await dbUser.save({ session });
            }

            // Создание черновика заказа
            const { customerInfo, delivery = {}, financials } = dbUser.checkoutPrefs ?? {};
            if (!delivery.allowCourierExtra) delivery.allowCourierExtra = false;
            const now = new Date();

            const [orderDraft] = await Order.create(
                [
                    {
                        customerId,
                        lastActivityAt: now,
                        statusHistory: [{
                            status: ORDER_STATUS.DRAFT,
                            changedBy: { id: customerId, name: dbUser.name, role: dbUser.role },
                            changedAt: now
                        }],
                        items: fixedDbOrderItems,
                        totals: orderTotals,
                        customerInfo,
                        delivery,
                        financials,
                        expiresAt: new Date(now.getTime() + ORDER_DRAFT_EXPIRATION)
                    }
                ],
                { session }
            );
            const orderId = orderDraft._id.toString();

            return {
                statusCode: 201,
                responseData: {
                    message: `Черновик заказа (ID: ${orderId}) успешно создан`,
                    orderAdjustments,
                    purchaseProductList,
                    cartItemList,
                    customerDiscount,
                    currentTotal,
                    orderId
                }
            };
        });

        // Черновик заказа создан - ответ клиенту об успехе
        safeSendResponse(req, res, statusCode, responseData);
    } catch (err) {
        next(err);
    }
};

/// Изменение черновика заказа ///
export const handleOrderDraftUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const {
        firstName, lastName, middleName, email, phone,
        deliveryMethod, allowCourierExtra,
        region, district, city, street, house, apartment, postalCode,
        defaultPaymentMethod,
        customerComment
    } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        firstName: { value: firstName, type: 'string', optional: true, form: true },
        lastName: { value: lastName, type: 'string', optional: true, form: true },
        middleName: { value: middleName, type: 'string', optional: true, form: true },
        email: { value: email, type: 'string', optional: true, form: true },
        phone: { value: phone, type: 'string', optional: true, form: true },
        deliveryMethod: { value: deliveryMethod, type: 'string', optional: true, form: true },
        allowCourierExtra: { value: allowCourierExtra, type: 'boolean', optional: true, form: true },
        region: { value: region, type: 'string', optional: true, form: true },
        district: { value: district, type: 'string', optional: true, form: true },
        city: { value: city, type: 'string', optional: true, form: true },
        street: { value: street, type: 'string', optional: true, form: true },
        house: { value: house, type: 'string', optional: true, form: true },
        apartment: { value: apartment, type: 'string', optional: true, form: true },
        postalCode: { value: postalCode, type: 'string', optional: true, form: true },
        defaultPaymentMethod: { value: defaultPaymentMethod, type: 'string', optional: true, form: true },
        customerComment: { value: customerComment, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'checkout');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
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
        const orderLbl = `(ID: ${orderId})`;

        // Поиск черновика, полностью удовлетворяющего условиям
        const dbOrderDraft = await Order.findOne({
            _id: orderId,
            customerId: dbUser._id,
            currentStatus: ORDER_STATUS.DRAFT,
            expiresAt: { $gt: new Date() }
        });
          
        if (!dbOrderDraft) {
            return safeSendResponse(req, res, 404, {
                message: `Черновик заказа ${orderLbl} не найден или просрочен`
            });
        }

        // Объединение нормализованных изменённых полей с существующими через дот-нотацию в их названиях
        const currentOrderDraft = dbOrderDraft.toObject();
        const normalizedUpdateFields = normalizeInputDataToNull(updateFields);
        const newOrderDraftData = dotNotationToObject(normalizedUpdateFields);
        const mergedOrderDraft = deepMergeNewNullable(currentOrderDraft, newOrderDraftData);

        // Проверка на изменение полей не нужна
        // Установка через set и сохранение через save для удаления null-полей и пустых объектов
        dbOrderDraft.set(mergedOrderDraft);
        await dbOrderDraft.save();

        safeSendResponse(req, res, 200, { message: `Черновик заказа ${orderLbl} обновлён` });
    } catch (err) {
        next(err);
    }
};

/// Подтверждение оформления заказа ///
export const handleOrderDraftConfirmRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const customerId = dbUser._id;
    const customerDiscount = dbUser.discount;
    
    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const {
        firstName, lastName, middleName, email, phone,
        deliveryMethod, allowCourierExtra,
        region, district, city, street, house, apartment, postalCode,
        defaultPaymentMethod,
        customerComment
    } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        firstName: { value: firstName, type: 'string', form: true },
        lastName: { value: lastName, type: 'string', form: true },
        middleName: { value: middleName, type: 'string', optional: true, form: true },
        email: { value: email, type: 'string', form: true },
        phone: { value: phone, type: 'string', form: true },
        deliveryMethod: { value: deliveryMethod, type: 'string', form: true },
        allowCourierExtra: { value: allowCourierExtra, type: 'boolean', optional: true, form: true },
        region: { value: region, type: 'string', optional: true, form: true },
        district: { value: district, type: 'string', optional: true, form: true },
        city: { value: city, type: 'string', optional: true, form: true },
        street: { value: street, type: 'string', optional: true, form: true },
        house: { value: house, type: 'string', optional: true, form: true },
        apartment: { value: apartment, type: 'string', optional: true, form: true },
        postalCode: { value: postalCode, type: 'string', optional: true, form: true },
        defaultPaymentMethod: { value: defaultPaymentMethod, type: 'string', form: true },
        customerComment: { value: customerComment, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'checkout');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка на согласованность данных для метода курьерской доставки
    const isCourierMethod = deliveryMethod === DELIVERY_METHOD.COURIER;
    const isAllowCourierExtra = allowCourierExtra !== undefined;
    
    if ((isCourierMethod && !isAllowCourierExtra) || (!isCourierMethod && isAllowCourierExtra)) {
        return safeSendResponse(req, res, 400, { message: 'Несогласованные данные для метода доставки' });
    }

    let orderFilesDir;

    try {
        const orderLbl = `(ID: ${orderId})`;
        
        const { statusCode, responseData } = await runInTransaction(async (session) => {
            const dbOrderDraft = await Order.findById(orderId).session(session);

            if (!dbOrderDraft) {
                throw createAppError(404, `Черновик заказа ${orderLbl} не найден`);
            }
            if (customerId.toString() !== dbOrderDraft.customerId.toString()) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }
            if (dbOrderDraft.currentStatus !== ORDER_STATUS.DRAFT) {
                throw createAppError(403, `Заказ ${orderLbl} уже оформлен, подтверждение невозможно`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }

            // Заказ просрочен => освобождение резервов и удаление заказа
            if (new Date() >= new Date(dbOrderDraft.expiresAt)) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 404,
                    responseData: { message: `Черновик заказа ${orderLbl} просрочен` }
                };
            }

            // Товары в корзине и в заказе отличаются => освобождение резервов и удаление заказа
            if (isCartDifferentFromOrder(dbUser.cart, dbOrderDraft.items)) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 409,
                    responseData: {
                        message: `Состав корзины не совпадает с черновиком заказа ${orderLbl}`
                    }
                };
            }

            const {
                fixedDbCart,
                fixedDbOrderItems,
                orderItemList,
                orderAdjustments,
                purchaseProductList,
                cartItemList
            } = await syncDraftOrderData(dbOrderDraft.items, customerDiscount);

            const orderTotals = calculateOrderTotals(fixedDbOrderItems);
            const isTotalAmountUnderMinimum = orderTotals.totalAmount < MIN_ORDER_AMOUNT;

            // Есть изменения в заказываемых товарах (вмешательство админа в каталог)
            if (orderAdjustments.length > 0) {
                // Обновление корзины клиента перед выходом
                dbUser.cart = fixedDbCart;
                await dbUser.save({ session });
                
                // Сумма заказа НЕ меньше минимальной => обработка изменений в черновике заказа и выход
                if (!isTotalAmountUnderMinimum) {
                    // Освобождение резервов для деактивированных товаров в заказе
                    const reservedOrderItemList = orderAdjustments
                        .filter(adj => adj.releaseQuantity)
                        .map(adj => ({ productId: adj.productId, quantity: adj.releaseQuantity }));

                    if (reservedOrderItemList.length > 0) {
                        await releaseReservedProducts(reservedOrderItemList, session);
                    }

                    // Обновление черновика заказа с последующим выходом
                    dbOrderDraft.items = fixedDbOrderItems;
                    dbOrderDraft.totals = orderTotals;
                    await dbOrderDraft.save({ session });

                    return {
                        statusCode: 412,
                        responseData: {
                            message: `Данные заказа ${orderLbl} изменены после синхронизации с каталогом`,
                            purchaseProductList,
                            cartItemList,
                            customerDiscount,
                            orderAdjustments,
                            orderDraft: {
                                expiresAt: dbOrderDraft.expiresAt,
                                items: orderItemList,
                                totals: orderTotals
                            }
                        }
                    };
                }
            }
                
            // Сумма заказа меньше минимальной => освобождение резервов и удаление заказа
            if (isTotalAmountUnderMinimum) {
                await releaseReservedProducts(dbOrderDraft.items, session);
                await dbOrderDraft.deleteOne({ session });

                return {
                    statusCode: 422,
                    responseData: {
                        message: `Сумма заказа ${orderLbl} после синхронизации меньше минимальной`,
                        reason: REQUEST_STATUS.LIMITATION,
                        purchaseProductList,
                        cartItemList,
                        customerDiscount,
                        orderAdjustments,
                        orderDraft: {
                            items: orderItemList,
                            totals: orderTotals
                        }
                    }
                };
            }

            // Подготовка данных для нового документа
            const currentOrderDraft = dbOrderDraft.toObject();
            delete currentOrderDraft._id; // Удаление поля для пересоздания в новом документе

            const shippingCost = prepareShippingCost(deliveryMethod, allowCourierExtra);
            const submittedOrderData = normalizeInputDataToNull({
                customerInfo: { firstName, lastName, middleName, email, phone },
                delivery: {
                    deliveryMethod,
                    allowCourierExtra,
                    shippingAddress: deliveryMethod === DELIVERY_METHOD.SELF_PICKUP
                        ? {}
                        : { region, district, city, street, house, apartment, postalCode },
                    ...(shippingCost !== undefined && { shippingCost })
                },
                financials: { defaultPaymentMethod },
                customerComment
            });
            const confirmedOrderData = {
                _modelType: ORDER_MODEL_TYPE.FINAL,
                currentStatus: ORDER_STATUS.CONFIRMED,
                ...submittedOrderData
            };

            // Создание нового документа для дискриминатора final модели Order
            const confirmedOrderDoc = new Order({ ...currentOrderDraft, ...confirmedOrderData });

            // Предварительная валидация до работы с файловой системой и создания номера заказа
            await confirmedOrderDoc.validate({ pathsToSkip: ['orderNumber', 'items', 'confirmedAt'] });

            // Подготовка списка товаров подтверждённого заказа
            const confirmedOrderId = confirmedOrderDoc._id.toString();
            const purchaseProductMap = new Map(purchaseProductList.map(prod => [prod.id.toString(), prod]));
            const confirmedOrderItemList = [];
            let isOrderFilesDirCreated = false;

            for (const orderItem of fixedDbOrderItems) {
                const {
                    productId: productObjectId,
                    quantity,
                    priceSnapshot,
                    appliedDiscountSnapshot,
                    appliedDiscountSourceSnapshot
                } = orderItem;

                const productId = productObjectId.toString();
                const prodLbl = `(ID: ${productId})`;
                const product = purchaseProductMap.get(productId);
                if (!product) throw new Error(`Товар ${prodLbl} не найден в purchaseProductMap`);

                const { images, mainImageIndex, sku, name, brand, unit } = product;
                let imageFilename;

                if (images.length > 0) {
                    imageFilename = (images[mainImageIndex] ?? images[0]).filename;
                    const thumbImageSize = PRODUCT_THUMBNAIL_PRESETS.small;
                    const thumbImagePath = join(
                        PRODUCT_STORAGE_PATH,
                        productId,
                        THUMBNAILS_FOLDER,
                        `${thumbImageSize}px`,
                        imageFilename
                    );

                    try {
                        await fsp.access(thumbImagePath);
                    } catch {
                        throw new Error(`Миниатюра для товара ${prodLbl} не найдена: ${thumbImagePath}`);
                    }

                    if (!isOrderFilesDirCreated) {
                        orderFilesDir = join(ORDER_STORAGE_PATH, confirmedOrderId);
                        await fsp.mkdir(orderFilesDir, { recursive: true });
                        isOrderFilesDirCreated = true;
                    }

                    const orderImagePath = join(orderFilesDir, imageFilename);
                    await fsp.copyFile(thumbImagePath, orderImagePath);
                }

                const finalUnitPrice = priceSnapshot * (1 - appliedDiscountSnapshot / 100);
                const totalPrice = finalUnitPrice * quantity;

                confirmedOrderItemList.push({
                    productId: productObjectId,
                    imageFilename,
                    sku,
                    name,
                    brand,
                    unit,
                    quantity,
                    originalUnitPrice: priceSnapshot,
                    appliedDiscount: appliedDiscountSnapshot,
                    appliedDiscountSource: appliedDiscountSourceSnapshot,
                    finalUnitPrice: +finalUnitPrice.toFixed(2),
                    totalPrice: +totalPrice.toFixed(2)
                });
            }

            // Получение документа с новым номером заказа (без session: счётчик откатывать нельзя!)
            const dbCounter = await Counter.findOneAndUpdate(
                { entity: 'order' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true } // upsert (update + insert) создаёт документ, если его ещё нет
            );
            const newOrderNumber = dbCounter.seq.toString().padStart(5, '0');

            // Установка номера, списка, статусов и дат
            confirmedOrderDoc.orderNumber = newOrderNumber;
            confirmedOrderDoc.items = confirmedOrderItemList;
            
            const now = new Date();
            confirmedOrderDoc.confirmedAt = now;
            confirmedOrderDoc.lastActivityAt = now;
            confirmedOrderDoc.statusHistory.push({
                status: ORDER_STATUS.CONFIRMED,
                changedBy: { id: customerId, name: dbUser.name, role: dbUser.role },
                changedAt: now
            });

            // Сохранение документа подтверждённого заказа
            await confirmedOrderDoc.save({ session });

            // Удаление документа черновика заказа
            await dbOrderDraft.deleteOne({ session });

            // Списание резервов товаров в заказе
            await commitProductPurchase(confirmedOrderDoc.items, session);

            // Очистка корзины клиента
            dbUser.cart = [];
            await dbUser.save({ session });

            return {
                statusCode: 200,
                responseData: { message: `Заказ ${orderLbl} успешно подтверждён` }
            };
        });

        // Отправка SSE-сообщения админам
        sseOrderManagement.sendToAllClients({ newManagedActiveOrdersCount: 1 });

        // Отправка ответа заказчику
        safeSendResponse(req, res, statusCode, responseData);
    } catch (err) {
        // Очистка папки файлов заказа (безопасно)
        await cleanupFolder(orderFilesDir, req);

        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'checkout');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Отмена оформления заказа ///
export const handleOrderDraftDeleteRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        const orderLbl = `(ID: ${orderId})`;

        await runInTransaction(async (session) => {
            const dbOrderDraft = await Order.findById(orderId).session(session);

            if (!dbOrderDraft) {
                throw createAppError(404, `Черновик заказа ${orderLbl} не найден`);
            }
            if (dbUser._id.toString() !== dbOrderDraft.customerId.toString()) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }
            if (dbOrderDraft.currentStatus !== ORDER_STATUS.DRAFT) {
                throw createAppError(403, `Заказ ${orderLbl} уже оформлен, удаление невозможно`, {
                    reason: REQUEST_STATUS.DENIED
                });
            }

            await releaseReservedProducts(dbOrderDraft.items, session);
            await dbOrderDraft.deleteOne({ session });
        });

        safeSendResponse(req, res, 200, { message: `Черновик заказа ${orderLbl} успешно удалён` });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};
