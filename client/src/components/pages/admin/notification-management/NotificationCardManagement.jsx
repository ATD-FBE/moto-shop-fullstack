import React, { useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import { openConfirmModal } from '@/services/modalConfirmService.js';
import {
    sendNotificationSendingRequest,
    sendNotificationDeleteRequest
} from '@/api/notificationRequests.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { routeConfig } from '@/config/appRouting.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { NOTIFICATION_STATUS, REQUEST_STATUS } from '@shared/constants.js';

export default function NotificationCardManagement({
    notification,
    notificationArticleRefs,
    notificationIdsInProgress,
    addNotificationIdInProgress,
    removeNotificationIdInProgress,
    updateNotificationState,
    page,
    limit,
    totalNotifications,
    paginatedNotificationsCount,
    setPage,
    reloadNotifications
}) {
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const {
        id, status, recipients, subject, message, signature,
        createdBy, createdAt, updatedAt, updateHistory, sentBy, sentAt
    } = notification;

    const formatLocalDate = (date, format = {}) => new Date(date)?.toLocaleString(undefined, format);

    const createdDateStr = formatLocalDate(createdAt);
    const updatedDateStr = formatLocalDate(updatedAt);
    const sentDateStr = formatLocalDate(sentAt);

    const isNotificationUiBlocked =
        status !== NOTIFICATION_STATUS.DRAFT ||
        notificationIdsInProgress.has(id);

    const sendNotification = async (notificationId) => {
        addNotificationIdInProgress(notificationId);

        const responseData = await dispatch(sendNotificationSendingRequest(notificationId));
        if (isUnmountedRef.current) return;

        const { status, message, updatedNotificationData } = responseData;
        logRequestStatus({ context: 'NOTIFICATION: SEND', status, message });
        
        if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось отправить уведомление',
                message: 'Ошибка при отправке уведомления.\nПодробности ошибки в консоли.'
            });
        } else {
            updateNotificationState(notificationId, updatedNotificationData);
        }

        removeNotificationIdInProgress(notificationId);
    };

    const editNotification = (notificationId) => {
        const url = routeConfig.adminCustomers.paths[0];
        const options = { state: { isExpanded: true, notificationId } };
        navigate(url, options);
    };

    const confirmNotificationDeletion = (notification) => {
        const processNotificationDeletion = async (notificationId) => {
            addNotificationIdInProgress(notificationId);
    
            const { status, message } = await dispatch(sendNotificationDeleteRequest(notificationId));
            if (isUnmountedRef.current) return;
    
            logRequestStatus({ context: 'NOTIFICATION: DELETE', status, message });
    
            const isAllowed = [REQUEST_STATUS.SUCCESS, REQUEST_STATUS.NOT_FOUND].includes(status);
            if (!isAllowed) {
                removeNotificationIdInProgress(notificationId);
                throw new Error(message);
            }
        };
    
        const finalizeNotificationDeletion = async (notificationId) => {
            // При удалении последнего уведомления на последней странице > 1 переход на предыдущую
            // Без проверки сработает хук в пагинации и произойдёт 2 запроса данных вместо 1
            const shouldGoBack =
                page > 1 &&
                page * limit >= totalNotifications &&
                paginatedNotificationsCount === 1;

            if (shouldGoBack) {
                setPage(prev => prev - 1);
            } else {
                await reloadNotifications();
                if (isUnmountedRef.current) return;
            }

            removeNotificationIdInProgress(notificationId);
        };

        openConfirmModal({
            prompt: `Удалить уведомление «${notification.subject}»?`,
            onConfirm: () => processNotificationDeletion(notification.id),
            onFinalize: () => finalizeNotificationDeletion(notification.id)
        });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <article
            data-id={id}
            ref={(elem) => (notificationArticleRefs.current[id] = elem)}
            className="notification-card"
        >
            <div className="notification-row">
                <div className="notification-date">
                    {status === NOTIFICATION_STATUS.DRAFT
                        ? !updateHistory.length
                            ? `Дата создания: ${createdDateStr}`
                            : `Дата изменения: ${updatedDateStr}`
                        : `Дата отправки: ${sentDateStr}`}
                </div>
                
                <div className={cn('notification-status', status)}>
                    {notificationIdsInProgress.has(id)
                        ? 'Обработка...'
                        : status === NOTIFICATION_STATUS.DRAFT ? 'Черновик' : 'Отправлено'}
                </div>
            </div>

            <div className="notification-recipients">
                <label htmlFor={`notification-${id}-recipients`}>
                    Клиенты-получатели ({recipients?.length ?? 0}):
                </label>
                <textarea
                    id={`notification-${id}-recipients`}
                    defaultValue={recipients?.join(', ') ?? ''}
                    readOnly
                >
                </textarea>
            </div>

            <h4 className="notification-subject">{subject}</h4>

            <div className="notification-message">
                {message.split(/\r?\n/).map((paragraph, idx) =>
                    paragraph
                        ? <p key={`${id}-${idx}`}>{paragraph}</p>
                        : <br key={`${id}-${idx}`} />
                )}
            </div>

            <p className="notification-signature">
                {signature}
            </p>

            <div className="notification-meta">
                <p>Автор: {`${createdBy} (${createdDateStr})`}</p>

                {updateHistory.length > 0 &&
                    <p>
                        Редактор(ы):{' '}
                        {updateHistory
                            .map(upd => `${upd.updatedBy} (${formatLocalDate(upd.updatedAt)})`)
                            .join(', ')}
                    </p>}
                
                {status !== NOTIFICATION_STATUS.DRAFT &&
                    <p>
                        Отправитель: {sentBy + ` (${sentDateStr})`}    
                    </p>}
            </div>

            <div className="notification-controls">
                <button
                    className="send-notification-btn"
                    onClick={() => sendNotification(id)}
                    disabled={isNotificationUiBlocked}
                >
                    <span className="icon">📩</span>
                    Отправить
                </button>

                <button
                    className="edit-notification-btn"
                    onClick={() => editNotification(id)}
                    disabled={isNotificationUiBlocked}
                >
                    <span className="icon">🖊</span>
                    Редактировать
                </button>

                <button
                    className="delete-notification-btn"
                    onClick={() => confirmNotificationDeletion({ id, subject })}
                    disabled={isNotificationUiBlocked}
                >
                    <span className="icon">❌</span>
                    Удалить
                </button>
            </div>
        </article>
    );
};
