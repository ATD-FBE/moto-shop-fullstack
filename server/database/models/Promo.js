import mongoose from 'mongoose';
import UpdateHistoryItemSchema from './schemas/UpdateHistoryItemSchema.js';
import { validationRules } from '../../../shared/validation.js';

const { Schema } = mongoose;

const PromoSchema = new Schema({
    title: {
        type: String,
        required: true,
        match: validationRules.promotion.title
    },
    imageFilename: { // Опционально
        type: String,
        set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
    },
    description: {
        type: String,
        required: true,
        match: validationRules.promotion.description
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    updateHistory: [UpdateHistoryItemSchema]
}, {
    timestamps: true // Автоматическое добавление полей createdAt и updatedAt
});

const Promo = mongoose.model('Promo', PromoSchema);

export default Promo;