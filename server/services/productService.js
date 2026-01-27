import mongoose from 'mongoose';
import Order from '../database/models/Order.js';
import User from '../database/models/User.js';
import Product from '../database/models/Product.js';
import {
    PRODUCT_STORAGE_FOLDER,
    ORIGINALS_FOLDER,
    THUMBNAILS_FOLDER,
    STORAGE_URL_PATH
} from '../config/paths.js';
import {
    PRODUCT_THUMBNAIL_PRESETS,
    PRODUCT_BRAND_NEW_THRESHOLD_MS,
    PRODUCT_RESTOCK_THRESHOLD_MS,
    ORDER_STATUS
} from '../../shared/constants.js';
import { calculateOrderTotals } from '../../shared/calculations.js';

export const prepareProductData = (dbProduct, { managed = false, now = Date.now() } = {}) => {
    const available = Math.max(0, dbProduct.stock - dbProduct.reserved);
    const isAvailable = available > 0;
    const brandNewSince = now - PRODUCT_BRAND_NEW_THRESHOLD_MS;
    const restockSince = now - PRODUCT_RESTOCK_THRESHOLD_MS;

    return {
        id: dbProduct._id,
        images: prepareProductImages(dbProduct._id, dbProduct.imageFilenames),
        mainImageIndex: dbProduct.mainImageIndex,
        sku: dbProduct.sku,
        name: dbProduct.name,
        brand: dbProduct.brand,
        description: dbProduct.description,
        available,
        isBrandNew: dbProduct.createdAt.getTime() >= brandNewSince && isAvailable,
        isRestocked: dbProduct.lastRestockAt.getTime() >= restockSince && isAvailable,
        unit: dbProduct.unit,
        price: dbProduct.price,
        discount: dbProduct.discount,
        isActive: dbProduct.isActive,
        ...(managed && {
            stock: dbProduct.stock,
            reserved: dbProduct.reserved,
            category: dbProduct.category,
            tags: dbProduct.tags.join(', ')
        })
    };
};

const prepareProductImages = (productId, imageFilenames) => {
    return imageFilenames.map(filename => ({
        filename,
        original: [
            STORAGE_URL_PATH,
            PRODUCT_STORAGE_FOLDER,
            productId,
            ORIGINALS_FOLDER,
            filename
        ].join('/'),
        thumbnails: Object.entries(PRODUCT_THUMBNAIL_PRESETS).reduce((acc, [key, size]) => {
            acc[key] = [
                STORAGE_URL_PATH,
                PRODUCT_STORAGE_FOLDER,
                productId,
                THUMBNAILS_FOLDER,
                `${size}px`,
                filename
            ].join('/');
            return acc;
        }, {})
    }));
};

export const prepareCartProductSnapshotData = (dbCartItem) => ({
    id: dbCartItem.productId.toString(),
    name: dbCartItem.nameSnapshot,
    brand: dbCartItem.brandSnapshot
});

