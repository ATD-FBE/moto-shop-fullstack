import Product from '../database/models/Product.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { prepareGuestCart, prepareCart, prepareFixedDbCart } from '../services/cartService.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';

/// Синхронизация гостевой корзины ///
export const handleGuestCartItemListRequest = async (req, res, next) => {
    const { guestCart } = req.body ?? {};

    if (!typeCheck.arrayOf(guestCart, 'object', typeCheck)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: guestCart' });
    }

    for (const { id, quantity } of guestCart) {
        if (!typeCheck.objectId(id) || !Number.isInteger(quantity) || quantity < 0) {
            return safeSendResponse(req, res, 400, { message: 'Неверный формат данных в guestCart' });
        }
    }

    try {
        const { purchaseProductList, cartItemList } = await prepareGuestCart(guestCart);
        checkTimeout(req);

        safeSendResponse(req, res, 200, {
            message: 'Гостевая корзина успешно синхронизирована',
            purchaseProductList,
            cartItemList
        });
    } catch (err) {
        next(err);
    }
};

/// Загрузка серверной корзины ///
export const handleCartItemListRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    try {
        const { purchaseProductList, cartItemList } = await prepareCart(dbUser.cart);
        checkTimeout(req);

        safeSendResponse(req, res, 200, {
            message: 'Корзина успешно загружена',
            purchaseProductList,
            cartItemList,
            customerDiscount: dbUser.discount
        });
    } catch (err) {
        next(err);
    }
};

/// Изменение количества товара в корзине ///
export const handleCartItemUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const productId = req.params.productId;
    const { quantity } = req.body ?? {};

    const inputTypeMap = {
        productId: { value: productId, type: 'objectId' },
        quantity: { value: quantity, type: 'number' }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap);

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const quantityNum = Number(quantity);

    if (!Number.isInteger(quantityNum) || quantityNum < 0) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: quantity' });
    }

    try {
        const { prodLbl } = await runInTransaction(async (session) => {
            let prodLbl = `(ID: ${productId})`;

            if (quantityNum === 0) {
                dbUser.cart = dbUser.cart.filter(item => !item.productId.equals(productId));
            } else {
                const dbProduct = await Product.findById(productId).lean().session(session);
                checkTimeout(req);
    
                if (!dbProduct) {
                    throw createAppError(404, `Товар ${prodLbl} не найден`);
                }

                prodLbl = `"${dbProduct.name}"`;

                const existingItem = dbUser.cart.find(item => item.productId.equals(productId));
                const nameSnapshot = dbProduct.name;
                const brandSnapshot = dbProduct.brand ?? null;
    
                // Актуальное количество товара на складе не проверяется
                if (existingItem) {
                    Object.assign(existingItem, { quantity: quantityNum, nameSnapshot, brandSnapshot });
                } else {
                    dbUser.cart.push({ productId, quantity: quantityNum, nameSnapshot, brandSnapshot });
                }
            }
    
            await dbUser.save({ session });
            checkTimeout(req);

            return { prodLbl };
        });

        safeSendResponse(req, res, 200, { message: `Количество товара ${prodLbl} в корзине изменено` });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Восстановление товара в корзине ///
export const handleCartItemRestoreRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const productId = req.params.productId;
    const { quantity, position } = req.body ?? {};

    const inputTypeMap = {
        productId: { value: productId, type: 'objectId' },
        quantity: { value: quantity, type: 'number' },
        position: { value: position, type: 'number' }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap);

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const quantityNum = Number(quantity);
    const positionNum = Number(position);

    if (!Number.isInteger(quantityNum) || quantityNum < 0) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: quantity' });
    }
    if (!Number.isInteger(positionNum) || positionNum < 0) {
        return safeSendResponse(req, res, 400, { message: 'Некорректное значение поля: position' });
    }
    
    const isItemInCart = dbUser.cart.some(item => item.productId.equals(productId));

    if (isItemInCart) {
        return safeSendResponse(req, res, 400, { message: 'Товар уже есть в корзине' });
    }

    try {
        const { prodLbl } = await runInTransaction(async (session) => {
            const dbProduct = await Product.findById(productId).lean().session(session);
            checkTimeout(req);

            const prodLbl = dbProduct ? `"${dbProduct.name}"` : `(ID: ${productId})`;

            if (!dbProduct) {
                throw createAppError(404, `Товар ${prodLbl} не найден`);
            }
    
            const insertPos = positionNum <= dbUser.cart.length ? positionNum : dbUser.cart.length;
            const newItem = {
                productId,
                quantity: quantityNum,
                nameSnapshot: dbProduct.name,
                brandSnapshot: dbProduct.brand ?? null
            };
    
            dbUser.cart.splice(insertPos, 0, newItem);
            await dbUser.save({ session });
            checkTimeout(req);

            return { prodLbl };
        });

        safeSendResponse(req, res, 200, { message: `Товар ${prodLbl} успешно восстановлен в корзине` });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Исправление всех проблемных товаров в корзине ///
export const handleCartWarningsFixRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    try {
        const { purchaseProductList, cartItemList } = await runInTransaction(async (session) => {
            const { fixedDbCart, purchaseProductList, cartItemList } = await prepareFixedDbCart(dbUser.cart);
            checkTimeout(req);

            dbUser.cart = fixedDbCart;
            await dbUser.save({ session });
            checkTimeout(req);

            return { purchaseProductList, cartItemList };
        });

        safeSendResponse(req, res, 200, {
            message: 'Проблемные товары в корзине успешно исправлены',
            purchaseProductList,
            cartItemList,
            customerDiscount: dbUser.discount
        });
    } catch (err) {
        next(err);
    }
};

/// Удаление товара из корзины ///
export const handleCartItemRemoveRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const productId = req.params.productId;

    if (!typeCheck.objectId(productId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: productId' });
    }

    try {
        await runInTransaction(async (session) => {
            dbUser.cart = dbUser.cart.filter(item => !item.productId.equals(productId));
            await dbUser.save({ session });
            checkTimeout(req);
        });

        safeSendResponse(req, res, 200, { message: `Товар ${productId} удалён из корзины` });
    } catch (err) {
        next(err);
    }
};

/// Очистка корзины ///
export const handleCartClearRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    try {
        await runInTransaction(async (session) => {
            dbUser.cart = [];
            await dbUser.save({ session });
            checkTimeout(req);
        });

        safeSendResponse(req, res, 200, { message: 'Корзина успешно очищена' });
    } catch (err) {
        next(err);
    }
};
