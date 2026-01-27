import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { REQUEST_STATUS, PROD_ENV } = CLIENT_CONSTANTS;

export const logRequestStatus = ({ context, status, message, details, unhandled = false }) => {
    const contextText = context ? `[${context.toUpperCase()}] ` : '';
    const statusText = `[${status ? status.toUpperCase() : '???'}]`;
    const messageText = message || '<нет сообщения>';

    if (unhandled) {
        return console.error(`${contextText}Необработанный статус: ${statusText}. ${messageText}`);
    }

    const formattedMessage = `${contextText}${statusText} ${messageText}${details ? ':' : ''}`;
    const logArgs = [formattedMessage];
    
    if (details) logArgs.push(details);

    switch (status) {
        case REQUEST_STATUS.SUCCESS:
        case REQUEST_STATUS.PARTIAL:
            if (!PROD_ENV) console.log(...logArgs);
            break;

        case REQUEST_STATUS.UNAUTH:
        case REQUEST_STATUS.USER_GONE:
        case REQUEST_STATUS.DENIED:
        case REQUEST_STATUS.BAD_REQUEST:
        case REQUEST_STATUS.NOT_FOUND:
        case REQUEST_STATUS.NO_SELECTION:
        case REQUEST_STATUS.LIMITATION:
        case REQUEST_STATUS.CONFLICT:
        case REQUEST_STATUS.MODIFIED:
        case REQUEST_STATUS.UNCHANGED:
        case REQUEST_STATUS.INVALID:
            if (!PROD_ENV) console.warn(...logArgs);
            break;

        case REQUEST_STATUS.ERROR:
        case REQUEST_STATUS.NETWORK:
            console.error(...logArgs);
            break;

        default:
            console.error(`${contextText}Неизвестный статус: ${statusText}. ${messageText}`);
            break;
    }
};
