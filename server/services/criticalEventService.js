import CriticalEvent from '../database/models/CriticalEvent.js';
import log from '../utils/logger.js';

export const logCriticalEvent = async ({ logContext, category, reason, data }) => {
    const eventDoc = { category, reason, data };

    log.error(`${logContext} - [CRITICAL EVENT]`, eventDoc);

    try {
        await CriticalEvent.create(eventDoc);
    } catch (err) {
        log.error('[FAILED TO SAVE CRITICAL EVENT]', err, { eventToSave: eventDoc });
    }
};
