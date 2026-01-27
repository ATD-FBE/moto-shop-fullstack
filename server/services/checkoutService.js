import Product from '../database/models/Product.js';
import {
    buildProductInventoryUpdatePipeline,
    applyProductBulkUpdate,
    prepareProductData
} from './productService.js';
import { getAppliedDiscountData } from '../../shared/commonHelpers.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { ORDER_RESERVE_BATCH_SIZE } = SERVER_CONSTANTS;

export const reserveProducts = async (remainingOrderItemsToReserve, session) => {
    const failedItemIdsSet = new Set();

    // Резервирование количества товаров порциями
    for (let i = 0; i < remainingOrderItemsToReserve.length; i += ORDER_RESERVE_BATCH_SIZE) {
        const batch = remainingOrderItemsToReserve.slice(i, i + ORDER_RESERVE_BATCH_SIZE);

        await Promise.all(batch.map(async (item) => {
            const updateResult = await Product.updateOne(
                {
                    _id: item.productId,
                    $expr: { // Проверка доступности товара (stock - reserved >= quantity)
                        $gte: [{ $subtract: ['$stock', '$reserved'] }, item.quantity]
                    }
                },
                buildProductInventoryUpdatePipeline('reserve', item.quantity),
                { session }
            );

            // Изменения не сохраняются, если товар не доступен => Запоминание ID товара
            if (!updateResult.modifiedCount) {
                failedItemIdsSet.add(item.productId.toString());
            }
        }));
    }

    return failedItemIdsSet;
};

export const releaseReservedProducts = async (orderItemList, session) => {
    await applyProductBulkUpdate(orderItemList, 'release', session);
};

export const commitProductPurchase = async (orderItemList, session) => {
    await applyProductBulkUpdate(orderItemList, 'commit', session);
};

export const prepareDraftOrderData = async (cartItemList, cartProductSnapshotMap, customerDiscount) => {
    const productIds = cartItemList.map(item => item.productId);
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    // Сбор актуальных данных, исправление корзины и заказа, сбор изменений для логов 
    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
    const now = Date.now();

    return cartItemList.reduce(
        (acc, cartItem) => {
            const productObjectId = cartItem.productId;
            const productId = productObjectId.toString();
            const dbProduct = dbProductMap.get(productId);
            const productSnapshot = cartProductSnapshotMap.get(productId);
            const adjustments = {};

            // Отсеивание удалённого из магазина товара
            if (!dbProduct) {
                adjustments.deleted = true;
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
                return acc;
            }

            // Отсеивание неактивного товара
            if (!dbProduct.isActive) {
                adjustments.inactive = true;
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
                return acc;
            }

            // Отсеивание закончившегося на складе товара
            const available = Math.max(0, dbProduct.stock - dbProduct.reserved);

            if (available === 0) {
                adjustments.outOfStock = true;
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
                return acc;
            }

            // Изменение количества товара
            const correctedQuantity = Math.min(cartItem.quantity, available);

            if (correctedQuantity < cartItem.quantity) {
                adjustments.quantityReduced = {
                    old: cartItem.quantity,
                    corrected: correctedQuantity
                };
            }

            // Изменение цены товара
            if (dbProduct.price !== productSnapshot.priceSnapshot) {
                adjustments.price = {
                    old: productSnapshot.priceSnapshot,
                    corrected: dbProduct.price
                };
            }

            // Изменение скидки
            const {
                appliedDiscount,
                appliedDiscountSource
            } = getAppliedDiscountData(dbProduct.discount, customerDiscount);

            if (
                appliedDiscount !== productSnapshot.appliedDiscountSnapshot ||
                appliedDiscountSource !== productSnapshot.appliedDiscountSourceSnapshot
            ) {
                adjustments.discount = {
                    old: productSnapshot.appliedDiscountSnapshot,
                    corrected: appliedDiscount,
                    appliedDiscountSourceSnapshot: appliedDiscountSource
                };
            }

            if (Object.keys(adjustments).length > 0) {
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
            }

            // Сбор данных для сохранения корзины и заказа, а также для отправки клиенту
            acc.fixedDbCart.push({
                productId: productObjectId,
                quantity: correctedQuantity,
                nameSnapshot: dbProduct.name,
                ...(dbProduct.brand && { brandSnapshot: dbProduct.brand }) // Опционально
            });
            acc.fixedDbOrderItems.push({
                productId: productObjectId,
                quantity: correctedQuantity,
                quantitySnapshot: correctedQuantity,
                priceSnapshot: dbProduct.price,
                appliedDiscountSnapshot: appliedDiscount,
                appliedDiscountSourceSnapshot: appliedDiscountSource
            });
            acc.purchaseProductList.push(prepareProductData(dbProduct, { now }));
            acc.cartItemList.push({
                id: productId,
                quantity: correctedQuantity,
                quantityReduced: false,
                outOfStock: false,
                inactive: false,
                deleted: false
            });
            
            return acc;
        },
        {
            fixedDbCart: [],
            fixedDbOrderItems: [],
            orderAdjustments: [],
            purchaseProductList: [],
            cartItemList: []
        }
    );
};