// Пропорциональное уменьшение кол-ва товара для оформляющих заказ клиентов при его уменьшении админом
export const redistributeProductProportionallyInDraftOrders = async (productId, newStock, session) => {
    const productObjectId = mongoose.Types.ObjectId.createFromHexString(productId);

    // Получение всех черновиков заказов с данным товаром
    const orderDrafts = await Order
        .find({
            currentStatus: ORDER_STATUS.DRAFT,
            items: { $elemMatch: { productId: productObjectId } }
        })
        .sort({ createdAt: 1 }) // При равных пропорциях единиц остатков приоритет у первого создавшего заказ
        .lean()
        .session(session);

    // Сбор всех запросов по количеству для этого товара
    const requests = orderDrafts.map(order => {
        const orderItem = order.items.find(item => item.productId.toString() === productId);
        if (!orderItem) return null; // Аномалия

        return {
            orderId: order._id,
            customerId: order.customerId,
            quantity: orderItem.quantity,
            items: order.items.map(item => ({ ...item }))
        };
    }).filter(Boolean);

    // Проверка общего количества заказов товара
    const totalRequested = requests.reduce((sum, req) => sum + req.quantity, 0);
    if (totalRequested <= newStock) return; // Выход, если суммарно заказов меньше или равно запасу

    // Пропорциональное распределение с учётом округления вниз
    const proportion = newStock / totalRequested;

    const tempResults = requests.map(req => {
        const raw = req.quantity * proportion;
        const allocated = Math.floor(raw);
        const fraction = raw - allocated;
        return { ...req, allocated, fraction };
    });

    if (!tempResults.length) return; // На всякий случай

    // Вычисление остатка после распределения с округлением
    const allocatedSum = tempResults.reduce((sum, req) => sum + req.allocated, 0);
    let remaining = newStock - allocatedSum;

    // Распределение оставшихся единиц по убыванию дробной части
    // При одинаковых дробных частях порядок запросов сохраняется (по дате создания заказа)
    tempResults.sort((a, b) => b.fraction - a.fraction);

    for (let i = 0; i < tempResults.length && remaining > 0; i++, remaining--) {
        tempResults[i].allocated++;
    }

    // Удаление из результатов тех запросов, в которых количество после распределения не измелось
    const filteredTempResults = tempResults.filter(req => req.allocated !== req.quantity);

    // Обновление количества товара в массиве для пересчёта сумм
    filteredTempResults.forEach(req => {
        req.items = req.items.map(item => {
            if (item.productId.toString() === productId) {
                return { ...item, quantity: req.allocated };
            }
            return item;
        });
    });

    // Сохранение изменений в заказах через формирование bulk-операций
    const orderBulkOps = filteredTempResults.map(req => ({
        updateOne: {
            filter: { _id: req.orderId },
            update: { 
                $set: {
                    'items.$[item].quantity': req.allocated,
                    totals: calculateOrderTotals(req.items)
                }
            },
            arrayFilters: [{ 'item.productId': productObjectId }] // item - название элемента массива
        }
    }));

    if (orderBulkOps.length > 0) {
        await Order.collection.bulkWrite(orderBulkOps, { session });
    }

    // Сохранение изменений в корзинах клиентов через формирование bulk-операций
    const customerIds = filteredTempResults.map(req => req.customerId);
    const users = await User.find({
        _id: { $in: customerIds },
        cart: { $elemMatch: { productId: productObjectId } }
    }).lean().session(session);

    const userBulkOps = users.map(user => {
        const cartItem = user.cart.find(item => item.productId.toString() === productId);
        if (!cartItem) return null;

        // Сохранение только если количество товара в корзине больше нового распределённого количества
        // Клиент мог отнять количество товара в корзине после создания черновика заказа
        const request = filteredTempResults.find(req => req.customerId.toString() === user._id.toString());
        const newQuantity = Math.min(cartItem.quantity, request.allocated);
        if (newQuantity === cartItem.quantity) return null;

        return {
            updateOne: {
                filter: { _id: user._id },
                update: { $set: { 'cart.$[item].quantity': newQuantity } },
                arrayFilters: [{ 'item.productId': productObjectId }] // item - название элемента массива
            }
        };
    }).filter(Boolean);

    if (userBulkOps.length > 0) {
        await User.collection.bulkWrite(userBulkOps, { session });
    }
};

export const applyProductBulkUpdate = async (orderItemList, adjustmentType, session) => {
    const bulkOps = orderItemList.map(item => ({
        updateOne: {
            filter: { _id: item.productId },
            update: buildProductInventoryUpdatePipeline(adjustmentType, item.quantity)
        }
    }));
  
    if (bulkOps.length) {
        await Product.bulkWrite(bulkOps, { session });
    }
};

