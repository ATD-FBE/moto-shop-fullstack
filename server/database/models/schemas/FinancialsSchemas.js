import mongoose from 'mongoose';
import {
    PAYMENT_METHOD_OPTIONS,
    REFUND_METHOD_OPTIONS,
    TRANSACTION_TYPE,
    ONLINE_TRANSACTION_STATUS,
    BANK_PROVIDER,
    CARD_ONLINE_PROVIDER,
    FINANCIALS_STATE,
    FINANCIALS_STATE_CONFIG,
    FINANCIALS_EVENT_CONFIG
} from '../../../../shared/constants.js';
import { validationRules } from '../../../../shared/fieldRules.js';

const { Schema } = mongoose;

const baseFinancialsFields = {
    defaultPaymentMethod: {
        type: String,
        enum: PAYMENT_METHOD_OPTIONS.map(opt => opt.value),
        set: val => val === null ? undefined : val // Удаление поля при значении null (метод save())
    }
};

// Аннулирование существующей записи в истории
const VoidedSchema = new Schema({
    flag: {
        type: Boolean,
        required: true // В поддокументе вместо default нужно ставить required
    },
    note: { // Опционально
        type: String,
        match: validationRules.financials.voidedNote
    },
    changedBy: {
        id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        role: {
            type: String,
            required: true
        }
    },
    changedAt: {
        type: Date,
        required: true // В поддокументе вместо default нужно ставить required
    }
}, {
    _id: false
});

// Временный объект с данными онлайн-транзакции (оплата/возврат картой)
const CurrentOnlineTransactionSchema = new Schema({
    type: {
        type: String,
        enum: Object.values(TRANSACTION_TYPE),
        required: true
    },
    providers: {
        type: [{
            type: String,
            enum: Object.values(CARD_ONLINE_PROVIDER)
        }],
        required: true,
        validate: {
            validator: arr => arr.length > 0,
            message: 'providers не может быть пустым массивом'
        }
    },
    status: {
        type: String,
        enum: Object.values(ONLINE_TRANSACTION_STATUS),
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    transactionIds: { // Отсутствует при статусе ONLINE_TRANSACTION_STATUS.INIT
        type: [{
            type: String
        }],
        default: []
    },
    confirmationUrl: { // Опционально
        type: String
    },
    startedAt: {
        type: Date,
        default: Date.now
    }
}, {
    _id: false
});

// Для хранения в профиле пользователя (всё опционально)
export const DraftFinancialsSchema = new Schema(baseFinancialsFields, { _id: false });

// Для хранения в заказе (ключевые поля обязательны)
export const FinalFinancialsSchema = new Schema({
    defaultPaymentMethod: {
        ...baseFinancialsFields.defaultPaymentMethod,
        required: true
    },
    state: {
        type: String,
        enum: Object.keys(FINANCIALS_STATE_CONFIG),
        default: FINANCIALS_STATE.PAID_PENDING
    },
    totalPaid: { // Агрегируемая сумма поступления всех траншей оплат
        type: Number,
        default: 0,
        validate: [val => validationRules.financials.totalPaid.test(String(val))]
    },
    totalRefunded: { // Агрегируемая сумма поступления всех траншей возвратов
        type: Number,
        default: 0,
        validate: [val => validationRules.financials.totalRefunded.test(String(val))]
    },
    eventHistory: [{
        eventId: {
            type: Schema.Types.ObjectId,
            default: () => new mongoose.Types.ObjectId()
        },
        event: {
            type: String,
            required: true,
            enum: Object.keys(FINANCIALS_EVENT_CONFIG)
        },
        action: {
            method: {
                type: String,
                required: true,
                enum: [...PAYMENT_METHOD_OPTIONS, ...REFUND_METHOD_OPTIONS].map(opt => opt.value)
            },
            amount: { // Сумма транша/попытки оплаты/возврата
                type: Number,
                required: true,
                validate: [val => validationRules.financials.amount.test(String(val))]
            },
            provider: { // Банк при переводе/провайдер платёжного шлюза при оплате/возврате картой онлайн
                type: String,
                enum: [...Object.values(BANK_PROVIDER), ...Object.values(CARD_ONLINE_PROVIDER)]
            },
            transactionId: { // ID транзакции при банковском переводе/оплате картой онлайн
                type: String,
                match: validationRules.financials.transactionId
            },
            originalPaymentId: { // ID платёжной транзакции для возврата на карту онлайн
                type: String,
                match: validationRules.refund.originalPaymentId
            },
            failureReason: { // Опционально для банковского перевода и онлайн-транзакций
                type: String,
                match: validationRules.financials.failureReason
            },
            externalReference: { // Опциональные данные по терминалу при возврате на карту вручную
                type: String,
                match: validationRules.refund.externalReference
            }
        },
        changedBy: {
            id: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            name: {
                type: String,
                default: 'SYSTEM'
            },
            role: {
                type: String,
                default: 'system'
            }
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        voided: {
            type: VoidedSchema,
            default: undefined
        }
    }],
    currentOnlineTransaction: {
        type: CurrentOnlineTransactionSchema,
        default: undefined
    }
}, {
    _id: false
});