export const syncDraftOrderData = async (dbOrderItemList, customerDiscount) => {
    const productIds = dbOrderItemList.map(item => item.productId);
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    // Сбор актуальных данных, исправление корзины и заказа, сбор изменений для логов 
    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
    const now = Date.now();

    return dbOrderItemList.reduce(
        (acc, orderItem) => {
            const productObjectId = orderItem.productId;
            const productId = productObjectId.toString();
            const dbProduct = dbProductMap.get(productId);
            const adjustments = {};

            // Отсеивание удалённого из магазина товара
            if (!dbProduct) {
                adjustments.deleted = true;
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
                return acc;
            }

            // Отсеивание неактивного товара
            if (!dbProduct.isActive) {
                adjustments.inactive = true;
                acc.orderAdjustments.push({
                    productId: productObjectId,
                    adjustments,
                    releaseQuantity: orderItem.quantity
                });
                return acc;
            }

            // Отсеивание закончившегося на складе товара
            if (orderItem.quantity <= 0) {
                adjustments.outOfStock = true;
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
                return acc;
            }

            // Изменение количества товара
            if (orderItem.quantity !== orderItem.quantitySnapshot) {
                adjustments.quantityReduced = {
                    old: orderItem.quantitySnapshot,
                    corrected: orderItem.quantity
                };
            }

            // Изменение цены товара
            if (dbProduct.price !== orderItem.priceSnapshot) {
                adjustments.price = {
                    old: orderItem.priceSnapshot,
                    corrected: dbProduct.price
                };
            }

            // Изменение скидки
            const {
                appliedDiscount,
                appliedDiscountSource
            } = getAppliedDiscountData(dbProduct.discount, customerDiscount);
            
            if (
                appliedDiscount !== orderItem.appliedDiscountSnapshot ||
                appliedDiscountSource !== orderItem.appliedDiscountSourceSnapshot
            ) {
                adjustments.discount = {
                    old: orderItem.appliedDiscountSnapshot,
                    corrected: appliedDiscount,
                    appliedDiscountSourceSnapshot: appliedDiscountSource
                };
            }

            if (Object.keys(adjustments).length > 0) {
                acc.orderAdjustments.push({ productId: productObjectId, adjustments });
            }

            // Сбор данных для сохранения корзины и заказа, а также для отправки клиенту
            acc.fixedDbCart.push({
                productId: productObjectId,
                quantity: orderItem.quantity,
                nameSnapshot: dbProduct.name,
                ...(dbProduct.brand && { brandSnapshot: dbProduct.brand }) // Опционально
            });
            acc.fixedDbOrderItems.push({
                productId: productObjectId,
                quantity: orderItem.quantity,
                quantitySnapshot: orderItem.quantity,
                priceSnapshot: dbProduct.price,
                appliedDiscountSnapshot: appliedDiscount,
                appliedDiscountSourceSnapshot: appliedDiscountSource
            });
            acc.orderItemList.push({
                id: productId,
                quantity: orderItem.quantity,
                priceSnapshot: dbProduct.price,
                appliedDiscountSnapshot: appliedDiscount
            });
            acc.purchaseProductList.push(prepareProductData(dbProduct, { now }));
            acc.cartItemList.push({
                id: productId,
                quantity: orderItem.quantity,
                quantityReduced: false,
                outOfStock: false,
                inactive: false,
                deleted: false
            });
            
            return acc;
        },
        {
            fixedDbCart: [],
            fixedDbOrderItems: [],
            orderItemList: [],
            orderAdjustments: [],
            purchaseProductList: [],
            cartItemList: []
        }
    );
};

export const replaceListItemsByKey = (originalList, updatedList, key = 'id') => {
    const updatedMap = new Map(updatedList.map(item => [item[key].toString(), item]));

    // Порядок элементов в списке при их замене сохраняется
    return originalList.map(item => {
        const itemKey = item[key].toString();
        return updatedMap.has(itemKey) ? updatedMap.get(itemKey) : item;
    });
};

export const isCartDifferentFromOrder = (cartItemList, orderItemList) => {
    const arrToMapById = (items) => Object.fromEntries(items.map(item => [String(item.productId), item]));

    const cartItemsMap = arrToMapById(cartItemList);
    const orderItemsMap = arrToMapById(orderItemList);

    const allIds = new Set([...Object.keys(cartItemsMap), ...Object.keys(orderItemsMap)]);

    for (const id of allIds) {
        const cartItem = cartItemsMap[id];
        const orderItem = orderItemsMap[id];

        if (!cartItem || !orderItem || cartItem.quantity !== orderItem.quantity) {
            return true;
        }
    }

    return false;
};
