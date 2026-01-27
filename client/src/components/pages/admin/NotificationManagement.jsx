import React from 'react';
import NotificationsBase from '@/components/pages/shared/NotificationsBase.jsx';
import NotificationCardManagement from './notification-management/NotificationCardManagement.jsx';

export default function NotificationManagement() {
    return (
        <NotificationsBase
            headerContent={
                <>
                    <h2>Управление уведомлениями</h2>
                    <p>Просмотр отправленных уведомлений и управление черновиками</p>
                </>
            }
            renderNotificationCard={(notification, props) => (
                <NotificationCardManagement
                    notification={notification}
                    {...props}
                />
            )}
        />
    );
};
