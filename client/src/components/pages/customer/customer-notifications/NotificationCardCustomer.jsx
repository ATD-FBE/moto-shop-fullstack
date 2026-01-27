import React, { useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import { sendNotificationMarkAsReadRequest } from '@/api/notificationRequests.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';

export default function NotificationCardCustomer({
    notification,
    notificationArticleRefs,
    notificationIdsInProgress,
    addNotificationIdInProgress,
    removeNotificationIdInProgress,
    updateNotificationState
}) {
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const { id, subject, message, signature, sentAt, isRead, readAt } = notification;

    const isUnread = !isRead;
    const sentDateStr = new Date(sentAt)?.toLocaleString();
    const readDateStr = readAt ? new Date(readAt)?.toLocaleString() : '';

    const markNotificationAsRead = async (eventType, notificationId) => {
        if (eventType === 'click' && document.getSelection().toString().length) return;

        addNotificationIdInProgress(notificationId);

        const responseData = await dispatch(sendNotificationMarkAsReadRequest(notificationId));
        if (isUnmountedRef.current) return;

        const { status, message, updatedNotificationData} = responseData;
        logRequestStatus({ context: 'NOTIFICATION: MARK AS READ', status, message });
        
        if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось отметить уведомление как прочитанное',
                message: 'Ошибка при отметке уведомления.\nПодробности ошибки в консоли.'
            });
        } else {
            updateNotificationState(notificationId, updatedNotificationData);
    
            if (eventType === 'keydown') {
                notificationArticleRefs.current[notificationId]?.blur();
            }
        }

        removeNotificationIdInProgress(notificationId);
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
            className={cn('notification-card', { 'unread': isUnread })}
            role="button"
            tabIndex={isUnread ? 0 : -1}
            onClick={(e) => isUnread && markNotificationAsRead(e.type, id)}
            onKeyDown={(e) => e.key === 'Enter' && isUnread && markNotificationAsRead(e.type, id)}
        >
            <div className="notification-row">
                <div className="notification-date">
                    {`Получено: ${sentDateStr}`}
                </div>
                
                <div className={cn(
                    'notification-status',
                    isRead ? 'read' : 'receipt'
                )}>
                    {notificationIdsInProgress.has(id)
                        ? 'Обработка...'
                        : isRead
                            ? `Прочитано${readDateStr && `: ${readDateStr}`}`
                            : 'Новое (клик для “прочитано”)'}
                </div>
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
        </article>
    );
};
