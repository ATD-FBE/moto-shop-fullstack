import Product from '../database/models/Product.js';
import { prepareProductData, prepareCartProductSnapshotData } from './productService.js';

export const prepareGuestCart = async (cartItemList) => {
    const productIds = cartItemList.map(item => item.id);
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    // Сбор актуальной корзины
    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
    const now = Date.now();

    return cartItemList.reduce(
        (acc, cartItem) => {
            const productId = cartItem.id;
            const dbProduct = dbProductMap.get(productId);
            if (!dbProduct) return acc;

            acc.purchaseProductList.push(prepareProductData(dbProduct, { now }));
            if (!dbProduct.isActive) return acc;

            const available = Math.max(0, dbProduct.stock - dbProduct.reserved);
            if (available === 0) return acc;

            acc.cartItemList.push({
                id: productId,
                quantity: Math.min(cartItem.quantity, available)
            });
            return acc;
        },
        { purchaseProductList: [], cartItemList: [] }
    );
};

export const prepareCart = async (cartItemList, { checkoutMode = false } = {}) => {
    const productIds = cartItemList.map(item => item.productId.toString());
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    // Сбор актуальной корзины
    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
    const now = Date.now();

    return cartItemList.reduce(
        (acc, cartItem) => {
            const productId = cartItem.productId.toString();
            const dbProduct = dbProductMap.get(productId);

            if (!dbProduct) {
                acc.purchaseProductList.push(prepareCartProductSnapshotData(cartItem));
                acc.cartItemList.push({
                    id: productId,
                    quantity: cartItem.quantity,
                    quantityReduced: true,
                    outOfStock: true,
                    inactive: true,
                    deleted: true
                });
                return acc;
            }

            const available = Math.max(0, dbProduct.stock - dbProduct.reserved);

            acc.purchaseProductList.push(prepareProductData(dbProduct, { now }));
            acc.cartItemList.push({
                id: productId,
                quantity: cartItem.quantity,
                quantityReduced: checkoutMode ? false : available < cartItem.quantity,
                outOfStock: checkoutMode ? false : available === 0,
                inactive: checkoutMode ? false : !dbProduct.isActive,
                deleted: false
            });
            return acc;
        },
        { purchaseProductList: [], cartItemList: [] }
    );
};

export const populateGuestCart = async (guestCart) => {
    const productIds = guestCart.map(item => item.id);
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));

    return guestCart.map(cartItem => {
        const dbProduct = dbProductMap.get(cartItem.id);
        if (!dbProduct) return null;

        if (!dbProduct.isActive) return null;

        const available = Math.max(0, dbProduct.stock - dbProduct.reserved);
        if (available <= 0) return null;

        return {
            productId: cartItem.id,
            quantity: cartItem.quantity,
            nameSnapshot: dbProduct.name,
            brandSnapshot: dbProduct.brand ?? null
        };
    }).filter(Boolean);
};

export const mergeCarts = (dbCart, populatedGuestCart) => {
    const mergedMap = new Map();

    // Товары из серверной корзины в первую очередь
    for (const item of dbCart) {
        const key = item.productId.toString();
        mergedMap.set(key, item);
    }

    // Товары из гостевой корзины — перезапись серверных товаров в карте
    for (const item of populatedGuestCart) {
        const key = item.productId;
        mergedMap.set(key, item);
    }

    return Array.from(mergedMap.values());
};

export const areCartsDifferent = (aCart, bCart) => {
    const cartToMap = (cart) => Object.fromEntries(cart.map(prod => [prod.productId, prod]));

    const aCartMap = cartToMap(aCart);
    const bCartMap = cartToMap(bCart);
  
    const allIds = new Set([...Object.keys(aCartMap), ...Object.keys(bCartMap)]);
  
    for (const id of allIds) {
        const aCartItem = aCartMap[id];
        const bCartItem = bCartMap[id];

        if (!aCartItem || !bCartItem || aCartItem.quantity !== bCartItem.quantity) {
            return true;
        }
    }

    return false;
};

export const prepareFixedDbCart = async (dbCart) => {
    const productIds = dbCart.map(item => item.productId);
    const dbProducts = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds } }).lean()
        : [];

    // Сбор актуальной и исправленной корзины
    const dbProductMap = new Map(dbProducts.map(prod => [prod._id.toString(), prod]));
    const now = Date.now();

    return dbCart.reduce(
        (acc, cartItem) => {
            const productId = cartItem.productId.toString();
            const dbProduct = dbProductMap.get(productId);
            if (!dbProduct) return acc;

            if (!dbProduct.isActive) return acc;

            const available = Math.max(0, dbProduct.stock - dbProduct.reserved);
            if (available === 0) return acc;

            cartItem.quantity = Math.min(cartItem.quantity, available);
            cartItem.nameSnapshot = dbProduct.name;
            cartItem.brandSnapshot = dbProduct.brand;

            acc.fixedDbCart.push(cartItem);
            acc.purchaseProductList.push(prepareProductData(dbProduct, { now }));
            acc.cartItemList.push({
                id: productId,
                quantity: cartItem.quantity,
                quantityReduced: false,
                outOfStock: false,
                inactive: false,
                deleted: false
            });
            return acc;
        },
        { fixedDbCart: [], purchaseProductList: [], cartItemList: [] }
    );
};

// id в гостевой корзине строка, в серверной корзине productId — ObjectId, приводимая к строке
