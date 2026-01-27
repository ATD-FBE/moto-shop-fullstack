import { REQUEST_STATUS, resolveRequestStatus } from '@shared/constants.js';

const apiResponse = async (response, extra = {}) => {
    const { errorPrefix = '', asFile = false, ...extraRest } = extra;
    const contentType = response.headers.get('Content-Type') || '';
    const isJsonResponse = contentType.includes('application/json');
    let data = {};
    let reason;

    if (isJsonResponse) {
        try { data = await response.json(); } catch {}
        reason = data.reason;
    }

    const status = resolveRequestStatus(response.status, reason);

    // Пустое тело запроса (204)
    if (status === REQUEST_STATUS.UNCHANGED) {
        return {
            status,
            message: 'Данные не изменены, сохранять нечего',
            ...extraRest
        };
    }

    // JSON-ответ (при ошибке загрузки файла содержит данные ошибки)
    if (isJsonResponse) {
        const { message, ...dataRest } = data;
        const safeMessage = message || (response.ok ? 'OK' : `Ошибка сервера (${response.status})`);
    
        if (!response.ok) {
            return {
                status: status ?? REQUEST_STATUS.ERROR,
                message: `${errorPrefix ? (errorPrefix + ': ') : ''}${safeMessage}`,
                ...extraRest,
                ...dataRest
            };
        }
    
        return { status, message: safeMessage, ...extraRest, ...dataRest };
    }

    // Бинарные данные в ответе
    if (asFile) {
        const blob = await response.blob();

        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'file';

        return { status, message: 'Файл успешно загружен', blob, filename, ...extraRest };
    }

    // Текстовый ответ
    const text = await response.text();
    return { status, text, ...extraRest };
};

export default apiResponse;
