import {
    createYooKassaPayment,
    createYooKassaRefunds,
    verifyYooKassaWebhookAuthenticity,
    normalizeYooKassaWebhook,
    fetchYooKassaExternalTransactions,
    normalizeYooKassaExternalTransaction
} from './online-providers/yookassaService.js';
import log from '../utils/logger.js';
import { CARD_ONLINE_PROVIDER } from '../../shared/constants.js';

export const detectWebhookProvider = (req) => {
    const headers = req.headers;
    const userAgent = headers['user-agent'] || '';

    // ЮKassa
    if (headers['signature'] || headers['x-request-signature'] || userAgent.includes('AHC')) {
        return CARD_ONLINE_PROVIDER.YOOKASSA;
    }

    log.warn(`${req.logCtx} - Провайдер вебхука не определён:`, { headers: req.headers, body: req.body });
    return null;
};

const providerMap = {
    [CARD_ONLINE_PROVIDER.YOOKASSA]: {
        createPayment: createYooKassaPayment,
        createRefund: createYooKassaRefunds,
        verifyWebhook: verifyYooKassaWebhookAuthenticity,
        normalizeWebhook: normalizeYooKassaWebhook,
        fetchExternal: fetchYooKassaExternalTransactions,
        normalizeExternal: normalizeYooKassaExternalTransaction
    }
};

const getProvider = (provider) => providerMap[provider] ?? null;

export const createOnlinePayment = async (provider, params) => {
    const p = getProvider(provider);

    if (!p?.createPayment) {
        return {
            paymentId: null,
            confirmationUrl: null,
            error: new Error(`Провайдер ${provider} не поддерживает онлайн-оплату`)
        };
    }

    return await p.createPayment(params);
};

export const createOnlineRefunds = async (provider, refundTasks, params) => {
    const p = getProvider(provider);

    if (!p?.createRefund) {
        return {
            refundIds: [],
            errors: refundTasks.map(task => ({
                task,
                reason: new Error(`Провайдер ${provider} не поддерживает онлайн-возвраты`)
            }))
        };
    }

    return await p.createRefund(refundTasks, params);
};

export const verifyWebhookAuthenticity = (provider, req) => {
    const p = getProvider(provider);
    if (!p?.verifyWebhook) return false;

    return p.verifyWebhook(req);
};

export const normalizeWebhook = (provider, payload) => {
    const p = getProvider(provider);
    if (!p?.normalizeWebhook) return null;

    return p.normalizeWebhook(payload);
};

export const fetchExternalTransactions = async (provider, stuckDbOrders) => {
    const p = getProvider(provider);
    if (!p?.fetchExternal) return [];

    return await p.fetchExternal(stuckDbOrders);
};

export const normalizeExternalTransaction = (provider, tx) => {
    const p = getProvider(provider);
    if (!p?.normalizeExternal) return null;

    return p.normalizeExternal(tx);
};
