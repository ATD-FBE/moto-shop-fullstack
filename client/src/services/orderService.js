import { formatProductTitle, formatCurrency } from '@/helpers/textHelpers.js';
import { formatDateToMoscowLog } from '@shared/commonHelpers.js';
import {
    DELIVERY_METHOD,
    PAYMENT_METHOD_OPTIONS,
    REFUND_METHOD_OPTIONS,
    BANK_PROVIDER_OPTIONS,
    CARD_ONLINE_PROVIDER_OPTIONS,
    FINANCIALS_EVENT_CONFIG,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { TEXT_LOG_LINE_BREAK, NO_VALUE_LABEL } = CLIENT_CONSTANTS;

const METHOD_MAP = [...PAYMENT_METHOD_OPTIONS, ...REFUND_METHOD_OPTIONS]
    .reduce((map, opt) => {
        map[opt.value] = opt;
        return map;
    }, {});

const PROVIDER_MAP = [...BANK_PROVIDER_OPTIONS, ...CARD_ONLINE_PROVIDER_OPTIONS]
    .reduce((map, opt) => {
        map[opt.value] = opt;
        return map;
    }, {});

export const formatOrderStatusHistoryLogs = (orderStatusHistory) => {
    return orderStatusHistory.reduce((acc, entry) => {
        const { status, isRollback, changes, cancellationReason, changedBy, changedAt } = entry;
        let line = '';

        // Добавление отката в первую очередь, если есть
        if (isRollback) {
            line += '[ОТКАТ] ';
        }

        // Добавление даты и статуса
        line += `[${formatDateToMoscowLog(changedAt)}] — Статус: [${status.toUpperCase()}]`;

        // Добавление причины отмены, если есть
        if (cancellationReason) {
            line += ` — Причина отмены: "${cancellationReason}"`;
        }

        // Добавление изменений, если они есть
        if (changes && changes.length > 0) {
            const changesStr = changes.map(change => {
                const oldValue = formatChangeValue(change.oldValue, change.currency);
                const newValue = formatChangeValue(change.newValue, change.currency);
                return `${change.field}: ${oldValue} → ${newValue}`;
            }).join('; ');

            line += ` — Изменения: { ${changesStr} }`;
        }

        // Добавление данных об операторе, изменившем статус (только пользователь)
        const changedByInfo = changedBy
            ? `${changedBy.name} (ID: ${changedBy.id}, роль: ${changedBy.role})`
            : NO_VALUE_LABEL;
        line += ` — Изменено: ${changedByInfo}`;

        return acc + line + TEXT_LOG_LINE_BREAK;
    }, '').slice(0, -TEXT_LOG_LINE_BREAK.length);
};

export const formatFinancialsEventHistoryLogs = (eventHistory) => {
    return eventHistory.reduce((acc, entry) => {
        const { eventId, event, action, changedBy, changedAt, voided } = entry;
        let line = '';

        // Добавление voided-префиксов в первую очередь
        if (voided?.flag) {
            const voidedBy = voided.changedBy;
            const voidedAt = voided.changedAt;
            const voidedByInfo = voidedBy
                ? `${voidedBy.name} (ID: ${voidedBy.id}, роль: ${voidedBy.role})`
                : NO_VALUE_LABEL;
                
            line += `[АННУЛИРОВАНО от ${formatDateToMoscowLog(voidedAt)}, кем: ${voidedByInfo}`;
            if (voided.note) line += `, причина: "${voided.note}"`;
            line += '] — ';
        }

        // Добавление даты
        line += `[${formatDateToMoscowLog(changedAt)}]`;

        // Добавление события
        const eventLbl = FINANCIALS_EVENT_CONFIG[event]?.label ?? event;
        line += ` — Событие: [${eventLbl.toUpperCase()}] [ID записи: ${eventId}]`;

        // Добавление деталей оплаты/возврата
        const methodLbl = METHOD_MAP[action.method]?.label ?? action.method;
        const providerLbl = PROVIDER_MAP[action.provider]?.label ?? action.provider;

        const details = [
            `Способ: ${methodLbl}`,
            `Сумма: ${formatCurrency(action.amount)} ₽`,
            ...(action.provider ? [`Провайдер: ${providerLbl}`] : []),
            ...(action.transactionId ? [`ID транзакции: ${action.transactionId}`] : []),
            ...(action.originalPaymentId ? [`ID исходного платежа: ${action.originalPaymentId}`] : []),
            ...(action.externalReference ? [`Источник: ${action.externalReference}`] : [])
        ];

        line += ` — Детали: { ${details.join('; ')} }`;

        // Добавление данных об операторе, добавившем запись (пользователь или SYSTEM)
        const changedByMeta = [
            changedBy?.id ? `ID: ${changedBy.id}` : null,
            changedBy?.role ? `роль: ${changedBy.role}` : null
        ].filter(Boolean).join(', ');
        
        const changedByInfo = changedBy
            ? `${changedBy.name}${changedByMeta ? ` (${changedByMeta})` : ''}`
            : NO_VALUE_LABEL;

        line += ` — Зафиксировано: ${changedByInfo}`;

        return acc + line + TEXT_LOG_LINE_BREAK;
    }, '').slice(0, -TEXT_LOG_LINE_BREAK.length);
};

export const formatAuditLogs = (auditLog) => {
    return auditLog.reduce((acc, entry) => {
        const { changes, reason, changedBy, changedAt } = entry;

        // Добавление даты
        let line = `[${formatDateToMoscowLog(changedAt)}]`;

        // Добавление изменений
        const changesStr = changes.map(change => {
            const oldValue = formatChangeValue(change.oldValue, change.currency);
            const newValue = formatChangeValue(change.newValue, change.currency);
            return `${change.field}: ${oldValue} → ${newValue}`;
        }).join('; ');

        line += ` — Изменения: { ${changesStr} }`;

        // Добавление причины
        line += ` — Причина: "${reason}"`;

        // Добавление данных об операторе, изменившем статус (только пользователь)
        const changedByInfo = changedBy
            ? `${changedBy.name} (ID: ${changedBy.id}, роль: ${changedBy.role})`
            : NO_VALUE_LABEL;
        line += ` — Изменено: ${changedByInfo}`;

        return acc + line + TEXT_LOG_LINE_BREAK;
    }, '').slice(0, -TEXT_LOG_LINE_BREAK.length);
};

export const formatOrderItemsAdjustmentLogs = (orderItemsAdjustments = []) => {
    const logs = [];
    let num = 0;

    const addLog = (message) => logs.push(`<span className="bold">${++num}.</span> ${message}`);

    for (const item of orderItemsAdjustments) {
        const { id, name, brand, adjustments } = item;
        const productTitle = formatProductTitle(name, brand) || `Товар (ID: ${id})`;
        const productTitleHtml = `<span className="cursive underline">"${productTitle}"</span>`;

        if (adjustments.deleted) {
            addLog(`<span className="color-red">Удалён</span> товар: ${productTitleHtml}.`);
        }

        if (adjustments.outOfStock) {
            addLog(`Товар <span className="color-red">закончился</span>: ${productTitleHtml}.`);
        }

        if (adjustments.quantityReduced) {
            const { old, corrected } = adjustments.quantityReduced;
            addLog(
                `<span className="color-red">Уменьшено количество</span> товара ${productTitleHtml}: ` +
                `с <span className="bold color-blue">${old}</span> ` +
                `до <span className="bold color-green">${corrected}</span>.`
            );
        }
    }

    return logs.join(TEXT_LOG_LINE_BREAK);
};

export const buildCustomerFullName = (firstName, lastName, middleName) =>
    [lastName, firstName, middleName ?? null].filter(Boolean).join(' ');    

export const buildShippingAddressDisplay = (deliveryMethod, shippingAddress) =>
    deliveryMethod === DELIVERY_METHOD.SELF_PICKUP
        ? NO_VALUE_LABEL
        : [
            shippingAddress.postalCode ?? null,                                    // Опционально
            shippingAddress.region ?? null,                                        // Опционально
            shippingAddress.district ? `${shippingAddress.district} район` : null, // Опционально
            `г. ${shippingAddress.city}`,
            `ул. ${shippingAddress.street}`,
            `д. ${shippingAddress.house}`,
            shippingAddress.apartment ? `кв. ${shippingAddress.apartment}` : null  // Опционально
        ].filter(Boolean).join(', ');

export const getShippingCostDisplay = (shippingCost) =>
    shippingCost === undefined
        ? NO_VALUE_LABEL
        : shippingCost === null
            ? '(уточняется)'
            : `${formatCurrency(shippingCost)} руб.`;


const formatChangeValue = (val, currency) => {
    if (val === null) return '<PENDING>';
    if (val === undefined) return '<UNDEFINED>';
    if (typeof val === 'object') return JSON.stringify(val);
    if (currency) return `${formatCurrency(val)} ₽`;
    return String(val);
};
