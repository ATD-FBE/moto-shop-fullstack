import mongoose from 'mongoose';
import { validationRules } from '../../../../shared/fieldRules.js';
import { DISCOUNT_SOURCES, PRODUCT_UNITS } from '../../../../shared/constants.js';

const { Schema } = mongoose;

const baseOrderItemFields = {
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        min: 0,
        required: true
    }
};

export const DraftOrderItemSchema = new Schema({
    ...baseOrderItemFields,
    quantitySnapshot: {
        type: Number,
        min: 0,
        required: true
    },
    priceSnapshot: {
        type: Number,
        min: 0,
        required: true
    },
    appliedDiscountSnapshot: { // В процентах
        type: Number,
        min: 0,
        max: 100,
        required: true
    },
    appliedDiscountSourceSnapshot: {
        type: String,
        enum: DISCOUNT_SOURCES,
        required: true
    }
}, {
    _id: false
});

export const FinalOrderItemSchema = new Schema({
    ...baseOrderItemFields,
    imageFilename: { // Опционально
        type: String
    },
    sku: { // Опционально
        type: String,
        match: validationRules.product.sku
    },
    name: {
        type: String,
        required: true,
        match: validationRules.product.name
    },
    brand: { // Опционально
        type: String,
        match: validationRules.product.brand
    },
    unit: {
        type: String,
        enum: PRODUCT_UNITS,
        required: true
    },
    originalUnitPrice: {
        type: Number,
        min: 0,
        required: true,
        validate: [val => validationRules.product.price.test(String(val))]
    },
    appliedDiscount: { // В процентах
        type: Number,
        min: 0,
        max: 100,
        required: true
    },
    appliedDiscountSource: {
        type: String,
        enum: DISCOUNT_SOURCES,
        required: true
    },
    finalUnitPrice: { // originalUnitPrice * (1 - appliedDiscount / 100)
        type: Number,
        min: 0,
        required: true,
        validate: [val => validationRules.product.price.test(String(val))]
    },
    totalPrice: { // finalUnitPrice * quantity
        type: Number,
        min: 0,
        required: true,
        validate: [val => validationRules.product.price.test(String(val))]
    },
}, {
    _id: false
});
