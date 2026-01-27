import mongoose from 'mongoose';
import UpdateHistoryItemSchema from './schemas/UpdateHistoryItemSchema.js';
import { validationRules } from '../../../shared/validation.js';
import { NOTIFICATION_STATUS } from '../../../shared/constants.js';

const { Schema } = mongoose;

const NotificationSchema = new Schema({
    status: {
        type: String,
        enum: Object.values(NOTIFICATION_STATUS),
        default: NOTIFICATION_STATUS.DRAFT,
        index: true
    },
    recipients: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'User'
        }],
        required: true,
        validate: [
            arr => validationRules.notification.recipients(arr) &&
            arr.every(id => mongoose.Types.ObjectId.isValid(id))
        ]
    },
    subject: {
        type: String,
        required: true,
        match: validationRules.notification.subject
    },
    message: {
        type: String,
        required: true,
        match: validationRules.notification.message
    },
    signature: {
        type: String,
        required: true,
        match: validationRules.notification.signature
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    updateHistory: [UpdateHistoryItemSchema],
    sentBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    sentAt: {
        type: Date
    }
}, {
    timestamps: true // Автоматическое добавление полей createdAt и updatedAt
});

// Составные индексы при поиске и сортировке для админа
NotificationSchema.index({ status: 1, updatedAt: -1 });
NotificationSchema.index({ status: 1, sentAt: -1 });

const Notification = mongoose.model('Notification', NotificationSchema);

export default Notification;