// Построение агрегатного pipeline для операций с обновлёнными значениями полей на каждом шаге
export const buildProductInventoryUpdatePipeline = (adjustmentType, quantity) => {
    switch (adjustmentType) {
        case 'reserve':
            return [
                { $set: { reserved: { $add: ['$reserved', quantity] } } },                    // rsv + qty
            ];

        case 'release':
            return [
                { $set: { reserved: { $max: [{ $subtract: ['$reserved', quantity] }, 0] } } } // rsv - qty
            ];

        case 'commit':
            return [
                {
                    $set: {
                        stock: { $max: [{ $subtract: ['$stock', quantity] }, 0] },            // stk - qty
                        reserved: { $max: [{ $subtract: ['$reserved', quantity] }, 0] }       // rsv - qty
                    }
                }
            ];

        case 'adjustAfterCommit':
            return [
                { $set: { stock: { $max: [{ $subtract: ['$stock', quantity] }, 0] } } }       // stk - ±qty
            ];

        case 'return':
            return [
                { $set: { stock: { $add: ['$stock', quantity] } } }                           // stk + qty
            ];
        
        default:
            throw new Error(`Неизвестный тип апдейта товара: ${adjustmentType}`);
    }
};

// Создание вычисляемых полей-флагов для фильтрации
export const buildProductsComputedFields = (query) => {
    const needInStockFilter = query.inStock === 'true' || query.inStock === 'false';
    const needBrandNewFilter = query.brandNew === 'true' || query.brandNew === 'false';
    const needRestockedFilter = query.restocked === 'true' || query.restocked === 'false';

    if (!needInStockFilter && !needBrandNewFilter && !needRestockedFilter) return [];

    const now = Date.now();
    const fields = {};

    if (needInStockFilter) {
        fields.inStock = { $cond: [{ $gt: [{ $subtract: ['$stock', '$reserved'] }, 0] }, true, false] };
    }
    
    if (needBrandNewFilter) {
        fields.isBrandNew = {
            $cond: [
                {
                    $and: [
                        { $gte: ['$createdAt', new Date(now - PRODUCT_BRAND_NEW_THRESHOLD_MS)] },
                        { $gt: [{ $subtract: ['$stock', '$reserved'] }, 0] }
                    ]
                },
                true,
                false
            ]
        };
    }
    
    if (needRestockedFilter) {
        fields.isRestocked = {
            $cond: [
                {
                    $and: [
                        { $gte: ['$lastRestockAt', new Date(now - PRODUCT_RESTOCK_THRESHOLD_MS)] },
                        { $gt: [{ $subtract: ['$stock', '$reserved'] }, 0] }
                    ]
                },
                true,
                false
            ]
        };
    }

    return [{ $addFields: fields }];
};

// Пайплайн для категорий товаров
export const buildCategoriesPipeline = (categoryParam) => {
    const categoriesPipeline = [];
    const categoryId = categoryParam?.split('-').pop() || '';

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const categoryObjectId = mongoose.Types.ObjectId.createFromHexString(categoryId);

        // 1. Создание поля с ID входящей категории
        categoriesPipeline.push({
            $addFields: { rootCategoryId: categoryObjectId }
        });

        // 2. Поиск потомков входящей категории (включая её саму)
        categoriesPipeline.push({
            $graphLookup: {
                from: 'categories',
                startWith: '$rootCategoryId',
                connectFromField: '_id',
                connectToField: 'parent',
                as: 'descendants'
            }
        });

        // 3. Создание общего массива из входящей категории и её потомков
        categoriesPipeline.push({
            $addFields: {
                allCategoryIds: {
                    $concatArrays: [['$rootCategoryId'], '$descendants._id']
                }
            }
        });

        // 4. Фильтр товаров, у которых поле category входит в allCategoryIds
        categoriesPipeline.push({
            $match: {
                $expr: { $in: ['$category', '$allCategoryIds'] }
            }
        });
    }

    return categoriesPipeline;
};
