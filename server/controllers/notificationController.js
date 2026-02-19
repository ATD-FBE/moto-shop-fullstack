import Notification from '../database/models/Notification.js';
import User from '../database/models/User.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { prepareNotificationData } from '../services/notificationService.js';
import * as sseNotifications from '../services/sse/sseNotificationsService.js';
import { parseSortParam } from '../utils/aggregationBuilders.js';
import { isArrayContentDifferent } from '../utils/compareUtils.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { notificationsSortOptions } from '../../shared/sortOptions.js';
import { notificationsPageLimitOptions } from '../../shared/pageLimitOptions.js';
import { NOTIFICATION_STATUS, REQUEST_STATUS } from '../../shared/constants.js';

/// Загрузка всех уведомлений (для управления админом или просмотра клиентом) ///
export const handleNotificationListRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const isAdmin = dbUser.role === 'admin';

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || notificationsPageLimitOptions[0], 1);
    const skip = (page - 1) * limit;

    try {
        let notificationsCount, dbPaginatedNotificationList;

        switch (dbUser.role) {
            case 'admin': {
                const draftsFilter = { status: NOTIFICATION_STATUS.DRAFT };
                const nonDraftsFilter = { status: { $ne: NOTIFICATION_STATUS.DRAFT } };
                const [draftsCount, nonDraftsCount] = await Promise.all([
                    Notification.countDocuments(draftsFilter),
                    Notification.countDocuments(nonDraftsFilter)
                ]);
                checkTimeout(req);

                notificationsCount = draftsCount + nonDraftsCount;

                const selectedFields =
                    '_id status recipients subject message signature createdBy ' +
                    'updateHistory createdAt updatedAt sentAt sentBy';

                let dbDraftNotifications = [], dbNonDraftNotifications = [];

                if (skip < draftsCount) { // Если на странице попадают черновики
                    const draftsLimit = Math.min(limit, draftsCount - skip);

                    dbDraftNotifications = await Notification.find(draftsFilter)
                        .select(selectedFields)
                        .populate('recipients', 'name')
                        .populate('createdBy', 'name')
                        .populate('updateHistory.updatedBy', 'name')
                        .populate('sentBy', 'name')
                        .sort({ updatedAt: -1 })
                        .skip(skip)
                        .limit(draftsLimit)
                        .lean();
                    checkTimeout(req);

                    const remaining = limit - dbDraftNotifications.length;

                    if (remaining > 0) {
                        dbNonDraftNotifications = await Notification.find(nonDraftsFilter)
                            .select(selectedFields)
                            .populate('recipients', 'name')
                            .populate('createdBy', 'name')
                            .populate('updateHistory.updatedBy', 'name')
                            .populate('sentBy', 'name')
                            .sort({ sentAt: -1 })
                            .skip(0) // Нечерновики идут сразу после всех черновиков
                            .limit(remaining)
                            .lean();
                        checkTimeout(req);
                    }
                } else { // Если все черновики уже пропущены — только нечерновики
                    const nonDraftsSkip = skip - draftsCount;

                    dbNonDraftNotifications = await Notification.find(nonDraftsFilter)
                        .select(selectedFields)
                        .populate('recipients', 'name')
                        .populate('createdBy', 'name')
                        .populate('updateHistory.updatedBy', 'name')
                        .populate('sentBy', 'name')
                        .sort({ sentAt: -1 })
                        .skip(nonDraftsSkip)
                        .limit(limit)
                        .lean();
                    checkTimeout(req);
                }

                dbPaginatedNotificationList = [...dbDraftNotifications, ...dbNonDraftNotifications];

                break;
            }

            case 'customer': {
                const { sortField, sortOrder } = parseSortParam(req.query.sort, notificationsSortOptions);
                const selectedFields = '_id sentAt subject message signature';

                const notifications = dbUser.notifications;
                const notificationIds = notifications.map(n => n.notificationId);

                const notificationMap = notifications.reduce((acc, { notificationId, isRead, readAt }) => {
                    acc[notificationId.toString()] = { isRead, readAt };
                    return acc;
                }, {});

                notificationsCount = await Notification.countDocuments({ _id: { $in: notificationIds } });
                checkTimeout(req);

                dbPaginatedNotificationList = await Notification.find({ _id: { $in: notificationIds } })
                    .select(selectedFields)
                    .sort({ [sortField]: sortOrder })
                    .skip(skip)
                    .limit(limit)
                    .lean();
                checkTimeout(req);

                dbPaginatedNotificationList = dbPaginatedNotificationList.map(notifItem => {
                    const metadata = notificationMap[notifItem._id.toString()] || {};

                    return {
                        ...notifItem,
                        isRead: metadata.isRead ?? false,
                        readAt: metadata.readAt ?? null
                    };
                });

                break;
            }

            default:
                return safeSendResponse(req, res, 403, {
                    message: 'Запрещено: несоответствующая роль',
                    reason: REQUEST_STATUS.DENIED
                });
        }

        const paginatedNotificationList = dbPaginatedNotificationList.map(notif =>
            prepareNotificationData(notif, { managed: isAdmin })
        );

        safeSendResponse(req, res, 200, {
            message: 'Уведомления успешно загружены',
            notificationsCount,
            paginatedNotificationList
        });
    } catch (err) {
        next(err);
    }
};

