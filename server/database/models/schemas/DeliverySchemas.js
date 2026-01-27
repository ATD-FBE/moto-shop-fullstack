import mongoose from 'mongoose';
import { validationRules } from '../../../../shared/validation.js';
import { DELIVERY_METHOD, DELIVERY_METHOD_OPTIONS } from '../../../../shared/constants.js';

const { Schema } = mongoose;

const baseDeliveryFields = {
    deliveryMethod: {
        type: String,
        enum: DELIVERY_METHOD_OPTIONS.map(opt => opt.value),
        set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
    },
    allowCourierExtra: {
        type: Boolean,
        default: function () {
            return this.deliveryMethod === DELIVERY_METHOD.COURIER ? false : undefined;
        },
        set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
    },
    shippingAddress: {
        region: { // Опционально для заказа
            type: String,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        district: { // Опционально для заказа
            type: String,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        city: {
            type: String,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        street: {
            type: String,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        house: {
            type: String,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        apartment: { // Опционально для заказа
            type: String,
            match: validationRules.checkout.apartment,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        },
        postalCode: { // Опционально для заказа
            type: String,
            match: validationRules.checkout.postalCode,
            set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
        }
    }
};

// Для хранения в профиле пользователя (всё опционально)
export const DraftDeliverySchema = new Schema(baseDeliveryFields, { _id: false });

// Для хранения в заказе (ключевые поля обязательны)
export const FinalDeliverySchema = new Schema({
    deliveryMethod: {
        ...baseDeliveryFields.deliveryMethod,
        required: true
    },
    allowCourierExtra: baseDeliveryFields.allowCourierExtra,
    shippingAddress: {
        region: { // Опционально для заказа
            ...baseDeliveryFields.shippingAddress.region,
            match: validationRules.checkout.region
        },
        district: { // Опционально для заказа
            ...baseDeliveryFields.shippingAddress.district,
            match: validationRules.checkout.district
        },
        city: {
            ...baseDeliveryFields.shippingAddress.city,
            required: isDeliveryRequired,
            match: validationRules.checkout.city
        },
        street: {
            ...baseDeliveryFields.shippingAddress.street,
            required: isDeliveryRequired,
            match: validationRules.checkout.street
        },
        house: {
            ...baseDeliveryFields.shippingAddress.house,
            required: isDeliveryRequired,
            match: validationRules.checkout.house
        },
        apartment: { // Опционально для заказа
            ...baseDeliveryFields.shippingAddress.apartment,
            match: validationRules.checkout.apartment
        },
        postalCode: { // Опционально для заказа
            ...baseDeliveryFields.shippingAddress.postalCode,
            match: validationRules.checkout.postalCode
        }
    },
    shippingCost: {
        type: Number,
        min: 0
    }
}, {
    _id: false
});

// this в функции required надёжен для обычных поддокументов, но не надёжен для поддокументов массивов
function isDeliveryRequired() {
    return this.deliveryMethod !== DELIVERY_METHOD.SELF_PICKUP;
}
