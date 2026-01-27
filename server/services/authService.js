import Order from '../database/models/Order.js';
import {
    populateGuestCart,
    mergeCarts,
    areCartsDifferent,
    prepareCart
} from '../services/cartService.js';
import { ORDER_STATUS, ORDER_ACTIVE_STATUSES } from '../../shared/constants.js';

export const getUserData = async (dbUser) => {
    const baseUserData = {
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role
    };

    if (dbUser.role === 'customer') {
        baseUserData.unreadNotificationsCount = dbUser.notifications.filter(n => !n.isRead).length;
        baseUserData.discount = dbUser.discount;
    }

    if (dbUser.role === 'admin') {
        baseUserData.managedActiveOrdersCount = await Order.countDocuments({
            currentStatus: { $in: ORDER_ACTIVE_STATUSES }
        });
    }

    return baseUserData;
};

export const getSessionData = async (dbUser, guestCart) => {
    // Данные пользователя
    const user = await getUserData(dbUser);

    if (dbUser.role !== 'customer') {
        return { user };
    }

    // При регистрации поля _id и cart в dbUser ещё отсутствуют
    // Активный черновик заказа
    const orderDraft = dbUser._id
        ? await Order.findOne({ customerId: dbUser._id, currentStatus: ORDER_STATUS.DRAFT }, { _id: 1 })
        : null;
    const orderDraftId = orderDraft ? orderDraft._id.toString() : null;

    /// Объединение товаров гостевой и серверной корзин, если нет начатого заказа ///
    let cartWasMerged = false;

    if (guestCart.length > 0 && !orderDraftId) {
        const populatedGuestCart = await populateGuestCart(guestCart);
        const mergedCart = mergeCarts(dbUser.cart || [], populatedGuestCart);
        const cartsAreDifferent = areCartsDifferent(dbUser.cart || [], mergedCart);
        
        if (cartsAreDifferent) {
            dbUser.cart = mergedCart;
            cartWasMerged = true;
        }
    }

    // Данные корзины
    const { purchaseProductList, cartItemList } = await prepareCart(dbUser.cart || [], {
        checkoutMode: Boolean(orderDraft)
    });

    return { user, purchaseProductList, cartItemList, cartWasMerged, orderDraftId };
};