/// Загрузка черновика уведомления для редактирования ///
export const handleNotificationRequest = async (req, res, next) => {
    const notificationId = req.params.notificationId;

    if (!typeCheck.objectId(notificationId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: notificationId' });
    }

    try {
        const dbNotification = await Notification.findById(notificationId)
            .select('recipients subject message signature')
            .lean();
        checkTimeout(req);

        if (!dbNotification) {
            return safeSendResponse(req, res, 404, {
                message: `Уведомление (ID: ${notificationId}) не найдено`
            });
        }

        safeSendResponse(req, res, 200, {
            message: `Уведомление "${dbNotification.subject}" успешно загружено`,
            notification: prepareNotificationData(dbNotification, { managed: true, edit: true })
        });
    } catch (err) {
        next(err);
    }
};

/// Создание черновика уведомления ///
export const handleNotificationCreateRequest = async (req, res, next) => {
    const userId = req.dbUser._id;
    const { recipients, subject, message, signature } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        recipients: { value: recipients, type: 'arrayOf', elemType: 'objectId', form: true },
        subject: { value: subject, type: 'string', form: true },
        message: { value: message, type: 'string', form: true },
        signature: { value: signature, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'notification');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Создание документа в базе MongoDB
    try {
        const { notifLbl } = await runInTransaction(async (session) => {
            const [newNotification] = await Notification.create(
                [
                    {
                        recipients,
                        subject: subject.trim(),
                        message: message.trim(),
                        signature: signature.trim(),
                        createdBy: userId
                    }
                ],
                { session }
            );
            checkTimeout(req);

            return { notifLbl: newNotification.subject };
        });

        safeSendResponse(req, res, 201, {
            message: `Уведомление "${notifLbl}" успешно создано`
        });
    } catch (err) {
        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'notification');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение черновика уведомления ///
export const handleNotificationUpdateRequest = async (req, res, next) => {
    const userId = req.dbUser._id;
    const notificationId = req.params.notificationId;
    const { recipients, subject, message, signature } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        notificationId: { value: notificationId, type: 'objectId' },
        recipients: { value: recipients, type: 'arrayOf', elemType: 'objectId', form: true },
        subject: { value: subject, type: 'string', form: true },
        message: { value: message, type: 'string', form: true },
        signature: { value: signature, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'notification');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Апдейт документа в базе MongoDB
    try {
        const { notifLbl } = await runInTransaction(async (session) => {
            // Проверка существования и доступности изменяемого уведомления
            const dbNotification = await Notification.findById(notificationId).session(session);
            checkTimeout(req);

            const notifLbl = dbNotification ? `"${dbNotification.subject}"` : `(ID: ${notificationId})`;

            if (!dbNotification) {
                throw createAppError(404, `Уведомление ${notifLbl} не найдено`);
            }
            if (dbNotification.status !== NOTIFICATION_STATUS.DRAFT) {
                throw createAppError(400, `Уведомление ${notifLbl} уже отправлено, редактирование невозможно`);
            }

            // Установка новых данных и проверка их изменений
            const currentRecipients = dbNotification.recipients.map(id => id.toString());
            const preparedRecipients = [...new Set(recipients)];
            const isRecipientsChanged = isArrayContentDifferent(currentRecipients, preparedRecipients);
            
            if (isRecipientsChanged) {
                dbNotification.recipients = preparedRecipients;
                dbNotification.markModified('recipients');
            }

            dbNotification.set({
                subject: subject.trim(),
                message: message.trim(),
                signature: signature.trim()
            });

            if (!dbNotification.isModified()) {
                throw createAppError(204);
            }

            // Добавление лога редактирования и сохранение в базе MongoDB
            dbNotification.updateHistory.push({ updatedBy: userId, updatedAt: new Date() });
            await dbNotification.save({ session });
            checkTimeout(req);

            return { notifLbl };
        });

        safeSendResponse(req, res, 200, { message: `Уведомление ${notifLbl} успешно изменено` });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'notification');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Отправка уведомления ///
export const handleNotificationSendingRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const notificationId = req.params.notificationId;

    if (!typeCheck.objectId(notificationId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: notificationId' });
    }

    try {
        const transactionResult = await runInTransaction(async (session) => {
            const dbNotification = await Notification.findById(notificationId).session(session);
            checkTimeout(req);

            const notifLbl = dbNotification ? `"${dbNotification.subject}"` : `(ID: ${notificationId})`;

            if (!dbNotification) {
                throw createAppError(404, `Уведомление ${notifLbl} не найдено`);
            }
            if (dbNotification.status !== NOTIFICATION_STATUS.DRAFT) {
                throw createAppError(
                    400,
                    `Уведомление ${notifLbl} уже отправлено, повторная отправка невозможна`
                );
            }
            if (!Array.isArray(dbNotification.recipients) || !dbNotification.recipients.length) {
                throw createAppError(400, `Нет получателей для уведомления ${notifLbl}`);
            }

            // Изменение записи о получении уведомления у клиентов
            const updateResult = await User.updateMany(
                { _id: { $in: dbNotification.recipients } },
                { $addToSet: { notifications: { notificationId } } },
                { session }
            );
            checkTimeout(req);

            const recipientsSentCount = updateResult.modifiedCount;

            // Отметка об отправке в уведомлении
            dbNotification.set({
                status: NOTIFICATION_STATUS.SENT,
                sentAt: new Date(),
                sentBy: dbUser._id
            });

            const updatedDbNotification = await dbNotification.save({ session });
            checkTimeout(req);

            return { recipientsSentCount, updatedDbNotification, notifLbl };
        });

        const { recipientsSentCount, updatedDbNotification, notifLbl } = transactionResult;

        // Отправка SSE-сообщения клиентам-получателям
        if (recipientsSentCount > 0) {
            sseNotifications.sendToClients(updatedDbNotification.recipients, {
                newUnreadNotificationsCount: 1
            });
        }

        safeSendResponse(req, res, 200, {
            message: recipientsSentCount === 0
                ? `Уведомление ${notifLbl} отправлено, но ни один пользователь не был` +
                    ' обновлён - возможно, оно уже есть у получателей, либо они были удалены'
                : `Уведомление ${notifLbl} успешно отправлено`,
            updatedNotificationData: {
                status: updatedDbNotification.status,
                sentAt: updatedDbNotification.sentAt,
                sentBy: dbUser.name
            }
        });
    } catch (err) {
        // Обработка контролируемой ошибки
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Отметка уведомления как прочитанного ///
export const handleNotificationMarkAsReadRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const notificationId = req.params.notificationId;

    if (!typeCheck.objectId(notificationId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: notificationId' });
    }

    const notification = dbUser.notifications.find(n => n.notificationId.toString() === notificationId);

    if (!notification) {
        return safeSendResponse(req, res, 404, {
            message: `Уведомление (ID: ${notificationId}) не найдено у пользователя`
        });
    }
    if (notification.isRead) {
        return safeSendResponse(req, res, 204);
    }

    try {
        const { notifLbl } = await runInTransaction(async (session) => {
            const dbNotification = await Notification.findById(notificationId).lean().session(session);
            checkTimeout(req);

            const notifLbl = dbNotification ? `"${dbNotification.subject}"` : `(ID: ${notificationId})`;
        
            if (!dbNotification) {
                throw createAppError(404, `Уведомление ${notifLbl} не найдено`);
            }
            
            notification.isRead = true;
            notification.readAt = new Date();
        
            await dbUser.save({ session });
            checkTimeout(req);

            return { notifLbl };
        });

        // Отправка SSE-сообщения клиенту
        sseNotifications.sendToClients([dbUser._id], { newUnreadNotificationsCount: -1 });

        safeSendResponse(req, res, 200, {
            message: `Уведомление ${notifLbl} отмечено как прочитанное`,
            updatedNotificationData: {
                isRead: notification.isRead,
                readAt: notification.readAt
            }
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }
        
        next(err);
    }
};

/// Удаление черновика уведомления ///
export const handleNotificationDeleteRequest = async (req, res, next) => {
    const notificationId = req.params.notificationId;

    if (!typeCheck.objectId(notificationId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: notificationId' });
    }

    try {
        const { notifLbl } = await runInTransaction(async (session) => {
            const dbNotification = await Notification.findById(notificationId).session(session);
            checkTimeout(req);

            const notifLbl = dbNotification ? `"${dbNotification.subject}"` : `(ID: ${notificationId})`;
    
            if (!dbNotification) {
                throw createAppError(404, `Уведомление ${notifLbl} не найдено`);
            }
            if (dbNotification.status !== NOTIFICATION_STATUS.DRAFT) {
                throw createAppError(400, `Уведомление ${notifLbl} уже отправлено, удаление невозможно`);
            }
    
            await dbNotification.deleteOne({ session });
            checkTimeout(req);

            return { notifLbl };
        });

        safeSendResponse(req, res, 200, { message: `Уведомление ${notifLbl} успешно удалено` });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};
